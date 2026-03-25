import { asc, eq, max } from 'drizzle-orm';
import { db as defaultDb, timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from './thread.js';

/** Bucket shape returned to callers — daysOfWeek is always number[]. */
export interface TimerBucketRow {
  id: string;
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** Fields accepted when creating a new bucket. */
export interface CreateBucketInput {
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  sortOrder?: number;
}

/** Fields accepted when updating a bucket (all optional). */
export interface UpdateBucketInput {
  name?: string;
  totalMinutes?: number;
  colorIndex?: number;
  daysOfWeek?: number[];
  sortOrder?: number;
}

/** Raw row shape from the timerBuckets table (daysOfWeek is a JSON string in DB). */
type TimerBucketDbRow = typeof timerBuckets.$inferSelect;

/** Convert a raw DB row to the caller-facing shape (daysOfWeek as number[]). */
function parseBucket(row: TimerBucketDbRow): TimerBucketRow {
  return {
    ...row,
    daysOfWeek: JSON.parse(row.daysOfWeek) as number[],
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

const MON_FRI = JSON.stringify([1, 2, 3, 4, 5]);

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

  await database.insert(timerBuckets).values({
    id,
    name: input.name,
    totalMinutes: input.totalMinutes,
    colorIndex: input.colorIndex,
    daysOfWeek: JSON.stringify(input.daysOfWeek),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id,
    name: input.name,
    totalMinutes: input.totalMinutes,
    colorIndex: input.colorIndex,
    daysOfWeek: input.daysOfWeek,
    sortOrder,
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
  if (updates.totalMinutes !== undefined) setFields.totalMinutes = updates.totalMinutes;
  if (updates.colorIndex !== undefined) setFields.colorIndex = updates.colorIndex;
  if (updates.daysOfWeek !== undefined) setFields.daysOfWeek = JSON.stringify(updates.daysOfWeek);
  if (updates.sortOrder !== undefined) setFields.sortOrder = updates.sortOrder;

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
