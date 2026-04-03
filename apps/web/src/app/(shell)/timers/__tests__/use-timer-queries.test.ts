import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import {
  useTodayState,
  useBuckets,
  useStartTimer,
  useStopTimer,
  useResetTimer,
  useSetTimerTime,
  useCreateBucket,
  useUpdateBucket,
  useDeleteBucket,
  timerKeys,
} from '../_hooks/use-timer-queries';

// ---------------------------------------------------------------------------
// Mock api module
// ---------------------------------------------------------------------------

vi.mock('../_lib/timer-api', () => ({
  fetchTodayState: vi.fn(),
  fetchBuckets: vi.fn(),
  createBucket: vi.fn(),
  updateBucket: vi.fn(),
  deleteBucket: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  resetTimer: vi.fn(),
  setTimerTime: vi.fn(),
}));

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
} from '../_lib/timer-api';

const mockFetchTodayState = vi.mocked(fetchTodayState);
const mockFetchBuckets = vi.mocked(fetchBuckets);
const mockCreateBucket = vi.mocked(createBucket);
const mockUpdateBucket = vi.mocked(updateBucket);
const mockDeleteBucket = vi.mocked(deleteBucket);
const mockStartTimer = vi.mocked(startTimer);
const mockStopTimer = vi.mocked(stopTimer);
const mockResetTimer = vi.mocked(resetTimer);
const mockSetTimerTime = vi.mocked(setTimerTime);

// ---------------------------------------------------------------------------
// Test wrapper
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  queryClient?.clear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const todayState = {
  date: '2026-03-24',
  buckets: [
    {
      id: 'b1',
      name: 'Work',
      totalMinutes: 60,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
      weeklySchedule: null,
      sortOrder: 0,
      elapsedSeconds: 120,
      startedAt: null,
      goalReachedAt: null,
      dismissedAt: null,
    },
  ],
};

