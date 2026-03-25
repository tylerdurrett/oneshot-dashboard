# Implementation Guide: Server-Tracked Timers

**Date:** 2026-03-24
**Feature:** Server-Tracked Timers
**Source:** [2026-03-24_feature-description.md](./2026-03-24_feature-description.md)

## Overview

This guide migrates the Bucket Timers system from localStorage to server-tracked timing with database persistence. The core insight: the server doesn't run a ticking clock — it stores `startedAt` timestamps and computes elapsed time on demand. A timer "runs" because `startedAt` is set and time is passing.

**Phase 1** lays the database foundation — schema, migrations, and seed data. **Phase 2** builds the server service layer — bucket CRUD, daily progress tracking, and the timer scheduler that handles completion detection and 3AM resets. **Phase 3** wires up the API routes and SSE endpoint. **Phase 4** rewrites the client to consume the server, replacing localStorage with TanStack Query hooks and an SSE listener. All existing UI components (grid, bucket, animations, sounds, context menus) remain unchanged — only the data source changes.

Schema is placed first because every subsequent phase depends on it. The service layer comes before routes so all business logic is unit-testable without HTTP. SSE is bundled with routes because the broadcast function is shared between route handlers and the scheduler. The client phase is last because it requires a working server to integrate against.

## File Structure

```
packages/db/src/
└── schema.ts                              # Updated — add timerBuckets + timerDailyProgress tables

apps/server/src/
├── services/
│   ├── timer-bucket.ts                    # New — bucket CRUD service
│   ├── timer-progress.ts                  # New — daily progress service (start, stop, get, reset)
│   └── timer-scheduler.ts                 # New — completion jobs, 3AM reset, startup recovery
├── routes/
│   └── timers.ts                          # New — REST routes + SSE endpoint
└── index.ts                               # Updated — register timer routes + init scheduler

apps/web/src/app/(shell)/timers/
├── _lib/
│   ├── timer-types.ts                     # Updated — remove localStorage types, add server response types
│   └── timer-api.ts                       # New — fetch wrappers for timer endpoints
├── _hooks/
│   ├── use-timer-state.ts                 # Rewritten — server-backed via TanStack Query + SSE
│   └── use-timer-sse.ts                   # New — SSE connection hook
└── __tests__/
    └── use-timer-state.test.ts            # Rewritten — mock API instead of localStorage
```

---

## Phase 1: Database Foundation

**Purpose:** Create the timer tables and seed default buckets so every subsequent phase has a schema to work against.

**Rationale:** Schema changes must come first — services, routes, and client all depend on these tables existing. Batching both tables in a single migration avoids multiple migration files for tightly coupled schema.

### 1.1 Timer Schema

- [ ] Add `timerBuckets` table to `packages/db/src/schema.ts`:
  - `id: text('id').primaryKey()` — UUID, matches existing convention
  - `name: text('name').notNull()`
  - `totalMinutes: integer('total_minutes').notNull()`
  - `colorIndex: integer('color_index').notNull()`
  - `daysOfWeek: text('days_of_week').notNull()` — JSON array string, e.g. `"[1,2,3,4,5]"`
  - `sortOrder: integer('sort_order').notNull().default(0)`
  - `createdAt: integer('created_at').notNull().$defaultFn(() => Date.now())`
  - `updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now())`
- [ ] Add `timerDailyProgress` table to `packages/db/src/schema.ts`:
  - `id: text('id').primaryKey()` — UUID
  - `bucketId: text('bucket_id').notNull().references(() => timerBuckets.id)`
  - `date: text('date').notNull()` — `YYYY-MM-DD`, 3AM-adjusted
  - `elapsedSeconds: integer('elapsed_seconds').notNull().default(0)` — accumulated from completed segments only
  - `startedAt: text('started_at')` — ISO timestamp if currently running, null if paused
  - `completedAt: text('completed_at')` — ISO timestamp if timer finished, null otherwise
  - Add unique constraint on `(bucketId, date)` to prevent duplicate rows
- [ ] Run `pnpm --filter @repo/db db:generate && pnpm --filter @repo/db db:migrate`
- [ ] Verify migration was generated and tables exist (check with a quick query in tests)

