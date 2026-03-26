import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timerDailyProgress } from '@repo/db';
import type { Database } from '../services/thread.js';
import { startTimer } from '../services/timer-progress.js';
import { TimerScheduler } from '../services/timer-scheduler.js';
import { createTimerTestDb, seedBucket } from './timer-test-helpers.js';

// ---------------------------------------------------------------------------
// init() — startup recovery
// ---------------------------------------------------------------------------

describe('TimerScheduler — init()', () => {
  let testDb: Database;
  let goalReachedBuckets: string[];
  let resetCount: number;
  let scheduler: TimerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    testDb = createTimerTestDb();
    goalReachedBuckets = [];
    resetCount = 0;
    scheduler = new TimerScheduler({
      database: testDb,
      onGoalReached: (id) => goalReachedBuckets.push(id),
      onDailyReset: () => resetCount++,
    });
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  it('recovers stale timers from previous dates', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });

    // Insert a running timer from yesterday's date
    const yesterdayStartedAt = new Date(2026, 2, 23, 22, 0, 0).toISOString();
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-23', // yesterday
      elapsedSeconds: 100,
      startedAt: yesterdayStartedAt,
    });

    // Init at 10 AM today — the stale timer should be stopped
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await scheduler.init(now);

    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startedAt).toBeNull();
    // Elapsed should include the time since it started (12 hours = 43200s) + original 100s
    expect(rows[0]!.elapsedSeconds).toBe(100 + 43200);
  });

  it('schedules goal-reached for currently running timers', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 10 }); // 600s total

    // Start a timer that's been running for 5 minutes (300s elapsed of 600s total)
    const startedAt = new Date(2026, 2, 24, 9, 55, 0).toISOString();
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 0,
      startedAt,
    });

    const now = new Date(2026, 2, 24, 10, 0, 0); // 5 min after start
    vi.setSystemTime(now);
    await scheduler.init(now);

    // Goal not yet reached (300s remaining)
    expect(goalReachedBuckets).toHaveLength(0);

    // Advance time by 5 minutes (300s) — goal should be reached
    await vi.advanceTimersByTimeAsync(300_000);

    expect(goalReachedBuckets).toHaveLength(1);
    expect(goalReachedBuckets[0]).toBe(bucket.id);

    // Timer should STILL be running (goal reached, not stopped)
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).not.toBeNull();
    expect(rows[0]!.goalReachedAt).not.toBeNull();
  });

  it('marks goal reached for overdue timers and fires callback (timer keeps running)', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 1 }); // 60s total

    // Timer started 10 minutes ago — way past its 60s total
    const startedAt = new Date(2026, 2, 24, 9, 50, 0).toISOString();
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: bucket.id,
      date: '2026-03-24',
      elapsedSeconds: 0,
      startedAt,
    });

    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await scheduler.init(now);

    // Callback should fire immediately during init
    expect(goalReachedBuckets).toHaveLength(1);
    expect(goalReachedBuckets[0]).toBe(bucket.id);

    // Timer should STILL be running (not stopped)
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).not.toBeNull();
    expect(rows[0]!.goalReachedAt).not.toBeNull();
  });

  it('handles mix of stale and current running timers', async () => {
    const stale = await seedBucket(testDb, { name: 'Stale', totalMinutes: 60, sortOrder: 0 });
    const current = await seedBucket(testDb, { name: 'Current', totalMinutes: 60, sortOrder: 1 });

    // Stale timer from yesterday
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: stale.id,
      date: '2026-03-23',
      elapsedSeconds: 0,
      startedAt: new Date(2026, 2, 23, 22, 0, 0).toISOString(),
    });

    // Current timer from today
    await testDb.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId: current.id,
      date: '2026-03-24',
      elapsedSeconds: 0,
      startedAt: new Date(2026, 2, 24, 9, 50, 0).toISOString(),
    });

    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await scheduler.init(now);

    // Stale timer should be stopped (accumulated elapsed), no callback
    const rows = await testDb.select().from(timerDailyProgress);
    const staleRow = rows.find((r) => r.bucketId === stale.id)!;
    expect(staleRow.startedAt).toBeNull();
    expect(staleRow.elapsedSeconds).toBeGreaterThan(0);

    // Current timer should still be running (10 min of 60 min elapsed)
    const currentRow = rows.find((r) => r.bucketId === current.id)!;
    expect(currentRow.startedAt).not.toBeNull();
    expect(goalReachedBuckets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// scheduleGoalReached / cancelGoalJob
// ---------------------------------------------------------------------------

describe('TimerScheduler — scheduleGoalReached', () => {
  let testDb: Database;
  let goalReachedBuckets: string[];
  let scheduler: TimerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    testDb = createTimerTestDb();
    goalReachedBuckets = [];
    scheduler = new TimerScheduler({
      database: testDb,
      onGoalReached: (id) => goalReachedBuckets.push(id),
      onDailyReset: () => {},
    });
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  it('fires callback at the correct time and keeps timer running', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 10 });
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);

    // Start the timer so markGoalReached has a progress row to update
    await startTimer(bucket.id, testDb, now);

    // Schedule goal at 5 minutes from now
    const goalAt = now.getTime() + 300_000;
    scheduler.scheduleGoalReached(bucket.id, goalAt, now);

    // Not yet fired
    expect(goalReachedBuckets).toHaveLength(0);

    // Advance 4 minutes — still not fired
    await vi.advanceTimersByTimeAsync(240_000);
    expect(goalReachedBuckets).toHaveLength(0);

    // Advance 1 more minute — should fire
    await vi.advanceTimersByTimeAsync(60_000);
    expect(goalReachedBuckets).toHaveLength(1);
    expect(goalReachedBuckets[0]).toBe(bucket.id);

    // Timer should still be running (not stopped)
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).not.toBeNull();
    expect(rows[0]!.goalReachedAt).not.toBeNull();
  });

  it('cancels previous job when scheduling same bucket', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await startTimer(bucket.id, testDb, now);

    // Schedule goal at +5 min
    scheduler.scheduleGoalReached(bucket.id, now.getTime() + 300_000, now);

    // Reschedule at +10 min — should cancel the first
    scheduler.scheduleGoalReached(bucket.id, now.getTime() + 600_000, now);

    // Advance past the first scheduled time — should NOT fire
    await vi.advanceTimersByTimeAsync(300_000);
    expect(goalReachedBuckets).toHaveLength(0);

    // Advance to the new scheduled time — should fire
    await vi.advanceTimersByTimeAsync(300_000);
    expect(goalReachedBuckets).toHaveLength(1);
  });

  it('fires immediately when goalAtMs is in the past', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 1 });
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await startTimer(bucket.id, testDb, now);

    // Schedule with a time in the past
    scheduler.scheduleGoalReached(bucket.id, now.getTime() - 1000, now);

    // Should fire on next tick (setTimeout(fn, 0))
    await vi.advanceTimersByTimeAsync(0);
    expect(goalReachedBuckets).toHaveLength(1);
  });
});

