import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TimeBucket } from '../_lib/timer-types';
import { TotalTimeIndicator } from '../_components/total-time-indicator';

function makeBucket(overrides: Partial<TimeBucket> = {}): TimeBucket {
  return {
    id: 'b1',
    name: 'Test',
    totalMinutes: 60,
    elapsedSeconds: 0,
    colorIndex: 0,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    weeklySchedule: null,
    startedAt: null,
    goalReachedAt: null,
    dismissedAt: null,
    deactivatedAt: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('TotalTimeIndicator', () => {
  it('renders nothing when there are no qualifying buckets', () => {
    const { container } = render(<TotalTimeIndicator allBuckets={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when all buckets are dismissed', () => {
    const buckets = [
      makeBucket({ dismissedAt: '2026-03-24T09:00:00Z' }),
    ];
    const { container } = render(<TotalTimeIndicator allBuckets={buckets} />);
    expect(container.innerHTML).toBe('');
  });

  it('displays summary with done, left, and total', () => {
    const buckets = [
      makeBucket({ totalMinutes: 120, elapsedSeconds: 4500 }),
      makeBucket({ id: 'b2', totalMinutes: 60, elapsedSeconds: 900 }),
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);
    // elapsed=5400s=1.5hr, remaining=10800-5400=5400s=1:30, totalDay=3hr
    const indicator = screen.getByTestId('total-time-indicator');
    expect(indicator.textContent).toContain('1.5 done');
    expect(indicator.textContent).toContain('1:30 left');
    expect(indicator.textContent).toContain('(3 total)');
  });

  it('shows 100% progress when single bucket exceeds its goal', () => {
    const buckets = [
      makeBucket({ totalMinutes: 60, elapsedSeconds: 7200 }),
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);

    const indicator = screen.getByTestId('total-time-indicator');
    const fillBar = indicator.children[1] as HTMLElement;
    // elapsed=7200, totalDay=max(7200,3600)=7200, progress=1.0
    expect(fillBar.style.transform).toBe('scaleX(1)');
    expect(indicator.textContent).toContain('2 done');
    expect(indicator.textContent).toContain('0:00 left');
  });

  it('shows partial progress when one bucket has overage but another is unfilled', () => {
    const buckets = [
      makeBucket({ id: 'work', totalMinutes: 60, elapsedSeconds: 10800 }), // 3hr on 1hr goal
      makeBucket({ id: 'exercise', totalMinutes: 60, elapsedSeconds: 0 }),  // 0hr on 1hr goal
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);

    // elapsed=10800 (3hr), totalDay=max(10800,3600)+max(0,3600)=14400 (4hr), progress=0.75
    const indicator = screen.getByTestId('total-time-indicator');
    const fillBar = indicator.children[1] as HTMLElement;
    expect(fillBar.style.transform).toBe('scaleX(0.75)');
    expect(indicator.textContent).toContain('3 done');
    expect(indicator.textContent).toContain('1:00 left');
    expect(indicator.textContent).toContain('(4 total)');
  });

  it('displays finish time when time remains', () => {
    const now = new Date('2026-04-01T14:00:00');
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());

    const buckets = [
      makeBucket({ totalMinutes: 60, elapsedSeconds: 1800 }), // 30 min remaining
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);

    const finishTime = new Date(now.getTime() + 1800 * 1000).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const indicator = screen.getByTestId('total-time-indicator');
    expect(indicator.textContent).toContain(`Finish at ${finishTime}`);

    vi.restoreAllMocks();
  });

  it('does not display finish time when all time is complete', () => {
    const buckets = [
      makeBucket({ totalMinutes: 60, elapsedSeconds: 7200 }), // exceeded goal
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);

    const indicator = screen.getByTestId('total-time-indicator');
    expect(indicator.textContent).not.toContain('Finish at');
  });
});
