# Implementation Guide: Fullscreen Chat with Sessions

**Date:** 2026-02-21
**Feature:** Fullscreen Chat with Sessions
**Source:** [2026-02-21_feature-description.md](./2026-02-21_feature-description.md)

## Overview

This guide implements the foundational chat experience: a fullscreen `/chat` route connected to a Fastify agent server that streams Claude responses from a Docker sandbox over WebSocket. Conversations persist as threads in SQLite.

The implementation is sequenced **backend-first, then frontend**, so each phase produces testable artifacts without waiting for the full stack. Database schema comes first (everything depends on it), then the Fastify server with HTTP endpoints (testable via curl), then Docker sandbox integration (testable independently), then WebSocket streaming, and finally the frontend chat UI wired to the live backend. Thread management (list, switch, new) is layered on last since it builds on a working single-thread flow.

Key architectural assumptions for v0.0:
- Single pre-authenticated Docker sandbox (manually set up by the developer)
- SQLite with WAL mode for safe concurrent access from Next.js and Fastify
- No auth, no multi-user — one user, one sandbox
- Thread titles are simple truncations of the first message (no LLM generation)

## File Structure

```
apps/
  server/                          ← NEW: Fastify agent server
    package.json
    tsconfig.json
    vitest.config.ts
    .env                           ← Committed: safe defaults (sandbox name, workspace path)
    src/
      index.ts                     ← Server entry, registers plugins
      config.ts                    ← Reads port from project.config.json, env for sandbox config
      plugins/
        websocket.ts               ← WebSocket plugin registration
      routes/
        threads.ts                 ← GET /threads, GET /threads/:id/messages, POST /threads
        chat.ts                    ← WebSocket /chat endpoint
      services/
        sandbox.ts                 ← Docker sandbox probe, exec, stream parsing
        thread.ts                  ← Thread CRUD database operations
      __tests__/
        sandbox.test.ts
        thread.test.ts
        threads-routes.test.ts

apps/web/
  src/app/
    chat/
      page.tsx                     ← NEW: Fullscreen chat route
      use-chat-socket.ts           ← NEW: WebSocket hook for streaming
      thread-selector.tsx          ← NEW: Thread dropdown component

packages/db/
  src/
    schema.ts                      ← MODIFIED: Add threads + messages tables

scripts/
  get-server-port.mjs             ← NEW: Reads serverPort from project.config.json
```

---

## Phase 1: Database Schema

**Purpose:** Add `threads` and `messages` tables to `@repo/db` so all downstream work has a data layer.

**Rationale:** Everything — server endpoints, persistence, frontend queries — depends on the schema. Placing it first means every subsequent phase can write tests against real tables.

### 1.1 Add threads and messages tables

- [x] Add `threads` table to `packages/db/src/schema.ts` with columns: `id` (text, primary key), `title` (text, not null), `claudeSessionId` (text, nullable), `createdAt` (integer, timestamp, default now), `updatedAt` (integer, timestamp, default now)
- [x] Add `messages` table with columns: `id` (text, primary key), `threadId` (text, foreign key to threads), `role` (text, enum: user/assistant), `content` (text), `createdAt` (integer, timestamp, default now)
- [x] Use `crypto.randomUUID()` for ID generation at the application layer (not auto-increment — these are text PKs)
- [x] Export both tables from `packages/db/src/index.ts` (already covered by `export * from './schema'`)

**Acceptance Criteria:**
- `threads` and `messages` tables exist in schema with correct column types
- Foreign key from `messages.threadId` to `threads.id` is defined
- Existing `users` table is untouched

### 1.2 Generate and apply migration

- [x] Run `pnpm --filter @repo/db db:generate` to create the migration file
- [x] Review the generated `.sql` file in `packages/db/drizzle/` to verify it creates the expected tables and columns
- [x] Run `pnpm --filter @repo/db db:migrate` to apply the migration to the local database
- [x] Commit the schema change and migration file together

**Acceptance Criteria:**
- Migration file is generated in `packages/db/drizzle/`
- `db:migrate` completes without errors
- Schema test confirms both tables are queryable

### 1.3 Write schema tests

- [x] Add tests in `packages/db/src/__tests__/schema.test.ts` verifying: threads table exports correctly, messages table exports correctly, column types match expectations
- [x] Run `pnpm --filter @repo/db test` — all tests pass

**Acceptance Criteria:**
- Schema tests pass
- Tests validate table structure and column definitions

---

## Phase 2: Agent Server Bootstrap

**Purpose:** Create the `apps/server` Fastify application with HTTP thread endpoints, testable via curl before any Docker or WebSocket integration.

**Rationale:** A working HTTP server with thread CRUD lets us validate the data layer end-to-end. Decoupling this from WebSocket/sandbox keeps the initial surface small and testable.

### 2.1 Scaffold the Fastify app

- [x] Create `apps/server/` directory with `package.json` (`@repo/server`), `tsconfig.json` (extending `@repo/typescript-config`), and `vitest.config.ts`
- [x] Add dependencies: `fastify`, `@fastify/websocket`, `@fastify/cors`, `@repo/db`, `dotenv` (for loading `.env` files)
- [x] Add dev dependencies: `tsx` (for dev runner), `vitest`, `@repo/typescript-config`, `@repo/eslint-config`
- [x] Add scripts: `"dev": "tsx watch src/index.ts"`, `"build": "tsc"`, `"test": "vitest run"`, `"lint": "eslint ."`
- [x] Create `src/config.ts` that reads `serverPort` from `project.config.json` (following the same pattern as `scripts/get-port.mjs`), and reads sandbox config (`SANDBOX_NAME`, `SANDBOX_WORKSPACE`) from environment variables via `dotenv`
- [x] Create `src/index.ts` with basic Fastify server startup using the port from config
- [x] Create `apps/server/.env` (committed) with safe defaults and comments for all env vars:
  ```
  # Docker sandbox configuration
  SANDBOX_NAME=my-sandbox
  SANDBOX_WORKSPACE=/workspace
  ```
