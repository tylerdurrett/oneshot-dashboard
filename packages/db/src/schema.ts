// Database schema — source of truth for all tables.
// After editing, run: pnpm --filter @repo/db db:generate && pnpm --filter @repo/db db:migrate

import { date, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const threads = pgTable('threads', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  claudeSessionId: text('claude_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => threads.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const timerBuckets = pgTable('timer_buckets', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  totalMinutes: integer('total_minutes').notNull(),
  colorIndex: integer('color_index').notNull(),
  daysOfWeek: jsonb('days_of_week').notNull().$type<number[]>(),
  weeklySchedule: jsonb('weekly_schedule').$type<Record<string, number>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const timerDailyProgress = pgTable(
  'timer_daily_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bucketId: uuid('bucket_id')
      .notNull()
      .references(() => timerBuckets.id),
    date: date('date', { mode: 'string' }).notNull(), // YYYY-MM-DD, 3AM-adjusted
    elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
    startedAt: text('started_at'), // ISO timestamp if currently running, null if paused
    goalReachedAt: text('goal_reached_at'), // ISO timestamp when elapsed first hit totalMinutes goal, null otherwise
    dismissedAt: text('dismissed_at'), // ISO timestamp when user dismissed this bucket for the day, null otherwise
    targetMinutesOverride: integer('target_minutes_override'), // nullable — overrides bucket's totalMinutes for just this day
  },
  (table) => [
    unique('uq_bucket_date').on(table.bucketId, table.date),
  ],
);
