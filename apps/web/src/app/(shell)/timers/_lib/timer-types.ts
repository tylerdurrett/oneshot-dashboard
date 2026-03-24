// Bucket Timer data types, constants, and utility functions.
// All pure logic — no React or DOM dependencies.

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A single time-tracking bucket. */
export interface TimeBucket {
  id: string;
  name: string;
  /** Total allocated time in minutes. */
  totalMinutes: number;
  /** Seconds elapsed today (resets daily at 3 AM). */
  elapsedSeconds: number;
  /** Index into BUCKET_COLORS (0-9). */
  colorIndex: number;
  /** Days of the week this bucket is active (0 = Sunday … 6 = Saturday). */
  daysOfWeek: number[];
}

/** Persisted state for the entire timer system. */
export interface TimerState {
  buckets: TimeBucket[];
  activeBucketId: string | null;
  /** ISO timestamp of last tick (for elapsed-time recovery on reload). */
  lastActiveTime: string | null;
  /** YYYY-MM-DD of the last daily reset (3 AM-adjusted). */
  lastResetDate: string;
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

// ---------------------------------------------------------------------------
// Default buckets
// ---------------------------------------------------------------------------

const MON_FRI = [1, 2, 3, 4, 5]; // Monday through Friday

export const DEFAULT_BUCKETS: TimeBucket[] = [
  {
    id: 'default-1',
    name: 'School Project',
    totalMinutes: 180,
    elapsedSeconds: 0,
    colorIndex: 0, // Blue
    daysOfWeek: MON_FRI,
  },
  {
    id: 'default-2',
    name: 'Business Project',
    totalMinutes: 180,
    elapsedSeconds: 0,
    colorIndex: 1, // Teal
    daysOfWeek: MON_FRI,
  },
  {
    id: 'default-3',
    name: 'Life Maintenance',
    totalMinutes: 60,
    elapsedSeconds: 0,
    colorIndex: 2, // Orange
    daysOfWeek: MON_FRI,
  },
  {
    id: 'default-4',
    name: 'Exercise',
    totalMinutes: 60,
    elapsedSeconds: 0,
    colorIndex: 3, // Pink
    daysOfWeek: MON_FRI,
  },
];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'time-buckets-state';

/** Custom event name used to trigger the "add bucket" flow from outside the
 *  timers page (e.g. from the app shell nav context menu). */
export const ADD_BUCKET_EVENT = 'add-bucket';

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
 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Return today's date as `YYYY-MM-DD`, treating times before 3 AM as the
 * previous calendar day. This lets the daily reset happen at 3 AM instead
 * of midnight.
 */
export function getResetDate(now: Date = new Date()): string {
  const adjusted = adjustForResetBoundary(now);
  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check whether a bucket is scheduled for today (3 AM-adjusted).
 * Uses the same 3 AM boundary as `getResetDate`.
 */
export function isBucketActiveToday(
  bucket: TimeBucket,
  now: Date = new Date(),
): boolean {
  const adjusted = adjustForResetBoundary(now);
  return bucket.daysOfWeek.includes(adjusted.getDay());
}

/**
 * Generate a unique ID for a new bucket.
 */
export function generateBucketId(): string {
  return crypto.randomUUID();
}
