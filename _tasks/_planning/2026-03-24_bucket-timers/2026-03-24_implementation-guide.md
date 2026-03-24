# Implementation Guide: Bucket Timers

**Date:** 2026-03-24
**Feature:** Bucket Timers
**Source:** [2026-03-24_feature-description.md](./2026-03-24_feature-description.md)

## Overview

This guide builds the Bucket Timer system in four phases, ordered so that each phase produces a testable, visible result before moving to the next.

**Phase 1** lays the foundation: data types, the treemap algorithm, and the state management hook — all pure logic with unit tests, no UI yet. **Phase 2** wires up the visual layer: the timer grid, individual bucket rendering, and the color system. At the end of Phase 2 you can see buckets, tap to start/stop, and watch time drain. **Phase 3** adds the interaction layer: context menus, the settings dialog, and the "Add Bucket" flow. **Phase 4** adds polish: completion animations, the sound chime, and the empty state.

All new files are colocated under `apps/web/src/app/(shell)/timers/` using underscore-prefixed folders (`_lib/`, `_hooks/`, `_components/`) to keep them out of Next.js routing. The existing `@repo/ui` components (Dialog, AlertDialog, DropdownMenu, Button, Input) are used directly — no new shared components needed.

## File Structure

```
apps/web/src/app/(shell)/timers/
├── page.tsx                          # Updated — renders TimerGrid
├── _lib/
│   ├── timer-types.ts                # Interfaces, constants, color defs, utilities
│   └── treemap.ts                    # Squarified treemap layout algorithm
├── _hooks/
│   └── use-timer-state.ts            # State management, persistence, reset logic
├── _components/
│   ├── timer-grid.tsx                # Container: measures, computes layout, positions buckets
│   ├── timer-bucket.tsx              # Single bucket: progress viz, pointer events, context menu
│   └── bucket-settings-dialog.tsx    # Modal for editing bucket properties
└── __tests__/
    ├── timer-types.test.ts           # formatTime, getResetDate, isBucketActiveToday
    ├── treemap.test.ts               # Layout algorithm
    └── use-timer-state.test.ts       # Hook logic (toggle, reset, persistence, recovery)

apps/web/src/app/globals.css          # Add bucket color CSS variables
apps/web/src/components/app-shell.tsx  # Add context menu to Timers nav item
apps/web/public/sounds/
└── timer-complete.mp3                # Completion chime audio file
```

---

## Phase 1: Core Logic

**Purpose:** Build all pure-logic modules (types, treemap, state hook) with tests, before any UI.

**Rationale:** These modules have zero UI dependencies and can be fully unit-tested in isolation. Getting them right first means the UI phases are purely visual wiring.

### 1.1 Data Types and Utilities

- [x] Create `_lib/timer-types.ts` with:
  - `TimeBucket` interface (id, name, totalMinutes, elapsedSeconds, colorIndex, daysOfWeek)
  - `TimerState` interface (buckets, activeBucketId, lastActiveTime, lastResetDate)
  - `BUCKET_COLORS` array with 10 color slots, each having `vibrant` and `muted` keys referencing CSS variables (`var(--bucket-1)`, `var(--bucket-1-muted)`, etc.)
  - `DEFAULT_BUCKETS` array (School Project 3h blue Mon-Fri, Business Project 3h teal Mon-Fri, Life Maintenance 1h orange Mon-Fri, Exercise 1h pink Mon-Fri)
  - `formatTime(seconds)` — returns `H:MM:SS` or `M:SS` string
  - `getResetDate()` — returns `YYYY-MM-DD` string, treating pre-3AM as previous day
  - `isBucketActiveToday(bucket)` — checks if bucket's `daysOfWeek` includes the current day (3AM-adjusted)
  - `generateBucketId()` — uses `crypto.randomUUID()` instead of 7-char random string (matches codebase convention)
  - `STORAGE_KEY` constant (`'time-buckets-state'`)
  - **Note:** Extracted shared `adjustForResetBoundary()` helper and `RESET_HOUR` constant to DRY up the 3AM logic used by both `getResetDate` and `isBucketActiveToday`
