import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTodayState,
  fetchBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  startTimer,
  stopTimer,
  resetTimer,
  setTimerTime,
  setDailyGoal,
  dismissBucket,
} from '../_lib/timer-api';
import type {
  TodayStateResponse,
  BucketResponse,
  CreateBucketInput,
  UpdateBucketInput,
  StartTimerResponse,
  StopTimerResponse,
} from '../_lib/timer-api';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const timerKeys = {
  today: ['timers', 'today'] as const,
  buckets: ['timers', 'buckets'] as const,
};

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

export function useTodayState() {
  return useQuery({
    queryKey: timerKeys.today,
    queryFn: fetchTodayState,
  });
}

export function useBuckets() {
  return useQuery({
    queryKey: timerKeys.buckets,
    queryFn: fetchBuckets,
  });
}

// ---------------------------------------------------------------------------
// Mutation Hooks
// ---------------------------------------------------------------------------

export function useStartTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucketId: string) => startTimer(bucketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
    },
  });
}

export function useStopTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucketId: string) => stopTimer(bucketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
    },
  });
}

export function useResetTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucketId: string) => resetTimer(bucketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
    },
  });
}

export function useSetTimerTime() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bucketId,
      elapsedSeconds,
    }: {
      bucketId: string;
      elapsedSeconds: number;
    }) => setTimerTime(bucketId, elapsedSeconds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
    },
  });
}

export function useSetDailyGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bucketId,
      targetMinutes,
    }: {
      bucketId: string;
      targetMinutes: number;
    }) => setDailyGoal(bucketId, targetMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
    },
  });
}

export function useCreateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBucketInput) => createBucket(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
      queryClient.invalidateQueries({ queryKey: timerKeys.buckets });
    },
  });
}

export function useUpdateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateBucketInput }) =>
      updateBucket(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
      queryClient.invalidateQueries({ queryKey: timerKeys.buckets });
    },
  });
}

export function useDismissBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucketId: string) => dismissBucket(bucketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBucket(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timerKeys.today });
      queryClient.invalidateQueries({ queryKey: timerKeys.buckets });
    },
  });
}

// Re-export types for convenience
export type {
  TodayStateResponse,
  BucketResponse,
  CreateBucketInput,
  UpdateBucketInput,
  StartTimerResponse,
  StopTimerResponse,
};
