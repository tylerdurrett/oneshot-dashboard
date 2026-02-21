import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { db } from '../index';

describe('schema module', () => {
  it('exports without errors', () => {
    expect(schema).toBeDefined();
  });

  it('exports users table with correct name', () => {
    expect(schema.users).toBeDefined();
    expect(getTableName(schema.users)).toBe('users');
  });
});

describe('db client', () => {
  it('initializes without errors', () => {
    expect(db).toBeDefined();
  });
});