- [x] Write tests in `__tests__/timer-types.test.ts`:
  - `formatTime`: 0s, 59s, 60s, 3599s, 3600s, edge cases
  - `getResetDate`: explicit Date args for before/after 3AM boundary
  - `isBucketActiveToday`: explicit Date args for various days, test inclusion/exclusion
  - `generateBucketId`: returns valid UUID, multiple calls produce unique values

**Acceptance Criteria:**
- All utility functions are exported and tested
- `formatTime(3661)` returns `"1:01:01"`, `formatTime(59)` returns `"0:59"`
- `getResetDate()` at 2:59AM returns previous day's date
- `isBucketActiveToday` correctly filters by day-of-week with 3AM adjustment

### 1.2 Treemap Algorithm

- [x] Create `_lib/treemap.ts` with:
  - `TreemapItem` interface (`id: string`, `value: number`)
  - `TreemapRect` interface (`id: string`, `x: number`, `y: number`, `width: number`, `height: number`)
  - Constants: `MIN_WIDTH = 120`, `MIN_HEIGHT = 80`
  - `squarify(items, containerWidth, containerHeight)` — main entry point:
    - Returns `[]` if no items or zero-dimension container
    - Sorts items descending by value
    - If total value is 0, delegates to `equalGrid` fallback
    - Otherwise delegates to `layoutRect`
  - `layoutRect(items, x, y, width, height, totalValue)` — recursive core:
    - 0 items → `[]`
    - 1 item → single rect filling the region (min-size enforced)
    - 2 items → delegates to `layoutTwo`
    - 3+ items → binary split:
      - Split direction: `width >= height` → horizontal (left/right), else vertical (top/bottom)
      - Optimal split point found by iterating possible split indices and minimizing: `|areaRatio - 0.5| + |itemRatio - 0.5| * 0.3` (area balance weighted 1.0, item count balance weighted 0.3)
      - Splits items into two groups, divides the region proportionally, recurses on each half
  - `layoutTwo(items, x, y, width, height, totalValue)` — two-item special case:
    - Splits along the longer axis proportional to value ratio
  - `equalGrid(items, x, y, width, height)` — zero-value fallback:
    - Lays items out in an equal-sized grid: `cols = ceil(sqrt(n))`, `rows = ceil(n / cols)`
    - Each item gets `width/cols` by `height/rows`
- [x] Write tests in `__tests__/treemap.test.ts`:
  - Empty items returns `[]`
  - Zero-dimension container returns `[]`
  - Single item fills container (with min-size enforcement)
  - Two equal items split 50/50 along longer axis
  - Four items with values `[100, 60, 30, 10]` in 400x300 container produce expected layout (walkthrough from spec: A gets 200x300, B gets 200x180, C gets 150x120, D gets 50x120)
  - All rectangles have positive width and height
  - Total area of rectangles ≈ container area (within rounding tolerance)
  - All-zero values produce equal grid layout
  - 100 items completes without stack overflow
  - **Note:** Internal functions use a shared output array (`out: TreemapRect[]`) instead of returning and spreading intermediate arrays, avoiding O(n log n) copies. The split-point loop uses a running sum instead of slice+reduce, making it O(n) instead of O(n^2). Redundant constant-pinning tests were omitted since behavioral tests already cover min-size enforcement.

**Acceptance Criteria:**
- `squarify([{id:'a', value:1}], 800, 600)` returns one rect at (0,0) with full dimensions
- `squarify([], 800, 600)` returns `[]`
- Sum of all rect areas ≈ containerWidth * containerHeight (within rounding tolerance)
- Zero-value items get equal-sized grid cells
- Algorithm handles 1, 2, 3, 4, 10, and 100 items without errors

### 1.3 State Management Hook

