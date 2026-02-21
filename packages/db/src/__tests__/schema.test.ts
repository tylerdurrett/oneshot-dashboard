import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { db } from '../index';

describe('schema module', () => {
  it('exports without errors', () => {
    expect(schema).toBeDefined();
  });

  it('exports threads table', () => {
    expect(schema.threads).toBeDefined();
  });

  it('exports messages table', () => {
    expect(schema.messages).toBeDefined();
  });
});

describe('threads table', () => {
  const columns = getTableColumns(schema.threads);

  it('has id column as text primary key', () => {
    expect(columns.id.dataType).toBe('string');
    expect(columns.id.notNull).toBe(true);
  });

  it('has title column as non-null text', () => {
    expect(columns.title.dataType).toBe('string');
    expect(columns.title.notNull).toBe(true);
  });

  it('has claudeSessionId column as nullable text', () => {
    expect(columns.claudeSessionId.dataType).toBe('string');
    expect(columns.claudeSessionId.notNull).toBe(false);
  });

  it('has createdAt column as non-null integer', () => {
    expect(columns.createdAt.dataType).toBe('number');
    expect(columns.createdAt.notNull).toBe(true);
  });

  it('has updatedAt column as non-null integer', () => {
    expect(columns.updatedAt.dataType).toBe('number');
    expect(columns.updatedAt.notNull).toBe(true);
  });
});

describe('messages table', () => {
  const columns = getTableColumns(schema.messages);

  it('has id column as text primary key', () => {
    expect(columns.id.dataType).toBe('string');
    expect(columns.id.notNull).toBe(true);
  });

  it('has threadId column as non-null text', () => {
    expect(columns.threadId.dataType).toBe('string');
    expect(columns.threadId.notNull).toBe(true);
  });

  it('has role column as non-null text', () => {
    expect(columns.role.dataType).toBe('string');
    expect(columns.role.notNull).toBe(true);
  });

  it('has content column as non-null text', () => {
    expect(columns.content.dataType).toBe('string');
    expect(columns.content.notNull).toBe(true);
  });

  it('has createdAt column as non-null integer', () => {
    expect(columns.createdAt.dataType).toBe('number');
    expect(columns.createdAt.notNull).toBe(true);
  });
});

describe('db client', () => {
  it('initializes without errors', () => {
    expect(db).toBeDefined();
  });
});
