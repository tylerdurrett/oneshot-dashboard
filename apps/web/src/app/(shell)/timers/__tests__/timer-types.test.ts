import { describe, expect, it } from 'vitest';
import {
  formatTime,
  isBucketActiveToday,
  generateBucketId,
  BUCKET_COLORS,
  type TimeBucket,
} from '../_lib/timer-types';

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------

describe('formatTime', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats 59 seconds as 0:59', () => {
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats 60 seconds as 1:00', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  it('formats 3599 seconds as 59:59 (just under 1 hour)', () => {
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats 3600 seconds as 1:00:00 (exactly 1 hour)', () => {
    expect(formatTime(3600)).toBe('1:00:00');
  });

  it('formats 3661 seconds as 1:01:01', () => {
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('handles large values', () => {
    // 10 hours, 5 minutes, 30 seconds = 36330
    expect(formatTime(36330)).toBe('10:05:30');
  });

  it('formats negative values with a minus prefix', () => {
    expect(formatTime(-10)).toBe('-0:10');
    expect(formatTime(-3661)).toBe('-1:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59');
  });
});

// ---------------------------------------------------------------------------
// isBucketActiveToday
// ---------------------------------------------------------------------------

describe('isBucketActiveToday', () => {
  const makeBucket = (daysOfWeek: number[]): TimeBucket => ({
    id: 'test',
    name: 'Test',
    totalMinutes: 60,
    elapsedSeconds: 0,
    colorIndex: 0,
    daysOfWeek,
    startedAt: null,
    goalReachedAt: null,
  });

  it('returns true when today is in the bucket daysOfWeek', () => {
    // March 24, 2026 is a Tuesday (day 2), at 10 AM
    const tuesday = new Date(2026, 2, 24, 10, 0, 0);
    const bucket = makeBucket([1, 2, 3, 4, 5]); // Mon–Fri
    expect(isBucketActiveToday(bucket, tuesday)).toBe(true);
  });

  it('returns false when today is not in the bucket daysOfWeek', () => {
    // March 22, 2026 is a Sunday (day 0), at 10 AM
    const sunday = new Date(2026, 2, 22, 10, 0, 0);
    const bucket = makeBucket([1, 2, 3, 4, 5]); // Mon–Fri
    expect(isBucketActiveToday(bucket, sunday)).toBe(false);
  });

  it('uses 3 AM adjustment — before 3 AM Tuesday treated as Monday', () => {
    // March 24, 2026 at 2:00 AM is calendar Tuesday, but 3AM-adjusted = Monday (day 1)
    const earlyTuesday = new Date(2026, 2, 24, 2, 0, 0);
    const mondayOnly = makeBucket([1]); // Monday only
    expect(isBucketActiveToday(mondayOnly, earlyTuesday)).toBe(true);
  });

  it('uses 3 AM adjustment — before 3 AM Tuesday excludes Tuesday-only bucket', () => {
    // Same early Tuesday, but a bucket active only on Tuesdays should be inactive
    const earlyTuesday = new Date(2026, 2, 24, 2, 0, 0);
    const tuesdayOnly = makeBucket([2]); // Tuesday only
    expect(isBucketActiveToday(tuesdayOnly, earlyTuesday)).toBe(false);
  });

  it('returns true for an every-day bucket', () => {
    const date = new Date(2026, 2, 24, 10, 0, 0);
    const bucket = makeBucket([0, 1, 2, 3, 4, 5, 6]);
    expect(isBucketActiveToday(bucket, date)).toBe(true);
  });

  it('returns false for an empty daysOfWeek', () => {
    const date = new Date(2026, 2, 24, 10, 0, 0);
    const bucket = makeBucket([]);
    expect(isBucketActiveToday(bucket, date)).toBe(false);
  });

  it('handles weekend bucket on Saturday', () => {
    // March 21, 2026 is a Saturday (day 6), at noon
    const saturday = new Date(2026, 2, 21, 12, 0, 0);
    const weekendBucket = makeBucket([0, 6]); // Sat + Sun
    expect(isBucketActiveToday(weekendBucket, saturday)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateBucketId
// ---------------------------------------------------------------------------

describe('generateBucketId', () => {
  it('returns a valid UUID string', () => {
    const id = generateBucketId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique values across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateBucketId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('BUCKET_COLORS', () => {
  it('has 10 color entries', () => {
    expect(BUCKET_COLORS).toHaveLength(10);
  });

  it('each entry has vibrant and muted CSS variable references', () => {
    for (const color of BUCKET_COLORS) {
      expect(color.vibrant).toMatch(/^var\(--bucket-\d+\)$/);
      expect(color.muted).toMatch(/^var\(--bucket-\d+-muted\)$/);
    }
  });
});