- [x] Create `_hooks/use-timer-state.ts` with `useTimerState()` hook:
  - `loadState()` — reads from localStorage, applies daily reset if needed, recovers elapsed time if timer was active
  - `isHydrated` flag — false until client-side load completes (prevents SSR mismatch)
  - 1-second `setInterval` when `activeBucketId` is set, incrementing `elapsedSeconds`
  - Completion detection: when `elapsedSeconds >= totalMinutes * 60`, stop timer, add to `completedBuckets` set
  - `toggleBucket(id)` — if same as active, stop; otherwise start (auto-stops previous)
  - `addBucket(bucket)` — adds a new bucket to the list
  - `removeBucket(id)` — removes a bucket
  - `updateBucket(id, updates)` — partial update of bucket properties
  - `resetBucketForToday(id)` — sets `elapsedSeconds` to 0
  - `setRemainingTime(id, remainingSeconds)` — sets `elapsedSeconds` to `totalMinutes * 60 - remainingSeconds`
  - Day-of-week filtering: expose `todaysBuckets` (filtered) alongside `allBuckets`
  - Persist to localStorage on every state change (after hydration)
  - **Note:** `loadState()` is exported for direct unit testing. `completedBuckets` is kept as separate state (not derived via useMemo) so the UI can distinguish "just completed this session" from "was already complete on load" — needed for Phase 4 completion animations.
- [x] Write tests in `__tests__/use-timer-state.test.ts`:
  - Toggle starts/stops a bucket
  - Toggling a different bucket switches active bucket
  - Daily reset zeroes all elapsed times when date changes
  - Time recovery adds elapsed seconds on reload (capped at total)
  - Completed bucket stops timer and enters completedBuckets set
  - Day-of-week filtering returns only today's buckets
  - `addBucket` / `removeBucket` / `updateBucket` work correctly
  - State persists to and loads from localStorage
  - **Note:** 29 tests total — also covers `loadState()` directly (corrupt JSON, time recovery capping), `setRemainingTime` clamping, and `resetBucketForToday` clearing completedBuckets.

**Acceptance Criteria:**
- Hook returns `isHydrated: false` on initial render, `true` after mount
- Starting a bucket sets `activeBucketId` and begins counting
- Switching buckets stops the previous one without losing its elapsed time
- Page reload with a running timer recovers the correct elapsed time
- Crossing the 3AM boundary resets all buckets

---

## Phase 2: Visual Layer

**Purpose:** Render the treemap grid with working timers — tap to start/stop, watch the color drain.

**Rationale:** With all logic tested in Phase 1, this phase is pure UI wiring. At the end you have a functional (if minimal) timer page.

### 2.1 Bucket Color CSS Variables

- [x] Add 10 bucket color pairs to `apps/web/src/app/globals.css` inside the `.dark` block:
  - `--bucket-1` / `--bucket-1-muted` (Blue, hue ~250)
  - `--bucket-2` / `--bucket-2-muted` (Teal, hue ~160)
  - `--bucket-3` / `--bucket-3-muted` (Orange, hue ~45)
  - `--bucket-4` / `--bucket-4-muted` (Pink, hue ~340)
  - `--bucket-5` / `--bucket-5-muted` (Purple, hue ~290)
  - `--bucket-6` / `--bucket-6-muted` (Green, hue ~130)
  - `--bucket-7` / `--bucket-7-muted` (Yellow, hue ~80)
  - `--bucket-8` / `--bucket-8-muted` (Red, hue ~25)
  - `--bucket-9` / `--bucket-9-muted` (Cyan, hue ~200)
  - `--bucket-10` / `--bucket-10-muted` (Magenta, hue ~320)
  - Use OKLCH color space: vibrant ~0.65-0.72 lightness, 0.18-0.22 chroma; muted ~0.35-0.40 lightness, 0.07-0.09 chroma
- [x] Add matching `:root` (light) values for the same variables (even though dark-first, prevents broken state if dark class is missing)
  - **Note:** Light theme vibrant colors use lower lightness (~0.55-0.62) for visibility on white backgrounds; light muted colors use higher lightness (~0.80-0.85) with very low chroma for a subtle appearance. Variables are not registered in `@theme inline` since they're consumed via `var()` in inline styles per `BUCKET_COLORS` in `timer-types.ts`.

**Acceptance Criteria:**
- All 20 CSS variables (10 vibrant + 10 muted) are defined
- Colors are visually distinct from each other
- Variables are accessible via `var(--bucket-N)` in components

### 2.2 Timer Grid Component

