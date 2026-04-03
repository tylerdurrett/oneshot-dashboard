/**
 * Shared Postgres test database connection.
 * All test files use this single connection to avoid duplication and connection leaks.
 * Migrations run once; each test truncates the tables it needs.
 */
import path from 'node:path';
import { afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '@repo/db';
import type { Database } from '../services/thread.js';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://oneshot:oneshot@localhost:5432/oneshot_test';

const MIGRATIONS_FOLDER = path.resolve(
  import.meta.dirname ?? '.',
  '../../../../packages/db/drizzle',
);

let client: ReturnType<typeof postgres> | null = null;
let db: Database | null = null;
let migrated = false;

/** Get (or create) the shared Postgres test database connection.
 *  Runs migrations once on first call. */
async function getDb(): Promise<Database> {
  if (db) return db;

  client = postgres(TEST_DB_URL, { max: 5 });
  db = drizzle(client, { schema }) as unknown as Database;

  if (!migrated) {
    await migrate(db as ReturnType<typeof drizzle>, {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    migrated = true;
  }

  return db;
}

/** Truncate the given tables and return the shared DB connection. */
export async function createCleanTestDb(
  tables: string,
): Promise<Database> {
  const testDb = await getDb();
  await testDb.execute(sql.raw(`TRUNCATE ${tables} CASCADE`));
  return testDb;
}

// Close the shared connection when the test worker exits.
afterAll(async () => {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
});