- [x] Add `apps/server` to pnpm workspace (already covered by `apps/*` glob in `pnpm-workspace.yaml`)

**Acceptance Criteria:**
- `pnpm --filter @repo/server dev` starts a Fastify server on the port from `project.config.json`
- Server responds to `GET /health` with `{ status: "ok" }`
- TypeScript compiles without errors

> **Implementation Notes (2.1):**
> - `src/index.ts` exports a `buildServer()` factory function (Fastify best practice) to enable `fastify.inject()` testing without starting a real server. The server only starts when not in Vitest (`!process.env.VITEST` guard).
> - `buildServer()` accepts an optional `{ logger?: boolean }` param so tests can suppress Pino output.
> - `tsconfig.json` extends `base.json` (not `library.json`) — `noEmit: true` from base means `tsc` only type-checks, which is correct since `tsx` runs source directly.
> - `config.ts` supports both `serverPort` (for Phase 2.4) and fallback `port + 2` from `project.config.json`.
> - Added a health endpoint test in `src/__tests__/health.test.ts` to validate the scaffold works.

### 2.2 Thread service layer

- [x] Create `src/services/thread.ts` with functions: `createThread(title)`, `getThread(id)`, `listThreads()`, `getThreadMessages(threadId)`, `addMessage(threadId, role, content)`, `updateThreadSessionId(threadId, sessionId)`, `updateThreadTitle(threadId, title)`
- [x] All functions use Drizzle ORM queries against `@repo/db`
- [x] `listThreads()` returns threads ordered by `updatedAt` descending
- [x] Write unit tests in `src/__tests__/thread.test.ts` using an in-memory SQLite database

**Acceptance Criteria:**
- All thread service functions work correctly
- Tests pass with in-memory database
- Thread listing is ordered most-recent-first

> **Implementation Notes (2.2):**
> - All service functions use dependency injection for the database parameter (`database: Database = db`) — defaults to the shared `@repo/db` client for production, but tests pass an in-memory libsql instance.
> - `Database` type is inferred as `typeof defaultDb` from the shared drizzle client, avoiding manual type construction.
> - Test database uses `@libsql/client` with `url: ':memory:'` and raw SQL DDL to create tables. Both `@libsql/client` and `drizzle-orm` added as dev dependencies to `@repo/server` since pnpm strict mode doesn't hoist transitive deps.
> - `addMessage()` also updates the parent thread's `updatedAt` timestamp to keep `listThreads()` ordering accurate.
> - 14 unit tests cover all 7 service functions including edge cases (nonexistent IDs, empty results, timestamp updates).

### 2.3 Thread HTTP routes

- [x] Create `src/routes/threads.ts` with Fastify route plugin:
  - `GET /threads` — returns `{ threads: [...] }` via `listThreads()`
  - `GET /threads/:id/messages` — returns `{ messages: [...] }` via `getThreadMessages(id)`, 404 if thread not found
  - `POST /threads` — accepts `{ title?: string }` body, creates thread with title (or "New conversation"), returns `{ thread: { id, title, ... } }`
- [x] Register routes in `src/index.ts`
- [x] Write integration tests in `src/__tests__/threads-routes.test.ts` using `fastify.inject()`
- [x] Enable CORS for the frontend origin (derived from `project.config.json` web port)

**Acceptance Criteria:**
- All three endpoints return correct responses
- `POST /threads` creates a thread and returns it
- `GET /threads/:id/messages` returns 404 for nonexistent thread
- Integration tests pass
- CORS headers are present in responses

> **Implementation Notes (2.3):**
> - Route plugin (`threadRoutes`) accepts an optional `database` parameter via `ThreadRoutesOptions`, following the same dependency injection pattern as the service layer. This enables full integration testing with in-memory SQLite via `buildServer({ database: testDb })`.
> - `buildServer()` now accepts `BuildServerOptions` with optional `logger` and `database` fields. The database is threaded through to the route plugin.
> - CORS is registered via `@fastify/cors` with origin set to `config.webOrigin` (`http://localhost:{port}` derived from `project.config.json`).
> - Added `webOrigin` to `config.ts` to centralize the web origin derivation.
> - 10 integration tests covering: empty thread list, thread ordering, thread creation with/without title, 404 for missing thread, empty/populated messages, CORS headers, and CORS preflight.

### 2.4 Integrate with Turborepo and monorepo tooling

**Port convention:** Web = N, Remotion Studio = N+1, Agent Server = N+2 (where N is the port from `pnpm hello`).

- [x] Update `scripts/setup.mjs` (`pnpm hello`):
  - Add `serverPort` (webPort + 2) to `project.config.json` output
  - Update the console output to show: "Dev server on port N, Remotion Studio on N+1, Agent server on N+2"
- [x] Create `scripts/get-server-port.mjs` (mirrors `get-port.mjs` but reads `serverPort`, defaults to 3002)
- [x] Update `apps/server/package.json` dev script to read port: `"dev": "tsx watch src/index.ts"` (port read in `src/config.ts` from `project.config.json`)
- [x] Verify `turbo.json` `dev` task picks up `apps/server` automatically (it should — `dev` task has no filter and `apps/*` is in the workspace)
- [x] Test that `pnpm dev` starts Next.js, and the Fastify server concurrently
- [x] Update `pnpm go` if needed — currently `turbo run dev studio`, which should pick up the server's `dev` task via turbo
- [x] Update `scripts/stop-dev-processes.mjs`:
  - Change `getTargetPorts(devPort)` to return `[devPort, devPort + 1, devPort + 2]` (adds server port)
  - Update console messages to mention all three services
