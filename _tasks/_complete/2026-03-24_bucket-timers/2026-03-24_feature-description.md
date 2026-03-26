# Feature: Bucket Timers

**Date:** 2026-03-24
**Status:** Scoped

## Overview

A visual time management tool that fills the timers page with color-coded rectangular "buckets," each representing a time allocation for an activity. Buckets are sized proportionally using a treemap layout so larger time blocks take more visual space. Tapping a bucket starts its countdown; the vibrant color drains away as time elapses, revealing a muted layer underneath. Everything resets daily at 3:00 AM.

## End-User Capabilities

1. **See today's time buckets at a glance** — open the Timers tab and the full content area is filled with proportionally-sized, color-coded rectangles
2. **Start/stop a timer with one tap** — tap a bucket to start its countdown; tap it again (or tap a different bucket) to pause it; only one bucket runs at a time
3. **Watch time drain visually** — as a timer counts down, the vibrant color shrinks from right to left, revealing a muted background
4. **Get notified when a bucket completes** — a checkmark animation plays and a sound chimes when a timer reaches zero
5. **Manage buckets via context menu** — right-click (desktop) or long-press (mobile) a bucket to access settings, set remaining time, or reset for today
6. **Edit bucket properties** — change name, duration, color, and active days of the week through a settings dialog
7. **Add new buckets** — long-press (mobile) or secondary-click (desktop) the "Timers" nav item to add a bucket; also available as a button when no buckets exist
8. **Delete buckets** — remove a bucket through its settings dialog (with confirmation)
9. **Schedule buckets by day of week** — configure which days each bucket appears (e.g., weekdays only)
10. **Resume after closing the page** — if a timer was running, elapsed time is recovered on reload using a timestamp comparison
11. **Start fresh each day** — all elapsed times reset automatically at 3:00 AM local time

## Architecture / Scope

### Where it lives

All timer code lives within the existing `/timers` route inside the app shell (`(shell)/timers/`). The treemap fills the shell's content area — the sidebar (desktop) and bottom nav (mobile) remain visible.

### Component breakdown

- **TimerGrid** — measures available content area, runs the treemap algorithm, absolutely positions each bucket
- **TimerBucket** — individual bucket with two-layer color progress, adaptive text sizing for small rectangles, pointer events for tap and long-press, inline context menu, completion animation
- **BucketSettingsDialog** — modal form for editing name, duration (hours + minutes), color, and day-of-week schedule
- **Treemap algorithm** — squarified treemap utility that takes items with weights and container dimensions, returns positioned rectangles
- **useTimerState hook** — manages all state: bucket list, active timer, 1-second tick interval, localStorage persistence, daily reset, day-of-week filtering, time recovery on reload

### Nav-level "Add Bucket" interaction

The "Timers" nav item in the app shell gains a context menu (right-click / long-press) with an "Add Bucket" option. This is a small addition to the existing `AppShell` component.

### Data persistence

Client-only via localStorage. No database changes needed for v1.

## Technical Details

### Data model

Each bucket stores: id, name, totalMinutes, elapsedSeconds, colorIndex, and daysOfWeek array. The overall timer state tracks the list of buckets, which one is active, a lastActiveTime timestamp (for recovery), and a lastResetDate string (for daily reset).

### Treemap layout

A squarified treemap algorithm sorts buckets by remaining seconds (descending), recursively splits the available rectangle horizontally or vertically to keep sub-rectangles as close to square as possible. Bucket rectangles shrink as time elapses — completed buckets get minimal space (`Math.max(1, remaining)`). If all values are zero, an equal-sized grid fallback is used. Container has 8px padding and 4px gaps between buckets.

### Color system

10 color slots defined as CSS custom properties in OKLCH color space. Each slot has a vibrant and muted variant. Colors are assigned by index and cycle if more than 10 buckets exist. The color picker in the settings dialog shows all 10 options.

### Timer mechanics

- 1-second `setInterval` when a bucket is active
- Toggle behavior: tapping the active bucket pauses it; tapping a different bucket switches to it
- On completion: bucket stops, checkmark animation plays, completion sound plays
- Time recovery on page load: compare `Date.now()` to `lastActiveTime`, add the difference to `elapsedSeconds` (capped at total)

### Daily reset

At load time, compute the "reset date" (today's date, but if before 3:00 AM, use yesterday). If it differs from `lastResetDate`, zero out all `elapsedSeconds` and clear the active timer.

### Context menu

Desktop: right-click on a bucket. Mobile: 800ms long-press with 10px movement cancellation threshold and pointer capture. Menu options: Bucket Settings, Set Remaining Time, Reset for Today (with confirmation).

### Completion sound

A short audio chime plays when a bucket's timer reaches zero. The sound file will be a small bundled asset.

### File locations (within `apps/web/src/`)

All feature-specific — colocated under `app/(shell)/timers/`:
- `_components/timer-grid.tsx`
- `_components/timer-bucket.tsx`
- `_components/bucket-settings-dialog.tsx`
- `_hooks/use-timer-state.ts`
- `_lib/timer-types.ts`
- `_lib/treemap.ts`

Bucket color CSS variables added to `app/globals.css`.

## Risks and Considerations

- **localStorage limits** — not a concern for this data volume, but if we later want cross-device sync we'll need to migrate to the database
- **1-second interval accuracy** — `setInterval` can drift, but the timestamp-based recovery on reload compensates for any gaps
- **SSR hydration mismatch** — localStorage isn't available server-side; the `isHydrated` pattern (render nothing until client mount) handles this
- **Touch event complexity** — long-press detection with pointer capture, movement cancellation, and tap prevention requires careful event handling to feel right on mobile
- **Treemap readability at extremes** — a 5-minute bucket next to a 3-hour bucket will be tiny; minimum dimension constraints (120px wide, 80px tall) help but very lopsided configurations could still look odd
- **Tiny-bucket typography** — very small rectangles need fewer, deliberate text-size steps instead of one fixed type scale; keep labels trimmed and prioritize readable time text

## Non-Goals / Future Iterations

- **Database persistence / cross-device sync** — v1 is localStorage only
- **Browser notifications** — not in this iteration
- **Drag-to-reorder or resize buckets** — treemap handles layout automatically
- **Historical tracking / analytics** — no record of past days' usage
- **Multiple timer profiles or presets** — one set of buckets per browser
- **Light theme** — dark-theme-first per project conventions

## Success Criteria

1. The `/timers` page displays buckets as a treemap filling the content area within the app shell
2. Tapping a bucket starts its countdown; tapping again or tapping another bucket switches correctly
3. The vibrant-to-muted color drain animates smoothly as time elapses
4. Completion triggers a checkmark animation and audible chime
5. Right-click (desktop) and long-press (mobile) open a context menu with settings, set time, and reset options
6. Bucket settings dialog allows editing name, duration, color (10 options), and day-of-week schedule
7. New buckets can be added via the Timers nav item context menu or an empty-state button
8. State survives page refresh, and running timers recover elapsed time accurately
9. All buckets reset at 3:00 AM local time
10. Only buckets scheduled for the current day are displayed
