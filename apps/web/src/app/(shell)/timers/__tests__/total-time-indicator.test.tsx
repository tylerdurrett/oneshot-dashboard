import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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
    startedAt: null,
    goalReachedAt: null,
    dismissedAt: null,
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

  it('displays formatted tracked and goal time', () => {
    const buckets = [
      makeBucket({ totalMinutes: 120, elapsedSeconds: 4500 }),
      makeBucket({ id: 'b2', totalMinutes: 60, elapsedSeconds: 900 }),
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);
    // 5400s = 1.5 hours, goal = 180min = 3 hours
    expect(screen.getByText('1.5 hours / 3 hours')).toBeDefined();
  });

  it('displays minutes when tracked is under an hour', () => {
    const buckets = [
      makeBucket({ totalMinutes: 120, elapsedSeconds: 1800 }),
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);
    // 1800s = 30 minutes, goal = 120min = 2 hours
    expect(screen.getByText('30 minutes / 2 hours')).toBeDefined();
  });

  it('caps progress bar at 100% when tracked exceeds goal', () => {
    const buckets = [
      makeBucket({ totalMinutes: 60, elapsedSeconds: 7200 }),
    ];
    render(<TotalTimeIndicator allBuckets={buckets} />);

    const indicator = screen.getByTestId('total-time-indicator');
    const fillBar = indicator.children[1] as HTMLElement;
    // scaleX should be 1 (100%), not 2
    expect(fillBar.style.transform).toBe('scaleX(1)');
    // But the text still shows the actual tracked time
    expect(screen.getByText('2 hours / 1 hour')).toBeDefined();
  });
});