- [x] Update `AGENTS.md`:
  - Add `apps/server` (`@repo/server`) to the Monorepo Structure section
  - Add `pnpm --filter @repo/server dev` to the Key Commands table
  - Update `pnpm dev` description to mention it starts the agent server too
  - Update `pnpm go` description if changed
- [x] Run `pnpm hello` to regenerate `project.config.json` with the new `serverPort` field

**Acceptance Criteria:**
- `pnpm hello` writes both `port` and `serverPort` to `project.config.json`
- `pnpm dev` starts both `apps/web` and `apps/server` concurrently on their respective ports
- `pnpm go` starts all three services (web, studio, server)
- `pnpm stop` kills processes on all three ports (web, studio, server)
- `AGENTS.md` reflects the new app and commands

> **Implementation Notes (2.4):**
> - `project.config.json` was updated directly with `serverPort: 3202` (port 3200 + 2) instead of running interactive `pnpm hello`, since setup is interactive and the config already existed.
> - `pnpm go` (`turbo run dev studio`) automatically picks up `@repo/server#dev` — no changes needed. The server runs as part of the `dev` pipeline.
> - `turbo.json` required no changes — the existing `dev` task (persistent, no cache) automatically includes all workspace packages with a `dev` script.
> - `apps/server/package.json` dev script was already correct (`tsx watch src/index.ts`) — port reading was already handled in `src/config.ts` from Phase 2.1.
> - `get-server-port.mjs` includes a fallback chain: `serverPort` → `port + 2` → `3002`.
> - Updated `getTargetPorts` test assertion from `[3300, 3301]` to `[3300, 3301, 3302]`.

---

## Phase 3: Docker Sandbox Integration

**Purpose:** Build the sandbox service layer that probes, invokes, and streams Claude responses from the Docker sandbox.

**Rationale:** This is the core complexity of the backend. Isolating it in its own phase means we can test sandbox communication independently of WebSocket and HTTP concerns. The reference doc at `docs/_reference/docker-sandbox-claude.md` provides proven patterns.

### 3.1 Sandbox probe and health check

- [x] Create `src/services/sandbox.ts` with a `probeSandbox()` function that runs `docker sandbox exec -w <workspace> <sandbox-name> claude auth status --json`
- [x] Parse the JSON output and verify `loggedIn: true` and `apiProvider: "firstParty"`
- [x] Reject API-key fallback auth
- [x] On startup, call `probeSandbox()` and log clear success/failure messages with instructions if the sandbox is unavailable or unauthenticated
- [x] Add a `GET /health` endpoint enhancement that includes sandbox status
- [x] Write tests with mocked `child_process.spawn` for probe success, auth failure, and sandbox unavailable scenarios

**Acceptance Criteria:**
- `probeSandbox()` correctly identifies healthy, unhealthy, and missing sandboxes
- Server logs clear instructions when sandbox is not available
- Health endpoint reports sandbox status
- Tests cover all error classification paths

> **Implementation Notes (3.1):**
> - `probeSandbox()` uses dependency injection for the spawn function (`spawnFn: SpawnFn = defaultSpawn`), matching the thread service's database DI pattern. Timeout is also injectable (`timeoutMs = 30_000`) so tests can use short values.
> - The function **never rejects** — it always resolves with a `SandboxProbeResult { status, message }`. Callers check `result.status` instead of try/catch.
> - Error classification checks unavailability patterns before auth patterns (per reference doc: "Check auth patterns first" applies to prompt context; for probes, unavailability takes priority since the sandbox must exist before auth matters).
> - `buildServer()` now accepts `spawnFn?: SpawnFn` in `BuildServerOptions`. The health endpoint closes over a `sandboxStatus` variable updated by `runSandboxProbe()`. Returns `{ status: 'unknown' }` until the probe runs.
> - `buildServer()` returns `Object.assign(server, { runSandboxProbe })` for full type safety — no `as any` casts needed.
> - Tests use a `createFakeSpawn()` factory with plain `EventEmitter` objects for stdout/stderr (not `Readable` streams) to avoid buffering timing issues.
> - 15 sandbox probe tests + 3 health endpoint tests (42 total across all server test files). Covers: healthy OAuth, `loggedIn: false`, API key auth, non-firstParty provider, auth error patterns in stderr, unavailability patterns, spawn ENOENT, unknown errors, timeout, invalid JSON, pattern priority, and correct command args.

### 3.2 Claude invocation with NDJSON stream parsing

- [x] Add `invokeClaude(prompt, sessionId?)` function to `src/services/sandbox.ts` that spawns `docker sandbox exec` with `--output-format stream-json` and `--permission-mode bypassPermissions`
- [x] If `sessionId` is provided, add `--resume <sessionId>` flag
- [x] Return a Node.js readable stream that emits parsed NDJSON events line-by-line
- [x] Implement `extractTextFromStreamLine()` following the reference doc pattern — handles `content_block_delta`, `assistant`, and `result` event types
- [x] Implement inactivity timeout (configurable, default 10 minutes) that kills the process if no output arrives
- [x] Handle non-zero exit codes gracefully — try to parse stdout before throwing
- [x] Handle resume failures by detecting error patterns and starting a new session
- [x] Write tests with mocked spawn for: successful streaming, resume success, resume failure fallback, timeout, and non-zero exit with valid output

**Acceptance Criteria:**
- `invokeClaude()` streams text tokens as they arrive
- Session ID is extracted from the `result` event
- Resume failures fall back to new session gracefully
- Inactivity timeout kills hung processes
- Non-zero exits with valid output are handled correctly
- All error classification patterns from the reference doc are covered

