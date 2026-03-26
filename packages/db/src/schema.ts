// Database schema — source of truth for all tables.
// After editing, run: pnpm --filter @repo/db db:generate && pnpm --filter @repo/db db:migrate

import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  claudeSessionId: text('claude_session_id'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

export const timerBuckets = sqliteTable('timer_buckets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  totalMinutes: integer('total_minutes').notNull(),
  colorIndex: integer('color_index').notNull(),
  daysOfWeek: text('days_of_week').notNull(), // JSON array string, e.g. "[1,2,3,4,5]"
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

export const timerDailyProgress = sqliteTable(
  'timer_daily_progress',
  {
    id: text('id').primaryKey(),
    bucketId: text('bucket_id')
      .notNull()
      .references(() => timerBuckets.id),
    date: text('date').notNull(), // YYYY-MM-DD, 3AM-adjusted
    elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
    startedAt: text('started_at'), // ISO timestamp if currently running, null if paused
    goalReachedAt: text('goal_reached_at'), // ISO timestamp when elapsed first hit totalMinutes goal, null otherwise
  },
  (table) => [
    unique('uq_bucket_date').on(table.bucketId, table.date),
  ],
);
