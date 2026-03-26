import { describe, expect, it } from 'vitest';

import type { TimeBucket } from '../_lib/timer-types';
import {
  bucketsToElapsedItems,
  getAllPageElapsedBaselineMinutes,
} from '../_components/all-timer-grid';

function makeBucket(
  id: string,
  elapsedSeconds: number,
): TimeBucket {
  return {
    id,
    name: id,
    totalMinutes: 60,
    elapsedSeconds,
    colorIndex: 0,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startedAt: null,
    goalReachedAt: null,
    dismissedAt: null,
  };
}

describe('getAllPageElapsedBaselineMinutes', () => {
  it('uses a larger baseline on very small screens', () => {
    expect(getAllPageElapsedBaselineMinutes(320)).toBe(10);
  });

  it('uses a medium baseline on small phones', () => {
    expect(getAllPageElapsedBaselineMinutes(390)).toBe(8);
  });

  it('uses a smaller baseline on wider layouts', () => {
    expect(getAllPageElapsedBaselineMinutes(900)).toBe(4);
  });
});

describe('bucketsToElapsedItems', () => {
  it('adds a baseline so tiny elapsed buckets stay visible in the treemap', () => {
    const items = bucketsToElapsedItems(
      [makeBucket('tiny', 30), makeBucket('medium', 5 * 60)],
      8,
    );

    expect(items).toEqual([
      { id: 'tiny', value: 9 },
      { id: 'medium', value: 13 },
    ]);
  });
});
