import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../services/thread.js';
import {
  daysFromSchedule,
  scheduleFromUniform,
  minutesForDay,
  createBucket,
  updateBucket,
  getBucket,
} from '../services/timer-bucket.js';
import {
  getResetDayOfWeek,
  resolveTargetMinutes,
  getTodayState,
  RESET_HOUR,
} from '../services/timer-progress.js';
import { createTimerTestDb, seedBucket } from './timer-test-helpers.js';

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe('daysFromSchedule', () => {
  it('returns sorted day indices from schedule keys', () => {
    expect(daysFromSchedule({ '5': 60, '1': 120, '3': 90 })).toEqual([1, 3, 5]);
  });

  it('returns empty array for empty schedule', () => {
    expect(daysFromSchedule({})).toEqual([]);
  });

  it('handles all 7 days', () => {
    const schedule = { '0': 60, '1': 60, '2': 60, '3': 60, '4': 60, '5': 60, '6': 60 };
    expect(daysFromSchedule(schedule)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('scheduleFromUniform', () => {
  it('creates schedule with same value for all specified days', () => {
    expect(scheduleFromUniform(120, [1, 3, 5])).toEqual({
      '1': 120,
      '3': 120,
      '5': 120,
    });
  });

  it('handles empty days array', () => {
    expect(scheduleFromUniform(60, [])).toEqual({});
  });

  it('handles all days', () => {
    const schedule = scheduleFromUniform(30, [0, 1, 2, 3, 4, 5, 6]);
    expect(Object.keys(schedule)).toHaveLength(7);
    expect(Object.values(schedule).every((v) => v === 30)).toBe(true);
  });
});

describe('minutesForDay', () => {
  it('returns schedule value when day exists', () => {
    expect(minutesForDay({ '1': 120, '3': 90 }, 1, 60)).toBe(120);
  });

  it('returns fallback when day not in schedule', () => {
    expect(minutesForDay({ '1': 120 }, 3, 60)).toBe(60);
  });

  it('returns fallback when schedule is null', () => {
    expect(minutesForDay(null, 1, 60)).toBe(60);
  });

  it('returns 0 when schedule has 0 for the day', () => {
    // Edge case: 0 is a valid value, should not fall through to fallback
    expect(minutesForDay({ '1': 0 }, 1, 60)).toBe(0);
  });
});

describe('getResetDayOfWeek', () => {
  it('returns current day after 3AM', () => {
    // Wednesday March 25, 2026 at 10:00 AM
    const now = new Date(2026, 2, 25, 10, 0, 0);
    expect(getResetDayOfWeek(now)).toBe(3); // Wednesday
  });

  it('returns previous day before 3AM', () => {
    // Wednesday March 25, 2026 at 2:00 AM → should be Tuesday
    const now = new Date(2026, 2, 25, 2, 0, 0);
    expect(getResetDayOfWeek(now)).toBe(2); // Tuesday
  });

  it('returns current day at exactly 3AM', () => {
    // Wednesday March 25, 2026 at 3:00 AM → should be Wednesday
    const now = new Date(2026, 2, 25, 3, 0, 0);
    expect(getResetDayOfWeek(now)).toBe(3); // Wednesday
  });

  it('handles midnight on Sunday wrapping to Saturday', () => {
    // Sunday March 29, 2026 at 0:00 AM → should be Saturday
    const now = new Date(2026, 2, 29, 0, 0, 0);
    expect(getResetDayOfWeek(now)).toBe(6); // Saturday
  });
});

describe('resolveTargetMinutes', () => {
  it('returns override when provided', () => {
    expect(resolveTargetMinutes(90, { '1': 120 }, 60, 1)).toBe(90);
  });

  it('returns schedule value when no override', () => {
    expect(resolveTargetMinutes(null, { '1': 120, '3': 90 }, 60, 1)).toBe(120);
  });

  it('returns totalMinutes fallback when day not in schedule', () => {
    expect(resolveTargetMinutes(null, { '1': 120 }, 60, 3)).toBe(60);
  });

  it('returns totalMinutes fallback when schedule is null', () => {
    expect(resolveTargetMinutes(null, null, 60, 1)).toBe(60);
  });

  it('returns totalMinutes fallback when schedule is undefined', () => {
    expect(resolveTargetMinutes(undefined, undefined, 60, 1)).toBe(60);
  });

  it('override takes precedence over schedule', () => {
    expect(resolveTargetMinutes(45, { '1': 120 }, 60, 1)).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// CRUD integration tests for weeklySchedule
// ---------------------------------------------------------------------------

describe('weeklySchedule CRUD', () => {
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createTimerTestDb();
  });

  it('createBucket builds uniform schedule when not provided', async () => {
    const bucket = await createBucket(
      { name: 'Test', totalMinutes: 120, colorIndex: 0, daysOfWeek: [1, 3, 5] },
      testDb,
    );

    expect(bucket.weeklySchedule).toEqual({ '1': 120, '3': 120, '5': 120 });
    expect(bucket.daysOfWeek).toEqual([1, 3, 5]);
    expect(bucket.totalMinutes).toBe(120);
  });

  it('createBucket accepts explicit weeklySchedule', async () => {
    const bucket = await createBucket(
      {
        name: 'Custom',
        totalMinutes: 60,
        colorIndex: 0,
        daysOfWeek: [1, 5],
        weeklySchedule: { '1': 60, '5': 240 },
      },
      testDb,
    );

    expect(bucket.weeklySchedule).toEqual({ '1': 60, '5': 240 });
    // daysOfWeek derived from schedule
    expect(bucket.daysOfWeek).toEqual([1, 5]);
    // totalMinutes is max of schedule values for backward compat
    expect(bucket.totalMinutes).toBe(240);
  });

  it('getBucket round-trips weeklySchedule correctly', async () => {
    const created = await createBucket(
      {
        name: 'Roundtrip',
        totalMinutes: 60,
        colorIndex: 0,
        daysOfWeek: [0, 1, 2],
        weeklySchedule: { '0': 240, '1': 60, '2': 90 },
      },
      testDb,
    );

    const fetched = await getBucket(created.id, testDb);
    expect(fetched!.weeklySchedule).toEqual({ '0': 240, '1': 60, '2': 90 });
    expect(fetched!.daysOfWeek).toEqual([0, 1, 2]);
  });

  it('updateBucket with weeklySchedule derives daysOfWeek and totalMinutes', async () => {
    const created = await createBucket(
      { name: 'Test', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1, 2, 3, 4, 5] },
      testDb,
    );

    const updated = await updateBucket(
      created.id,
      { weeklySchedule: { '1': 120, '5': 60 } },
      testDb,
    );

    expect(updated!.weeklySchedule).toEqual({ '1': 120, '5': 60 });
    expect(updated!.daysOfWeek).toEqual([1, 5]);
    expect(updated!.totalMinutes).toBe(120); // max
  });

  it('updateBucket with legacy fields rebuilds weeklySchedule', async () => {
    const created = await createBucket(
      {
        name: 'Test',
        totalMinutes: 60,
        colorIndex: 0,
        daysOfWeek: [1, 2, 3],
        weeklySchedule: { '1': 60, '2': 60, '3': 60 },
      },
      testDb,
    );

    // Update using legacy fields (like old callers would)
    const updated = await updateBucket(
      created.id,
      { totalMinutes: 90, daysOfWeek: [1, 3, 5] },
      testDb,
    );

    // weeklySchedule should be rebuilt as uniform
    expect(updated!.weeklySchedule).toEqual({ '1': 90, '3': 90, '5': 90 });
    expect(updated!.totalMinutes).toBe(90);
    expect(updated!.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('updateBucket with only totalMinutes rebuilds schedule with existing days', async () => {
    const created = await createBucket(
      { name: 'Test', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1, 3, 5] },
      testDb,
    );

    const updated = await updateBucket(created.id, { totalMinutes: 120 }, testDb);

    expect(updated!.weeklySchedule).toEqual({ '1': 120, '3': 120, '5': 120 });
    expect(updated!.totalMinutes).toBe(120);
    expect(updated!.daysOfWeek).toEqual([1, 3, 5]); // unchanged
  });
});

// ---------------------------------------------------------------------------
// getTodayState integration test with weeklySchedule
// ---------------------------------------------------------------------------

describe('getTodayState with weeklySchedule', () => {
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createTimerTestDb();
  });

  it('resolves per-day target from weeklySchedule', async () => {
    // Create a bucket with different goals per day
    await createBucket(
      {
        name: 'Variable',
        totalMinutes: 60, // fallback
        colorIndex: 0,
        daysOfWeek: [1, 5],
        weeklySchedule: { '1': 60, '5': 240 },
      },
      testDb,
    );

    // Query on a Monday (day 1) at 10AM
    const monday = new Date(2026, 2, 23, 10, 0, 0); // March 23, 2026 is a Monday
    const stateMonday = await getTodayState(testDb, monday);
    expect(stateMonday.buckets[0]!.totalMinutes).toBe(60);

    // Query on a Friday (day 5) at 10AM
    const friday = new Date(2026, 2, 27, 10, 0, 0); // March 27, 2026 is a Friday
    const stateFriday = await getTodayState(testDb, friday);
    expect(stateFriday.buckets[0]!.totalMinutes).toBe(240);
  });

  it('returns weeklySchedule in response', async () => {
    await createBucket(
      {
        name: 'WithSchedule',
        totalMinutes: 60,
        colorIndex: 0,
        daysOfWeek: [1, 3],
        weeklySchedule: { '1': 90, '3': 120 },
      },
      testDb,
    );

    const monday = new Date(2026, 2, 23, 10, 0, 0);
    const state = await getTodayState(testDb, monday);
    expect(state.buckets[0]!.weeklySchedule).toEqual({ '1': 90, '3': 120 });
  });

  it('falls back to totalMinutes for null weeklySchedule', async () => {
    // Seed bucket using raw helper (no weeklySchedule)
    const bucket = await seedBucket(testDb, {
      totalMinutes: 45,
      daysOfWeek: [1, 2, 3, 4, 5],
    });

    const monday = new Date(2026, 2, 23, 10, 0, 0);
    const state = await getTodayState(testDb, monday);
    expect(state.buckets[0]!.totalMinutes).toBe(45);
  });
});