**Acceptance Criteria:**
- Both tables exist in the SQLite database after migration
- `timerDailyProgress` has a unique constraint on `(bucket_id, date)`
- Foreign key from `timerDailyProgress.bucketId` to `timerBuckets.id` is enforced
- Existing `threads` and `messages` tables are unaffected

### 1.2 Seed Default Buckets

- [ ] Create a seed function in the timer bucket service (or a standalone seed utility) that inserts the 4 default buckets (School Project 3h, Business Project 3h, Life Maintenance 1h, Exercise 1h) if no buckets exist
  - Match the current `DEFAULT_BUCKETS` from `timer-types.ts` (names, durations, color indices, Mon-Fri)
  - Use `crypto.randomUUID()` for IDs (not the old `default-1` etc.)
  - Assign `sortOrder` 0-3
- [ ] Call the seed function during server startup (after migration, before scheduler init) — only seeds if the `timerBuckets` table is empty
- [ ] Write a test that verifies seeding creates 4 buckets and is idempotent (second call is a no-op)

**Acceptance Criteria:**
- Fresh database gets 4 default buckets on server start
- Existing database with buckets is not re-seeded
- Seed is idempotent — running twice produces the same result

---

## Phase 2: Server Service Layer

**Purpose:** Build all business logic as pure service functions with database injection, fully testable without HTTP.

**Rationale:** Following the existing codebase pattern (`services/thread.ts`), services are standalone async functions that accept an optional `database` parameter. This enables in-memory SQLite testing and keeps routes thin.

### 2.1 Bucket CRUD Service

- [ ] Create `apps/server/src/services/timer-bucket.ts` with:
  - `listBuckets(database?)` — returns all buckets ordered by `sortOrder` asc
  - `getBucket(id, database?)` — returns single bucket or undefined
  - `createBucket({ name, totalMinutes, colorIndex, daysOfWeek, sortOrder? }, database?)` — generates UUID, inserts, returns created bucket
  - `updateBucket(id, updates, database?)` — partial update (name, totalMinutes, colorIndex, daysOfWeek, sortOrder), sets `updatedAt`, returns updated bucket or undefined if not found
  - `deleteBucket(id, database?)` — deletes all daily progress rows for this bucket first (no CASCADE, matches existing pattern), then deletes the bucket. Returns boolean
  - `daysOfWeek` stored as JSON string in DB, parsed/serialized in service layer — callers work with `number[]`
- [ ] Write tests in `apps/server/src/__tests__/timer-bucket.test.ts`:
  - CRUD operations work correctly
  - `deleteBucket` cascades to daily progress rows
  - `updateBucket` returns undefined for nonexistent ID
  - `daysOfWeek` round-trips correctly (array → JSON string → array)
  - `listBuckets` returns sorted by `sortOrder`

**Acceptance Criteria:**
- All CRUD operations work with in-memory test database
- Deleting a bucket removes its progress history
- `daysOfWeek` is transparent to callers (always `number[]`)

### 2.2 Daily Progress Service