> **Implementation Notes (3.2):**
> - `invokeClaude()` returns an `EventEmitter` (not a `Readable` stream) since the consumer (Phase 4 WebSocket) needs to react to typed events (`text`, `result`, `error`, `close`, `resume_failed`) rather than read a generic stream. This is more idiomatic for the event-driven pattern.
> - Uses the same spawn DI pattern as `probeSandbox()` — `spawnFn` defaults to `child_process.spawn`, tests pass a fake.
> - Inactivity timeout uses `setInterval` with a configurable check interval (5 seconds or the timeout value, whichever is smaller). Tests use 50ms timeout for speed.
> - Line buffering handles NDJSON lines split across multiple `stdout` chunks — data is buffered and only complete lines (terminated by `\n`) are processed. A dedicated test verifies this with a line split mid-JSON.
> - `processStreamLine()` emits `text` events for `content_block_delta` and `assistant` types, and `result` events for the `result` type. The `result` event carries both the full text and session ID.
> - Error classification priority follows the reference doc: auth → unavailability → resume → unknown. Specifically, resume failure auto-retry is suppressed when auth failure patterns are also present (auth takes priority).
> - `runInvocation()` calls itself recursively on resume failure with `sessionId = undefined`, reusing the same `EventEmitter`. The `resume_failed` event is emitted before the retry so consumers can track this.
> - Non-zero exit with valid NDJSON: the `result` event is already emitted during line-by-line streaming, so `parseResultFromOutput()` just confirms a result existed and the close is clean (no error emitted).
> - 23 new tests added (10 `extractTextFromStreamLine` + 13 `invokeClaude`) for a total of 38 sandbox tests and 65 across all server test files. Covers: all NDJSON event types, edge cases (empty, non-JSON, unknown type), successful streaming, correct docker args with/without resume, resume failure fallback, auth-over-resume priority, inactivity timeout, non-zero exit with/without valid output, auth/unavailability classification, spawn error, and line buffering across chunks.

---

## Phase 4: WebSocket Streaming

**Purpose:** Wire the WebSocket endpoint that connects the frontend to the sandbox streaming, with message persistence.

**Rationale:** With HTTP endpoints and sandbox service already tested, this phase adds the real-time layer. It's the bridge between frontend and backend and needs its own focused implementation.

### 4.1 WebSocket plugin setup

- [x] Create `src/plugins/websocket.ts` that registers `@fastify/websocket`
- [x] Register the plugin in `src/index.ts`

**Acceptance Criteria:**
- WebSocket upgrade works on the Fastify server
- A test WebSocket connection can be established

> **Implementation Notes (4.1):**
> - `src/plugins/websocket.ts` is a thin re-export of `@fastify/websocket` (`export { default as websocket } from '@fastify/websocket'`). The plugin is registered directly via `server.register(websocket)` in `buildServer()` — matching the CORS pattern — rather than wrapping it in a custom plugin function. This avoids Fastify encapsulation issues since `@fastify/websocket` uses `fastify-plugin` internally to break scope.
> - Added `ws` and `@types/ws` as dev dependencies for WebSocket client testing (pnpm strict mode prevents importing transitive deps from `@fastify/websocket`).
> - Tests use `server.injectWS()` (provided by `@fastify/websocket`) for WebSocket testing without starting a real server — similar to Fastify's `server.inject()` for HTTP.
> - Test routes must be registered inside `server.after()` so the websocket plugin's `onRoute` hook is active when the route is processed. Routes added at the top level (outside `register`/`after`) are processed before queued plugins initialize.
> - 2 new tests: bidirectional echo via WebSocket upgrade, and `websocketServer` property availability. 67 total tests across all server test files.

### 4.2 Chat WebSocket endpoint

- [x] Create `src/routes/chat.ts` with a WebSocket route at `/chat`
- [x] Handle incoming messages matching the protocol: `{ "type": "message", "threadId": "...", "content": "..." }`
- [x] On receiving a message:
  1. Validate `threadId` exists (send error if not)
  2. Persist the user message to the database via thread service
  3. Look up the thread's `claudeSessionId`
  4. Call `invokeClaude(content, sessionId)` to start streaming
  5. Forward each `content_block_delta` text token to the client as `{ "type": "token", "text": "..." }`
  6. On `result` event: persist the full assistant message, update thread's `claudeSessionId`, send `{ "type": "done", "messageId": "..." }`
  7. On error: send `{ "type": "error", "message": "..." }`
- [x] If this is the first message in a new thread, auto-generate the title from the user's message (first 60 chars, trimmed to word boundary) and update the thread
- [x] Disable sending while a response is streaming (ignore incoming messages for that connection until `done`)
- [x] Handle resume failures: if `--resume` fails, retry without `--resume` and update the thread's session ID

**Acceptance Criteria:**
- Client can send a message and receive streamed tokens back
- User and assistant messages are persisted to SQLite
- Thread's `claudeSessionId` is updated after each response
- Thread title is auto-generated from first message
- Errors are forwarded to the client as error events
- Resume failures fall back gracefully

> **Implementation Notes (4.2):**
> - `chatRoutes` plugin follows the same DI pattern as `threadRoutes` — `ChatRoutesOptions` accepts optional `database` and `spawnFn`. The `spawnFn` is needed here (unlike thread routes) because the chat route invokes Claude via the sandbox service.
> - `handleChatMessage()` is a standalone async function (not exported) that encapsulates the full message flow. The streaming lock is passed in via a `setStreaming` callback, keeping the function testable without closure coupling.
> - `generateTitle()` is exported for unit testing. It trims to word boundary with `...` suffix for truncated titles. Content ≤ 60 chars is returned as-is.
> - Resume failure handling is delegated entirely to `invokeClaude()` — the chat route just listens for events. When `invokeClaude` retries without `--resume`, it emits a new `result` event with the new `sessionId`, which is persisted via `updateThreadSessionId`.
> - A `resultReceived` flag in the event handler prevents the `close` safety net from prematurely releasing the streaming lock before the async `result` handler finishes persisting.
> - The `socket.on('message')` handler is wrapped in try/catch to prevent unhandled promise rejections from crashing the server. Errors are forwarded to the client as `{ type: 'error' }` messages.
> - `sendJSON()` checks `socket.readyState === OPEN` before sending to handle client disconnects during streaming gracefully.
> - First-message detection uses `getThreadMessages().length === 1` (after persisting the user message) rather than checking the title string, as the message count is the authoritative signal.
> - All 67 existing tests pass, TypeScript compiles cleanly.

