import { db as defaultDb, timerBuckets } from '@repo/db';
import type { Database } from './thread.js';

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
