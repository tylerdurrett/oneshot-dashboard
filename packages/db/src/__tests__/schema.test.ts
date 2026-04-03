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

  it('exports timerBuckets table', () => {
    expect(schema.timerBuckets).toBeDefined();
  });

  it('exports timerDailyProgress table', () => {
    expect(schema.timerDailyProgress).toBeDefined();
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

  it('has createdAt column as non-null timestamp', () => {
    expect(columns.createdAt.dataType).toBe('string');
    expect(columns.createdAt.notNull).toBe(true);
  });

  it('has updatedAt column as non-null timestamp', () => {
    expect(columns.updatedAt.dataType).toBe('string');
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

  it('has createdAt column as non-null timestamp', () => {
    expect(columns.createdAt.dataType).toBe('string');
    expect(columns.createdAt.notNull).toBe(true);
  });
});

describe('timerBuckets table', () => {
  const columns = getTableColumns(schema.timerBuckets);

  it('has id column as text primary key', () => {
    expect(columns.id.dataType).toBe('string');
    expect(columns.id.notNull).toBe(true);
  });

  it('has name column as non-null text', () => {
    expect(columns.name.dataType).toBe('string');
    expect(columns.name.notNull).toBe(true);
  });

  it('has totalMinutes column as non-null integer', () => {
    expect(columns.totalMinutes.dataType).toBe('number');
    expect(columns.totalMinutes.notNull).toBe(true);
  });

  it('has colorIndex column as non-null integer', () => {
    expect(columns.colorIndex.dataType).toBe('number');
    expect(columns.colorIndex.notNull).toBe(true);
  });

  it('has daysOfWeek column as non-null jsonb', () => {
    expect(columns.daysOfWeek.dataType).toBe('json');
    expect(columns.daysOfWeek.notNull).toBe(true);
  });

  it('has sortOrder column as non-null integer with default', () => {
    expect(columns.sortOrder.dataType).toBe('number');
    expect(columns.sortOrder.notNull).toBe(true);
    expect(columns.sortOrder.hasDefault).toBe(true);
  });

  it('has createdAt column as non-null timestamp', () => {
    expect(columns.createdAt.dataType).toBe('string');
    expect(columns.createdAt.notNull).toBe(true);
  });

  it('has updatedAt column as non-null timestamp', () => {
    expect(columns.updatedAt.dataType).toBe('string');
    expect(columns.updatedAt.notNull).toBe(true);
  });
});

describe('timerDailyProgress table', () => {
  const columns = getTableColumns(schema.timerDailyProgress);

  it('has id column as text primary key', () => {
    expect(columns.id.dataType).toBe('string');
    expect(columns.id.notNull).toBe(true);
  });

  it('has bucketId column as non-null text', () => {
    expect(columns.bucketId.dataType).toBe('string');
    expect(columns.bucketId.notNull).toBe(true);
  });

  it('has date column as non-null date', () => {
    expect(columns.date.dataType).toBe('string');
    expect(columns.date.notNull).toBe(true);
  });

  it('has elapsedSeconds column as non-null integer with default', () => {
    expect(columns.elapsedSeconds.dataType).toBe('number');
    expect(columns.elapsedSeconds.notNull).toBe(true);
    expect(columns.elapsedSeconds.hasDefault).toBe(true);
  });

  it('has startedAt column as nullable text', () => {
    expect(columns.startedAt.dataType).toBe('string');
    expect(columns.startedAt.notNull).toBe(false);
  });

  it('has goalReachedAt column as nullable text', () => {
    expect(columns.goalReachedAt.dataType).toBe('string');
    expect(columns.goalReachedAt.notNull).toBe(false);
  });
});

describe('db client', () => {
  it('initializes without errors', () => {
    expect(db).toBeDefined();
  });
});
