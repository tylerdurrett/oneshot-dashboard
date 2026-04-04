import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { UseTimerStateReturn } from '../_hooks/use-timer-state';
import { AllTimerGridWithState } from '../_components/all-timer-grid';
import { TimerGridWithState } from '../_components/timer-grid';

const { mockUseTimerState } = vi.hoisted(() => ({
  mockUseTimerState: vi.fn(),
}));

vi.mock('../_hooks/use-timer-state', () => ({
  useTimerState: mockUseTimerState,
}));

vi.mock('../_hooks/use-container-size', () => ({
  useContainerSize: () => ({
    containerRef: { current: null },
    size: { width: 320, height: 640 },
  }),
}));

vi.mock('../_components/timer-bucket', () => ({
  TimerBucket: () => React.createElement('div', null, 'Bucket'),
  getTimerBucketSizeTier: () => 'large',
}));

vi.mock('../_components/bucket-settings-dialog', () => ({
  BucketSettingsDialog: () => null,
}));

vi.mock('@repo/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children),
}));

function makeTimerState(overrides: Partial<UseTimerStateReturn> = {}): UseTimerStateReturn {
  return {
    isHydrated: true,
    allBuckets: [],
    todaysBuckets: [],
    activeBucketId: null,
    goalReachedBuckets: new Set(),
    toggleBucket: vi.fn(),
    addBucket: vi.fn(),
    removeBucket: vi.fn(),
    updateBucket: vi.fn(),
    resetBucketForToday: vi.fn(),
    setElapsedTime: vi.fn(),
    setDailyGoal: vi.fn(),
    dismissBucketForToday: vi.fn(),
    ...overrides,
  };
}

describe('timer views state sharing', () => {
  beforeEach(() => {
    mockUseTimerState.mockReset();
  });

  it('TimerGridWithState uses the provided timer state instead of creating a new hook instance', () => {
    render(<TimerGridWithState timerState={makeTimerState()} />);

    expect(screen.getByText('No buckets yet')).toBeTruthy();
    expect(mockUseTimerState).not.toHaveBeenCalled();
  });

  it('clicking "Create your first bucket" opens dialog without calling addBucket', () => {
    const state = makeTimerState();
    render(<TimerGridWithState timerState={state} />);

    const btn = screen.getAllByRole('button', { name: /create your first bucket/i })[0]!;
    fireEvent.click(btn);

    // addBucket must NOT be called — the API call should be deferred until
    // the user saves the dialog, preventing a premature POST with defaults.
    expect(state.addBucket).not.toHaveBeenCalled();
  });

  it('AllTimerGridWithState uses the provided timer state instead of creating a new hook instance', () => {
    render(<AllTimerGridWithState timerState={makeTimerState()} />);

    expect(screen.getByText('No time tracked yet')).toBeTruthy();
    expect(mockUseTimerState).not.toHaveBeenCalled();
  });
});
