import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { isBucketActiveToday, type TimeBucket } from '../_lib/timer-types';
import type { ServerBucket, UpdateBucketInput } from '../_lib/timer-api';
import type { TimerCompletedData } from './use-timer-sse';
import {
  useTodayState,
  useStartTimer,
  useStopTimer,
  useCreateBucket,
  useDeleteBucket,
  useUpdateBucket as useUpdateBucketMutation,
  useResetTimer,
  useSetTimerTime,
  timerKeys,
} from './use-timer-queries';
import { useTimerSSE } from './use-timer-sse';

export interface UseTimerStateReturn {
  isHydrated: boolean;
  allBuckets: TimeBucket[];
  todaysBuckets: TimeBucket[];
  activeBucketId: string | null;
  completedBuckets: ReadonlySet<string>;
  toggleBucket: (id: string) => void;
  addBucket: (bucket: TimeBucket) => void;
  removeBucket: (id: string) => void;
  updateBucket: (id: string, updates: Partial<TimeBucket>) => void;
  resetBucketForToday: (id: string) => void;
  setRemainingTime: (id: string, remainingSeconds: number) => void;
}

/** Convert a ServerBucket to a TimeBucket for UI components.
 *  Computes live elapsed seconds from `startedAt` if the timer is running. */
function serverBucketToTimeBucket(sb: ServerBucket, now: Date): TimeBucket {
  let elapsedSeconds = sb.elapsedSeconds;

  if (sb.startedAt) {
    const startedAtMs = new Date(sb.startedAt).getTime();
    const additionalElapsed = Math.floor((now.getTime() - startedAtMs) / 1000);
    elapsedSeconds += Math.max(0, additionalElapsed);
  }

  const totalSeconds = sb.totalMinutes * 60;
  elapsedSeconds = Math.min(elapsedSeconds, totalSeconds);

  return {
    id: sb.id,
    name: sb.name,
    totalMinutes: sb.totalMinutes,
    elapsedSeconds,
    colorIndex: sb.colorIndex,
    daysOfWeek: sb.daysOfWeek,
  };
}

