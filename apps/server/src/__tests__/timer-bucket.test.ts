import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { beforeEach, describe, expect, it } from 'vitest';
import { timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from '../services/thread.js';
import {
  seedDefaultBuckets,
  listBuckets,
  getBucket,
  createBucket,
  updateBucket,
  deleteBucket,
} from '../services/timer-bucket.js';

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

describe('bucket CRUD', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTestDb();
  });

  describe('createBucket', () => {
    it('creates a bucket with correct fields', async () => {
      const bucket = await createBucket(
        {
          name: 'Study',
          totalMinutes: 120,
          colorIndex: 2,
          daysOfWeek: [1, 2, 3, 4, 5],
        },
        testDb,
      );

      expect(bucket.name).toBe('Study');
      expect(bucket.totalMinutes).toBe(120);
      expect(bucket.colorIndex).toBe(2);
      expect(bucket.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
      expect(bucket.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('auto-assigns sortOrder when not provided', async () => {
      const b1 = await createBucket(
        { name: 'A', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );
      const b2 = await createBucket(
        { name: 'B', totalMinutes: 60, colorIndex: 1, daysOfWeek: [2] },
        testDb,
      );

      expect(b1.sortOrder).toBe(0);
      expect(b2.sortOrder).toBe(1);
    });

    it('uses explicit sortOrder when provided', async () => {
      const bucket = await createBucket(
        { name: 'A', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1], sortOrder: 10 },
        testDb,
      );
      expect(bucket.sortOrder).toBe(10);
    });
  });

  describe('getBucket', () => {
    it('returns a bucket by ID with parsed daysOfWeek', async () => {
      const created = await createBucket(
        { name: 'Test', totalMinutes: 30, colorIndex: 0, daysOfWeek: [0, 6] },
        testDb,
      );

      const found = await getBucket(created.id, testDb);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test');
      expect(found!.daysOfWeek).toEqual([0, 6]);
    });

    it('returns undefined for nonexistent ID', async () => {
      const found = await getBucket('nonexistent-id', testDb);
      expect(found).toBeUndefined();
    });
  });

  describe('listBuckets', () => {
    it('returns buckets sorted by sortOrder ascending', async () => {
      await createBucket(
        { name: 'C', totalMinutes: 60, colorIndex: 2, daysOfWeek: [1], sortOrder: 2 },
        testDb,
      );
      await createBucket(
        { name: 'A', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1], sortOrder: 0 },
        testDb,
      );
      await createBucket(
        { name: 'B', totalMinutes: 60, colorIndex: 1, daysOfWeek: [1], sortOrder: 1 },
        testDb,
      );

      const buckets = await listBuckets(testDb);
      expect(buckets).toHaveLength(3);
      expect(buckets.map((b) => b.name)).toEqual(['A', 'B', 'C']);
    });

    it('returns empty array when no buckets exist', async () => {
      const buckets = await listBuckets(testDb);
      expect(buckets).toEqual([]);
    });

    it('returns daysOfWeek as number arrays', async () => {
      await createBucket(
        { name: 'Weekdays', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1, 2, 3, 4, 5] },
        testDb,
      );

      const buckets = await listBuckets(testDb);
      expect(buckets[0]!.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('updateBucket', () => {
    it('updates name and returns updated bucket', async () => {
      const created = await createBucket(
        { name: 'Old', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );

      const updated = await updateBucket(created.id, { name: 'New' }, testDb);
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New');
      expect(updated!.totalMinutes).toBe(60); // unchanged
    });

    it('updates multiple fields at once', async () => {
      const created = await createBucket(
        { name: 'Test', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );

      const updated = await updateBucket(
        created.id,
        { totalMinutes: 120, colorIndex: 3, daysOfWeek: [0, 6] },
        testDb,
      );
      expect(updated!.totalMinutes).toBe(120);
      expect(updated!.colorIndex).toBe(3);
      expect(updated!.daysOfWeek).toEqual([0, 6]);
    });

    it('updates updatedAt timestamp', async () => {
      const created = await createBucket(
        { name: 'Test', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );

      // Small delay to ensure timestamp differs
      const updated = await updateBucket(created.id, { name: 'Updated' }, testDb);
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('returns undefined for nonexistent ID', async () => {
      const result = await updateBucket('nonexistent-id', { name: 'X' }, testDb);
      expect(result).toBeUndefined();
    });

    it('round-trips daysOfWeek correctly', async () => {
      const created = await createBucket(
        { name: 'Test', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1, 3, 5] },
        testDb,
      );

      const updated = await updateBucket(
        created.id,
        { daysOfWeek: [0, 2, 4, 6] },
        testDb,
      );
      expect(updated!.daysOfWeek).toEqual([0, 2, 4, 6]);

      // Verify via getBucket too
      const fetched = await getBucket(created.id, testDb);
      expect(fetched!.daysOfWeek).toEqual([0, 2, 4, 6]);
    });
  });

  describe('deleteBucket', () => {
    it('deletes an existing bucket and returns true', async () => {
      const created = await createBucket(
        { name: 'ToDelete', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );

      const result = await deleteBucket(created.id, testDb);
      expect(result).toBe(true);

      const found = await getBucket(created.id, testDb);
      expect(found).toBeUndefined();
    });

    it('returns false for nonexistent ID', async () => {
      const result = await deleteBucket('nonexistent-id', testDb);
      expect(result).toBe(false);
    });

    it('cascades to daily progress rows', async () => {
      const created = await createBucket(
        { name: 'WithProgress', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );

      // Insert progress rows for this bucket
      await testDb.insert(timerDailyProgress).values({
        id: crypto.randomUUID(),
        bucketId: created.id,
        date: '2026-03-24',
        elapsedSeconds: 300,
      });
      await testDb.insert(timerDailyProgress).values({
        id: crypto.randomUUID(),
        bucketId: created.id,
        date: '2026-03-23',
        elapsedSeconds: 600,
      });

      // Verify progress exists
      const progressBefore = await testDb.select().from(timerDailyProgress);
      expect(progressBefore).toHaveLength(2);

      // Delete bucket — should also delete progress
      const result = await deleteBucket(created.id, testDb);
      expect(result).toBe(true);

      const progressAfter = await testDb.select().from(timerDailyProgress);
      expect(progressAfter).toHaveLength(0);
    });

    it('does not affect other buckets or their progress', async () => {
      const keep = await createBucket(
        { name: 'Keep', totalMinutes: 60, colorIndex: 0, daysOfWeek: [1] },
        testDb,
      );
      const remove = await createBucket(
        { name: 'Remove', totalMinutes: 60, colorIndex: 1, daysOfWeek: [1] },
        testDb,
      );

      // Add progress to both
      await testDb.insert(timerDailyProgress).values({
        id: crypto.randomUUID(),
        bucketId: keep.id,
        date: '2026-03-24',
        elapsedSeconds: 100,
      });
      await testDb.insert(timerDailyProgress).values({
        id: crypto.randomUUID(),
        bucketId: remove.id,
        date: '2026-03-24',
        elapsedSeconds: 200,
      });

      await deleteBucket(remove.id, testDb);

      // "Keep" bucket and its progress should be untouched
      const buckets = await listBuckets(testDb);
      expect(buckets).toHaveLength(1);
      expect(buckets[0]!.name).toBe('Keep');

      const progress = await testDb.select().from(timerDailyProgress);
      expect(progress).toHaveLength(1);
      expect(progress[0]!.bucketId).toBe(keep.id);
    });
  });
});
