import { eq, isNotNull } from 'drizzle-orm';
import { timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from './thread.js';
import {
  RESET_HOUR,
  elapsedSince,
  getResetDate,
  stopTimer,
  stopAllRunningTimers,
} from './timer-progress.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimerSchedulerOptions {
  database: Database;
  onTimerCompleted: (bucketId: string) => void;
  onDailyReset: () => void;
}

// ---------------------------------------------------------------------------
// TimerScheduler
// ---------------------------------------------------------------------------

/**
 * Manages background timer jobs: completion detection via setTimeout,
 * daily reset, and startup recovery for stale timers.
 *
 * Uses in-process setTimeout — appropriate for a single-user SQLite app.
 * Server restart recovery is handled by `init()` scanning the database.
 */
export class TimerScheduler {
  private database: Database;
  private onTimerCompleted: (bucketId: string) => void;
  private onDailyReset: () => void;
  private destroyed = false;

  /** Maps bucketId → scheduled completion timeout. */
  private completionJobs = new Map<string, NodeJS.Timeout>();

  /** The next daily reset timeout. */
  private resetJob: NodeJS.Timeout | null = null;

  constructor(opts: TimerSchedulerOptions) {
    this.database = opts.database;
    this.onTimerCompleted = opts.onTimerCompleted;
    this.onDailyReset = opts.onDailyReset;
  }

  /**
   * Initialize the scheduler on server startup.
   * 1. Recover stale timers from previous dates (server was down during reset)
   * 2. Handle today's running timers (auto-complete overdue, schedule remaining)
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

        if (totalElapsed >= totalSeconds) {
          await stopTimer(row.bucketId, this.database, now);
          this.onTimerCompleted(row.bucketId);
        } else {
          const remainingSeconds = totalSeconds - totalElapsed;
          const completesAtMs = now.getTime() + remainingSeconds * 1000;
          this.scheduleCompletion(row.bucketId, completesAtMs, now);
        }
      }
    }

    this.scheduleNextReset(now);
  }

  /**
   * Schedule a completion timeout for a bucket. Fires `onTimerCompleted`
   * when the timer's total duration is reached.
   *
   * Cancels any existing job for the same bucket first.
   */
  scheduleCompletion(
    bucketId: string,
    completesAtMs: number,
    now: Date = new Date(),
  ): void {
    if (this.destroyed) return;
    this.cancelCompletion(bucketId);

    const delay = Math.max(0, completesAtMs - now.getTime());

    const timeout = setTimeout(async () => {
      this.completionJobs.delete(bucketId);
      if (this.destroyed) return;
      try {
        await stopTimer(bucketId, this.database);
        if (this.destroyed) return;
        this.onTimerCompleted(bucketId);
      } catch (err) {
        // Log but don't crash — unhandled rejections in setTimeout are fatal
        console.error(`Timer completion failed for bucket ${bucketId}:`, err);
      }
    }, delay);

    this.completionJobs.set(bucketId, timeout);
  }

  /** Cancel a scheduled completion job for a bucket, if one exists. */
  cancelCompletion(bucketId: string): void {
    const existing = this.completionJobs.get(bucketId);
    if (existing) {
      clearTimeout(existing);
      this.completionJobs.delete(bucketId);
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

    for (const timeout of this.completionJobs.values()) {
      clearTimeout(timeout);
    }
    this.completionJobs.clear();

    if (this.resetJob) {
      clearTimeout(this.resetJob);
      this.resetJob = null;
    }
  }
}