- [ ] Create `apps/server/src/services/timer-progress.ts` with:
  - `getResetDate(now?)` — returns `YYYY-MM-DD` with 3AM boundary adjustment (replicated from client-side `timer-types.ts` since server is now source of truth for dates)
  - `getTodayState(database?)` — returns all buckets with today's progress merged in:
    - Queries all buckets + left-joins today's progress rows
    - For each bucket: returns `{ ...bucket, elapsedSeconds, startedAt, completedAt }` (defaults to 0/null/null if no progress row)
    - **Auto-completion check**: for any running timer where `elapsedSeconds + (now - startedAt) >= totalMinutes * 60`, auto-complete it in the DB before returning (catches timers that completed while server was running but no client was connected, or after server restart)
    - Returns `{ date, buckets }` where `date` is today's reset-adjusted date
  - `startTimer(bucketId, database?)`:
    - First, stop any currently running timer for today (enforce single-active): find any progress row with `startedAt IS NOT NULL` for today's date, accumulate its elapsed, clear its `startedAt`
    - Then, get-or-create a progress row for this bucket + today's date
    - Set `startedAt = new Date().toISOString()`
    - Return `{ bucketId, startedAt, stoppedBucketId? }` (the previously running bucket, if any)
  - `stopTimer(bucketId, database?)`:
    - Find today's progress row for this bucket
    - If not running (`startedAt` is null), return `{ changed: false }`
    - Compute `additionalElapsed = floor((now - startedAt) / 1000)`
    - Update `elapsedSeconds += additionalElapsed`, clear `startedAt`
    - Check for completion: if `elapsedSeconds >= totalMinutes * 60`, set `completedAt`
    - Return `{ changed: true, elapsedSeconds, completedAt }`
  - `resetProgress(bucketId, database?)` — set `elapsedSeconds = 0`, clear `startedAt` and `completedAt` for today's row
  - `setRemainingTime(bucketId, remainingSeconds, database?)` — compute `elapsedSeconds = totalMinutes * 60 - remainingSeconds`, update today's row, handle completion if remaining is 0
  - `stopAllRunningTimers(date, database?)` — find all progress rows with `startedAt IS NOT NULL` for the given date, accumulate elapsed for each, clear all `startedAt`. Used by the 3AM reset job. Returns list of stopped bucket IDs
- [ ] Write tests in `apps/server/src/__tests__/timer-progress.test.ts`:
  - `getResetDate` matches 3AM boundary behavior (before/after 3AM)
  - `getTodayState` returns merged bucket + progress data
  - `getTodayState` auto-completes overdue running timers
  - `startTimer` stops previously running timer
  - `startTimer` creates progress row if none exists
  - `stopTimer` accumulates elapsed correctly
  - `stopTimer` detects completion
  - `resetProgress` zeros out and clears completion
  - `setRemainingTime` sets correct elapsed and detects completion at 0
  - `stopAllRunningTimers` stops all active timers for a given date

**Acceptance Criteria:**
- Starting a timer when another is running stops the previous one atomically
- Elapsed time computation is correct: `elapsedSeconds + floor((now - startedAt) / 1000)`
- Auto-completion on read catches timers that finished while no client was watching
- `getResetDate()` at 2:59AM returns previous day's date
- All service functions work with injected test database

### 2.3 Timer Scheduler

- [ ] Create `apps/server/src/services/timer-scheduler.ts` with a `TimerScheduler` class:
  - Constructor accepts: `database`, `onTimerCompleted` callback, `onDailyReset` callback
  - `completionJobs: Map<string, NodeJS.Timeout>` — maps `bucketId` to scheduled timeout
  - `resetJob: NodeJS.Timeout | null` — the next 3AM reset job
  - `init()` — called on server startup:
    1. Check for stale running timers from previous dates (server was down during 3AM): find progress rows with `startedAt IS NOT NULL` where `date != getResetDate()`. For each: compute elapsed up to the boundary, write it, clear `startedAt`
    2. Check for running timers today: for each, compute remaining time. If overdue → auto-complete and fire callback. Otherwise → schedule completion job
    3. Schedule the next 3AM reset job
  - `scheduleCompletion(bucketId, completesAtMs)` — cancel any existing job for this bucket, schedule `setTimeout` for `completesAtMs - Date.now()`. On fire: call `stopTimer()` service, invoke `onTimerCompleted(bucketId)` callback
  - `cancelCompletion(bucketId)` — clear timeout, remove from map
  - `scheduleNextReset()` — compute ms until next 3AM, schedule `setTimeout`. On fire: call `stopAllRunningTimers()`, invoke `onDailyReset()` callback, then call `scheduleNextReset()` again for the following day
  - `destroy()` — clear all timeouts (completion jobs + reset job). Called on server shutdown via `onClose` hook
- [ ] Write tests in `apps/server/src/__tests__/timer-scheduler.test.ts`:
  - `init()` recovers stale timers from previous dates
  - `init()` schedules completion for currently running timers
  - `init()` auto-completes overdue timers
  - `scheduleCompletion` fires callback at the right time (use fake timers)
  - `cancelCompletion` prevents callback from firing
  - `scheduleNextReset` computes correct time until 3AM
  - `destroy()` cleans up all timeouts
  - Scheduling a new completion for the same bucket cancels the previous one

