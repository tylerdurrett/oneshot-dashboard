'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_BUCKETS,
  getResetDate,
  isBucketActiveToday,
  STORAGE_KEY,
  type TimeBucket,
  type TimerState,
} from '../_lib/timer-types';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTimerStateReturn {
  isHydrated: boolean;
  allBuckets: TimeBucket[];
  todaysBuckets: TimeBucket[];
  activeBucketId: string | null;
  completedBuckets: Set<string>;
  toggleBucket: (id: string) => void;
  addBucket: (bucket: TimeBucket) => void;
  removeBucket: (id: string) => void;
  updateBucket: (id: string, updates: Partial<TimeBucket>) => void;
  resetBucketForToday: (id: string) => void;
  setRemainingTime: (id: string, remainingSeconds: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDefaultState(): TimerState {
  return {
    buckets: DEFAULT_BUCKETS,
    activeBucketId: null,
    lastActiveTime: null,
    lastResetDate: getResetDate(),
  };
}

/**
 * Load persisted state from localStorage, applying daily reset and
 * elapsed-time recovery as needed. Returns default state if nothing
 * is stored or the stored data is corrupt.
 */
export function loadState(): {
  state: TimerState;
  recovered: Set<string>;
} {
  const recovered = new Set<string>();

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (SSR, private browsing quota, etc.)
    return { state: createDefaultState(), recovered };
  }

  if (!raw) {
    return { state: createDefaultState(), recovered };
  }

  let parsed: TimerState;
  try {
    parsed = JSON.parse(raw) as TimerState;
  } catch {
    // Corrupt JSON — start fresh
    return { state: createDefaultState(), recovered };
  }

  const currentResetDate = getResetDate();
  const needsReset = parsed.lastResetDate !== currentResetDate;

  // Daily reset: zero out all elapsed times when the 3AM boundary was crossed
  if (needsReset) {
    return {
      state: {
        buckets: parsed.buckets.map((b) => ({ ...b, elapsedSeconds: 0 })),
        activeBucketId: null,
        lastActiveTime: null,
        lastResetDate: currentResetDate,
      },
      recovered,
    };
  }

  // Time recovery: if a timer was running when the page closed, recover
  // the elapsed seconds based on how much wall-clock time has passed.
  if (parsed.activeBucketId && parsed.lastActiveTime) {
    const elapsed = Math.floor(
      (Date.now() - new Date(parsed.lastActiveTime).getTime()) / 1000,
    );

    if (elapsed > 0) {
      const buckets = parsed.buckets.map((b) => {
        if (b.id !== parsed.activeBucketId) return b;

        const totalSeconds = b.totalMinutes * 60;
        const newElapsed = Math.min(b.elapsedSeconds + elapsed, totalSeconds);

        // Track completion that happened while the page was closed
        if (newElapsed >= totalSeconds) {
          recovered.add(b.id);
        }
        return { ...b, elapsedSeconds: newElapsed };
      });

      // If the active bucket completed during recovery, stop the timer
      const activeCompleted = recovered.has(parsed.activeBucketId);

      return {
        state: {
          ...parsed,
          buckets,
          activeBucketId: activeCompleted ? null : parsed.activeBucketId,
          lastActiveTime: activeCompleted
            ? null
            : new Date().toISOString(),
        },
        recovered,
      };
    }
  }

  return { state: parsed, recovered };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTimerState(): UseTimerStateReturn {
  const [state, setState] = useState<TimerState>(createDefaultState);
  const [isHydrated, setIsHydrated] = useState(false);
  // Separate state (not derived) so the UI can distinguish "just completed
  // this session" from "was already complete on load" — needed for Phase 4
  // completion animations that should only fire once.
  const [completedBuckets, setCompletedBuckets] = useState<Set<string>>(
    () => new Set(),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Mount: load from localStorage ----
  useEffect(() => {
    const { state: loaded, recovered } = loadState();
    setState(loaded);
    if (recovered.size > 0) {
      setCompletedBuckets((prev) => {
        const next = new Set(prev);
        for (const id of recovered) next.add(id);
        return next;
      });
    }
    setIsHydrated(true);
  }, []);

  // ---- Persist to localStorage on every state change (after hydration) ----
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or unavailable — silently ignore
    }
  }, [state, isHydrated]);

  // ---- 1-second interval when a bucket is active ----
  useEffect(() => {
    if (!isHydrated || !state.activeBucketId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.activeBucketId) return prev;

        const bucket = prev.buckets.find((b) => b.id === prev.activeBucketId);
        if (!bucket) return prev;

        const totalSeconds = bucket.totalMinutes * 60;
        const newElapsed = Math.min(bucket.elapsedSeconds + 1, totalSeconds);
        const completed = newElapsed >= totalSeconds;

        return {
          ...prev,
          buckets: prev.buckets.map((b) =>
            b.id === prev.activeBucketId
              ? { ...b, elapsedSeconds: newElapsed }
              : b,
          ),
          activeBucketId: completed ? null : prev.activeBucketId,
          lastActiveTime: completed ? null : new Date().toISOString(),
        };
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isHydrated, state.activeBucketId]);

  // ---- Completion detection ----
  useEffect(() => {
    if (!isHydrated) return;

    let changed = false;
    const next = new Set(completedBuckets);

    for (const bucket of state.buckets) {
      if (
        bucket.elapsedSeconds >= bucket.totalMinutes * 60 &&
        !completedBuckets.has(bucket.id)
      ) {
        next.add(bucket.id);
        changed = true;
      }
    }

    if (changed) {
      setCompletedBuckets(next);
    }
    // Intentionally excludes completedBuckets from deps to avoid an infinite
    // loop: this effect reads completedBuckets and conditionally sets it.
    // Safe because removeBucket/resetBucketForToday always also mutate
    // state.buckets, so a stale closure here cannot re-add a removed ID.
  }, [state.buckets, isHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Derived: today's buckets ----
  const todaysBuckets = useMemo(
    () => state.buckets.filter((b) => isBucketActiveToday(b)),
    [state.buckets],
  );

  // ---- Actions ----

  const toggleBucket = useCallback((id: string) => {
    setState((prev) => {
      if (prev.activeBucketId === id) {
        return { ...prev, activeBucketId: null, lastActiveTime: null };
      }

      // Don't start a completed bucket
      const bucket = prev.buckets.find((b) => b.id === id);
      if (bucket && bucket.elapsedSeconds >= bucket.totalMinutes * 60) {
        return prev;
      }

      // Start the new bucket (previous one keeps its elapsed time)
      return {
        ...prev,
        activeBucketId: id,
        lastActiveTime: new Date().toISOString(),
      };
    });
  }, []);

  const addBucket = useCallback((bucket: TimeBucket) => {
    setState((prev) => ({
      ...prev,
      buckets: [...prev.buckets, bucket],
    }));
  }, []);

  const removeBucket = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      buckets: prev.buckets.filter((b) => b.id !== id),
      activeBucketId: prev.activeBucketId === id ? null : prev.activeBucketId,
      lastActiveTime:
        prev.activeBucketId === id ? null : prev.lastActiveTime,
    }));
    setCompletedBuckets((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const updateBucket = useCallback(
    (id: string, updates: Partial<TimeBucket>) => {
      setState((prev) => ({
        ...prev,
        buckets: prev.buckets.map((b) => {
          if (b.id !== id) return b;
          const updated = { ...b, ...updates };
          // Cap elapsed if totalMinutes was reduced
          const totalSeconds = updated.totalMinutes * 60;
          if (updated.elapsedSeconds > totalSeconds) {
            updated.elapsedSeconds = totalSeconds;
          }
          return updated;
        }),
      }));
    },
    [],
  );

  const resetBucketForToday = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      buckets: prev.buckets.map((b) =>
        b.id === id ? { ...b, elapsedSeconds: 0 } : b,
      ),
    }));
    setCompletedBuckets((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const setRemainingTime = useCallback((id: string, remainingSeconds: number) => {
    setState((prev) => {
      const bucket = prev.buckets.find((b) => b.id === id);
      if (!bucket) return prev;

      const totalSeconds = bucket.totalMinutes * 60;
      const elapsed = Math.max(0, Math.min(totalSeconds, totalSeconds - remainingSeconds));

      const isNowComplete = elapsed >= totalSeconds;

      return {
        ...prev,
        buckets: prev.buckets.map((b) =>
          b.id === id ? { ...b, elapsedSeconds: elapsed } : b,
        ),
        activeBucketId:
          isNowComplete && prev.activeBucketId === id
            ? null
            : prev.activeBucketId,
        lastActiveTime:
          isNowComplete && prev.activeBucketId === id
            ? null
            : prev.lastActiveTime,
      };
    });
  }, []);

  return {
    isHydrated,
    allBuckets: state.buckets,
    todaysBuckets,
    activeBucketId: state.activeBucketId,
    completedBuckets,
    toggleBucket,
    addBucket,
    removeBucket,
    updateBucket,
    resetBucketForToday,
    setRemainingTime,
  };
}
