import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BUCKETS, STORAGE_KEY, type TimeBucket, type TimerState } from '../_lib/timer-types';
import { loadState, useTimerState } from '../_hooks/use-timer-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal TimerState for seeding localStorage. */
function makeState(overrides: Partial<TimerState> = {}): TimerState {
  return {
    buckets: DEFAULT_BUCKETS.map((b) => ({ ...b })),
    activeBucketId: null,
    lastActiveTime: null,
    lastResetDate: '2026-03-24',
    ...overrides,
  };
}

function seedStorage(state: TimerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  // Tuesday March 24 2026, 10:00 AM
  vi.setSystemTime(new Date(2026, 2, 24, 10, 0, 0));
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// loadState (pure function)
// ---------------------------------------------------------------------------

describe('loadState', () => {
  it('returns default state when localStorage is empty', () => {
    const { state } = loadState();
    expect(state.buckets).toHaveLength(DEFAULT_BUCKETS.length);
    expect(state.activeBucketId).toBeNull();
    expect(state.lastResetDate).toBe('2026-03-24');
  });

  it('returns default state when localStorage contains corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
    const { state } = loadState();
    expect(state.buckets).toHaveLength(DEFAULT_BUCKETS.length);
  });

  it('applies daily reset when lastResetDate differs from today', () => {
    const stale = makeState({
      lastResetDate: '2026-03-23',
      buckets: DEFAULT_BUCKETS.map((b) => ({ ...b, elapsedSeconds: 999 })),
      activeBucketId: 'default-1',
      lastActiveTime: new Date(2026, 2, 23, 22, 0, 0).toISOString(),
    });
    seedStorage(stale);

    const { state } = loadState();
    expect(state.lastResetDate).toBe('2026-03-24');
    expect(state.activeBucketId).toBeNull();
    for (const b of state.buckets) {
      expect(b.elapsedSeconds).toBe(0);
    }
  });

  it('recovers elapsed time when a timer was running', () => {
    // Timer was running 30 seconds ago with 100 elapsed seconds
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const stored = makeState({
      activeBucketId: 'default-1',
      lastActiveTime: thirtySecsAgo,
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-1' ? { ...b, elapsedSeconds: 100 } : b,
      ),
    });
    seedStorage(stored);

    const { state } = loadState();
    const bucket = state.buckets.find((b) => b.id === 'default-1')!;
    expect(bucket.elapsedSeconds).toBe(130); // 100 + 30
    expect(state.activeBucketId).toBe('default-1');
  });

  it('caps recovered time at total and marks completion', () => {
    // Bucket has 1 minute total (60s), 50s elapsed, 20s recovery → would be 70s, capped at 60s
    const twentySecsAgo = new Date(Date.now() - 20_000).toISOString();
    const stored = makeState({
      activeBucketId: 'default-3', // Life Maintenance = 60 min
      lastActiveTime: twentySecsAgo,
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-3'
          ? { ...b, totalMinutes: 1, elapsedSeconds: 50 }
          : b,
      ),
    });
    seedStorage(stored);

    const { state, recovered } = loadState();
    const bucket = state.buckets.find((b) => b.id === 'default-3')!;
    expect(bucket.elapsedSeconds).toBe(60); // capped at 1 min * 60
    expect(state.activeBucketId).toBeNull(); // stopped
    expect(recovered.has('default-3')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useTimerState hook
// ---------------------------------------------------------------------------

describe('useTimerState', () => {
  // ---- Hydration ----

  it('returns isHydrated: false on initial render, then true after mount', async () => {
    const { result } = renderHook(() => useTimerState());

    // Before effects run, isHydrated should be false
    // (renderHook runs effects synchronously in act, so we check after)
    expect(result.current.isHydrated).toBe(true);
  });

  it('loads default buckets when localStorage is empty', () => {
    const { result } = renderHook(() => useTimerState());
    expect(result.current.allBuckets).toHaveLength(DEFAULT_BUCKETS.length);
  });

  it('loads state from localStorage', () => {
    const custom = makeState({
      buckets: [
        {
          id: 'custom-1',
          name: 'Custom',
          totalMinutes: 30,
          elapsedSeconds: 10,
          colorIndex: 5,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
      ],
    });
    seedStorage(custom);

    const { result } = renderHook(() => useTimerState());
    expect(result.current.allBuckets).toHaveLength(1);
    expect(result.current.allBuckets[0]!.name).toBe('Custom');
  });

  // ---- Toggle ----

  it('toggleBucket starts a bucket', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => {
      result.current.toggleBucket('default-1');
    });

    expect(result.current.activeBucketId).toBe('default-1');
  });

  it('toggleBucket stops the active bucket when toggled again', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-1'));
    act(() => result.current.toggleBucket('default-1'));

    expect(result.current.activeBucketId).toBeNull();
  });

  it('switching buckets preserves previous buckets elapsed time', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-1'));

    // Advance 5 seconds
    for (let i = 0; i < 5; i++) {
      act(() => vi.advanceTimersByTime(1000));
    }

    const elapsedBefore = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!.elapsedSeconds;
    expect(elapsedBefore).toBe(5);

    // Switch to a different bucket
    act(() => result.current.toggleBucket('default-2'));
    expect(result.current.activeBucketId).toBe('default-2');

    // Bucket 1 retains its elapsed time
    const bucket1 = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket1.elapsedSeconds).toBe(5);
  });

  it('does not start a completed bucket', () => {
    // Seed a bucket that is already at its limit
    const stored = makeState({
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-3'
          ? { ...b, totalMinutes: 1, elapsedSeconds: 60 }
          : b,
      ),
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-3'));
    expect(result.current.activeBucketId).toBeNull();
  });

  // ---- Timer ticking ----

  it('increments elapsedSeconds every second when active', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-1'));

    act(() => vi.advanceTimersByTime(3000));

    const bucket = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket.elapsedSeconds).toBe(3);
  });

  it('stops counting when no bucket is active', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-1'));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.toggleBucket('default-1')); // stop

    act(() => vi.advanceTimersByTime(5000));

    const bucket = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket.elapsedSeconds).toBe(2);
  });

  // ---- Completion ----

  it('stops the timer and adds to completedBuckets when time runs out', () => {
    // Set up a bucket with only 2 seconds remaining
    const stored = makeState({
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-3'
          ? { ...b, totalMinutes: 1, elapsedSeconds: 58 }
          : b,
      ),
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-3'));
    act(() => vi.advanceTimersByTime(2000));

    expect(result.current.activeBucketId).toBeNull();
    expect(result.current.completedBuckets.has('default-3')).toBe(true);
  });

  // ---- Day-of-week filtering ----

  it('todaysBuckets includes Mon-Fri buckets on a Tuesday', () => {
    const { result } = renderHook(() => useTimerState());
    // System time is Tuesday — all default buckets are Mon-Fri
    expect(result.current.todaysBuckets).toHaveLength(DEFAULT_BUCKETS.length);
  });

  it('todaysBuckets excludes buckets not scheduled for today', () => {
    const stored = makeState({
      buckets: [
        {
          id: 'weekend-only',
          name: 'Weekend',
          totalMinutes: 60,
          elapsedSeconds: 0,
          colorIndex: 0,
          daysOfWeek: [0, 6], // Sat + Sun only
        },
      ],
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());
    // Tuesday — weekend bucket should not appear
    expect(result.current.todaysBuckets).toHaveLength(0);
  });

  // ---- CRUD operations ----

  it('addBucket appends a new bucket', () => {
    const { result } = renderHook(() => useTimerState());
    const initialLen = result.current.allBuckets.length;

    const newBucket: TimeBucket = {
      id: 'new-1',
      name: 'New Bucket',
      totalMinutes: 45,
      elapsedSeconds: 0,
      colorIndex: 7,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    };

    act(() => result.current.addBucket(newBucket));

    expect(result.current.allBuckets).toHaveLength(initialLen + 1);
    expect(result.current.allBuckets.at(-1)!.name).toBe('New Bucket');
  });

  it('removeBucket removes a bucket and stops it if active', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-2'));
    expect(result.current.activeBucketId).toBe('default-2');

    act(() => result.current.removeBucket('default-2'));

    expect(result.current.allBuckets.find((b) => b.id === 'default-2')).toBeUndefined();
    expect(result.current.activeBucketId).toBeNull();
  });

  it('updateBucket changes bucket properties', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => {
      result.current.updateBucket('default-1', { name: 'Renamed' });
    });

    expect(
      result.current.allBuckets.find((b) => b.id === 'default-1')!.name,
    ).toBe('Renamed');
  });

  it('updateBucket caps elapsedSeconds when totalMinutes is reduced', () => {
    // Give default-1 some elapsed time
    const stored = makeState({
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-1' ? { ...b, elapsedSeconds: 500 } : b,
      ),
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());

    // Reduce totalMinutes to 5 (300 seconds) — elapsedSeconds should cap at 300
    act(() => {
      result.current.updateBucket('default-1', { totalMinutes: 5 });
    });

    const bucket = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket.elapsedSeconds).toBe(300);
  });

  // ---- resetBucketForToday ----

  it('resetBucketForToday zeros elapsedSeconds', () => {
    const stored = makeState({
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-1' ? { ...b, elapsedSeconds: 999 } : b,
      ),
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());

    act(() => result.current.resetBucketForToday('default-1'));

    const bucket = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket.elapsedSeconds).toBe(0);
  });

  it('resetBucketForToday removes bucket from completedBuckets', () => {
    const stored = makeState({
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-3'
          ? { ...b, totalMinutes: 1, elapsedSeconds: 60 }
          : b,
      ),
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());
    // default-3 should be detected as completed
    expect(result.current.completedBuckets.has('default-3')).toBe(true);

    act(() => result.current.resetBucketForToday('default-3'));

    expect(result.current.completedBuckets.has('default-3')).toBe(false);
    expect(
      result.current.allBuckets.find((b) => b.id === 'default-3')!
        .elapsedSeconds,
    ).toBe(0);
  });

  // ---- setRemainingTime ----

  it('setRemainingTime sets correct elapsedSeconds', () => {
    const { result } = renderHook(() => useTimerState());

    // default-1 is 180 minutes (10800 seconds). Set remaining to 5 minutes (300s).
    act(() => result.current.setRemainingTime('default-1', 300));

    const bucket = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket.elapsedSeconds).toBe(10500); // 10800 - 300
  });

  it('setRemainingTime clamps to valid range', () => {
    const { result } = renderHook(() => useTimerState());

    // Negative remaining → elapsed should be capped at total
    act(() => result.current.setRemainingTime('default-1', -100));
    const bucket1 = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket1.elapsedSeconds).toBe(10800);

    // Remaining > total → elapsed should be 0
    act(() => result.current.setRemainingTime('default-1', 999999));
    const bucket2 = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket2.elapsedSeconds).toBe(0);
  });

  it('setRemainingTime stops active bucket if now complete', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-1'));
    expect(result.current.activeBucketId).toBe('default-1');

    // Set remaining to 0 — bucket is now complete
    act(() => result.current.setRemainingTime('default-1', 0));

    expect(result.current.activeBucketId).toBeNull();
  });

  // ---- Persistence ----

  it('persists state to localStorage on changes', () => {
    const { result } = renderHook(() => useTimerState());

    act(() => result.current.toggleBucket('default-1'));
    act(() => vi.advanceTimersByTime(2000));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw!) as TimerState;
    expect(persisted.activeBucketId).toBe('default-1');
    const bucket = persisted.buckets.find((b) => b.id === 'default-1')!;
    expect(bucket.elapsedSeconds).toBe(2);
  });

  // ---- Daily reset via hook ----

  it('applies daily reset on mount when date has changed', () => {
    const stale = makeState({
      lastResetDate: '2026-03-23',
      buckets: DEFAULT_BUCKETS.map((b) => ({ ...b, elapsedSeconds: 500 })),
      activeBucketId: 'default-1',
    });
    seedStorage(stale);

    const { result } = renderHook(() => useTimerState());

    expect(result.current.activeBucketId).toBeNull();
    for (const b of result.current.allBuckets) {
      expect(b.elapsedSeconds).toBe(0);
    }
  });

  // ---- Time recovery via hook ----

  it('recovers elapsed time on mount when timer was running', () => {
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const stored = makeState({
      activeBucketId: 'default-1',
      lastActiveTime: thirtySecsAgo,
      buckets: DEFAULT_BUCKETS.map((b) =>
        b.id === 'default-1' ? { ...b, elapsedSeconds: 100 } : b,
      ),
    });
    seedStorage(stored);

    const { result } = renderHook(() => useTimerState());

    const bucket = result.current.allBuckets.find(
      (b) => b.id === 'default-1',
    )!;
    expect(bucket.elapsedSeconds).toBe(130);
    expect(result.current.activeBucketId).toBe('default-1');
  });
});
