import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { beforeEach, describe, expect, it } from 'vitest';
import { threads, messages } from '@repo/db';
import {
  addMessage,
  createThread,
  getThread,
  getThreadMessages,
  listThreads,
  updateThreadSessionId,
  updateThreadTitle,
  type Database,
} from '../services/thread.js';

/** Create a fresh in-memory database with the schema applied. */
function createTestDb(): Database {
  const client = createClient({ url: ':memory:' });
  const testDb = drizzle(client, { schema: { threads, messages } });

  // Apply schema via raw SQL
  client.executeMultiple(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      claude_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    );
  `);

  return testDb as unknown as Database;
}

describe('thread service', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTestDb();
  });

  describe('createThread', () => {
    it('creates a thread with a UUID and returns it', async () => {
      const thread = await createThread('My thread', testDb);

      expect(thread.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(thread.title).toBe('My thread');
      expect(thread.claudeSessionId).toBeNull();
      expect(thread.createdAt).toBeTypeOf('number');
      expect(thread.updatedAt).toBeTypeOf('number');
    });

    it('persists the thread to the database', async () => {
      const thread = await createThread('Persisted', testDb);
      const fetched = await getThread(thread.id, testDb);

      expect(fetched).toBeDefined();
      expect(fetched!.title).toBe('Persisted');
    });
  });

  describe('getThread', () => {
    it('returns the thread by ID', async () => {
      const created = await createThread('Find me', testDb);
      const found = await getThread(created.id, testDb);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find me');
    });

    it('returns undefined for nonexistent ID', async () => {
      const found = await getThread('nonexistent', testDb);
      expect(found).toBeUndefined();
    });
  });

  describe('listThreads', () => {
    it('returns threads ordered by updatedAt descending', async () => {
      const t1 = await createThread('First', testDb);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      const t2 = await createThread('Second', testDb);
      await new Promise((r) => setTimeout(r, 10));
      const t3 = await createThread('Third', testDb);

      const list = await listThreads(testDb);

      expect(list).toHaveLength(3);
      expect(list[0]!.id).toBe(t3.id);
      expect(list[1]!.id).toBe(t2.id);
      expect(list[2]!.id).toBe(t1.id);
    });

    it('returns an empty array when no threads exist', async () => {
      const list = await listThreads(testDb);
      expect(list).toEqual([]);
    });
  });

  describe('getThreadMessages', () => {
    it('returns messages ordered by createdAt ascending', async () => {
      const thread = await createThread('Chat', testDb);

      const m1 = await addMessage(thread.id, 'user', 'Hello', testDb);
      await new Promise((r) => setTimeout(r, 10));
      const m2 = await addMessage(
        thread.id,
        'assistant',
        'Hi there!',
        testDb,
      );

      const msgs = await getThreadMessages(thread.id, testDb);

      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.id).toBe(m1.id);
      expect(msgs[0]!.role).toBe('user');
      expect(msgs[0]!.content).toBe('Hello');
      expect(msgs[1]!.id).toBe(m2.id);
      expect(msgs[1]!.role).toBe('assistant');
      expect(msgs[1]!.content).toBe('Hi there!');
    });

    it('returns an empty array for a thread with no messages', async () => {
      const thread = await createThread('Empty', testDb);
      const msgs = await getThreadMessages(thread.id, testDb);
      expect(msgs).toEqual([]);
    });
  });

  describe('addMessage', () => {
    it('creates a message with a UUID and returns it', async () => {
      const thread = await createThread('Msg test', testDb);
      const msg = await addMessage(thread.id, 'user', 'Hello world', testDb);

      expect(msg.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(msg.threadId).toBe(thread.id);
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello world');
      expect(msg.createdAt).toBeTypeOf('number');
    });

    it('updates the thread updatedAt timestamp', async () => {
      const thread = await createThread('Update test', testDb);
      const originalUpdatedAt = thread.updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      await addMessage(thread.id, 'user', 'New message', testDb);

      const updated = await getThread(thread.id, testDb);
      expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe('updateThreadSessionId', () => {
    it('updates the claudeSessionId on a thread', async () => {
      const thread = await createThread('Session test', testDb);
      expect(thread.claudeSessionId).toBeNull();

      await updateThreadSessionId(thread.id, 'session-abc', testDb);

      const updated = await getThread(thread.id, testDb);
      expect(updated!.claudeSessionId).toBe('session-abc');
    });

    it('updates the updatedAt timestamp', async () => {
      const thread = await createThread('Session ts', testDb);
      const original = thread.updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      await updateThreadSessionId(thread.id, 'session-xyz', testDb);

      const updated = await getThread(thread.id, testDb);
      expect(updated!.updatedAt).toBeGreaterThan(original);
    });
  });

  describe('updateThreadTitle', () => {
    it('updates the title of a thread', async () => {
      const thread = await createThread('Old title', testDb);

      await updateThreadTitle(thread.id, 'New title', testDb);

      const updated = await getThread(thread.id, testDb);
      expect(updated!.title).toBe('New title');
    });

    it('updates the updatedAt timestamp', async () => {
      const thread = await createThread('Title ts', testDb);
      const original = thread.updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      await updateThreadTitle(thread.id, 'Updated title', testDb);

      const updated = await getThread(thread.id, testDb);
      expect(updated!.updatedAt).toBeGreaterThan(original);
    });
  });
});