**Acceptance Criteria:**
- Server restart with a running timer resumes tracking correctly
- Server restart after missing a 3AM boundary retroactively stops stale timers
- Completion fires within 1 second of the actual completion time
- 3AM reset stops all running timers and resets for the new day
- `destroy()` leaves no orphaned timeouts

---

## Phase 3: API & Real-Time Layer

**Purpose:** Expose timer functionality via REST routes and push real-time events to connected clients via SSE.

**Rationale:** Routes are thin wrappers around the service layer (matching existing `routes/threads.ts` pattern). SSE is bundled here because the broadcast function is shared between route handlers (immediate feedback) and the scheduler (background events).

### 3.1 SSE Infrastructure

- [ ] Add SSE client management to `apps/server/src/routes/timers.ts`:
  - `sseClients: Map<string, ServerResponse>` — connected SSE clients
  - `broadcast(event, data)` — write `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` to all clients
  - `GET /timers/events` route:
    - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Register client in `sseClients` map
    - On connection close: remove from map
    - Send initial `:ok\n\n` comment as connection confirmation
  - Export `broadcast` so it can be passed to the scheduler
- [ ] Write test verifying SSE connection sends correct headers and initial comment

**Acceptance Criteria:**
- Client can connect to `/timers/events` and receive SSE stream
- Multiple clients can connect simultaneously
- Disconnected clients are cleaned up from the map
- `broadcast()` sends formatted SSE events to all connected clients

### 3.2 Bucket CRUD Routes

- [ ] Add to `apps/server/src/routes/timers.ts`:
  - `GET /timers/buckets` — returns `{ buckets }` via `listBuckets()`
  - `POST /timers/buckets` — accepts `{ name, totalMinutes, colorIndex, daysOfWeek }`, returns `{ bucket }` with 201
  - `PATCH /timers/buckets/:id` — accepts partial update body, returns `{ bucket }` or 404
  - `DELETE /timers/buckets/:id` — returns `{ success: true }` or 404. Also cancels any scheduled completion job for this bucket
- [ ] Write route tests using Fastify `inject()` (matching existing `threads.test.ts` pattern)

**Acceptance Criteria:**
- All CRUD operations return correct status codes and response shapes
- 404 returned for operations on nonexistent buckets
- Deleting a bucket cancels its scheduled completion job

### 3.3 Timer Control Routes

- [ ] Add to `apps/server/src/routes/timers.ts`:
  - `GET /timers/today` — returns `{ date, buckets }` via `getTodayState()`. Each bucket includes `elapsedSeconds`, `startedAt`, `completedAt`. For running timers, client uses `startedAt` to compute live elapsed locally
  - `POST /timers/buckets/:id/start` — calls `startTimer()`, schedules completion job, broadcasts `timer-started` SSE event. Returns `{ bucketId, startedAt, stoppedBucketId? }`
  - `POST /timers/buckets/:id/stop` — calls `stopTimer()`, cancels completion job, broadcasts `timer-stopped` SSE event. If completion detected, also broadcasts `timer-completed`. Returns `{ elapsedSeconds, completedAt }`
  - `POST /timers/buckets/:id/reset` — calls `resetProgress()`, cancels completion job, broadcasts `timer-reset` SSE event. Returns `{ success: true }`
  - `POST /timers/buckets/:id/set-time` — accepts `{ remainingSeconds }`, calls `setRemainingTime()`, reschedules completion if timer is running, broadcasts `timer-updated` SSE event. Returns `{ elapsedSeconds, completedAt }`
- [ ] Wire up scheduler callbacks to broadcast:
  - `onTimerCompleted(bucketId)` → broadcasts `{ event: 'timer-completed', data: { bucketId } }`
  - `onDailyReset()` → broadcasts `{ event: 'daily-reset' }`
- [ ] Write route tests:
  - Start/stop cycle accumulates elapsed correctly
  - Starting a timer when another is running stops the previous
  - Stop detects completion and returns `completedAt`
  - Reset clears elapsed and completion
  - SSE events are broadcast on state changes (verify via test SSE client or mock)

