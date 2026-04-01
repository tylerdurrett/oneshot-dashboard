import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileTimersPager } from '../layout';

const { mockNavigate, mockRaf } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRaf: vi.fn((cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(0), 0);
  }),
}));

vi.mock('react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  Outlet: () => null,
  useLocation: () => ({ pathname: '/timers/remaining' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../_hooks/use-container-size', () => ({
  useContainerSize: () => ({
    containerRef: { current: null },
    size: { width: 300, height: 640 },
  }),
}));

vi.mock('../_hooks/use-timer-state', () => ({}));

vi.mock('../_components/timer-grid', () => ({
  TimerGridWithState: () => (
    <button data-testid="remaining-view-button" className="h-full w-full">
      Remaining View
    </button>
  ),
}));

vi.mock('../_components/all-timer-grid', () => ({
  AllTimerGridWithState: () => <div>All View</div>,
}));

import type { UseTimerStateReturn } from '../_hooks/use-timer-state';

const mockTimerState: UseTimerStateReturn = {
  isHydrated: true,
  allBuckets: [],
  todaysBuckets: [],
  activeBucketId: null,
  goalReachedBuckets: new Set<string>(),
  toggleBucket: vi.fn(),
  addBucket: vi.fn(),
  removeBucket: vi.fn(),
  updateBucket: vi.fn(),
  resetBucketForToday: vi.fn(),
  setElapsedTime: vi.fn(),
  setDailyGoal: vi.fn(),
  dismissBucketForToday: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
  mockNavigate.mockReset();
  mockRaf.mockClear();

  vi.stubGlobal('requestAnimationFrame', mockRaf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

function setPagerBounds(pager: HTMLElement, width = 300, height = 640) {
  Object.defineProperty(pager, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }),
  });
}

function swipe(target: HTMLElement, pager: HTMLElement) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 220,
    clientY: 120,
  });
  fireEvent.pointerMove(pager, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 90,
    clientY: 128,
  });
  fireEvent.pointerUp(pager, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 90,
    clientY: 128,
  });
}

describe('MobileTimersPager settle timing', () => {
  it('holds the released position until the destination view becomes active', async () => {
    const { rerender } = render(<MobileTimersPager activeView="remaining" timerState={mockTimerState} />);

    const pager = screen.getByTestId('timers-mobile-pager');
    const target = screen.getByTestId('remaining-view-button');
    setPagerBounds(pager);

    swipe(target, pager);

    expect(mockNavigate).toHaveBeenCalledWith('/timers/all');
    expect(mockRaf).not.toHaveBeenCalled();
    expect(pager.firstElementChild?.getAttribute('style')).toContain(
      'transform: translate3d(-130px, 0, 0)',
    );

    rerender(<MobileTimersPager activeView="all" timerState={mockTimerState} />);

    expect(mockRaf).toHaveBeenCalledTimes(1);
    expect(pager.firstElementChild?.getAttribute('style')).toContain(
      'transform: translate3d(-130px, 0, 0)',
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(pager.firstElementChild?.getAttribute('style')).toContain(
      'transform: translate3d(-300px, 0, 0)',
    );
  });
});
