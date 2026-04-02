import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db as defaultDb, timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from './thread.js';
import { daysFromSchedule, minutesForDay } from './timer-bucket.js';

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
  weeklySchedule: Record<string, number> | null;
  sortOrder: number;
  elapsedSeconds: number;
  startedAt: string | null;
  goalReachedAt: string | null;
  dismissedAt: string | null;
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

/** Adjust a date for the 3AM day boundary: before RESET_HOUR counts as previous day. */
function getAdjustedDate(now: Date): Date {
  const adjusted = new Date(now);
  if (adjusted.getHours() < RESET_HOUR) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return adjusted;
}

/**
 * Return today's date as `YYYY-MM-DD`, treating times before 3 AM as the
 * previous calendar day. Replicates the client-side logic so the server
 * is the source of truth for date boundaries.
 */
export function getResetDate(now: Date = new Date()): string {
  const adjusted = getAdjustedDate(now);
  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Get the effective day-of-week (0=Sunday) for schedule lookup, respecting the 3AM boundary. */
export function getResetDayOfWeek(now: Date = new Date()): number {
  return getAdjustedDate(now).getDay();
}

/**
 * Resolve the target minutes for a bucket on a given day.
 * Priority: daily override → weeklySchedule → totalMinutes fallback.
 */
export function resolveTargetMinutes(
  override: number | null | undefined,
  schedule: Record<string, number> | null | undefined,
  totalMinutes: number,
  dayOfWeek: number,
): number {
  if (override != null) return override;
  return minutesForDay(schedule ?? null, dayOfWeek, totalMinutes);
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
  const dayOfWeek = getResetDayOfWeek(now);

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
    // Exclude deactivated buckets from the timer dashboard
    .where(isNull(timerBuckets.deactivatedAt))
    .orderBy(asc(timerBuckets.sortOrder));

  const buckets: TodayBucketState[] = [];

  for (const row of rows) {
    const bucket = row.timer_buckets;
    const progress = row.timer_daily_progress;
    const schedule = bucket.weeklySchedule
      ? (JSON.parse(bucket.weeklySchedule) as Record<string, number>)
      : null;

    buckets.push({
      id: bucket.id,
      name: bucket.name,
      totalMinutes: resolveTargetMinutes(
        progress?.targetMinutesOverride,
        schedule,
        bucket.totalMinutes,
        dayOfWeek,
      ),
      colorIndex: bucket.colorIndex,
      daysOfWeek: schedule
        ? daysFromSchedule(schedule)
        : (JSON.parse(bucket.daysOfWeek) as number[]),
      weeklySchedule: schedule,
      sortOrder: bucket.sortOrder,
      elapsedSeconds: progress?.elapsedSeconds ?? 0,
      startedAt: progress?.startedAt ?? null,
      goalReachedAt: progress?.goalReachedAt ?? null,
      dismissedAt: progress?.dismissedAt ?? null,
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

  const dayOfWeek = getResetDayOfWeek(now);

  const rows = await database
    .select({
      id: timerDailyProgress.id,
      elapsedSeconds: timerDailyProgress.elapsedSeconds,
      startedAt: timerDailyProgress.startedAt,
      goalReachedAt: timerDailyProgress.goalReachedAt,
      totalMinutes: timerBuckets.totalMinutes,
      weeklySchedule: timerBuckets.weeklySchedule,
      targetMinutesOverride: timerDailyProgress.targetMinutesOverride,
    })
    .from(timerDailyProgress)
    .innerJoin(timerBuckets, eq(timerDailyProgress.bucketId, timerBuckets.id))
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
  const schedule = row.weeklySchedule ? (JSON.parse(row.weeklySchedule) as Record<string, number>) : null;
  const totalSeconds = resolveTargetMinutes(
    row.targetMinutesOverride,
    schedule,
    row.totalMinutes,
    dayOfWeek,
  ) * 60;
  // If the background scheduler missed the goal-reached moment, stopping an
  // overdue timer still needs to persist completion so Remaining can hide it.
  const goalReachedAt =
    row.goalReachedAt ?? (elapsedSeconds >= totalSeconds ? now.toISOString() : null);

  await database
    .update(timerDailyProgress)
    .set({
      elapsedSeconds,
      startedAt: null,
      goalReachedAt,
    })
    .where(eq(timerDailyProgress.id, row.id));

  return { changed: true, elapsedSeconds, goalReachedAt };
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
 * Set elapsed time for a bucket directly. Clears goalReachedAt since the user
 * is manually adjusting time.
 */
export async function setElapsedTime(
  bucketId: string,
  elapsedSeconds: number,
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

  const clamped = Math.max(0, elapsedSeconds);
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
      .set({ elapsedSeconds: clamped, goalReachedAt })
      .where(eq(timerDailyProgress.id, existing[0]!.id));
  } else {
    await database.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId,
      date,
      elapsedSeconds: clamped,
      startedAt: null,
      goalReachedAt,
    });
  }

  return { elapsedSeconds: clamped, goalReachedAt };
}

/**
 * Override the target goal for a bucket for just today. Clears goalReachedAt
 * so the scheduler can re-evaluate based on the new target.
 */
export async function setDailyGoal(
  bucketId: string,
  targetMinutes: number,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<{ targetMinutes: number; goalReachedAt: string | null }> {
  const date = getResetDate(now);

  const bucketRows = await database
    .select()
    .from(timerBuckets)
    .where(eq(timerBuckets.id, bucketId));

  if (bucketRows.length === 0) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }

  const clamped = Math.max(1, targetMinutes);
  // Changing the goal clears goal state so the scheduler can
  // re-notify if the timer crosses the new goal while running.
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
      .set({ targetMinutesOverride: clamped, goalReachedAt })
      .where(eq(timerDailyProgress.id, existing[0]!.id));
  } else {
    await database.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId,
      date,
      elapsedSeconds: 0,
      startedAt: null,
      goalReachedAt,
      targetMinutesOverride: clamped,
    });
  }

  return { targetMinutes: clamped, goalReachedAt };
}