**Acceptance Criteria:**
- `GET /timers/today` returns all buckets with merged progress for today
- Starting a timer returns `startedAt` timestamp the client can use for local countdown
- Stopping accumulates elapsed and detects completion
- All mutations broadcast appropriate SSE events
- Scheduler completion and reset callbacks broadcast to connected clients

### 3.4 Server Wiring

- [ ] Update `apps/server/src/index.ts`:
  - Import and register `timerRoutes` (same pattern as `threadRoutes`)
  - Pass `database` and `scheduler` via route options
  - Create `TimerScheduler` instance, call `scheduler.init()` after server starts listening
  - Add `scheduler.destroy()` to the `onClose` hook
  - Call seed function before scheduler init
- [ ] Verify server starts cleanly with new routes registered
- [ ] Add `/timers` prefix to all timer routes (or use Fastify `prefix` option on the plugin)

**Acceptance Criteria:**
- Server starts without errors with timer routes registered
- Default buckets are seeded on first start
- Scheduler initializes and recovers any running timers
- Scheduler is destroyed on server shutdown
- CORS allows timer endpoints from the web app origin

---

## Phase 4: Client Migration

**Purpose:** Rewrite the client hook to consume the server API, replacing localStorage with TanStack Query and SSE.

**Rationale:** The client phase comes last because it requires a working server. All existing UI components (timer-grid, timer-bucket, settings dialog, context menus, animations, sounds) remain unchanged — only the data source beneath `useTimerState` changes.

### 4.1 API Client & Types

- [ ] Create `apps/web/src/app/(shell)/timers/_lib/timer-api.ts`:
  - `getBaseUrl()` — same pattern as `chat/api.ts`, reads `NEXT_PUBLIC_SERVER_PORT`
  - Type definitions for server responses:
    - `ServerBucket` — bucket fields + `elapsedSeconds`, `startedAt`, `completedAt` from progress
    - `TodayStateResponse` — `{ date: string, buckets: ServerBucket[] }`
    - `StartTimerResponse` — `{ bucketId, startedAt, stoppedBucketId? }`
    - `StopTimerResponse` — `{ elapsedSeconds, completedAt }`
  - API functions:
    - `fetchTodayState()` → `GET /timers/today`
    - `fetchBuckets()` → `GET /timers/buckets`
    - `createBucket(data)` → `POST /timers/buckets`
    - `updateBucket(id, data)` → `PATCH /timers/buckets/:id`
    - `deleteBucket(id)` → `DELETE /timers/buckets/:id`
    - `startTimer(bucketId)` → `POST /timers/buckets/:id/start`
    - `stopTimer(bucketId)` → `POST /timers/buckets/:id/stop`
    - `resetTimer(bucketId)` → `POST /timers/buckets/:id/reset`
    - `setTimerTime(bucketId, remainingSeconds)` → `POST /timers/buckets/:id/set-time`
  - Error handling: throw on non-OK status (matching `chat/api.ts` pattern)
- [ ] Update `timer-types.ts`:
  - Keep: `TimeBucket` interface, `BucketColor`, `BUCKET_COLORS`, `formatTime()`, `isBucketActiveToday()`, `generateBucketId()`, `ADD_BUCKET_EVENT`
  - Remove: `TimerState` interface, `STORAGE_KEY`, `DEFAULT_BUCKETS` (defaults now live on the server)
  - Remove: `getResetDate()` (server is now source of truth for dates — client receives date in API response)
  - Keep `RESET_HOUR` and `adjustForResetBoundary` only if `isBucketActiveToday` still needs them for client-side display filtering. If the server's `GET /timers/today` already returns only today's state, these can be removed too. Decision: keep them — the client receives ALL buckets and filters locally for display, since it needs `allBuckets` for the settings dialog

**Acceptance Criteria:**
- All API functions work against the running server
- Response types match server response shapes
- `timer-types.ts` has no localStorage-related exports

### 4.2 SSE Hook

