import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { timerBuckets, timerDailyProgress } from '@repo/db';
import { createBucket } from '../services/timer-bucket.js';
import type { Database } from '../services/thread.js';

/** Create a test bucket with sensible defaults. */
export async function seedBucket(
  db: Database,
  overrides: {
    name?: string;
    totalMinutes?: number;
    colorIndex?: number;
    daysOfWeek?: number[];
    sortOrder?: number;
  } = {},
) {
  return createBucket(
    {
      name: overrides.name ?? 'Test Bucket',
      totalMinutes: overrides.totalMinutes ?? 60,
      colorIndex: overrides.colorIndex ?? 0,
      daysOfWeek: overrides.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
      sortOrder: overrides.sortOrder,
    },
    db,
  );
}

/** Create a fresh in-memory database with the timer schema applied.
 *  Shared across timer service tests to avoid duplicating DDL. */
export function createTimerTestDb(): Database {
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
      weekly_schedule TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deactivated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE timer_daily_progress (
      id TEXT PRIMARY KEY NOT NULL,
      bucket_id TEXT NOT NULL,
      date TEXT NOT NULL,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      goal_reached_at TEXT,
      dismissed_at TEXT,
      target_minutes_override INTEGER,
      FOREIGN KEY (bucket_id) REFERENCES timer_buckets(id)
    );
    CREATE UNIQUE INDEX uq_bucket_date ON timer_daily_progress (bucket_id, date);
  `);

  return testDb as unknown as Database;
}