describe('TimerScheduler — cancelGoalJob', () => {
  let testDb: Database;
  let goalReachedBuckets: string[];
  let scheduler: TimerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    testDb = createTimerTestDb();
    goalReachedBuckets = [];
    scheduler = new TimerScheduler({
      database: testDb,
      onGoalReached: (id) => goalReachedBuckets.push(id),
      onDailyReset: () => {},
    });
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  it('prevents callback from firing', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 10 });
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await startTimer(bucket.id, testDb, now);

    scheduler.scheduleGoalReached(bucket.id, now.getTime() + 300_000, now);
    scheduler.cancelGoalJob(bucket.id);

    // Advance past the scheduled time — callback should not fire
    await vi.advanceTimersByTimeAsync(600_000);
    expect(goalReachedBuckets).toHaveLength(0);
  });

  it('is a no-op for a bucket with no scheduled job', () => {
    // Should not throw
    scheduler.cancelGoalJob('nonexistent-id');
  });
});

// ---------------------------------------------------------------------------
// scheduleNextReset
// ---------------------------------------------------------------------------

describe('TimerScheduler — scheduleNextReset', () => {
  let testDb: Database;
  let resetCount: number;
  let scheduler: TimerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    testDb = createTimerTestDb();
    resetCount = 0;
    scheduler = new TimerScheduler({
      database: testDb,
      onGoalReached: () => {},
      onDailyReset: () => resetCount++,
    });
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  it('fires at the next 3AM', async () => {
    // Current time: 10 PM on March 24
    const now = new Date(2026, 2, 24, 22, 0, 0);
    vi.setSystemTime(now);
    scheduler.scheduleNextReset(now);

    // Should fire in 5 hours (10 PM → 3 AM = 5 hours)
    expect(resetCount).toBe(0);

    // Advance 4 hours — not yet
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(resetCount).toBe(0);

    // Advance 1 more hour — should fire
    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);
    expect(resetCount).toBe(1);
  });

  it('schedules for tomorrow when already past 3AM today', async () => {
    // Current time: 10 AM on March 24
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    scheduler.scheduleNextReset(now);

    // Should fire in 17 hours (10 AM → 3 AM next day = 17 hours)
    await vi.advanceTimersByTimeAsync(16 * 60 * 60 * 1000);
    expect(resetCount).toBe(0);

    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);
    expect(resetCount).toBe(1);
  });

  it('stops running timers for the ending date', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 180 });

    // Start a timer at 10 PM on March 24
    const startTime = new Date(2026, 2, 24, 22, 0, 0);
    vi.setSystemTime(startTime);
    await startTimer(bucket.id, testDb, startTime);

    scheduler.scheduleNextReset(startTime);

    // Advance to 3 AM — the reset fires
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    expect(resetCount).toBe(1);

    // Timer should be stopped with elapsed accumulated
    const rows = await testDb.select().from(timerDailyProgress);
    expect(rows[0]!.startedAt).toBeNull();
    expect(rows[0]!.elapsedSeconds).toBeGreaterThan(0);
  });

  it('reschedules itself after firing', async () => {
    const now = new Date(2026, 2, 24, 22, 0, 0);
    vi.setSystemTime(now);
    scheduler.scheduleNextReset(now);

    // Advance to first 3AM (5 hours)
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    expect(resetCount).toBe(1);

    // Advance 24 more hours to the next 3AM
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(resetCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------

describe('TimerScheduler — destroy', () => {
  let testDb: Database;
  let goalReachedBuckets: string[];
  let resetCount: number;
  let scheduler: TimerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    testDb = createTimerTestDb();
    goalReachedBuckets = [];
    resetCount = 0;
    scheduler = new TimerScheduler({
      database: testDb,
      onGoalReached: (id) => goalReachedBuckets.push(id),
      onDailyReset: () => resetCount++,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleans up all timeouts so no callbacks fire', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 10 });
    const now = new Date(2026, 2, 24, 10, 0, 0);
    vi.setSystemTime(now);
    await startTimer(bucket.id, testDb, now);

    // Schedule a goal job and a reset job
    scheduler.scheduleGoalReached(bucket.id, now.getTime() + 300_000, now);
    scheduler.scheduleNextReset(now);

    // Destroy everything
    scheduler.destroy();

    // Advance well past both scheduled times
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // Neither callback should have fired
    expect(goalReachedBuckets).toHaveLength(0);
    expect(resetCount).toBe(0);
  });

  it('is safe to call multiple times', () => {
    scheduler.destroy();
    scheduler.destroy(); // should not throw
  });
});
