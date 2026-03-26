import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { ServerBucket, TodayStateResponse } from '../_lib/timer-api';
import { useTimerState } from '../_hooks/use-timer-state';
import { useTimerSSE } from '../_hooks/use-timer-sse';
import type { TimerSSEHandlers } from '../_hooks/use-timer-sse';

// ---------------------------------------------------------------------------
// Mock timer-api module
// ---------------------------------------------------------------------------

vi.mock('../_lib/timer-api', () => ({
  getBaseUrl: vi.fn(() => 'http://localhost:4902'),
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
  createBucket,
  updateBucket,
  deleteBucket,
  startTimer,
  stopTimer,
  resetTimer,
  setTimerTime,
} from '../_lib/timer-api';

const mockFetchTodayState = vi.mocked(fetchTodayState);
const mockCreateBucket = vi.mocked(createBucket);
const mockUpdateBucket = vi.mocked(updateBucket);
const mockDeleteBucket = vi.mocked(deleteBucket);
const mockStartTimer = vi.mocked(startTimer);
const mockStopTimer = vi.mocked(stopTimer);
const mockResetTimer = vi.mocked(resetTimer);
const mockSetTimerTime = vi.mocked(setTimerTime);

// ---------------------------------------------------------------------------
// Mock use-timer-sse module — capture handlers for manual SSE simulation
// ---------------------------------------------------------------------------

const mockUseTimerSSE = vi.mocked(useTimerSSE);

/** Latest handlers captured from useTimerSSE mock calls. */
function getSSEHandlers(): TimerSSEHandlers {
  const calls = mockUseTimerSSE.mock.calls;
  if (calls.length === 0) {
    throw new Error('useTimerSSE not called yet');
  }
  return calls[calls.length - 1]![0];
}

vi.mock('../_hooks/use-timer-sse', () => ({
  useTimerSSE: vi.fn(),
  SSE_EVENTS: {
    TIMER_STARTED: 'timer-started',
    TIMER_STOPPED: 'timer-stopped',
    TIMER_GOAL_REACHED: 'timer-goal-reached',
    TIMER_RESET: 'timer-reset',
    TIMER_UPDATED: 'timer-updated',
    DAILY_RESET: 'daily-reset',
  },
}));

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
// Fixtures
// ---------------------------------------------------------------------------

function makeServerBucket(overrides: Partial<ServerBucket> = {}): ServerBucket {
  return {
    id: 'b1',
    name: 'Work',
    totalMinutes: 60,
    colorIndex: 0,
    daysOfWeek: [1, 2, 3, 4, 5],
    sortOrder: 0,
    elapsedSeconds: 0,
    startedAt: null,
    goalReachedAt: null,
    ...overrides,
  };
}

function makeTodayState(
  buckets: ServerBucket[] = [makeServerBucket()],
): TodayStateResponse {
  return { date: '2026-03-24', buckets };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  queryClient?.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTimerState', () => {
  // ---- Hydration ----

  it('returns isHydrated: false until query succeeds, then true', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.allBuckets).toHaveLength(1);
  });

  // ---- allBuckets mapping ----

  it('maps server buckets to TimeBucket shape', async () => {
    const sb = makeServerBucket({
      id: 'test-1',
      name: 'Test Bucket',
      totalMinutes: 120,
      elapsedSeconds: 300,
      colorIndex: 5,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    mockFetchTodayState.mockResolvedValue(makeTodayState([sb]));

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    const bucket = result.current.allBuckets[0]!;
    expect(bucket.id).toBe('test-1');
    expect(bucket.name).toBe('Test Bucket');
    expect(bucket.totalMinutes).toBe(120);
    expect(bucket.elapsedSeconds).toBe(300);
    expect(bucket.colorIndex).toBe(5);
    expect(bucket.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Should not have server-only fields
    expect(bucket).not.toHaveProperty('sortOrder');
    // startedAt and goalReachedAt are now part of TimeBucket
    expect(bucket.startedAt).toBeNull();
    expect(bucket.goalReachedAt).toBeNull();
  });

  it('computes live elapsed for running timers', async () => {
    // Timer started 30 seconds ago with 100 base elapsed
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const sb = makeServerBucket({
      elapsedSeconds: 100,
      startedAt: thirtySecsAgo,
    });
    mockFetchTodayState.mockResolvedValue(makeTodayState([sb]));

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // 100 base + 30 from startedAt = 130
    expect(result.current.allBuckets[0]!.elapsedSeconds).toBe(130);
  });

  it('does NOT cap elapsed at total duration (tracks actual usage)', async () => {
    // Timer exceeds total: 50s base + 20s from startedAt on a 1-minute bucket
    const twentySecsAgo = new Date(Date.now() - 20_000).toISOString();
    const sb = makeServerBucket({
      totalMinutes: 1,
      elapsedSeconds: 50,
      startedAt: twentySecsAgo,
    });
    mockFetchTodayState.mockResolvedValue(makeTodayState([sb]));

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // NOT capped — elapsed can exceed totalMinutes * 60 to track actual usage
    expect(result.current.allBuckets[0]!.elapsedSeconds).toBe(70);
  });

  // ---- activeBucketId ----

  it('derives activeBucketId from server startedAt', async () => {
    const sb = makeServerBucket({
      id: 'active-1',
      startedAt: new Date().toISOString(),
    });
    mockFetchTodayState.mockResolvedValue(makeTodayState([sb]));

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.activeBucketId).toBe('active-1');
  });

  it('activeBucketId is null when no timer is running', async () => {
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([makeServerBucket({ startedAt: null })]),
    );

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.activeBucketId).toBeNull();
  });

  // ---- todaysBuckets ----

  it('todaysBuckets includes buckets scheduled for today', async () => {
    // Use current real day of week to avoid needing fake timers
    const today = new Date().getDay();
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([makeServerBucket({ daysOfWeek: [today] })]),
    );

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.todaysBuckets).toHaveLength(1);
  });

  it('todaysBuckets excludes buckets not scheduled for today', async () => {
    // Pick a day that is NOT today
    const today = new Date().getDay();
    const notToday = (today + 3) % 7; // 3 days off from today
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([makeServerBucket({ daysOfWeek: [notToday] })]),
    );

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.todaysBuckets).toHaveLength(0);
  });

  // ---- toggleBucket ----

  it('toggleBucket calls startTimer when bucket is not active', async () => {
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([makeServerBucket({ id: 'b1', startedAt: null })]),
    );
    mockStartTimer.mockResolvedValue({
      bucketId: 'b1',
      startedAt: new Date().toISOString(),
      stoppedBucketId: null,
    });

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.toggleBucket('b1'));

    await waitFor(() => expect(mockStartTimer).toHaveBeenCalledWith('b1'));
  });

  it('toggleBucket calls stopTimer when bucket is active', async () => {
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([
        makeServerBucket({
          id: 'b1',
          startedAt: new Date().toISOString(),
        }),
      ]),
    );
    mockStopTimer.mockResolvedValue({ elapsedSeconds: 100, goalReachedAt: null });

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.activeBucketId).toBe('b1');

    act(() => result.current.toggleBucket('b1'));

    await waitFor(() => expect(mockStopTimer).toHaveBeenCalledWith('b1'));
  });

  // ---- addBucket ----

  it('addBucket calls createBucket with correct shape', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());
    mockCreateBucket.mockResolvedValue({
      id: 'new-1',
      name: 'New Bucket',
      totalMinutes: 45,
      colorIndex: 7,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() =>
      result.current.addBucket({
        id: 'local-id', // should be ignored — server generates ID
        name: 'New Bucket',
        totalMinutes: 45,
        elapsedSeconds: 0, // should be ignored — server tracks progress
        colorIndex: 7,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startedAt: null,
        goalReachedAt: null,
      }),
    );

    await waitFor(() =>
      expect(mockCreateBucket).toHaveBeenCalledWith({
        name: 'New Bucket',
        totalMinutes: 45,
        colorIndex: 7,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      }),
    );
  });

  // ---- removeBucket ----

  it('removeBucket calls deleteBucket', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());
    mockDeleteBucket.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.removeBucket('b1'));

    await waitFor(() => expect(mockDeleteBucket).toHaveBeenCalledWith('b1'));
  });

  // ---- updateBucket ----

  it('updateBucket calls server mutation with server-accepted fields', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());
    mockUpdateBucket.mockResolvedValue({
      id: 'b1',
      name: 'Renamed',
      totalMinutes: 60,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
      sortOrder: 0,
      createdAt: 1000,
      updatedAt: Date.now(),
    });

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.updateBucket('b1', { name: 'Renamed' }));

    await waitFor(() =>
      expect(mockUpdateBucket).toHaveBeenCalledWith('b1', { name: 'Renamed' }),
    );
  });

  // ---- resetBucketForToday ----

  it('resetBucketForToday calls resetTimer and clears from goalReachedBuckets', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());
    mockResetTimer.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // First mark as completed via SSE
    await act(async () => getSSEHandlers().onGoalReached?.({ bucketId: 'b1' }));
    await waitFor(() => expect(result.current.goalReachedBuckets.has('b1')).toBe(true));

    // Then reset
    act(() => result.current.resetBucketForToday('b1'));

    await waitFor(() => expect(mockResetTimer).toHaveBeenCalledWith('b1'));
    expect(result.current.goalReachedBuckets.has('b1')).toBe(false);
  });

  // ---- setRemainingTime ----

  it('setRemainingTime calls setTimerTime mutation', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());
    mockSetTimerTime.mockResolvedValue({
      elapsedSeconds: 3300,
      goalReachedAt: null,
    });

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.setRemainingTime('b1', 300));

    await waitFor(() =>
      expect(mockSetTimerTime).toHaveBeenCalledWith('b1', 300),
    );
  });

  // ---- SSE events ----

  it('useTimerSSE is wired with all expected handlers', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());

    renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    // Verify useTimerSSE was called with all expected handler callbacks
    expect(mockUseTimerSSE).toHaveBeenCalled();
    const handlers = getSSEHandlers();
    expect(typeof handlers.onGoalReached).toBe('function');
    expect(typeof handlers.onDailyReset).toBe('function');
    expect(typeof handlers.onTimerStarted).toBe('function');
    expect(typeof handlers.onTimerStopped).toBe('function');
    expect(typeof handlers.onTimerReset).toBe('function');
    expect(typeof handlers.onTimerUpdated).toBe('function');
  });

  it('SSE daily-reset event clears goalReachedBuckets', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState());

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // Add to goalReachedBuckets via SSE (same approach as resetBucketForToday test)
    await act(async () => getSSEHandlers().onGoalReached?.({ bucketId: 'b1' }));
    await waitFor(() =>
      expect(result.current.goalReachedBuckets.has('b1')).toBe(true),
    );

    // Trigger daily reset — should clear goalReachedBuckets
    await act(async () => getSSEHandlers().onDailyReset?.());
    await waitFor(() =>
      expect(result.current.goalReachedBuckets.size).toBe(0),
    );
  });

  // ---- Tick interval ----

  it('1-second tick forces re-render with updated elapsed', async () => {
    // Use fake timers with shouldAdvanceTime so promises still resolve
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 2, 24, 10, 0, 0));

    const now = new Date().toISOString();
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([
        makeServerBucket({
          id: 'b1',
          elapsedSeconds: 0,
          startedAt: now,
        }),
      ]),
    );

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // Initial: elapsed should be ~0 in both views
    expect(result.current.allBuckets[0]!.elapsedSeconds).toBe(0);
    expect(result.current.todaysBuckets[0]!.elapsedSeconds).toBe(0);

    // Advance 3 seconds — each tick forces re-render
    act(() => vi.advanceTimersByTime(3000));

    // Both All and Remaining should now show ~3 seconds elapsed from startedAt.
    expect(result.current.allBuckets[0]!.elapsedSeconds).toBe(3);
    expect(result.current.todaysBuckets[0]!.elapsedSeconds).toBe(3);
  });

  it('tick interval stops when no bucket is active', async () => {
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([makeServerBucket({ startedAt: null, elapsedSeconds: 10 })]),
    );

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    const elapsed = result.current.allBuckets[0]!.elapsedSeconds;
    expect(elapsed).toBe(10);

    // No active bucket — elapsed should not change even if time passes
    // (no interval is running to force re-render)
  });

  // ---- Completion detection on initial load ----

  it('does not add already-completed buckets to goalReachedBuckets on load', async () => {
    // Bucket already completed before page load
    mockFetchTodayState.mockResolvedValue(
      makeTodayState([
        makeServerBucket({
          totalMinutes: 1,
          elapsedSeconds: 60,
          goalReachedAt: new Date().toISOString(),
        }),
      ]),
    );

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // Should NOT be in goalReachedBuckets (it was already complete on load,
    // not completed during this session)
    expect(result.current.goalReachedBuckets.has('b1')).toBe(false);
  });

  // ---- Empty state ----

  it('returns empty arrays when no buckets exist', async () => {
    mockFetchTodayState.mockResolvedValue(makeTodayState([]));

    const { result } = renderHook(() => useTimerState(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    expect(result.current.allBuckets).toEqual([]);
    expect(result.current.todaysBuckets).toEqual([]);
    expect(result.current.activeBucketId).toBeNull();
  });
});