/** Remove an ID from the completedBuckets set (no-op if absent). */
function removeFromSet(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  id: string,
) {
  setter((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}

export function useTimerState(): UseTimerStateReturn {
  const queryClient = useQueryClient();
  const todayQuery = useTodayState();
  const startMutation = useStartTimer();
  const stopMutation = useStopTimer();
  const createMutation = useCreateBucket();
  const deleteMutation = useDeleteBucket();
  const updateMutation = useUpdateBucketMutation();
  const resetMutation = useResetTimer();
  const setTimeMutation = useSetTimerTime();

  // Session-only tracking of buckets completed during this browser session.
  // Used for animations — should NOT include buckets already completed on load.
  const [completedBuckets, setCompletedBuckets] = useState<Set<string>>(
    () => new Set(),
  );

  // Tick counter — included in allBuckets useMemo deps to force recalculation
  // of live elapsed from startedAt each second.
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const serverBuckets: ServerBucket[] = todayQuery.data?.buckets ?? [];

  const activeBucketId = useMemo(() => {
    const running = serverBuckets.find((b) => b.startedAt !== null);
    return running?.id ?? null;
  }, [serverBuckets]);

  // 1-second interval when a timer is running — forces re-render so
  // allBuckets recalculates from startedAt timestamp.
  useEffect(() => {
    if (!activeBucketId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeBucketId]);

  const allBuckets = useMemo(() => {
    const now = new Date();
    return serverBuckets.map((sb) => serverBucketToTimeBucket(sb, now));
    // tick forces recalculation of live elapsed each second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBuckets, tick]);

  // Derive todaysBuckets from serverBuckets (stable reference between ticks)
  // rather than allBuckets, since isBucketActiveToday only checks daysOfWeek.
  // Buckets already completed on load (completedAt set, not running) are
  // excluded — they'd otherwise show permanently at 0:00 after a page refresh
  // because the animation→hide flow only runs for timers that complete during
  // the current session.
  const todaysBuckets = useMemo(() => {
    const now = new Date();
    return serverBuckets
      .filter((sb) => {
        if (!isBucketActiveToday(sb)) return false;
        // Hide buckets that finished before this session (completedAt set,
        // not currently running). Buckets completing *during* this session
        // are hidden via the animation flow in timer-grid.
        if (sb.completedAt && !sb.startedAt) return false;
        return true;
      })
      .map((sb) => serverBucketToTimeBucket(sb, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBuckets, tick]);

  // Completion detection — when tick causes a bucket to reach its total,
  // add to completedBuckets. Buckets already completed on initial load are
  // excluded so animations only fire for timers that complete this session.
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!todayQuery.isSuccess) return;

    // On first data load, snapshot initially-completed buckets so we skip them.
    if (!initializedRef.current && allBuckets.length > 0) {
      initializedRef.current = true;
      for (const bucket of allBuckets) {
        if (bucket.elapsedSeconds >= bucket.totalMinutes * 60) {
          prevCompletedRef.current.add(bucket.id);
        }
      }
      return;
    }

    let changed = false;
    const next = new Set(completedBuckets);

    for (const bucket of allBuckets) {
      if (
        bucket.elapsedSeconds >= bucket.totalMinutes * 60 &&
        !completedBuckets.has(bucket.id) &&
        !prevCompletedRef.current.has(bucket.id)
      ) {
        next.add(bucket.id);
        changed = true;
      }
    }

    if (changed) {
      setCompletedBuckets(next);
    }
    // Intentionally excludes completedBuckets from deps to avoid infinite loop.
  }, [allBuckets, todayQuery.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE integration — useTimerSSE stores handlers in a ref, so useCallback
  // wrappers are unnecessary (handler identity doesn't trigger reconnection).
  const invalidateToday = useCallback(
    () => queryClient.invalidateQueries({ queryKey: timerKeys.today }),
    [queryClient],
  );

  useTimerSSE({
    onTimerCompleted: useCallback(
      (data: TimerCompletedData) => {
        setCompletedBuckets((prev) => {
          if (prev.has(data.bucketId)) return prev;
          const next = new Set(prev);
          next.add(data.bucketId);
          return next;
        });
        queryClient.invalidateQueries({ queryKey: timerKeys.today });
      },
      [queryClient],
    ),
    onDailyReset: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
      setCompletedBuckets(new Set());
      prevCompletedRef.current = new Set();
    }, [queryClient]),
    onTimerStarted: invalidateToday,
    onTimerStopped: invalidateToday,
    onTimerReset: invalidateToday,
    onTimerUpdated: invalidateToday,
  });

  const toggleBucket = useCallback(
    (id: string) => {
      if (activeBucketId === id) {
        stopMutation.mutate(id);
      } else {
        startMutation.mutate(id);
      }
    },
    [activeBucketId, startMutation, stopMutation],
  );

  const addBucket = useCallback(
    (bucket: TimeBucket) => {
      createMutation.mutate({
        name: bucket.name,
        totalMinutes: bucket.totalMinutes,
        colorIndex: bucket.colorIndex,
        daysOfWeek: bucket.daysOfWeek,
      });
    },
    [createMutation],
  );

  const removeBucket = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
      removeFromSet(setCompletedBuckets, id);
    },
    [deleteMutation],
  );

  const updateBucketFn = useCallback(
    (id: string, updates: Partial<TimeBucket>) => {
      const { name, totalMinutes, colorIndex, daysOfWeek } = updates;
      const serverUpdates: UpdateBucketInput = {
        ...(name !== undefined && { name }),
        ...(totalMinutes !== undefined && { totalMinutes }),
        ...(colorIndex !== undefined && { colorIndex }),
        ...(daysOfWeek !== undefined && { daysOfWeek }),
      };
      updateMutation.mutate({ id, updates: serverUpdates });
    },
    [updateMutation],
  );

  const resetBucketForToday = useCallback(
    (id: string) => {
      resetMutation.mutate(id);
      removeFromSet(setCompletedBuckets, id);
      // Clear from initially-completed tracking so re-completion
      // after reset triggers animation
      prevCompletedRef.current.delete(id);
    },
    [resetMutation],
  );

  const setRemainingTime = useCallback(
    (id: string, remainingSeconds: number) => {
      setTimeMutation.mutate({ bucketId: id, remainingSeconds });
    },
    [setTimeMutation],
  );

  return {
    isHydrated: todayQuery.isSuccess,
    allBuckets,
    todaysBuckets,
    activeBucketId,
    completedBuckets,
    toggleBucket,
    addBucket,
    removeBucket,
    updateBucket: updateBucketFn,
    resetBucketForToday,
    setRemainingTime,
  };
}
