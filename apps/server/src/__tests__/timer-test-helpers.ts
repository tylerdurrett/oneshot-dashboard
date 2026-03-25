import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { timerBuckets, timerDailyProgress } from '@repo/db';
import type { Database } from '../services/thread.js';

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