/**
 * Compute the absolute timestamp (ms) when a running timer will reach its goal.
 * Returns null if the bucket doesn't exist, there's no progress row, the timer
 * is not running, or the goal has already been reached.
 *
 * Used by routes to schedule goal-reached jobs after starting a timer or
 * adjusting elapsed time.
 */
export async function computeGoalMs(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<number | null> {
  const date = getResetDate(now);

  const dayOfWeek = getResetDayOfWeek(now);

  const rows = await database
    .select({
      totalMinutes: timerBuckets.totalMinutes,
      weeklySchedule: timerBuckets.weeklySchedule,
      targetMinutesOverride: timerDailyProgress.targetMinutesOverride,
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

  const schedule = rows[0]!.weeklySchedule ? (JSON.parse(rows[0]!.weeklySchedule) as Record<string, number>) : null;
  const totalSeconds = resolveTargetMinutes(
    rows[0]!.targetMinutesOverride,
    schedule,
    rows[0]!.totalMinutes,
    dayOfWeek,
  ) * 60;
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

/** Result of dismissBucket(). */
export interface DismissBucketResult {
  dismissedAt: string;
  /** True if the bucket had a running timer that was stopped. */
  wasStopped: boolean;
}

/**
 * Dismiss a bucket for today — sets the goal to zero and hides it from the
 * Remaining view until the next 3 AM reset. If the timer is running, stops
 * it without accumulating the active session's time (previously tracked
 * elapsed time is preserved). The bucket reappears automatically the next
 * day because no progress row exists for the new date.
 */
export async function dismissBucket(
  bucketId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<DismissBucketResult> {
  const date = getResetDate(now);
  const dismissedAt = now.toISOString();
  let wasStopped = false;

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
    const row = existing[0]!;

    // If the timer is running, stop it but do NOT accumulate the active
    // session's time — dismiss means "skip this today", not "log the time".
    if (row.startedAt) {
      wasStopped = true;
    }

    await database
      .update(timerDailyProgress)
      .set({ startedAt: null, dismissedAt, targetMinutesOverride: 0 })
      .where(eq(timerDailyProgress.id, row.id));
  } else {
    await database.insert(timerDailyProgress).values({
      id: crypto.randomUUID(),
      bucketId,
      date,
      elapsedSeconds: 0,
      startedAt: null,
      dismissedAt,
      targetMinutesOverride: 0,
    });
  }

  return { dismissedAt, wasStopped };
}
