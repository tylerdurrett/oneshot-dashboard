import { beforeEach, describe, expect, it } from 'vitest';
import { timerDailyProgress } from '@repo/db';
import type { Database } from '../services/thread.js';
import {
  getResetDate,
  getTodayState,
  startTimer,
  stopTimer,
  resetProgress,
  setElapsedTime,
  markGoalReached,
  stopAllRunningTimers,
  dismissBucket,
} from '../services/timer-progress.js';
import { createTimerTestDb, seedBucket } from './timer-test-helpers.js';

// ---------------------------------------------------------------------------
// getResetDate
// ---------------------------------------------------------------------------

describe('getResetDate', () => {
  it('returns today\'s date when after 3 AM', () => {
    // March 24, 2026 at 10:00 AM
    const date = getResetDate(new Date(2026, 2, 24, 10, 0, 0));
    expect(date).toBe('2026-03-24');
  });

  it('returns previous day\'s date when before 3 AM', () => {
    // March 24, 2026 at 2:59 AM → should return March 23
    const date = getResetDate(new Date(2026, 2, 24, 2, 59, 0));
    expect(date).toBe('2026-03-23');
  });

  it('returns today\'s date at exactly 3 AM', () => {
    // March 24, 2026 at 3:00 AM → should return March 24
    const date = getResetDate(new Date(2026, 2, 24, 3, 0, 0));
    expect(date).toBe('2026-03-24');
  });

  it('handles midnight correctly (returns previous day)', () => {
    // March 24, 2026 at 0:00 AM → should return March 23
    const date = getResetDate(new Date(2026, 2, 24, 0, 0, 0));
    expect(date).toBe('2026-03-23');
  });

  it('handles month boundaries correctly', () => {
    // April 1, 2026 at 1:00 AM → should return March 31
    const date = getResetDate(new Date(2026, 3, 1, 1, 0, 0));
    expect(date).toBe('2026-03-31');
  });
});

// ---------------------------------------------------------------------------
// getTodayState
// ---------------------------------------------------------------------------

