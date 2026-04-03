import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../index';

describe('PostgreSQL connection', () => {
  it('connects and executes a basic query', async () => {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    expect(result).toBeDefined();
  });
});
