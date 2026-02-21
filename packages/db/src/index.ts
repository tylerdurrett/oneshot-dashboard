import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the default database path relative to the @repo/db package directory,
 *  so the same file is used regardless of which process imports this module. */
const defaultDbUrl = `file:${path.resolve(__dirname, '..', 'local.db')}`;

const client = createClient({
  url: process.env.DATABASE_URL ?? defaultDbUrl,
});

export const db = drizzle(client, { schema });

/** Enable WAL journal mode for concurrent read/write access. */
export async function enableWalMode(): Promise<string> {
  const result = await client.execute('PRAGMA journal_mode = WAL');
  return (result.rows[0]?.journal_mode as string) ?? 'unknown';
}

/** Get the current SQLite journal mode. */
export async function getJournalMode(): Promise<string> {
  const result = await client.execute('PRAGMA journal_mode');
  return (result.rows[0]?.journal_mode as string) ?? 'unknown';
}

export * from './schema';