describe('getTodayState', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('returns all buckets with default progress when no progress rows exist', async () => {
    await seedBucket(testDb, { name: 'A', sortOrder: 0 });
    await seedBucket(testDb, { name: 'B', sortOrder: 1 });

    const now = new Date(2026, 2, 24, 10, 0, 0);
    const result = await getTodayState(testDb, now);

    expect(result.date).toBe('2026-03-24');
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[0]!.name).toBe('A');
    expect(result.buckets[0]!.elapsedSeconds).toBe(0);
    expect(result.buckets[0]!.startedAt).toBeNull();
    expect(result.buckets[0]!.goalReachedAt).toBeNull();
  });

  it('merges existing progress data correctly', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const now = new Date(2026, 2, 24, 10, 0, 0);

    // Insert a progress row with some elapsed time
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 300,
      startedAt: null,
      goalReachedAt: null,
    });

    const result = await getTodayState(testDb, now);
    expect(result.buckets[0]!.elapsedSeconds).toBe(300);
  });

  it('does NOT auto-complete overdue running timers (timer keeps running past goal)', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 1 }); // 60 seconds total
    const startedAt = new Date(2026, 2, 24, 9, 0, 0).toISOString(); // started an hour ago

    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 0,
      startedAt,
    });

    const now = new Date(2026, 2, 24, 10, 0, 0); // 1 hour later
    const result = await getTodayState(testDb, now);

    // Timer should still be running — no auto-stop, no capping
    expect(result.buckets[0]!.elapsedSeconds).toBe(0); // raw DB value (live elapsed computed client-side)
    expect(result.buckets[0]!.startedAt).toBe(startedAt);
    expect(result.buckets[0]!.goalReachedAt).toBeNull();
  });

  it('does not modify a timer that has not exceeded its total', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 }); // 3600 seconds total
    const startedAt = new Date(2026, 2, 24, 9, 50, 0).toISOString(); // started 10 min ago

    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 0,
      startedAt,
    });

    const now = new Date(2026, 2, 24, 10, 0, 0);
    const result = await getTodayState(testDb, now);

    // Timer should still be running
    expect(result.buckets[0]!.elapsedSeconds).toBe(0); // not accumulated yet (still running)
    expect(result.buckets[0]!.startedAt).toBe(startedAt);
    expect(result.buckets[0]!.goalReachedAt).toBeNull();
  });

  it('returns daysOfWeek as number array', async () => {
    await seedBucket(testDb, { daysOfWeek: [1, 3, 5] });

    const now = new Date(2026, 2, 24, 10, 0, 0);
    const result = await getTodayState(testDb, now);
    expect(result.buckets[0]!.daysOfWeek).toEqual([1, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// startTimer
// ---------------------------------------------------------------------------

describe('startTimer', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('creates a progress row and sets startedAt', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);

    const result = await startTimer(bucket.id, testDb, now);

    expect(result.bucketId).toBe(bucket.id);
    expect(result.startedAt).toBe(now.toISOString());
    expect(result.stoppedBucketId).toBeNull();

    // Verify progress row was created in the DB
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bucketId).toBe(bucket.id);
    expect(rows[0]!.startedAt).toBe(now.toISOString());
  });

  it('stops previously running timer (single-active enforcement)', async () => {
    const bucketA = await seedBucket(testDb, { name: 'A', sortOrder: 0 });
    const bucketB = await seedBucket(testDb, { name: 'B', sortOrder: 1 });

    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucketA.id, testDb, t1);

    // Start B 5 minutes later — A should be stopped
    const t2 = new Date(2026, 2, 24, 10, 5, 0);
    const result = await startTimer(bucketB.id, testDb, t2);

    expect(result.stoppedBucketId).toBe(bucketA.id);
    expect(result.bucketId).toBe(bucketB.id);

    // Verify A was stopped with accumulated elapsed
    const rows = await testDb.select().from(timerDailyProgress);
    const rowA = rows.find((r) => r.bucketId === bucketA.id)!;
    expect(rowA.startedAt).toBeNull();
    expect(rowA.elapsedSeconds).toBe(300); // 5 minutes = 300 seconds
  });

  it('reuses existing progress row if one exists for today', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);

    // Pre-create a progress row with some elapsed time
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 120,
    });

    await startTimer(bucket.id, testDb, now);

    // Should still only have 1 progress row (reused, not duplicated)
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startedAt).toBe(now.toISOString());
    expect(rows[0]!.elapsedSeconds).toBe(120); // preserved
  });

  it('preserves goalReachedAt when restarting a goal-reached timer', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);
    const goalTime = new Date(2026, 2, 24, 9, 0, 0).toISOString();

    // Pre-create a goal-reached progress row
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 3600,
      goalReachedAt: goalTime,
    });

    await startTimer(bucket.id, testDb, now);

    const rows = await testDb.select().from(timerDailyProgress);
    // goalReachedAt should be preserved — only resetProgress clears it
    expect(rows[0]!.goalReachedAt).toBe(goalTime);
    expect(rows[0]!.startedAt).toBe(now.toISOString());
  });
});

// ---------------------------------------------------------------------------
// stopTimer
// ---------------------------------------------------------------------------

describe('stopTimer', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('accumulates elapsed correctly', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, t1);

    // Stop 10 minutes later
    const t2 = new Date(2026, 2, 24, 10, 10, 0);
    const result = await stopTimer(bucket.id, testDb, t2);

    expect(result.changed).toBe(true);
    expect(result.elapsedSeconds).toBe(600); // 10 minutes
    expect(result.goalReachedAt).toBeNull();
  });

  it('returns changed: false when timer is not running', async () => {
    const bucket = await seedBucket(testDb);

    const result = await stopTimer(bucket.id, testDb, new Date(2026, 2, 24, 10, 0, 0));
    expect(result.changed).toBe(false);
  });

  it('returns changed: false for a paused timer with progress', async () => {
    const bucket = await seedBucket(testDb);

    // Insert a progress row that is not running (startedAt is null)
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 300,
    });

    const result = await stopTimer(bucket.id, testDb, new Date(2026, 2, 24, 10, 0, 0));
    expect(result.changed).toBe(false);
  });

  it('sets goalReachedAt when stopping an overdue timer', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 1 }); // 60 seconds
    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, t1);

    // Stop 2 minutes later (well past 60-second total)
    const t2 = new Date(2026, 2, 24, 10, 2, 0);
    const result = await stopTimer(bucket.id, testDb, t2);

    expect(result.changed).toBe(true);
    // Elapsed is NOT capped — tracks actual usage
    expect(result.elapsedSeconds).toBe(120);
    expect(result.goalReachedAt).toBe(t2.toISOString());

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.goalReachedAt).toBe(t2.toISOString());
  });

  it('accumulates across start/stop cycles', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });

    // First cycle: run for 5 minutes
    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, t1);
    const t2 = new Date(2026, 2, 24, 10, 5, 0);
    await stopTimer(bucket.id, testDb, t2);

    // Second cycle: run for 3 minutes
    const t3 = new Date(2026, 2, 24, 10, 10, 0);
    await startTimer(bucket.id, testDb, t3);
    const t4 = new Date(2026, 2, 24, 10, 13, 0);
    const result = await stopTimer(bucket.id, testDb, t4);

    expect(result.elapsedSeconds).toBe(480); // 5 min + 3 min = 480 seconds
  });

  it('allows elapsed to exceed totalMinutes without capping', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 1 }); // 60 seconds
    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, t1);

    // Stop 5 minutes later (300s >> 60s total)
    const t2 = new Date(2026, 2, 24, 10, 5, 0);
    const result = await stopTimer(bucket.id, testDb, t2);

    expect(result.elapsedSeconds).toBe(300); // not capped at 60
  });
});

