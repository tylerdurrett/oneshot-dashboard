# Feature: Server-Tracked Timers

**Date:** 2026-03-24
**Status:** Planning

## Summary

Migrate the Bucket Timers system from client-side localStorage persistence to server-tracked timing with database storage. The server becomes the source of truth for when timers start and stop, enabling timers to continue running even when the browser is closed.

## Motivation

The current implementation stores all timer state in localStorage and relies on the client to count seconds. If the user closes their browser while a timer is running, the app attempts wall-clock recovery on reload — but this is fragile and cannot support future features like server-side notifications.

With server-tracked timing, the server records `startedAt` timestamps and computes elapsed time on demand. A timer "runs" because time is passing since `startedAt` was recorded — no active process ticks on the server.

## Key Behaviors

### Server-Tracked Timing
- **Start**: Server sets `startedAt = NOW()` on the daily progress row
- **Stop**: Server computes `elapsedSeconds += (now - startedAt)`, clears `startedAt`
- **Current elapsed** (derived): If paused → `elapsedSeconds`. If running → `elapsedSeconds + (now - startedAt)`
- **Close browser**: `startedAt` persists in DB. Reopen → server returns accurate state

### Server-Side Completion Detection
- When a timer starts, the server calculates its exact completion time and schedules an in-process job (`setTimeout`)
- When the job fires: mark complete in DB, broadcast SSE event to connected clients
- On every state fetch, server also checks for missed completions (covers server restart)

### 3AM Daily Reset (Server-Driven)
- Server schedules a 3AM job that stops all running timers
- Elapsed time is written to yesterday's progress row, `startedAt` is cleared
- SSE event notifies connected clients to refetch

### Real-Time Updates via SSE
- `GET /timers/events` — Server-Sent Events stream
- Events: `timer-completed`, `daily-reset`
- Foundation for future real-time patterns across the project

### Daily Progress History
- Progress rows are kept per (bucket, date) — not deleted on reset
- Enables future analytics (time spent per day/week)

## What Stays Client-Side
- 1-second UI interval for the visual countdown (purely cosmetic, derives from server state)
- Treemap layout, animations, context menus, sounds — all unchanged
- Day-of-week display filtering (which buckets to show today)

## What Changes
- `useTimerState` hook: rewritten to fetch from server API + listen to SSE
- No more localStorage persistence or time-recovery logic
- New: database tables, server services, API routes, timer scheduler, SSE endpoint
- New: TanStack Query hooks for timer data (matching existing thread hook patterns)

## Migration
- On first load, check if localStorage has timer data
- If so, POST it to the server to seed the database
- Clear localStorage after successful migration