- [ ] Create `apps/web/src/app/(shell)/timers/_hooks/use-timer-sse.ts`:
  - `useTimerSSE(handlers)` hook:
    - Connects to `${getBaseUrl()}/timers/events` via `EventSource`
    - Accepts callback handlers: `onTimerCompleted(bucketId)`, `onTimerStarted(data)`, `onTimerStopped(data)`, `onTimerReset(data)`, `onTimerUpdated(data)`, `onDailyReset()`
    - Auto-reconnects on connection loss (EventSource does this natively)
    - Cleans up on unmount
    - Uses refs for handlers to avoid reconnecting when callbacks change
  - Export `SSE_EVENTS` constants matching server event names

**Acceptance Criteria:**
- Hook connects to SSE endpoint on mount
- Callbacks fire when server broadcasts events
- Connection is cleaned up on unmount
- Changing callback references does not cause reconnection

### 4.3 TanStack Query Hooks

- [ ] Create query key structure in `timer-api.ts` (or a separate `use-timers.ts`):
  ```
  timerKeys = {
    today: ['timers', 'today'] as const,
    buckets: ['timers', 'buckets'] as const,
  }
  ```
- [ ] Create hooks (matching `use-threads.ts` pattern):
  - `useTodayState()` — `useQuery` wrapping `fetchTodayState()`
  - `useStartTimer()` — `useMutation`, invalidates `timerKeys.today` on success
  - `useStopTimer()` — `useMutation`, invalidates `timerKeys.today` on success
  - `useCreateBucket()` — `useMutation`, invalidates both `timerKeys.today` and `timerKeys.buckets`
  - `useUpdateBucket()` — `useMutation`, invalidates both keys
  - `useDeleteBucket()` — `useMutation`, invalidates both keys
  - `useResetTimer()` — `useMutation`, invalidates `timerKeys.today`
  - `useSetTimerTime()` — `useMutation`, invalidates `timerKeys.today`

**Acceptance Criteria:**
- All hooks follow the existing TanStack Query patterns in the codebase
- Mutations invalidate appropriate query keys
- `useTodayState()` returns the full bucket + progress state

### 4.4 Rewrite useTimerState Hook

- [ ] Rewrite `_hooks/use-timer-state.ts` to maintain the **same return interface** (`UseTimerStateReturn`) so all UI components remain unchanged:
  - `isHydrated` — true after initial `useTodayState()` query succeeds (use `isSuccess` from the query)
  - `allBuckets` — mapped from `useTodayState().data.buckets`, converting `ServerBucket` to `TimeBucket` (compute `elapsedSeconds` live: if `startedAt` is set, add `floor((now - startedAt) / 1000)`)
  - `todaysBuckets` — filtered from `allBuckets` using `isBucketActiveToday()`
  - `activeBucketId` — derived: the bucket whose `startedAt` is not null
  - `completedBuckets` — `Set<string>` tracking buckets completed during this session (for animations). Populated from SSE `timer-completed` events, not from initial load
  - `toggleBucket(id)` — if active, call `stopTimer` mutation; otherwise call `startTimer` mutation
  - `addBucket(bucket)` — call `createBucket` mutation
  - `removeBucket(id)` — call `deleteBucket` mutation
  - `updateBucket(id, updates)` — call `updateBucket` mutation
  - `resetBucketForToday(id)` — call `resetTimer` mutation, clear from `completedBuckets`
  - `setRemainingTime(id, remainingSeconds)` — call `setTimerTime` mutation
  - **Local 1-second interval**: when `activeBucketId` is set, run a `setInterval` that increments a local `tickOffset` counter. The displayed elapsed time = server's `elapsedSeconds + floor((now - startedAt) / 1000)`. The interval just forces a re-render each second — it doesn't track state, it recalculates from the server timestamp
  - **SSE integration**: use `useTimerSSE` to listen for events:
    - `onTimerCompleted(bucketId)` → add to `completedBuckets` set, invalidate `timerKeys.today`
    - `onDailyReset()` → invalidate `timerKeys.today`, clear `completedBuckets`
    - Other events → invalidate `timerKeys.today` (ensures UI reflects latest server state)
- [ ] Rewrite tests in `__tests__/use-timer-state.test.ts`:
  - Mock API functions instead of localStorage
  - Test that toggle calls start/stop mutations
  - Test that SSE completion event adds to `completedBuckets`
  - Test that the 1-second interval causes re-render with updated elapsed time
  - Test that `isHydrated` tracks query success state

