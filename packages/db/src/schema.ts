// Database schema — source of truth for all tables.
// After editing, run: pnpm --filter @repo/db db:generate && pnpm --filter @repo/db db:migrate

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
