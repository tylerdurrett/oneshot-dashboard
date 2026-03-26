import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db as defaultDb, timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from './thread.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A bucket merged with today's progress data. */
export interface TodayBucketState {
  id: string;
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  sortOrder: number;
  elapsedSeconds: number;
  startedAt: string | null;
  goalReachedAt: string | null;
}

/** Result of getTodayState(). */
export interface TodayStateResult {
  date: string;
  buckets: TodayBucketState[];
}

/** Result of startTimer(). */
export interface StartTimerResult {
  bucketId: string;
  startedAt: string;
  stoppedBucketId: string | null;
}

/** Result of stopTimer(). */
export interface StopTimerResult {
  changed: boolean;
  elapsedSeconds?: number;
  goalReachedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Hour at which the daily reset boundary occurs. */
export const RESET_HOUR = 3;

/** Compute whole seconds elapsed since an ISO timestamp. */
export function elapsedSince(startedAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
}

/**
 * Return today's date as `YYYY-MM-DD`, treating times before 3 AM as the
 * previous calendar day. Replicates the client-side logic so the server
 * is the source of truth for date boundaries.
 */
export function getResetDate(now: Date = new Date()): string {
  const adjusted = new Date(now);
  if (adjusted.getHours() < RESET_HOUR) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Get all buckets merged with today's progress. Returns raw state —
 * elapsed is NOT capped at totalMinutes, and running timers past their
 * goal are NOT auto-stopped.
 */
export async function getTodayState(
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<TodayStateResult> {
  const date = getResetDate(now);

  const rows = await database
    .select()
    .from(timerBuckets)
    .leftJoin(
      timerDailyProgress,
      and(
        eq(timerDailyProgress.bucketId, timerBuckets.id),
        eq(timerDailyProgress.date, date),
      ),
    )
    .orderBy(asc(timerBuckets.sortOrder));

  const buckets: TodayBucketState[] = [];

  for (const row of rows) {
    const bucket = row.timer_buckets;
    const progress = row.timer_daily_progress;

    buckets.push({
      id: bucket.id,
      name: bucket.name,
      totalMinutes: bucket.totalMinutes,
      colorIndex: bucket.colorIndex,
      daysOfWeek: JSON.parse(bucket.daysOfWeek) as number[],
      sortOrder: bucket.sortOrder,
      elapsedSeconds: progress?.elapsedSeconds ?? 0,
      startedAt: progress?.startedAt ?? null,
      goalReachedAt: progress?.goalReachedAt ?? null,
    });
  }

  return { date, buckets };
}

/**
 * Start a timer for a bucket. Enforces single-active: stops any currently
 * running timer for today before starting the new one.
 */
export async function startTimer(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<StartTimerResult> {
  const date = getResetDate(now);
  let stoppedBucketId: string | null = null;

  const running = await database
    .select()
    .from(timerDailyProgress)
    .where(
      and(
        eq(timerDailyProgress.date, date),
        isNotNull(timerDailyProgress.startedAt),
      ),
    );

  for (const row of running) {
    if (row.bucketId === bucketId) continue; // will be overwritten below
    await database
      .update(timerDailyProgress)
      .set({
        elapsedSeconds: row.elapsedSeconds + elapsedSince(row.startedAt!, now),
        startedAt: null,
      })
      .where(eq(timerDailyProgress.id, row.id));
    stoppedBucketId = row.bucketId;
  }

  const existing = await database
    .select()
    .from(timerDailyProgress)
    .where(
      and(
        eq(timerDailyProgress.bucketId, bucketId),
        eq(timerDailyProgress.date, date),
      ),
    );

  const startedAt = now.toISOString();

  if (existing.length > 0) {
    const row = existing[0]!;
    let elapsedSeconds = row.elapsedSeconds;
    if (row.startedAt) {
      elapsedSeconds += elapsedSince(row.startedAt, now);
    }
    // Preserve goalReachedAt — if the goal was already reached, don't clear it.
    // Only resetProgress() clears goalReachedAt.
    await database
      .update(timerDailyProgress)
      .set({ startedAt, elapsedSeconds })
      .where(eq(timerDailyProgress.id, row.id));
  } else {
    await database.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId,
      date,
      elapsedSeconds: 0,
      startedAt,
    });
  }

  return { bucketId, startedAt, stoppedBucketId };
}

/**
 * Stop a running timer. Accumulates elapsed time without capping.
 * Does NOT set goalReachedAt — that's the scheduler's job while running.
 */
export async function stopTimer(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<StopTimerResult> {
  const date = getResetDate(now);

  const rows = await database
    .select()
    .from(timerDailyProgress)
    .where(
      and(
        eq(timerDailyProgress.bucketId, bucketId),
        eq(timerDailyProgress.date, date),
      ),
    );

  if (rows.length === 0 || !rows[0]!.startedAt) {
    return { changed: false };
  }

  const row = rows[0]!;
  const elapsedSeconds = row.elapsedSeconds + elapsedSince(row.startedAt!, now);

  await database
    .update(timerDailyProgress)
    .set({
      elapsedSeconds,
      startedAt: null,
    })
    .where(eq(timerDailyProgress.id, row.id));

  return { changed: true, elapsedSeconds, goalReachedAt: row.goalReachedAt };
}

/**
 * Reset a bucket's progress for today — zero elapsed, clear startedAt and goalReachedAt.
 */
export async function resetProgress(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<void> {
  const date = getResetDate(now);

  await database
    .update(timerDailyProgress)
    .set({
      elapsedSeconds: 0,
      startedAt: null,
      goalReachedAt: null,
    })
    .where(
      and(
        eq(timerDailyProgress.bucketId, bucketId),
        eq(timerDailyProgress.date, date),
      ),
    );
}

/**
 * Set remaining time for a bucket. Computes elapsedSeconds from the bucket's
 * totalMinutes. Clears goalReachedAt since the user is manually adjusting time.
 */
export async function setRemainingTime(
  bucketId: string,
  remainingSeconds: number,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<{ elapsedSeconds: number; goalReachedAt: string | null }> {
  const date = getResetDate(now);

  const bucketRows = await database
    .select()
    .from(timerBuckets)
    .where(eq(timerBuckets.id, bucketId));

  if (bucketRows.length === 0) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }

  const totalSeconds = bucketRows[0]!.totalMinutes * 60;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  // Manually adjusting time clears goal state so the scheduler can
  // re-notify if the timer crosses the goal again while running.
  const goalReachedAt = null;

  const existing = await database
    .select()
    .from(timerDailyProgress)
    .where(
      and(
        eq(timerDailyProgress.bucketId, bucketId),
        eq(timerDailyProgress.date, date),
      ),
    );

  if (existing.length > 0) {
    await database
      .update(timerDailyProgress)
      .set({ elapsedSeconds, goalReachedAt })
      .where(eq(timerDailyProgress.id, existing[0]!.id));
  } else {
    await database.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId,
      date,
      elapsedSeconds,
      startedAt: null,
      goalReachedAt,
    });
  }

  return { elapsedSeconds, goalReachedAt };
}

/**
 * Compute the absolute timestamp (ms) when a running timer will reach its goal.
 * Returns null if the bucket doesn't exist, there's no progress row, the timer
 * is not running, or the goal has already been reached.
 *
 * Used by routes to schedule goal-reached jobs after starting a timer or
 * adjusting remaining time.
 */
export async function computeGoalMs(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<number | null> {
  const date = getResetDate(now);

  const rows = await database
    .select({
      totalMinutes: timerBuckets.totalMinutes,
      elapsedSeconds: timerDailyProgress.elapsedSeconds,
      startedAt: timerDailyProgress.startedAt,
      goalReachedAt: timerDailyProgress.goalReachedAt,
    })
    .from(timerDailyProgress)
    .innerJoin(timerBuckets, eq(timerDailyProgress.bucketId, timerBuckets.id))
    .where(
      and(
        eq(timerDailyProgress.bucketId, bucketId),
        eq(timerDailyProgress.date, date),
      ),
    );

  if (rows.length === 0 || !rows[0]!.startedAt) return null;
  if (rows[0]!.goalReachedAt) return null;

  const totalSeconds = rows[0]!.totalMinutes * 60;
  const remainingSeconds = totalSeconds - rows[0]!.elapsedSeconds;

  if (remainingSeconds <= 0) return null;

  return new Date(rows[0]!.startedAt).getTime() + remainingSeconds * 1000;
}

/**
 * Mark a timer's goal as reached without stopping it. Sets goalReachedAt
 * but preserves startedAt so the timer keeps running.
 *
 * Called by the scheduler when a running timer crosses its totalMinutes goal.
 */
export async function markGoalReached(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<{ goalReachedAt: string }> {
  const date = getResetDate(now);
  const goalReachedAt = now.toISOString();

  await database
    .update(timerDailyProgress)
    .set({ goalReachedAt })
    .where(
      and(
        eq(timerDailyProgress.bucketId, bucketId),
        eq(timerDailyProgress.date, date),
      ),
    );

  return { goalReachedAt };
}

/**
 * Stop all running timers for a given date. Accumulates elapsed for each.
 * Used by the 3AM reset job.
 */
export async function stopAllRunningTimers(
  date: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<string[]> {
  const running = await database
    .select()
    .from(timerDailyProgress)
    .where(
      and(
        eq(timerDailyProgress.date, date),
        isNotNull(timerDailyProgress.startedAt),
      ),
    );

  const stoppedBucketIds: string[] = [];

  for (const row of running) {
    await database
      .update(timerDailyProgress)
      .set({
        elapsedSeconds: row.elapsedSeconds + elapsedSince(row.startedAt!, now),
        startedAt: null,
      })
      .where(eq(timerDailyProgress.id, row.id));
    stoppedBucketIds.push(row.bucketId);
  }

  return stoppedBucketIds;
}
