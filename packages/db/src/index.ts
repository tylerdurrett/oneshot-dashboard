import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from './schema';

const defaultDbUrl = 'postgresql://oneshot:oneshot@localhost:5432/oneshot';

const client = postgres(process.env.DATABASE_URL ?? defaultDbUrl);

export const db = drizzle(client, { schema });

export * from './schema';