### 4.3 Write WebSocket integration tests

- [x] Test the full flow: connect → send message → receive tokens → receive done
- [x] Test error scenarios: invalid thread ID, sandbox unavailable
- [x] Test thread title auto-generation on first message
- [x] Use mocked sandbox service to avoid Docker dependency in tests

**Acceptance Criteria:**
- All WebSocket flow tests pass
- Error scenarios are covered
- Tests run without Docker

> **Implementation Notes (4.3):**
> - 12 integration tests in `src/__tests__/chat-routes.test.ts` organized into 6 groups: happy path (3), title auto-generation (2), error scenarios (4), streaming lock (1), session resume (2).
> - Reuses the same test infrastructure patterns: `createTestDb()` (in-memory SQLite), `createFakeSpawn()` (mocked child_process), `ndjson()` helper, and `server.injectWS('/chat')` for WebSocket testing.
> - `collectWsMessages()` helper collects all WS messages until `done` or `error` with a configurable timeout, simplifying assertions across tests.
> - Streaming lock test uses a two-phase spawn mock: emits a token immediately (via `process.nextTick`), then delays the result by 100ms. The test waits for the first token (confirming the lock is active) before sending the second message. This avoids the race condition where both messages enter `handleChatMessage()` before `setStreaming(true)` is called (since it runs after async DB operations).
> - Session resume test uses `updateThreadSessionId()` to manually set a stale session ID, then verifies `--resume` flag is passed and the retry without `--resume` succeeds with a new session ID persisted.
> - All 79 tests pass across 6 test files (12 new + 67 existing). Lint clean.

---

## Phase 5: Frontend Chat UI

**Purpose:** Build the `/chat` route with real-time streaming display, using the existing AI Elements components.

**Rationale:** With the backend fully functional and testable, the frontend can be built against a live server. The existing prototype at `apps/web/src/app/prototype/chat/page.tsx` provides a proven component composition pattern to build from.

### 5.1 WebSocket hook