- [ ] Create `_components/timer-grid.tsx`:
  - `'use client'` directive (uses hooks and DOM measurement)
  - Measures container dimensions using a `ref` and `ResizeObserver` (or `offsetWidth/offsetHeight` on mount + resize)
  - Calls `squarify()` with today's buckets mapped to `TreemapItem` using **remaining seconds** as value: `Math.max(1, bucket.totalMinutes * 60 - bucket.elapsedSeconds)` — this means bucket rectangles shrink as time elapses, and the `Math.max(1, ...)` ensures completed timers still get minimal space
  - Renders a container `div` with `position: relative` filling the parent
  - For each `TreemapRect`, renders a `TimerBucket` with absolute positioning
  - Applies 8px container padding and 4px inter-bucket gaps via positioning math:
    - `left: rect.x + 8 + 2` (container padding + half-gap)
    - `top: rect.y + 8 + 2`
    - `width: Math.max(rect.width - 4, 100)` (subtract full gap, floor at 100px)
    - `height: Math.max(rect.height - 4, 60)` (subtract full gap, floor at 60px)
  - Passes `isActive`, `isCompleted`, computed `style`, and all handler callbacks to each bucket
  - Manages which bucket has settings dialog open (selected bucket state)
  - Renders `BucketSettingsDialog` once, controlled by selected bucket state
- [ ] Update `timers/page.tsx` to render `<TimerGrid />`

**Acceptance Criteria:**
- Opening `/timers` shows colored rectangles filling the content area
- Bucket sizes are proportional to their duration
- Resizing the browser window recalculates the layout
- Grid respects app shell boundaries (sidebar/bottom nav visible)

### 2.3 Timer Bucket Component

- [ ] Create `_components/timer-bucket.tsx`:
  - Outer container: `position: relative`, `rounded-lg`, `overflow-hidden`, `select-none`, receives `style` prop for absolute positioning from grid
  - **Layer stack** (back to front, all `absolute inset-0`):
    1. **Muted layer** — `backgroundColor: BUCKET_COLORS[colorIndex].muted`, always full size, always visible (shows "depleted" time)
    2. **Vibrant layer** — `backgroundColor: BUCKET_COLORS[colorIndex].vibrant`, shrinks as time elapses:
       - `progress = elapsedSeconds / (totalMinutes * 60)` (0 = fresh, 1 = complete)
       - `transform: scaleX(${1 - progress})` — starts full width, shrinks toward the left edge
       - `transformOrigin: 'left'` — anchored on the left so it shrinks from right to left
       - `transition: 'transform 300ms linear'` — smooth 300ms interpolation between tick updates
    3. **Active pulse overlay** (only when `isActive`):
       - Fill pulse: `absolute inset-0`, `bg-white`, `animate-pulse`, `opacity-20`
       - Border pulse: `absolute inset-0`, `border-2 border-white/30 rounded-lg`, `animate-[pulse_2s_ease-in-out_infinite]`
    4. **Text content** (always visible, on top of all layers):
       - `position: relative` (to sit above the absolute layers), `z-10`
       - Centered via flexbox (`flex flex-col items-center justify-center h-full`)
       - Bucket name: white, bold, `text-lg md:text-xl`
       - Remaining time: white, `text-2xl md:text-4xl font-bold`, `style={{ fontFeatureSettings: '"tnum"' }}` for tabular-nums
       - Remaining time computed as `formatTime(totalMinutes * 60 - elapsedSeconds)`
  - Active container also gets `ring-2 ring-white/40` on the outer div
  - Tap handler: calls `onTap` on click/pointerUp (will be refined in Phase 3 for long-press discrimination)
- [ ] Visually verify in browser: buckets show names, times count down, color drains left-to-right, active state pulses

**Acceptance Criteria:**
- Each bucket displays its name and remaining time in white text
- Tapping a bucket starts its countdown (time decrements every second)
- The vibrant color layer visibly shrinks from right to left as time elapses
- An inactive bucket with partial progress shows the muted color on the right portion
- The active bucket has a pulsing white overlay, pulsing border, and white ring
- Tapping a different bucket switches the timer (previous bucket retains its progress visually)

---

## Phase 3: Interactions

**Purpose:** Add the context menu, settings dialog, and "Add Bucket" flow.

**Rationale:** Phase 2 delivered a working visual timer. Phase 3 adds all the management interactions that make it a complete tool.

### 3.1 Bucket Context Menu

