import { eq, isNotNull } from 'drizzle-orm';
import { timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from './thread.js';
import {
  RESET_HOUR,
  elapsedSince,
  getResetDate,
  markGoalReached,
  stopAllRunningTimers,
} from './timer-progress.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimerSchedulerOptions {
  database: Database;
  onGoalReached: (bucketId: string) => void;
  onDailyReset: () => void;
}

// ---------------------------------------------------------------------------
// TimerScheduler
// ---------------------------------------------------------------------------

/**
 * Manages background timer jobs: goal-reached detection via setTimeout,
 * daily reset, and startup recovery for stale timers.
 *
 * Uses in-process setTimeout — appropriate for a single-user SQLite app.
 * Server restart recovery is handled by `init()` scanning the database.
 */
export class TimerScheduler {
  private database: Database;
  private onGoalReached: (bucketId: string) => void;
  private onDailyReset: () => void;
  private destroyed = false;

  /** Maps bucketId → scheduled goal-reached timeout. */
  private goalJobs = new Map<string, NodeJS.Timeout>();

  /** The next daily reset timeout. */
  private resetJob: NodeJS.Timeout | null = null;

  constructor(opts: TimerSchedulerOptions) {
    this.database = opts.database;
    this.onGoalReached = opts.onGoalReached;
    this.onDailyReset = opts.onDailyReset;
  }

  /**
   * Initialize the scheduler on server startup.
   * 1. Recover stale timers from previous dates (server was down during reset)
   * 2. Handle today's running timers (mark goal if overdue, schedule remaining)
   * 3. Schedule the next daily reset
   */
  async init(now: Date = new Date()): Promise<void> {
    const todayDate = getResetDate(now);

    const running = await this.database
      .select({
        progressId: timerDailyProgress.id,
        bucketId: timerDailyProgress.bucketId,
        date: timerDailyProgress.date,
        elapsedSeconds: timerDailyProgress.elapsedSeconds,
        startedAt: timerDailyProgress.startedAt,
        goalReachedAt: timerDailyProgress.goalReachedAt,
        totalMinutes: timerBuckets.totalMinutes,
      })
      .from(timerDailyProgress)
      .innerJoin(timerBuckets, eq(timerDailyProgress.bucketId, timerBuckets.id))
      .where(isNotNull(timerDailyProgress.startedAt));

    for (const row of running) {
      const elapsed = elapsedSince(row.startedAt!, now);

      if (row.date !== todayDate) {
        // Stale timer from a previous date — the server was down during the
        // daily reset, so we retroactively stop it and persist the elapsed.
        await this.database
          .update(timerDailyProgress)
          .set({
            elapsedSeconds: row.elapsedSeconds + elapsed,
            startedAt: null,
          })
          .where(eq(timerDailyProgress.id, row.progressId));
      } else {
        const totalSeconds = row.totalMinutes * 60;
        const totalElapsed = row.elapsedSeconds + elapsed;

        if (totalElapsed >= totalSeconds && !row.goalReachedAt) {
          // Timer is past its goal but goal wasn't marked yet —
          // mark it now. Timer keeps running.
          await markGoalReached(row.bucketId, this.database, now);
          this.onGoalReached(row.bucketId);
        } else if (totalElapsed < totalSeconds) {
          // Timer hasn't reached goal yet — schedule notification
          const remainingSeconds = totalSeconds - totalElapsed;
          const goalAtMs = now.getTime() + remainingSeconds * 1000;
          this.scheduleGoalReached(row.bucketId, goalAtMs, now);
        }
        // If goal was already reached (row.goalReachedAt set), nothing to do
      }
    }

    this.scheduleNextReset(now);
  }

  /**
   * Schedule a goal-reached timeout for a bucket. Fires `onGoalReached`
   * when the timer's total duration is reached. The timer keeps running
   * after the goal is marked.
   *
   * Cancels any existing job for the same bucket first.
   */
  scheduleGoalReached(
    bucketId: string,
    goalAtMs: number,
    now: Date = new Date(),
  ): void {
    if (this.destroyed) return;
    this.cancelGoalJob(bucketId);

    const delay = Math.max(0, goalAtMs - now.getTime());

    const timeout = setTimeout(async () => {
      this.goalJobs.delete(bucketId);
      if (this.destroyed) return;
      try {
        // Mark goal reached but keep timer running
        await markGoalReached(bucketId, this.database);
        if (this.destroyed) return;
        this.onGoalReached(bucketId);
      } catch (err) {
        // Log but don't crash — unhandled rejections in setTimeout are fatal
        console.error(`Goal reached marking failed for bucket ${bucketId}:`, err);
      }
    }, delay);

    this.goalJobs.set(bucketId, timeout);
  }

  /** Cancel a scheduled goal-reached job for a bucket, if one exists. */
  cancelGoalJob(bucketId: string): void {
    const existing = this.goalJobs.get(bucketId);
    if (existing) {
      clearTimeout(existing);
      this.goalJobs.delete(bucketId);
    }
  }

  /**
   * Schedule the next daily reset. When fired:
   * 1. Stop all running timers for the ending day
   * 2. Fire `onDailyReset` callback
   * 3. Reschedule for the next day
   */
  scheduleNextReset(now: Date = new Date()): void {
    if (this.destroyed) return;

    if (this.resetJob) {
      clearTimeout(this.resetJob);
      this.resetJob = null;
    }

    const nextReset = new Date(now);
    nextReset.setHours(RESET_HOUR, 0, 0, 0);

    if (now.getTime() >= nextReset.getTime()) {
      nextReset.setDate(nextReset.getDate() + 1);
    }

    const delay = nextReset.getTime() - now.getTime();

    this.resetJob = setTimeout(async () => {
      this.resetJob = null;
      if (this.destroyed) return;
      try {
        // The date being reset is the one that just ended (1ms before the boundary)
        const endingDate = getResetDate(new Date(nextReset.getTime() - 1));
        await stopAllRunningTimers(endingDate, this.database, nextReset);
        if (this.destroyed) return;
        this.onDailyReset();
        this.scheduleNextReset(nextReset);
      } catch (err) {
        console.error('Daily reset failed:', err);
      }
    }, delay);
  }

  /** Clean up all scheduled timeouts. Called on server shutdown. */
  destroy(): void {
    this.destroyed = true;

    for (const timeout of this.goalJobs.values()) {
      clearTimeout(timeout);
    }
    this.goalJobs.clear();

    if (this.resetJob) {
      clearTimeout(this.resetJob);
      this.resetJob = null;
    }
  }
}