// ---------------------------------------------------------------------------
// markGoalReached
// ---------------------------------------------------------------------------

describe('markGoalReached', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('sets goalReachedAt without clearing startedAt', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 1 });
    const startTime = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, startTime);

    const goalTime = new Date(2026, 2, 24, 10, 1, 0);
    const result = await markGoalReached(bucket.id, testDb, goalTime);

    expect(result.goalReachedAt).toBe(goalTime.toISOString());

    // Timer should still be running
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).toBe(startTime.toISOString());
    expect(rows[0]!.goalReachedAt).toBe(goalTime.toISOString());
  });
});

// ---------------------------------------------------------------------------
// resetProgress
// ---------------------------------------------------------------------------

describe('resetProgress', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('zeros out elapsed and clears goalReachedAt', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);

    // Create a goal-reached progress row
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 3600,
      goalReachedAt: now.toISOString(),
    });

    await resetProgress(bucket.id, testDb, now);

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.elapsedSeconds).toBe(0);
    expect(rows[0]!.startedAt).toBeNull();
    expect(rows[0]!.goalReachedAt).toBeNull();
  });

  it('clears a running timer', async () => {
    const bucket = await seedBucket(testDb);
    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, t1);

    const t2 = new Date(2026, 2, 24, 10, 5, 0);
    await resetProgress(bucket.id, testDb, t2);

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.elapsedSeconds).toBe(0);
    expect(rows[0]!.startedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setElapsedTime
// ---------------------------------------------------------------------------

describe('setElapsedTime', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('sets elapsed seconds directly', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 }); // 3600s total
    const now = new Date(2026, 2, 24, 10, 0, 0);

    const result = await setElapsedTime(bucket.id, 1800, testDb, now);

    expect(result.elapsedSeconds).toBe(1800);
    // goalReachedAt is always cleared when manually setting time
    expect(result.goalReachedAt).toBeNull();

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.elapsedSeconds).toBe(1800);
  });

  it('does NOT set goalReachedAt when elapsed equals total (clears it)', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const now = new Date(2026, 2, 24, 10, 0, 0);

    const result = await setElapsedTime(bucket.id, 3600, testDb, now);

    expect(result.elapsedSeconds).toBe(3600);
    // Manually setting time always clears goalReachedAt
    expect(result.goalReachedAt).toBeNull();
  });

  it('creates a progress row if none exists', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const now = new Date(2026, 2, 24, 10, 0, 0);

    await setElapsedTime(bucket.id, 1200, testDb, now);

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.elapsedSeconds).toBe(1200);
  });

  it('updates existing progress row', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const now = new Date(2026, 2, 24, 10, 0, 0);

    // Pre-create a progress row
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 100,
    });

    await setElapsedTime(bucket.id, 1800, testDb, now);

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1); // no duplicate
    expect(rows[0]!.elapsedSeconds).toBe(1800);
  });

  it('throws for nonexistent bucket', async () => {
    const now = new Date(2026, 2, 24, 10, 0, 0);
    await expect(
      setElapsedTime('nonexistent-id', 1000, testDb, now),
    ).rejects.toThrow('Bucket not found');
  });
});

// ---------------------------------------------------------------------------
// stopAllRunningTimers
// ---------------------------------------------------------------------------