**Acceptance Criteria:**
- `UseTimerStateReturn` interface is identical — no UI component changes needed
- Clicking a bucket calls the server (not localStorage)
- Timer counts down visually via local interval reading `startedAt` from server state
- Closing and reopening the browser shows accurate elapsed time
- Server-side completion (browser closed) is reflected when the page reopens
- SSE completion event triggers animation and chime in real time

### 4.5 localStorage Migration & Cleanup

- [ ] Add one-time migration logic to `timer-grid.tsx` (or a dedicated migration utility):
  - On mount, check if `localStorage.getItem('time-buckets-state')` exists
  - If so, parse it and POST each bucket to `POST /timers/buckets` (skip if a bucket with the same name already exists on the server, to handle partial migrations)
  - For each bucket, if it has `elapsedSeconds > 0` for today, also call `setTimerTime` to set progress
  - On success, remove the localStorage key
  - Wrap in try/catch — if migration fails, leave localStorage intact (user can retry next load)
- [ ] Remove from `timer-types.ts`: `STORAGE_KEY` constant, `DEFAULT_BUCKETS` array
- [ ] Remove from `use-timer-state.ts`: `loadState()` function, all localStorage read/write logic
- [ ] Remove `loadState` tests from test file
- [ ] Update `timer-grid.tsx`: remove any direct localStorage references

**Acceptance Criteria:**
- Existing localStorage data is migrated to the server on first load after upgrade
- localStorage key is cleaned up after successful migration
- Failed migration doesn't lose data (localStorage preserved)
- No localStorage references remain in the timer codebase after cleanup
- Default buckets come from the server seed, not the client

---

## Dependency Graph

```
Phase 1 (Database Foundation)
  1.1 Schema ─→ 1.2 Seed
                  │
Phase 2 (Service Layer)
  2.1 Bucket CRUD ─→ 2.2 Daily Progress ─→ 2.3 Timer Scheduler
       │                    │                      │
Phase 3 (API & Real-Time)  │                      │
  3.1 SSE Infrastructure ──┤                      │
       │                    │                      │
  3.2 Bucket Routes ←──────┘                      │
       │                                           │
  3.3 Timer Control Routes ←──────────────────────┘
       │
  3.4 Server Wiring
       │
Phase 4 (Client Migration)
  4.1 API Client & Types
       │
  4.2 SSE Hook ──→ 4.3 TanStack Query Hooks
       │                    │
       └────────→ 4.4 Rewrite useTimerState ←──┘
                            │
                  4.5 Migration & Cleanup
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Server stores `startedAt` timestamps, not a running counter | No server-side ticking process needed. Elapsed time is derived via `elapsedSeconds + (now - startedAt)`. Survives browser close, server restart, and network interruption |
| Express (Fastify) routes, not tRPC | Matches existing codebase patterns. Timer API is ~6 endpoints — not enough surface area to justify adding tRPC's dependency weight. Can be revisited when the project adds more server features |
| SSE over WebSocket for timer events | Simpler protocol for server→client push. No bidirectional channel needed (mutations go via REST). `EventSource` auto-reconnects natively. Establishes the SSE pattern for future real-time features |
| Timer scheduler uses in-process `setTimeout` | Single-user SQLite app doesn't need an external job queue. Precise to the millisecond. Server restart recovery via `init()` scan handles the edge case |
| `useTimerState` return interface unchanged | All UI components (grid, bucket, animations, context menus, sounds) remain untouched. The migration is entirely beneath the hook boundary |
| Daily progress rows kept as history | Free storage in SQLite. Enables future "time spent this week/month" analytics. Rows accumulate naturally — no cleanup job needed |
| Single-active timer enforced at service layer | `startTimer()` stops any running timer before starting the new one. Prevents impossible states in the database regardless of client behavior |
| Client keeps local 1-second interval for UI | Purely cosmetic — recalculates from `startedAt` each tick. No state to persist or recover. Server is always the source of truth |
| 3AM reset is server-driven | Works even when browser is closed. Server stops all running timers, writes elapsed to yesterday's row, broadcasts SSE to any connected clients |
