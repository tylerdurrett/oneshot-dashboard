import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { beforeEach, describe, expect, it } from 'vitest';
import { timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from '../services/thread.js';
import { seedDefaultBuckets } from '../services/timer-bucket.js';

/** Create a fresh in-memory database with the timer schema applied. */
function createTestDb(): Database {
  const client = createClient({ url: ':memory:' });
  const testDb = drizzle(client, {
    schema: { timerBuckets, timerDailyProgress },
  });

  client.executeMultiple(`
    CREATE TABLE timer_buckets (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      total_minutes INTEGER NOT NULL,
      color_index INTEGER NOT NULL,
      days_of_week TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE timer_daily_progress (
      id TEXT PRIMARY KEY NOT NULL,
      bucket_id TEXT NOT NULL,
      date TEXT NOT NULL,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (bucket_id) REFERENCES timer_buckets(id)
    );
    CREATE UNIQUE INDEX uq_bucket_date ON timer_daily_progress (bucket_id, date);
  `);

  return testDb as unknown as Database;
}

describe('seedDefaultBuckets', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTestDb();
  });

  it('seeds 4 default buckets into an empty database', async () => {
    const seeded = await seedDefaultBuckets(testDb);
    expect(seeded).toBe(true);

    const buckets = await testDb.select().from(timerBuckets);
    expect(buckets).toHaveLength(4);
  });

  it('creates buckets with correct names and durations', async () => {
    await seedDefaultBuckets(testDb);
    const buckets = await testDb.select().from(timerBuckets);

    // Sorted by sortOrder (0-3)
    const sorted = buckets.sort((a, b) => a.sortOrder - b.sortOrder);

    expect(sorted[0]!.name).toBe('School Project');
    expect(sorted[0]!.totalMinutes).toBe(180);
    expect(sorted[0]!.colorIndex).toBe(0);

    expect(sorted[1]!.name).toBe('Business Project');
    expect(sorted[1]!.totalMinutes).toBe(180);
    expect(sorted[1]!.colorIndex).toBe(1);

    expect(sorted[2]!.name).toBe('Life Maintenance');
    expect(sorted[2]!.totalMinutes).toBe(60);
    expect(sorted[2]!.colorIndex).toBe(2);

    expect(sorted[3]!.name).toBe('Exercise');
    expect(sorted[3]!.totalMinutes).toBe(60);
    expect(sorted[3]!.colorIndex).toBe(3);
  });

  it('stores daysOfWeek as JSON string for Mon-Fri', async () => {
    await seedDefaultBuckets(testDb);
    const buckets = await testDb.select().from(timerBuckets);

    for (const bucket of buckets) {
      expect(bucket.daysOfWeek).toBe('[1,2,3,4,5]');
    }
  });

  it('assigns sequential sortOrder 0-3', async () => {
    await seedDefaultBuckets(testDb);
    const buckets = await testDb.select().from(timerBuckets);
    const orders = buckets.map((b) => b.sortOrder).sort();
    expect(orders).toEqual([0, 1, 2, 3]);
  });

  it('generates UUID ids', async () => {
    await seedDefaultBuckets(testDb);
    const buckets = await testDb.select().from(timerBuckets);

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const bucket of buckets) {
      expect(bucket.id).toMatch(uuidRegex);
    }
  });

  it('is idempotent — second call is a no-op', async () => {
    const first = await seedDefaultBuckets(testDb);
    expect(first).toBe(true);

    const second = await seedDefaultBuckets(testDb);
    expect(second).toBe(false);

    const buckets = await testDb.select().from(timerBuckets);
    expect(buckets).toHaveLength(4);
  });

  it('does not seed when user-created buckets already exist', async () => {
    // Insert a user-created bucket first
    await testDb.insert(timerBuckets).values({
      id: crypto.randomUUID(),
      name: 'Custom Bucket',
      totalMinutes: 45,
      colorIndex: 5,
      daysOfWeek: '[0,6]',
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const seeded = await seedDefaultBuckets(testDb);
    expect(seeded).toBe(false);

    const buckets = await testDb.select().from(timerBuckets);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.name).toBe('Custom Bucket');
  });
});
