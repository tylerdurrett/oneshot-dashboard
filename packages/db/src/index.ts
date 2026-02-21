import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:local.db',
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