- [ ] Add context menu to `timer-bucket.tsx`:
  - **Desktop**: `onContextMenu` handler (right-click) — `preventDefault`, capture position, show menu
  - **Mobile**: long-press detection via `onPointerDown` / `onPointerMove` / `onPointerUp` / `onPointerCancel`:
    - 800ms timeout triggers menu
    - Movement > 10px cancels
    - `setPointerCapture` for reliable tracking
    - `isLongPressRef` prevents tap from firing after long-press
    - Skip long-press logic for `pointerType === 'mouse'`
  - Custom dropdown menu (positioned absolutely near the press point):
    - "Bucket Settings" (Settings icon) — calls `onOpenSettings`
    - "Set Remaining Time" (Clock icon) — opens inline time input
    - "Reset for Today" (RotateCcw icon) — calls `onResetForToday` with confirmation
  - Menu positioning: 10px below press point, clamped to viewport edges
  - Click-outside-to-close listener
  - `touch-none` class on bucket to prevent browser touch behaviors
- [ ] Add "Set Remaining Time" inline dialog within the context menu flow:
  - Two number inputs: hours and minutes
  - Converts to remaining seconds and calls `onSetRemainingTime`
- [ ] Add reset confirmation using `ConfirmationDialog` from `@repo/ui`

**Acceptance Criteria:**
- Right-click on a bucket (desktop) shows the context menu
- Long-press on a bucket (mobile) shows the context menu after 800ms
- Moving finger > 10px cancels the long-press without triggering menu
- Releasing after a long-press does not also toggle the timer
- All three menu options work correctly
- Menu closes when clicking outside

### 3.2 Bucket Settings Dialog

- [ ] Create `_components/bucket-settings-dialog.tsx`:
  - Uses `Dialog` / `DialogContent` / `DialogHeader` / `DialogFooter` from `@repo/ui/components/dialog`
  - Props: `bucket`, `open`, `onOpenChange`, `onSave`, `onDelete`
  - Form fields:
    - Name: text `Input` (required)
    - Duration Hours: number `Input` (0-23)
    - Duration Minutes: number `Input` (0-59)
    - Color: 10 color swatches (circular buttons showing each bucket color, selected has ring)
    - Active Days: 7 toggle buttons (S M T W T F S), multi-select, at least one required
  - "Save" button calls `onSave` with updated fields
  - "Delete Bucket" button at bottom with destructive styling, triggers `ConfirmationDialog`
  - Local form state initialized from `bucket` prop when dialog opens

**Acceptance Criteria:**
- Dialog opens with current bucket values pre-filled
- Changing name, duration, color, or days and saving updates the bucket
- Color picker shows 10 distinct options with the current selection highlighted
- Day toggles correctly select/deselect days
- Cannot save with empty name or zero days selected
- Delete requires confirmation before removing the bucket

### 3.3 Add Bucket Flow

- [ ] Modify `apps/web/src/components/app-shell.tsx`:
  - Add context menu (right-click / long-press) to the Timers `NavLink`:
    - Use same long-press pattern as bucket context menu (800ms, pointer capture)
    - On desktop: `onContextMenu` on the nav link
    - Menu option: "Add Bucket" (Plus icon)
  - On "Add Bucket": generate a new bucket with defaults (name: "New Bucket", 1 hour, next available color index, all days active) and open the settings dialog for it
  - Need a way to communicate "add bucket" action from the shell to the timers page — use a custom event or a shared callback via context
- [ ] Add empty state to `timer-grid.tsx`:
  - When no buckets exist for today, show centered message: clock icon, "No buckets yet", and a "Create your first bucket" button
  - Button triggers the same add-bucket flow (creates default + opens settings)

**Acceptance Criteria:**
- Right-clicking the Timers nav item shows an "Add Bucket" option
- Long-pressing the Timers nav item on mobile shows the same option
- Selecting "Add Bucket" creates a new bucket and opens its settings dialog
- When no buckets exist, the empty state shows with a create button
- The create button in the empty state works the same as the nav context menu

---

## Phase 4: Polish

**Purpose:** Add completion animations, sound, and final visual refinements.

**Rationale:** Core functionality is complete after Phase 3. Phase 4 is about feel — things that make the timer satisfying to use but aren't blocking.

### 4.1 Completion Animation

