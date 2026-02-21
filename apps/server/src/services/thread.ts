import { desc, eq } from 'drizzle-orm';
import { db as defaultDb, threads, messages } from '@repo/db';

/** Database type inferred from the shared drizzle client. */
export type Database = typeof defaultDb;

const db: Database = defaultDb;

/** Create a new thread. Returns the created thread. */
export async function createThread(title: string, database: Database = db) {
  const id = crypto.randomUUID();
  const now = Date.now();

  await database.insert(threads).values({
    id,
    title,
    createdAt: now,
    updatedAt: now,
  });

  return { id, title, claudeSessionId: null, createdAt: now, updatedAt: now };
}

/** Get a single thread by ID. Returns undefined if not found. */
export async function getThread(id: string, database: Database = db) {
  const result = await database
    .select()
    .from(threads)
    .where(eq(threads.id, id));

  return result[0];
}

/** List all threads, ordered by most recently updated first. */
export async function listThreads(database: Database = db) {
  return database
    .select()
    .from(threads)
    .orderBy(desc(threads.updatedAt));
}

/** Get all messages for a thread, ordered by creation time ascending. */
export async function getThreadMessages(
  threadId: string,
  database: Database = db,
) {
  return database
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt);
}

/** Add a message to a thread. Returns the created message. Updates the thread's updatedAt. */
export async function addMessage(
  threadId: string,
  role: string,
  content: string,
  database: Database = db,
) {
  const id = crypto.randomUUID();
  const now = Date.now();

  await database.insert(messages).values({
    id,
    threadId,
    role,
    content,
    createdAt: now,
  });

  await database
    .update(threads)
    .set({ updatedAt: now })
    .where(eq(threads.id, threadId));

  return { id, threadId, role, content, createdAt: now };
}

/** Update a thread's Claude session ID. */
export async function updateThreadSessionId(
  threadId: string,
  sessionId: string,
  database: Database = db,
) {
  await database
    .update(threads)
    .set({ claudeSessionId: sessionId, updatedAt: Date.now() })
    .where(eq(threads.id, threadId));
}

/** Update a thread's title. */
export async function updateThreadTitle(
  threadId: string,
  title: string,
  database: Database = db,
) {
  await database
    .update(threads)
    .set({ title, updatedAt: Date.now() })
    .where(eq(threads.id, threadId));
}
