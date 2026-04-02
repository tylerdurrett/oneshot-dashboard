import { asc, eq, max } from 'drizzle-orm';
import { db as defaultDb, timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from './thread.js';

// ---------------------------------------------------------------------------
// WeeklySchedule helpers — pure functions, exported for tests + reuse
// ---------------------------------------------------------------------------

/** Map of day-of-week ("0"-"6", 0=Sunday) to target minutes. */
export type WeeklySchedule = Record<string, number>;

/** Derive a sorted active-days array from a schedule. */
export function daysFromSchedule(schedule: WeeklySchedule): number[] {
  return Object.keys(schedule).map(Number).sort((a, b) => a - b);
}

/** Build a uniform schedule where every active day gets the same value. */
export function scheduleFromUniform(totalMinutes: number, days: number[]): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  for (const d of days) schedule[String(d)] = totalMinutes;
  return schedule;
}

/** Look up a day's target from a schedule, falling back to a default. */
export function minutesForDay(
  schedule: WeeklySchedule | null,
  dayOfWeek: number,
  fallback: number,
): number {
  if (!schedule) return fallback;
  const value = schedule[String(dayOfWeek)];
  return value != null ? value : fallback;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Bucket shape returned to callers — daysOfWeek is always number[]. */
export interface TimerBucketRow {
  id: string;
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  weeklySchedule: WeeklySchedule | null;
  sortOrder: number;
  deactivatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Fields accepted when creating a new bucket. */
export interface CreateBucketInput {
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  weeklySchedule?: WeeklySchedule;
  sortOrder?: number;
}

/** Fields accepted when updating a bucket (all optional). */
export interface UpdateBucketInput {
  name?: string;
  totalMinutes?: number;
  colorIndex?: number;
  daysOfWeek?: number[];
  weeklySchedule?: WeeklySchedule;
  sortOrder?: number;
  deactivatedAt?: number | null; // null to reactivate, timestamp to deactivate
}

/** Raw row shape from the timerBuckets table (daysOfWeek is a JSON string in DB). */
type TimerBucketDbRow = typeof timerBuckets.$inferSelect;

/** Convert a raw DB row to the caller-facing shape.
 *  When weeklySchedule is present, daysOfWeek is derived from it (single source of truth). */
function parseBucket(row: TimerBucketDbRow): TimerBucketRow {
  const schedule = row.weeklySchedule
    ? (JSON.parse(row.weeklySchedule) as WeeklySchedule)
    : null;
  return {
    ...row,
    weeklySchedule: schedule,
    // Derive daysOfWeek from schedule when available; fall back to legacy column.
    daysOfWeek: schedule ? daysFromSchedule(schedule) : (JSON.parse(row.daysOfWeek) as number[]),
  };
}

/** Default buckets seeded into a fresh database. Matches the client-side
 *  DEFAULT_BUCKETS so existing users see the same starting configuration. */
const DEFAULT_BUCKETS = [
  { name: 'School Project', totalMinutes: 180, colorIndex: 0 },
  { name: 'Business Project', totalMinutes: 180, colorIndex: 1 },
  { name: 'Life Maintenance', totalMinutes: 60, colorIndex: 2 },
  { name: 'Exercise', totalMinutes: 60, colorIndex: 3 },
] as const;

const MON_FRI_DAYS = [1, 2, 3, 4, 5];
const MON_FRI = JSON.stringify(MON_FRI_DAYS);

/**
 * Seed the default timer buckets if the table is empty.
 * Called once on server startup — idempotent, only inserts when no buckets exist.
 */
export async function seedDefaultBuckets(
  database: Database = defaultDb,
): Promise<boolean> {
  const existing = await database.select({ id: timerBuckets.id }).from(timerBuckets).limit(1);
  if (existing.length > 0) return false;

  const now = Date.now();

  await database.insert(timerBuckets).values(
    DEFAULT_BUCKETS.map((b, i) => ({
      id: crypto.randomUUID(),
      name: b.name,
      totalMinutes: b.totalMinutes,
      colorIndex: b.colorIndex,
      daysOfWeek: MON_FRI,
      weeklySchedule: JSON.stringify(scheduleFromUniform(b.totalMinutes, MON_FRI_DAYS)),
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    })),
  );

  return true;
}

/** List all buckets, sorted by sortOrder. */
export async function listBuckets(
  database: Database = defaultDb,
): Promise<TimerBucketRow[]> {
  const rows = await database
    .select()
    .from(timerBuckets)
    .orderBy(asc(timerBuckets.sortOrder));
  return rows.map(parseBucket);
}

/** Get a single bucket by ID. Returns undefined if not found. */
export async function getBucket(
  id: string,
  database: Database = defaultDb,
): Promise<TimerBucketRow | undefined> {
  const rows = await database
    .select()
    .from(timerBuckets)
    .where(eq(timerBuckets.id, id));
  return rows[0] ? parseBucket(rows[0]) : undefined;
}

/** Create a new bucket. Assigns next sortOrder if not provided. */
export async function createBucket(
  input: CreateBucketInput,
  database: Database = defaultDb,
): Promise<TimerBucketRow> {
  const id = crypto.randomUUID();
  const now = Date.now();

  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const result = await database
      .select({ maxSort: max(timerBuckets.sortOrder) })
      .from(timerBuckets);
    sortOrder = (result[0]?.maxSort ?? -1) + 1;
  }

  // weeklySchedule is the source of truth; build from uniform values if not provided.
  const schedule = input.weeklySchedule ?? scheduleFromUniform(input.totalMinutes, input.daysOfWeek);
  const derivedDays = daysFromSchedule(schedule);
  // totalMinutes stored as max of schedule values for backward compat.
  const derivedTotalMinutes = Math.max(...Object.values(schedule), 0);

  await database.insert(timerBuckets).values({
    id,
    name: input.name,
    totalMinutes: derivedTotalMinutes,
    colorIndex: input.colorIndex,
    daysOfWeek: JSON.stringify(derivedDays),
    weeklySchedule: JSON.stringify(schedule),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id,
    name: input.name,
    totalMinutes: derivedTotalMinutes,
    colorIndex: input.colorIndex,
    daysOfWeek: derivedDays,
    weeklySchedule: schedule,
    sortOrder,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Update a bucket by ID. Returns the updated bucket, or undefined if not found. */
export async function updateBucket(
  id: string,
  updates: UpdateBucketInput,
  database: Database = defaultDb,
): Promise<TimerBucketRow | undefined> {
  const setFields: Partial<TimerBucketDbRow> = { updatedAt: Date.now() };
  if (updates.name !== undefined) setFields.name = updates.name;
  if (updates.colorIndex !== undefined) setFields.colorIndex = updates.colorIndex;
  if (updates.sortOrder !== undefined) setFields.sortOrder = updates.sortOrder;
  // Use !== undefined (not truthy check) because null is valid (reactivation)
  if (updates.deactivatedAt !== undefined) setFields.deactivatedAt = updates.deactivatedAt;

  if (updates.weeklySchedule !== undefined) {
    // weeklySchedule provided — it's the source of truth; derive the legacy fields.
    setFields.weeklySchedule = JSON.stringify(updates.weeklySchedule);
    setFields.daysOfWeek = JSON.stringify(daysFromSchedule(updates.weeklySchedule));
    setFields.totalMinutes = Math.max(...Object.values(updates.weeklySchedule), 0);
  } else if (updates.totalMinutes !== undefined || updates.daysOfWeek !== undefined) {
    // Legacy callers updating totalMinutes/daysOfWeek — rebuild weeklySchedule.
    // We need the current bucket state to fill in what wasn't provided.
    const existing = await database.select().from(timerBuckets).where(eq(timerBuckets.id, id));
    if (existing[0]) {
      const currentDays = updates.daysOfWeek ?? (JSON.parse(existing[0].daysOfWeek) as number[]);
      const currentMinutes = updates.totalMinutes ?? existing[0].totalMinutes;
      setFields.weeklySchedule = JSON.stringify(scheduleFromUniform(currentMinutes, currentDays));
      if (updates.totalMinutes !== undefined) setFields.totalMinutes = updates.totalMinutes;
      if (updates.daysOfWeek !== undefined) setFields.daysOfWeek = JSON.stringify(updates.daysOfWeek);
    }
  }

  await database
    .update(timerBuckets)
    .set(setFields)
    .where(eq(timerBuckets.id, id));

  // Re-read to return the full updated row (also serves as not-found check)
  const updated = await database
    .select()
    .from(timerBuckets)
    .where(eq(timerBuckets.id, id));
  return updated[0] ? parseBucket(updated[0]) : undefined;
}

/**
 * Delete a bucket and all its daily progress rows.
 * No CASCADE on FK — delete progress first, then the bucket (matches deleteThread pattern).
 * Returns true if the bucket existed.
 */
export async function deleteBucket(
  id: string,
  database: Database = defaultDb,
): Promise<boolean> {
  const existing = await database
    .select()
    .from(timerBuckets)
    .where(eq(timerBuckets.id, id));
  if (existing.length === 0) return false;

  // Delete progress rows first (no CASCADE), then the bucket
  await database.delete(timerDailyProgress).where(eq(timerDailyProgress.bucketId, id));
  await database.delete(timerBuckets).where(eq(timerBuckets.id, id));

  return true;
}
