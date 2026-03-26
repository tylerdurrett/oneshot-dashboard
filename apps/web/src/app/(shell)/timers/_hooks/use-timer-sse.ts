import { useEffect, useRef } from 'react';

import { getBaseUrl } from '../_lib/timer-api';

// ---------------------------------------------------------------------------
// SSE event names — must match server (apps/server/src/routes/timers.ts)
// ---------------------------------------------------------------------------

export const SSE_EVENTS = {
  TIMER_STARTED: 'timer-started',
  TIMER_STOPPED: 'timer-stopped',
  TIMER_GOAL_REACHED: 'timer-goal-reached',
  TIMER_RESET: 'timer-reset',
  TIMER_UPDATED: 'timer-updated',
  TIMER_DISMISSED: 'timer-dismissed',
  DAILY_RESET: 'daily-reset',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimerStartedData {
  bucketId: string;
  startedAt: string;
}

export interface TimerStoppedData {
  bucketId: string;
}

export interface TimerGoalReachedData {
  bucketId: string;
}

export interface TimerResetData {
  bucketId: string;
}

export interface TimerUpdatedData {
  bucketId: string;
  elapsedSeconds: number;
  goalReachedAt: string | null;
}

export interface TimerDismissedData {
  bucketId: string;
}

export interface TimerSSEHandlers {
  onTimerStarted?: (data: TimerStartedData) => void;
  onTimerStopped?: (data: TimerStoppedData) => void;
  onGoalReached?: (data: TimerGoalReachedData) => void;
  onTimerReset?: (data: TimerResetData) => void;
  onTimerUpdated?: (data: TimerUpdatedData) => void;
  onTimerDismissed?: (data: TimerDismissedData) => void;
  onDailyReset?: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Parse SSE event data, silently ignoring malformed JSON. */
function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Connects to the server's SSE endpoint and dispatches timer events to
 * callback handlers. Uses refs for handlers so changing callbacks does not
 * cause a reconnection.
 *
 * EventSource auto-reconnects on connection loss natively.
 */
export function useTimerSSE(handlers: TimerSSEHandlers): void {
  // Store handlers in a ref so the EventSource listeners always call the
  // latest callbacks without needing to tear down and reconnect.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource(`${getBaseUrl()}/timers/events`);

    es.addEventListener(SSE_EVENTS.TIMER_STARTED, (e) => {
      const data = safeParse<TimerStartedData>(e.data);
      if (data) handlersRef.current.onTimerStarted?.(data);
    });

    es.addEventListener(SSE_EVENTS.TIMER_STOPPED, (e) => {
      const data = safeParse<TimerStoppedData>(e.data);
      if (data) handlersRef.current.onTimerStopped?.(data);
    });

    es.addEventListener(SSE_EVENTS.TIMER_GOAL_REACHED, (e) => {
      const data = safeParse<TimerGoalReachedData>(e.data);
      if (data) handlersRef.current.onGoalReached?.(data);
    });

    es.addEventListener(SSE_EVENTS.TIMER_RESET, (e) => {
      const data = safeParse<TimerResetData>(e.data);
      if (data) handlersRef.current.onTimerReset?.(data);
    });

    es.addEventListener(SSE_EVENTS.TIMER_UPDATED, (e) => {
      const data = safeParse<TimerUpdatedData>(e.data);
      if (data) handlersRef.current.onTimerUpdated?.(data);
    });

    es.addEventListener(SSE_EVENTS.TIMER_DISMISSED, (e) => {
      const data = safeParse<TimerDismissedData>(e.data);
      if (data) handlersRef.current.onTimerDismissed?.(data);
    });

    es.addEventListener(SSE_EVENTS.DAILY_RESET, () => {
      handlersRef.current.onDailyReset?.();
    });

    return () => {
      es.close();
    };
  }, []); // stable — handlers accessed via ref
}
