// Bucket Timer data types, constants, and utility functions.
// All pure logic — no React or DOM dependencies.

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A single time-tracking bucket. */
export interface TimeBucket {
  id: string;
  name: string;
  /** Total allocated time in minutes (the daily goal/budget). With weeklySchedule, this is the resolved goal for today. */
  totalMinutes: number;
  /** Seconds elapsed today (resets daily at 3 AM). Can exceed totalMinutes * 60. */
  elapsedSeconds: number;
  /** Index into BUCKET_COLORS (0-9). */
  colorIndex: number;
  /** Days of the week this bucket is active (0 = Sunday … 6 = Saturday). */
  daysOfWeek: number[];
  /** Per-day schedule mapping day-of-week ("0"-"6") to target minutes. Null for legacy buckets. */
  weeklySchedule: Record<string, number> | null;
  /** ISO timestamp if timer is currently running, null if paused/stopped. */
  startedAt: string | null;
  /** ISO timestamp when elapsed first reached totalMinutes goal, null if not yet reached. */
  goalReachedAt: string | null;
  /** ISO timestamp when the user dismissed this bucket for today, null if not dismissed. */
  dismissedAt: string | null;
  /** Timestamp when bucket was deactivated (removed from schedules), null if active. */
  deactivatedAt: number | null;
}

// ---------------------------------------------------------------------------
// Color system
// ---------------------------------------------------------------------------

export interface BucketColor {
  vibrant: string;
  muted: string;
}

/** 10 color slots referenced by CSS custom properties. */
export const BUCKET_COLORS: BucketColor[] = [
  { vibrant: 'var(--bucket-1)', muted: 'var(--bucket-1-muted)' },
  { vibrant: 'var(--bucket-2)', muted: 'var(--bucket-2-muted)' },
  { vibrant: 'var(--bucket-3)', muted: 'var(--bucket-3-muted)' },
  { vibrant: 'var(--bucket-4)', muted: 'var(--bucket-4-muted)' },
  { vibrant: 'var(--bucket-5)', muted: 'var(--bucket-5-muted)' },
  { vibrant: 'var(--bucket-6)', muted: 'var(--bucket-6-muted)' },
  { vibrant: 'var(--bucket-7)', muted: 'var(--bucket-7-muted)' },
  { vibrant: 'var(--bucket-8)', muted: 'var(--bucket-8-muted)' },
  { vibrant: 'var(--bucket-9)', muted: 'var(--bucket-9-muted)' },
  { vibrant: 'var(--bucket-10)', muted: 'var(--bucket-10-muted)' },
];

/** Custom event name used to trigger the "add bucket" flow from outside the
 *  timers page (e.g. from the app shell nav context menu). */
export const ADD_BUCKET_EVENT = 'add-bucket';

/** Padding around the outer edge of the treemap grid (px). */
export const GRID_PADDING = 6;

/** Gap between adjacent treemap buckets (px). */
export const GRID_GAP = 4;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Hour at which the daily reset boundary occurs. Times before this
 *  hour are treated as belonging to the previous calendar day. */
const RESET_HOUR = 3;

/** Apply the 3 AM day-boundary adjustment: if `now` is before RESET_HOUR,
 *  return a Date shifted back one calendar day. */
function adjustForResetBoundary(now: Date): Date {
  const adjusted = new Date(now);
  if (adjusted.getHours() < RESET_HOUR) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return adjusted;
}

/**
 * Format a duration in seconds as a human-readable time string.
 * Returns `H:MM:SS` when >= 1 hour, otherwise `M:SS`.
 * Supports negative values (prefixed with `-`) for over-budget display.
 */
export function formatTime(seconds: number): string {
  const negative = seconds < 0;
  const abs = Math.abs(Math.floor(seconds));
  const hrs = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const prefix = negative ? '-' : '';

  if (hrs > 0) {
    return `${prefix}${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${prefix}${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Check whether a bucket is scheduled for today (3 AM-adjusted).
 */
export function isBucketActiveToday(
  bucket: TimeBucket,
  now: Date = new Date(),
): boolean {
  const adjusted = adjustForResetBoundary(now);
  return bucket.daysOfWeek.includes(adjusted.getDay());
}

/**
 * Format a duration in seconds as a human-readable label with units.
 * Returns decimal hours (max 2 decimals) when >= 1 hour, whole minutes otherwise.
 * Examples: "35 minutes", "1.25 hours", "8 hours", "0 minutes"
 */
export function formatDurationLabel(seconds: number): string {
  if (seconds >= 3600) {
    const hours = parseFloat((seconds / 3600).toFixed(2));
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Aggregate elapsed and total-day seconds across all qualifying buckets for today.
 * Includes buckets active today that are NOT dismissed — completed/past-goal
 * buckets still count toward the daily total.
 *
 * totalDaySeconds uses max(elapsed, goal) per bucket so that overage in one
 * bucket inflates the denominator, preventing it from compensating for
 * unfilled buckets.
 */
export function getTotalTimeStats(
  allBuckets: TimeBucket[],
  now?: Date,
): { elapsedSeconds: number; totalDaySeconds: number } {
  const effectiveNow = now ?? new Date();
  let elapsedSeconds = 0;
  let totalDaySeconds = 0;
  for (const b of allBuckets) {
    if (!isBucketActiveToday(b, effectiveNow) || b.dismissedAt) continue;
    elapsedSeconds += b.elapsedSeconds;
    totalDaySeconds += Math.max(b.elapsedSeconds, b.totalMinutes * 60);
  }
  return { elapsedSeconds, totalDaySeconds };
}

/**
 * Generate a unique ID for a new bucket.
 */
export { generateId as generateBucketId } from '@/lib/generate-id';