- [ ] Add completion sequence to `timer-bucket.tsx`:
  - When a bucket enters `completedBuckets`, trigger a two-stage animation:
    1. **Success overlay** (1.2s): white/20 background with checkmark SVG, `animate-in fade-in zoom-in`, checkmark bounces
    2. **Exit** (0.4s): bucket scales to 0 with opacity fade (`scale-0 opacity-0 transition-all duration-400`)
  - After exit animation completes, call `onRemove` to remove the bucket from the visible grid
  - Use `useState` for `showSuccess` and `isExiting` flags, `setTimeout` to sequence stages

**Acceptance Criteria:**
- When a timer reaches zero, a checkmark appears over the bucket
- After the checkmark, the bucket shrinks and fades out
- The bucket is removed from the grid after the animation finishes
- Remaining buckets reflow to fill the space

### 4.2 Completion Sound

- [ ] Add a short audio chime file to `apps/web/public/sounds/timer-complete.mp3` (a brief, pleasant chime)
- [ ] Play the sound when a bucket completes:
  - Create an `Audio` instance in the hook or component
  - Call `.play()` when a bucket enters the completed set
  - Handle the case where audio autoplay is blocked (catch the promise rejection silently)

**Acceptance Criteria:**
- A chime plays when any timer reaches zero
- The sound does not play on page load or reset
- If the browser blocks autoplay, no error is thrown

### 4.3 Visual Polish Pass

- [ ] Ensure `tabular-nums` font feature is applied to all time displays for stable width
- [ ] Verify animations use only `transform` and `opacity` for GPU acceleration (per ui-conventions)
- [ ] Test responsive behavior: desktop (sidebar visible), tablet, mobile (bottom nav visible)
- [ ] Verify the treemap recalculates on window resize and orientation change
- [ ] Ensure context menus are properly dismissed on scroll or navigation

**Acceptance Criteria:**
- Timer digits don't jiggle as they change (tabular-nums)
- Animations are smooth at 60fps
- Layout works at mobile (375px), tablet (768px), and desktop (1280px+) widths
- No visual glitches on orientation change

---

## Dependency Graph

```
Phase 1 (Core Logic)
  1.1 Types/Utils ─→ 1.2 Treemap ─→ 1.3 State Hook
                          │                │
                     Phase 2 (Visual)      │
                       2.1 CSS Colors      │
                          │                │
                       2.2 Timer Grid ←────┘
                          │
                       2.3 Timer Bucket
                          │
                     Phase 3 (Interactions)
                       3.1 Context Menu
                          │
                       3.2 Settings Dialog
                          │
                       3.3 Add Bucket Flow
                          │
                     Phase 4 (Polish)
                       4.1 Completion Animation
                       4.2 Completion Sound
                       4.3 Visual Polish
```

Note: 2.1 (CSS Colors) has no code dependency on Phase 1 and could be done in parallel, but is grouped with Phase 2 for clarity since it's only meaningful once buckets render.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Colocate all files under `timers/` with `_` prefixed folders | Follows project convention of feature-specific colocation; underscore prefix keeps folders out of Next.js routing |
| localStorage, not database | Feature description specifies client-only persistence for v1; avoids schema migration and server round-trips |
| Custom context menu instead of `DropdownMenu` from `@repo/ui` | Bucket context menu needs absolute positioning at the press point (not anchored to a trigger element); the nav item context menu can use DropdownMenu since it has a natural anchor |
| 10 OKLCH color slots | User requested expansion from 4 to 10; OKLCH provides perceptually uniform colors that look good in both vibrant and muted variants |
| Treemap value = remaining seconds, not total duration | Bucket rectangles shrink as time elapses, giving a spatial sense of how much time is left; `Math.max(1, ...)` prevents zero-area rects for completed buckets |
| `ResizeObserver` for container measurement | More reliable than `resize` event alone; handles sidebar toggle, orientation change, and dynamic layout shifts |
| Pure-logic-first phasing | Types → algorithm → hook → UI means each layer has a tested foundation; prevents debugging layout issues and logic bugs simultaneously |
| Shared add-bucket communication via custom event | Avoids prop-drilling through the shell layout or creating a context provider just for one action; `CustomEvent` is simple and decoupled |