- [x] Create `apps/web/src/app/chat/use-chat-socket.ts` — a custom React hook that manages the WebSocket connection
- [x] Hook API: `useChatSocket({ serverUrl })` returns `{ sendMessage(threadId, content), messages, isStreaming, error, connectionStatus }`. The `serverUrl` is derived from `NEXT_PUBLIC_SERVER_URL` env var (set in `next.config.ts` from `project.config.json`'s `serverPort`)
- [x] Handle incoming event types: `token` (append to current assistant message), `done` (finalize message), `error` (set error state)
- [x] Implement auto-reconnect with exponential backoff on disconnect
- [x] Track connection status: `connecting`, `connected`, `disconnected`
- [x] Write unit tests for the hook using a mock WebSocket

**Acceptance Criteria:**
- Hook establishes WebSocket connection on mount
- `sendMessage` sends the correct protocol message
- Tokens accumulate into a streaming message
- `done` event finalizes the message
- Auto-reconnect works with backoff
- Connection status is tracked accurately

> **Implementation Notes (5.1):**
> - Hook API simplified from `useChatSocket({ serverUrl })` to `useChatSocket()` — the server URL is derived internally from `NEXT_PUBLIC_SERVER_PORT` env var (exposed via `next.config.ts` reading `project.config.json`). No need to pass it as a parameter since it's a build-time constant.
> - Also returns `setMessages` so thread switching (Phase 6) can replace the message array when loading a different thread's history.
> - `sendMessage` uses a ref (`isStreamingRef`) for the streaming guard instead of the state value in the closure, giving `sendMessage` a stable identity (empty dependency array) and avoiding unnecessary re-renders in consumers.
> - `sendMessage` optimistically appends both the user message and an empty assistant placeholder. Tokens from the server append to this placeholder. The `done` event replaces the temporary streaming ID with the real server-assigned message ID.
> - `ws.send()` is wrapped in try/catch to handle the edge case where the socket closes between the `readyState` check and the actual send. On failure, the error state is set and the streaming lock is released.
> - `next.config.ts` reads `serverPort` from `../../project.config.json` with fallback chain: `serverPort` → `port + 2` → `3002`. Exposed as `NEXT_PUBLIC_SERVER_PORT` via Next.js `env` config.
> - 15 unit tests covering: connection lifecycle, message send format, optimistic messages, token accumulation, done finalization, error handling, error clearing, streaming lock, unmount cleanup, exponential backoff timing, backoff reset on reconnect, ws.send failure, and external message setting. 23 total web tests.

### 5.2 Chat page layout and message display

- [x] Create `apps/web/src/app/chat/page.tsx` as a client component
- [x] Fullscreen layout: `h-dvh`, dark theme, no nav or sidebar
- [x] Use container-query-based scaling for message content width (not fixed `max-w-3xl`) so content adapts to viewport
- [x] Compose using AI Elements: `Conversation`, `ConversationContent`, `ConversationScrollButton`, `Message`, `MessageContent`, `MessageResponse`
- [x] Render messages from both the loaded history (HTTP) and live streaming (WebSocket)
- [x] Streaming assistant messages show content as it arrives (token by token via `MessageResponse`)
- [x] Auto-scroll to bottom on new messages (handled by `Conversation` + `StickToBottom`)
- [x] Add the `dark` class to the root HTML element for the chat route (or use layout-level class)

**Acceptance Criteria:**
- `/chat` renders a fullscreen dark chat interface
- Messages display with markdown rendering (bold, italic, lists, code blocks with syntax highlighting)
- Streaming tokens appear in real-time
- Auto-scroll works when new content arrives
- Content width scales with container, not uncomfortably wide on large screens
- **Visual test (chrome-devtools):** Screenshot `/chat` at desktop and narrow widths, verify dark theme, layout, and container-query scaling

> **Implementation Notes (5.2):**
> - Created `apps/web/src/app/chat/layout.tsx` as a server component wrapping children in `<div className="dark min-h-screen bg-background text-foreground">`, matching the prototype layout pattern.
> - `page.tsx` uses a two-div container query pattern: outer `@container` div establishes the query context at full viewport width, inner div uses `@3xl:max-w-2xl @5xl:max-w-3xl @7xl:max-w-4xl` with `mx-auto` for responsive centering. This is necessary because CSS container query elements cannot query themselves.
> - `PLACEHOLDER_THREAD_ID` was moved to a separate `constants.ts` file because Next.js App Router disallows named exports from page files (only `default`, `metadata`, `generateStaticParams`, etc. are valid).
> - `ConversationEmptyState` is shown when `messages.length === 0` with "What can I help you with?" title — this will be replaced by thread auto-creation in Phase 5.4.
> - `MessageResponse` (Streamdown-based) naturally handles streaming because its memo comparison detects changed `children` as tokens accumulate via `useChatSocket`.
> - 11 unit tests in `page.test.tsx` covering: layout structure (h-dvh, @container, container query max-width classes), empty state (shown/hidden), message rendering (user, assistant, multi-message order, streaming partial content), component presence, and PLACEHOLDER_THREAD_ID constant. 34 total web tests across 4 test files.

### 5.3 Chat input with streaming state

- [x] Use `PromptInputProvider`, `PromptInput`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputSubmit` from `@repo/ui`
- [x] Wire `onSubmit` to send messages via the WebSocket hook
- [x] Pass `status` to `PromptInputSubmit` — `"streaming"` while Claude is responding (disables input), `"ready"` otherwise
- [x] Input area positioned at the bottom of the viewport

**Acceptance Criteria:**
- User can type and submit messages
- Input is disabled while Claude is streaming
- Submit button shows appropriate state (send vs stop)
- Enter key submits, Shift+Enter adds newline
- **Visual test (chrome-devtools):** Screenshot the input area in ready and streaming states, verify disabled styling and button state

> **Implementation Notes (5.3):**
> - `PromptInputProvider` was omitted — it's only needed when external components need to trigger file dialogs or read input state, neither of which applies here. `PromptInput` manages its own internal state.
> - `handleSubmit` trims whitespace and ignores empty submissions before calling `sendMessage(PLACEHOLDER_THREAD_ID, text)`. The `sendMessage` dependency comes from `useChatSocket` which has a stable identity (empty dep array via refs).
> - Status mapping is minimal: `isStreaming ? 'streaming' : undefined`. The `undefined` case renders as idle (send icon). The `'streaming'` case renders the stop square icon. No `'submitted'` intermediate state is used since `sendMessage` sets `isStreaming` synchronously before sending — there's no gap between submit and streaming.
> - Input area uses `border-t border-border p-4` wrapper matching the prototype pattern, positioned naturally at the bottom of the flex column (after the `flex-1` Conversation area).
> - Enter/Shift+Enter behavior is handled natively by `PromptInputTextarea` — no additional wiring needed.
> - 7 new tests added (18 total in page.test.tsx, 41 total web tests): input rendering, placeholder text, submit wiring with PLACEHOLDER_THREAD_ID, whitespace rejection, idle status display, streaming status display, and border-t wrapper styling.

### 5.4 Thread data fetching with TanStack Query

- [x] Install and configure TanStack Query in the chat route (or app-wide if not already set up)
- [x] Create query hooks: `useThreads()` for `GET /threads`, `useThreadMessages(threadId)` for `GET /threads/:id/messages`
- [x] Create mutation: `useCreateThread()` for `POST /threads`
- [x] On page load: if no active thread, create a new one automatically
- [x] When switching threads, fetch messages and display them
- [x] Write tests for query hooks

**Acceptance Criteria:**
- Thread list loads from the server
- Thread messages load when a thread is selected
- New threads can be created
- Data refetches appropriately (e.g., thread list updates after new messages)

> **Implementation Notes (5.4):**
> - `@tanstack/react-query` v5 installed in `apps/web`. `QueryClientProvider` is scoped to the chat route via `ChatProviders` client component in `chat-providers.tsx`, keeping it out of the global layout. The chat `layout.tsx` remains a server component — `ChatProviders` is the client boundary.
> - API client (`api.ts`) provides typed fetch functions (`fetchThreads`, `fetchThreadMessages`, `createThread`) with types (`Thread`, `ThreadMessage`) matching server response shapes. Uses the same `NEXT_PUBLIC_SERVER_PORT` env var pattern as `use-chat-socket.ts`.
> - Query hooks (`use-threads.ts`): `useThreads()`, `useThreadMessages(threadId | null)` (with `enabled: !!threadId`), `useCreateThread()` (invalidates thread list on success). Structured `threadKeys` factory for cache management.
> - `PLACEHOLDER_THREAD_ID` and `constants.ts` deleted. The page now manages `activeThreadId` via `useState<string | null>`, set by auto-creating a thread on mount. A `creatingRef` guard prevents double-creation in React Strict Mode.
> - Thread list is invalidated when streaming ends (detected via `wasStreamingRef` tracking `isStreaming` transitions) so `updatedAt` stays current for Phase 6's thread list display.
> - `useThreadMessages` data is converted to `ChatMessage[]` and set via `setMessages()` when loaded, enabling thread switching in Phase 6. Empty arrays from new threads are skipped to avoid clearing optimistic messages.
> - 28 new tests added (8 API, 10 hooks, 10 updated page tests replacing PLACEHOLDER_THREAD_ID tests with active-thread-ID tests). 60 total web tests across 6 test files. All 177 tests pass across all packages. Build and lint clean.

### 5.5 Error display

- [x] Show inline error messages in the chat when: sandbox is unavailable, Claude errors during streaming, WebSocket disconnects
- [x] For streaming errors: preserve any tokens already received, show error indicator after partial response
- [x] Show connection status indicator when WebSocket is disconnected
- [x] Errors never crash the page — wrap in error boundaries where appropriate
- [x] Write tests for error display states

**Acceptance Criteria:**
- Sandbox-down error shows "Agent is offline. Check the Docker sandbox."
- Partial responses are preserved on error
- Connection status is visible when disconnected
- Page never crashes on any error scenario
- **Visual test (chrome-devtools):** Screenshot error states — inline error message, connection status indicator, partial response with error

> **Implementation Notes (5.5):**
> - Inline error display renders after messages inside `ConversationContent` as a `role="alert"` div with destructive theme styling (`border-destructive/50`, `bg-destructive/10`, `text-destructive`). Sandbox/offline errors are detected via regex (`/sandbox|offline/i`) and show the user-friendly "Agent is offline. Check the Docker sandbox." message.
> - Partial responses are preserved by design — error renders *after* the message list, not replacing it. The `useChatSocket` hook already keeps accumulated tokens in the message array when an error occurs.
> - Connection status indicator renders as a `role="status"` bar between the conversation area and the input area, showing "Connecting..." or "Disconnected. Reconnecting..." based on `connectionStatus`. Hidden when connected.
> - Next.js App Router error boundary (`error.tsx`) catches uncaught React errors with a dark-themed fullscreen fallback UI and "Try again" button that calls `reset()`.
> - No external component library additions needed — all styling uses existing Tailwind design tokens (`destructive`, `muted`, `border`, etc.).
> - 11 new tests added: 5 inline error tests (render, null, sandbox keyword, offline keyword, partial response preservation), 3 connection status tests (disconnected, connecting, connected hidden), 4 error boundary tests (message, fallback, reset click, layout classes). 72 total web tests across 7 test files. 189 total tests across all packages. Build and lint clean.

---

## Phase 6: Thread Management

**Purpose:** Add thread switching, browsing, and creation UI so users can manage multiple conversations.

**Rationale:** This is layered on after the single-thread flow works end-to-end. Thread management is additive — it doesn't change the core streaming flow, just wraps it with navigation.

### 6.1 Thread title bar and selector dropdown

- [x] Create `apps/web/src/app/chat/thread-selector.tsx` — a dropdown component showing the current thread title and a list of previous threads
- [x] Display current thread title at the top of the chat
- [x] Dropdown shows threads with title + relative timestamp (e.g., "2 hours ago")
- [x] Ordered by most recent first
- [x] Selecting a thread: loads its messages, switches the active thread for WebSocket messages
- [x] Use Shadcn `DropdownMenu` or `Select` component as the base

**Acceptance Criteria:**
- Thread title is visible at the top of the chat
- Dropdown lists all threads with titles and timestamps
- Selecting a thread loads its messages and resumes context
- Current thread is highlighted in the dropdown
- **Visual test (chrome-devtools):** Screenshot the title bar and open dropdown with multiple threads

> **Implementation Notes (6.1):**
> - `ThreadSelector` component uses `DropdownMenu` from `@repo/ui` (Radix-based) rather than `Select` — more flexible for the thread list UX with timestamps, active highlighting, and the "New thread" action at the bottom.
> - DropdownMenu components were already in `packages/ui/src/components/dropdown-menu.tsx` but weren't exported from the package index. Added the necessary exports to `packages/ui/src/index.ts`.
> - `formatTimeAgo()` utility in `apps/web/src/app/chat/format-time-ago.ts` converts epoch-second timestamps to relative strings ("just now", "2m ago", "3h ago", "5d ago", "2w ago", "3mo ago", "1y ago"). No external date library needed.
> - `lucide-react` added as a direct dependency of `apps/web` (pnpm strict mode prevents importing it transitively from `@repo/ui`). Used for `ChevronDown` and `Plus` icons.
> - The title bar is a `border-b` div positioned above the `Conversation` component inside the container-query-scaled inner div, so it respects the same responsive max-width.
> - Active thread is highlighted with `bg-accent/50` class on the corresponding `DropdownMenuItem`.
> - The "New thread" button is integrated directly into the `ThreadSelector` dropdown (below a separator) rather than as a separate top-right button, since the plan specified it should be in the dropdown (6.1) and also as a standalone button (6.2). The standalone "+" button will be added in 6.2.
> - Thread switching in `page.tsx`: `handleSelectThread` sets `activeThreadId` and clears messages immediately — the `useThreadMessages` query then refetches and populates from the server. `handleNewThread` creates a thread via the mutation and switches to it.
> - 18 new tests added: 8 `formatTimeAgo` tests, 10 `ThreadSelector` tests. Page tests updated with 4 new tests (title bar rendering, thread list passing, thread switching, new thread creation) plus mock updates for `useThreads` and `ThreadSelector`. 95 total web tests, 208 total across all packages. Build and lint clean.

### 6.2 New thread button

- [ ] Add a "+" button in the top-right corner of the chat
- [ ] Clicking it: creates a new thread (via `useCreateThread` mutation), switches to it, clears the message display
- [ ] The new thread starts empty and ready for input

**Acceptance Criteria:**
- "+" button is visible and accessible
- Clicking creates a new empty thread
- Chat switches to the new thread immediately
- Previous thread is still available in the dropdown
- **Visual test (chrome-devtools):** Screenshot showing the "+" button placement and the resulting empty thread state

### 6.3 Thread resumption flow

- [ ] When selecting a previous thread from the dropdown:
  1. Fetch messages via `GET /threads/:id/messages` and display them
  2. The WebSocket will use the thread's `claudeSessionId` for `--resume` on the next message
  3. If resume fails (stale session), the server starts a fresh Claude session — user still sees their history
- [ ] Write integration tests for the thread switching flow

**Acceptance Criteria:**
- Switching threads loads full message history
- Sending a message in a resumed thread uses `--resume`
- Stale session fallback works — messages display, new session starts
- No visual disruption during thread switches

---

## Phase 7: Polish and Edge Cases

**Purpose:** Handle remaining edge cases, add connection resilience, and verify the full flow end-to-end.

**Rationale:** Final phase to catch anything the earlier phases deferred. Focuses on production-readiness within v0.0 scope.

### 7.1 WebSocket reconnection and resilience

- [ ] Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] Show connection status indicator during reconnection
- [ ] On reconnect: do not replay messages — just re-establish the connection for new messages
- [ ] If a stream was in progress during disconnect: show an error indicator on the partial message
- [ ] Write tests for reconnection behavior

**Acceptance Criteria:**
- WebSocket auto-reconnects after disconnection
- Backoff prevents rapid reconnection loops
- User sees connection status during outage
- In-progress streams show error on disconnect

### 7.2 SQLite WAL mode and concurrent access

- [ ] Enable WAL mode on the SQLite database connection in `@repo/db` (or in the server startup)
- [ ] Verify that both Next.js and Fastify can read/write concurrently without locking errors
- [ ] Add a startup check that logs a warning if WAL mode is not enabled

**Acceptance Criteria:**
- WAL mode is enabled for the SQLite database
- Concurrent access from both processes works without errors

### 7.3 End-to-end verification

- [ ] Verify `pnpm test` passes across all packages
- [ ] Verify `pnpm build` succeeds
- [ ] Verify `pnpm lint` passes
- [ ] **Visual test (chrome-devtools):** Start `pnpm dev`, navigate to `/chat`, and screenshot the following scenarios:
  - Empty chat state (fresh thread, ready to type)
  - After sending a message with streamed response visible
  - Multi-turn conversation with several messages
  - Thread dropdown open with multiple threads listed
  - After switching to a previous thread (history loaded)
  - Error state (sandbox unavailable)
  - Dark theme, scrollbar styling, and container-query scaling at 1440px and 768px widths

**Acceptance Criteria:**
- All success criteria from the feature description are met
- All automated tests pass
- Build and lint succeed
- Chat works end-to-end with real Docker sandbox
- All visual test screenshots confirm correct layout, theming, and responsive behavior

---

## Dependency Graph

```
Phase 1 (Database Schema)
  1.1 → 1.2 → 1.3
    |
Phase 2 (Server Bootstrap)          Phase 3 (Sandbox Integration)
  2.1 → 2.2 → 2.3 → 2.4              3.1 → 3.2
    |                                    |
    +------------------------------------+
                    |
              Phase 4 (WebSocket)
                4.1 → 4.2 → 4.3
                    |
              Phase 5 (Frontend)
                5.1 → 5.2 → 5.3 → 5.4 → 5.5
                    |
              Phase 6 (Thread Management)
                6.1 → 6.2 → 6.3
                    |
              Phase 7 (Polish)
                7.1 → 7.2 → 7.3
```

Note: Phases 2 and 3 can be worked on in parallel since they're independent (server HTTP vs sandbox service). They converge at Phase 4 where the WebSocket endpoint ties them together.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Backend-first sequencing | Each backend phase is testable via curl/scripts without needing a UI. Reduces integration risk. |
| Phases 2 & 3 parallelizable | HTTP thread CRUD and Docker sandbox integration are independent concerns that converge at the WebSocket layer. |
| Fastify over Next.js API routes | WebSocket streaming with Docker subprocess piping is better suited to a standalone server. Keeps Next.js focused on UI. |
| Text primary keys (UUID) | Avoids auto-increment leaking information. UUIDs are generated at the app layer, not the database, making tests easier. |
| WAL mode for SQLite | Prevents locking when Next.js and Fastify access the same database file concurrently. |
| Container queries over max-width | Feature description specifies container-query-based scaling. Adapts to actual available space rather than viewport breakpoints. |
| Simple title truncation | v0.0 scope — no LLM-generated titles. First 60 chars of first message, trimmed to word boundary. |
| Prototype as reference, not base | The prototype at `apps/web/src/app/prototype/chat/` proves the component composition works, but the real page will have significant additional logic (WebSocket, thread management, error states). Build fresh rather than adapt the prototype. |
| Mocked sandbox in tests | All server tests mock `child_process.spawn` to avoid Docker dependency. End-to-end Docker testing is manual (Phase 7). |
| Auto-create thread on page load | User lands on `/chat` ready to type — no "create thread" step. A thread is created automatically if none is active. |
| Port convention: N, N+1, N+2 | Web, Remotion, Server ports derived from a single base port in `project.config.json`. Set once via `pnpm hello`, readable by all apps. No env var duplication. |
| Server URL from project.config.json | Frontend derives `NEXT_PUBLIC_SERVER_URL` from `serverPort` in `next.config.ts` rather than a separate `.env` entry. Ports stay centralized in one file. |