describe('stopAllRunningTimers', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('stops all active timers for a given date and returns bucket IDs', async () => {
    const bucketA = await seedBucket(testDb, { name: 'A', sortOrder: 0 });
    const bucketB = await seedBucket(testDb, { name: 'B', sortOrder: 1 });

    const startedAt = new Date(2026, 2, 24, 10, 0, 0).toISOString();

    // Both running on the same date
    await testDb.insert(timerDailyProgress).values([
      {
        id: crypto.randomUUID(),
        bucketId: bucketA.id,
        date: '2026-03-24',
        elapsedSeconds: 100,
        startedAt,
      },
      {
        id: crypto.randomUUID(),
        bucketId: bucketB.id,
        date: '2026-03-24',
        elapsedSeconds: 200,
        startedAt,
      },
    ]);

    const now = new Date(2026, 2, 24, 10, 5, 0); // 5 minutes later
    const stoppedIds = await stopAllRunningTimers('2026-03-24', testDb, now);

    expect(stoppedIds).toHaveLength(2);
    expect(stoppedIds).toContain(bucketA.id);
    expect(stoppedIds).toContain(bucketB.id);

    // Verify all are stopped and elapsed accumulated
    const rows = await testDb.select().from(timerDailyProgress);
    for (const row of rows) {
      expect(row.startedAt).toBeNull();
      expect(row.elapsedSeconds).toBeGreaterThan(0);
    }

    const rowA = rows.find((r) => r.bucketId === bucketA.id)!;
    expect(rowA.elapsedSeconds).toBe(400); // 100 + 300 (5 min)

    const rowB = rows.find((r) => r.bucketId === bucketB.id)!;
    expect(rowB.elapsedSeconds).toBe(500); // 200 + 300 (5 min)
  });

  it('returns empty array when no timers are running', async () => {
    const stoppedIds = await stopAllRunningTimers('2026-03-24', testDb);
    expect(stoppedIds).toEqual([]);
  });

  it('only stops timers for the specified date', async () => {
    const bucket = await seedBucket(testDb);
    const startedAt = new Date(2026, 2, 24, 10, 0, 0).toISOString();

    // Running timer on March 24
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 0,
      startedAt,
    });

    // Stop timers for March 23 — should not affect March 24
    const stoppedIds = await stopAllRunningTimers('2026-03-23', testDb);
    expect(stoppedIds).toEqual([]);

    // March 24 timer should still be running
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).toBe(startedAt);
  });
});

// ---------------------------------------------------------------------------
// dismissBucket
// ---------------------------------------------------------------------------

describe('dismissBucket', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTimerTestDb();
  });

  it('creates a progress row with dismissedAt when none exists', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);

    const result = await dismissBucket(bucket.id, testDb, now);

    expect(result.dismissedAt).toBe(now.toISOString());
    expect(result.wasStopped).toBe(false);

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dismissedAt).toBe(now.toISOString());
    expect(rows[0]!.elapsedSeconds).toBe(0);
    expect(rows[0]!.startedAt).toBeNull();
  });

  it('sets dismissedAt on an existing non-running progress row', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);

    // Pre-create a progress row with some elapsed time
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 300,
      startedAt: null,
    });

    const result = await dismissBucket(bucket.id, testDb, now);

    expect(result.wasStopped).toBe(false);
    expect(result.dismissedAt).toBe(now.toISOString());

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dismissedAt).toBe(now.toISOString());
    // Elapsed should be preserved
    expect(rows[0]!.elapsedSeconds).toBe(300);
  });

  it('stops a running timer and sets dismissedAt', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const t1 = new Date(2026, 2, 24, 10, 0, 0);
    await startTimer(bucket.id, testDb, t1);

    // Dismiss 5 minutes later — timer should be stopped with elapsed accumulated
    const t2 = new Date(2026, 2, 24, 10, 5, 0);
    const result = await dismissBucket(bucket.id, testDb, t2);

    expect(result.wasStopped).toBe(true);
    expect(result.dismissedAt).toBe(t2.toISOString());

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).toBeNull();
    expect(rows[0]!.elapsedSeconds).toBe(300); // 5 minutes accumulated
    expect(rows[0]!.dismissedAt).toBe(t2.toISOString());
  });

  it('getTodayState includes dismissedAt', async () => {
    const bucket = await seedBucket(testDb);
    const now = new Date(2026, 2, 24, 10, 0, 0);
    await dismissBucket(bucket.id, testDb, now);

    const state = await getTodayState(testDb, now);
    expect(state.buckets[0]!.dismissedAt).toBe(now.toISOString());
  });

  it('dismissed bucket does not affect the next day', async () => {
    const bucket = await seedBucket(testDb);
    const today = new Date(2026, 2, 24, 10, 0, 0);
    await dismissBucket(bucket.id, testDb, today);

    // Next day — no progress row exists for March 25, so dismissedAt is null
    const tomorrow = new Date(2026, 2, 25, 10, 0, 0);
    const state = await getTodayState(testDb, tomorrow);
    expect(state.buckets[0]!.dismissedAt).toBeNull();
  });
});