const bucketList = [
  {
    id: 'b1',
    name: 'Work',
    totalMinutes: 60,
    colorIndex: 0,
    daysOfWeek: [1, 2, 3, 4, 5],
    weeklySchedule: null,
    sortOrder: 0,
    deactivatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('timerKeys', () => {
  it('has correct key structure', () => {
    expect(timerKeys.today).toEqual(['timers', 'today']);
    expect(timerKeys.buckets).toEqual(['timers', 'buckets']);
  });
});

describe('useTodayState', () => {
  it('fetches and returns today state', async () => {
    mockFetchTodayState.mockResolvedValue(todayState);

    const { result } = renderHook(() => useTodayState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(todayState);
    expect(mockFetchTodayState).toHaveBeenCalledOnce();
  });

  it('handles fetch error', async () => {
    mockFetchTodayState.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTodayState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});

describe('useBuckets', () => {
  it('fetches and returns bucket list', async () => {
    mockFetchBuckets.mockResolvedValue(bucketList);

    const { result } = renderHook(() => useBuckets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(bucketList);
    expect(mockFetchBuckets).toHaveBeenCalledOnce();
  });

  it('handles fetch error', async () => {
    mockFetchBuckets.mockRejectedValue(new Error('Server down'));

    const { result } = renderHook(() => useBuckets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server down');
  });
});

describe('useStartTimer', () => {
  it('starts a timer and invalidates today cache', async () => {
    const response = {
      bucketId: 'b1',
      startedAt: '2026-03-24T10:00:00.000Z',
      stoppedBucketId: null,
    };
    mockStartTimer.mockResolvedValue(response);
    mockFetchTodayState.mockResolvedValue(todayState);

    const wrapper = createWrapper();

    // Populate today cache first
    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));

    // Start timer
    const { result } = renderHook(() => useStartTimer(), { wrapper });
    result.current.mutate('b1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);
    expect(mockStartTimer).toHaveBeenCalledWith('b1');

    // Today cache should have been refetched (initial + invalidation)
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
  });

  it('handles start error', async () => {
    mockStartTimer.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useStartTimer(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('bad-id');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});

describe('useStopTimer', () => {
  it('stops a timer and invalidates today cache', async () => {
    const response = { elapsedSeconds: 300, goalReachedAt: null };
    mockStopTimer.mockResolvedValue(response);
    mockFetchTodayState.mockResolvedValue(todayState);

    const wrapper = createWrapper();

    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useStopTimer(), { wrapper });
    result.current.mutate('b1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);
    expect(mockStopTimer).toHaveBeenCalledWith('b1');
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
  });
});

describe('useResetTimer', () => {
  it('resets a timer and invalidates today cache', async () => {
    mockResetTimer.mockResolvedValue(undefined);
    mockFetchTodayState.mockResolvedValue(todayState);

    const wrapper = createWrapper();

    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useResetTimer(), { wrapper });
    result.current.mutate('b1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockResetTimer).toHaveBeenCalledWith('b1');
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
  });
});

describe('useSetTimerTime', () => {
  it('sets timer time and invalidates today cache', async () => {
    const response = { elapsedSeconds: 3300, goalReachedAt: null };
    mockSetTimerTime.mockResolvedValue(response);
    mockFetchTodayState.mockResolvedValue(todayState);

    const wrapper = createWrapper();

    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useSetTimerTime(), { wrapper });
    result.current.mutate({ bucketId: 'b1', elapsedSeconds: 300 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);
    expect(mockSetTimerTime).toHaveBeenCalledWith('b1', 300);
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
  });
});

describe('useCreateBucket', () => {
  it('creates a bucket and invalidates both caches', async () => {
    const created = { ...bucketList[0]! };
    mockCreateBucket.mockResolvedValue(created);
    mockFetchTodayState.mockResolvedValue(todayState);
    mockFetchBuckets.mockResolvedValue(bucketList);

    const wrapper = createWrapper();

    // Populate both caches
    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    const { result: bucketsResult } = renderHook(() => useBuckets(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(bucketsResult.current.isSuccess).toBe(true));

    // Create bucket
    const input = {
      name: 'Work',
      totalMinutes: 60,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
    };
    const { result } = renderHook(() => useCreateBucket(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(created);
    expect(mockCreateBucket).toHaveBeenCalledWith(input);

    // Both caches should have been refetched
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchBuckets).toHaveBeenCalledTimes(2));
  });

  it('handles creation error', async () => {
    mockCreateBucket.mockRejectedValue(new Error('Validation error'));

    const { result } = renderHook(() => useCreateBucket(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      name: '',
      totalMinutes: 0,
      colorIndex: 0,
      daysOfWeek: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Validation error');
  });
});

describe('useUpdateBucket', () => {
  it('updates a bucket and invalidates both caches', async () => {
    const updated = { ...bucketList[0]!, name: 'Updated Work' };
    mockUpdateBucket.mockResolvedValue(updated);
    mockFetchTodayState.mockResolvedValue(todayState);
    mockFetchBuckets.mockResolvedValue(bucketList);

    const wrapper = createWrapper();

    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    const { result: bucketsResult } = renderHook(() => useBuckets(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(bucketsResult.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useUpdateBucket(), { wrapper });
    result.current.mutate({ id: 'b1', updates: { name: 'Updated Work' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(updated);
    expect(mockUpdateBucket).toHaveBeenCalledWith('b1', {
      name: 'Updated Work',
    });
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchBuckets).toHaveBeenCalledTimes(2));
  });
});

describe('useDeleteBucket', () => {
  it('deletes a bucket and invalidates both caches', async () => {
    mockDeleteBucket.mockResolvedValue(undefined);
    mockFetchTodayState.mockResolvedValue(todayState);
    mockFetchBuckets.mockResolvedValue(bucketList);

    const wrapper = createWrapper();

    const { result: todayResult } = renderHook(() => useTodayState(), {
      wrapper,
    });
    const { result: bucketsResult } = renderHook(() => useBuckets(), {
      wrapper,
    });
    await waitFor(() => expect(todayResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(bucketsResult.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useDeleteBucket(), { wrapper });
    result.current.mutate('b1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteBucket).toHaveBeenCalledWith('b1');
    await waitFor(() => expect(mockFetchTodayState).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchBuckets).toHaveBeenCalledTimes(2));
  });

  it('handles deletion error', async () => {
    mockDeleteBucket.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useDeleteBucket(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('bad-id');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});
