import { createBucket } from '../services/timer-bucket.js';
import type { Database } from '../services/thread.js';
import { createCleanTestDb } from './test-db.js';

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

/** Create a fresh test database connection with clean timer tables. */
export async function createTimerTestDb(): Promise<Database> {
  return createCleanTestDb('timer_daily_progress, timer_buckets');
}
