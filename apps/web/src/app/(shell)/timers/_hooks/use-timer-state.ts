import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { isBucketActiveToday, type TimeBucket } from '../_lib/timer-types';
import type { ServerBucket, UpdateBucketInput } from '../_lib/timer-api';
import type { TimerGoalReachedData } from './use-timer-sse';
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
  goalReachedBuckets: ReadonlySet<string>;
  toggleBucket: (id: string) => void;
  addBucket: (bucket: TimeBucket) => void;
  removeBucket: (id: string) => void;
  updateBucket: (id: string, updates: Partial<TimeBucket>) => void;
  resetBucketForToday: (id: string) => void;
  setRemainingTime: (id: string, remainingSeconds: number) => void;
}

/** Convert a ServerBucket to a TimeBucket for UI components.
 *  Computes live elapsed seconds from `startedAt` if the timer is running.
 *  Elapsed is NOT capped — it can exceed totalMinutes * 60. */
function serverBucketToTimeBucket(sb: ServerBucket, now: Date): TimeBucket {
  let elapsedSeconds = sb.elapsedSeconds;

  if (sb.startedAt) {
    const startedAtMs = new Date(sb.startedAt).getTime();
    const additionalElapsed = Math.floor((now.getTime() - startedAtMs) / 1000);
    elapsedSeconds += Math.max(0, additionalElapsed);
  }

  return {
    id: sb.id,
    name: sb.name,
    totalMinutes: sb.totalMinutes,
    elapsedSeconds,
    colorIndex: sb.colorIndex,
    daysOfWeek: sb.daysOfWeek,
    startedAt: sb.startedAt,
    goalReachedAt: sb.goalReachedAt,
  };
}

/** Remove an ID from the goalReachedBuckets set (no-op if absent). */
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

  // Session-only tracking of buckets that reached their goal during this
  // browser session. Used for chime/animation — should NOT include buckets
  // already goal-reached on load.
  const [goalReachedBuckets, setGoalReachedBuckets] = useState<Set<string>>(
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

  // Stable base conversion — only changes when server data changes (not per-tick).
  // Stores converted TimeBuckets with their elapsed frozen at the server snapshot.
  const baseBuckets = useMemo(
    () => serverBuckets.map((sb) => serverBucketToTimeBucket(sb, new Date())),
    [serverBuckets],
  );

  // Per-tick: only recompute the running bucket's elapsed. Non-running buckets
  // keep stable object references so downstream useMemo/React.memo isn't defeated.
  const allBuckets = useMemo(() => {
    if (!activeBucketId) return baseBuckets;
    const now = new Date();
    return baseBuckets.map((b) => {
      if (b.id !== activeBucketId || !b.startedAt) return b;
      const startedAtMs = new Date(b.startedAt).getTime();
      const liveElapsed =
        (serverBuckets.find((sb) => sb.id === b.id)?.elapsedSeconds ?? 0) +
        Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1000));
      return { ...b, elapsedSeconds: liveElapsed };
    });
  }, [baseBuckets, activeBucketId, serverBuckets, tick]);

  // Remaining renders todaysBuckets, so it must derive from the same
  // live-updating bucket list as the All view. Filtering against the frozen
  // server snapshot makes the active timer appear stuck until a refetch lands.
  const todaysBuckets = useMemo(() => {
    return allBuckets.filter((bucket) => {
      if (!isBucketActiveToday(bucket)) return false;
      // Hide buckets that hit their goal and are stopped. Running timers
      // past goal stay visible (showing negative remaining + check icon).
      if (bucket.goalReachedAt && !bucket.startedAt) return false;
      return true;
    });
  }, [allBuckets]);

  // Goal-reached detection — when server data shows a bucket has goalReachedAt
  // set and it wasn't already in goalReachedBuckets, add it for chime/animation.
  // SSE onGoalReached is the primary mechanism; this is backup for edge cases.
  const prevGoalReachedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!todayQuery.isSuccess) return;

    // On first data load, snapshot initially-goal-reached buckets so we skip them.
    if (!initializedRef.current && serverBuckets.length > 0) {
      initializedRef.current = true;
      for (const sb of serverBuckets) {
        if (sb.goalReachedAt) {
          prevGoalReachedRef.current.add(sb.id);
        }
      }
      return;
    }

    let changed = false;
    const next = new Set(goalReachedBuckets);

    for (const sb of serverBuckets) {
      if (
        sb.goalReachedAt &&
        !goalReachedBuckets.has(sb.id) &&
        !prevGoalReachedRef.current.has(sb.id)
      ) {
        next.add(sb.id);
        changed = true;
      }
    }

    if (changed) {
      setGoalReachedBuckets(next);
    }
    // Intentionally excludes goalReachedBuckets from deps to avoid infinite loop.
  }, [serverBuckets, todayQuery.isSuccess]);

  // SSE integration — useTimerSSE stores handlers in a ref, so useCallback
  // wrappers are unnecessary (handler identity doesn't trigger reconnection).
  const invalidateToday = useCallback(
    () => queryClient.invalidateQueries({ queryKey: timerKeys.today }),
    [queryClient],
  );

  useTimerSSE({
    onGoalReached: useCallback(
      (data: TimerGoalReachedData) => {
        setGoalReachedBuckets((prev) => {
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
      setGoalReachedBuckets(new Set());
      prevGoalReachedRef.current = new Set();
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
      removeFromSet(setGoalReachedBuckets, id);
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
      removeFromSet(setGoalReachedBuckets, id);
      // Clear from initially-goal-reached tracking so re-reaching
      // the goal after reset triggers chime/animation
      prevGoalReachedRef.current.delete(id);
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
    goalReachedBuckets,
    toggleBucket,
    addBucket,
    removeBucket,
    updateBucket: updateBucketFn,
    resetBucketForToday,
    setRemainingTime,
  };
}
