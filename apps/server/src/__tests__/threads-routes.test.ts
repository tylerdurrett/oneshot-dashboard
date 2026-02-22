import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { beforeEach, describe, expect, it } from 'vitest';
import { threads, messages } from '@repo/db';
import { config } from '../config.js';
import { buildServer } from '../index.js';
import type { Database } from '../services/thread.js';

/** Create a fresh in-memory database with the schema applied. */
function createTestDb(): Database {
  const client = createClient({ url: ':memory:' });
  const testDb = drizzle(client, { schema: { threads, messages } });

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

describe('thread routes', () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTestDb();
  });

  describe('GET /threads', () => {
    it('returns an empty array when no threads exist', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'GET',
        url: '/threads',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ threads: [] });

      await server.close();
    });

    it('returns threads ordered by updatedAt descending', async () => {
      const server = buildServer({ logger: false, database: testDb });

      // Create threads with small delays for distinct timestamps
      await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'First' },
      });
      await new Promise((r) => setTimeout(r, 10));
      await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'Second' },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/threads',
      });

      const body = response.json();
      expect(body.threads).toHaveLength(2);
      expect(body.threads[0].title).toBe('Second');
      expect(body.threads[1].title).toBe('First');

      await server.close();
    });
  });

  describe('POST /threads', () => {
    it('creates a thread with a custom title and returns 201', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'My chat' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.thread.title).toBe('My chat');
      expect(body.thread.id).toBeDefined();
      expect(body.thread.claudeSessionId).toBeNull();

      await server.close();
    });

    it('defaults title to "New conversation" when no title provided', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'POST',
        url: '/threads',
        payload: {},
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().thread.title).toBe('New conversation');

      await server.close();
    });

    it('defaults title when body is empty', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'POST',
        url: '/threads',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().thread.title).toBe('New conversation');

      await server.close();
    });
  });

  describe('GET /threads/:id/messages', () => {
    it('returns 404 for a nonexistent thread', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'GET',
        url: '/threads/nonexistent/messages',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Thread not found' });

      await server.close();
    });

    it('returns empty messages for a thread with no messages', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const createRes = await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'Empty thread' },
      });
      const threadId = createRes.json().thread.id;

      const response = await server.inject({
        method: 'GET',
        url: `/threads/${threadId}/messages`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ messages: [] });

      await server.close();
    });

    it('returns messages for a thread that has them', async () => {
      const server = buildServer({ logger: false, database: testDb });

      // Create a thread
      const createRes = await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'Chat thread' },
      });
      const threadId = createRes.json().thread.id;

      // Add messages directly via the service (since addMessage isn't exposed via HTTP yet)
      const { addMessage } = await import('../services/thread.js');
      await addMessage(threadId, 'user', 'Hello', testDb);
      await new Promise((r) => setTimeout(r, 10));
      await addMessage(threadId, 'assistant', 'Hi there!', testDb);

      const response = await server.inject({
        method: 'GET',
        url: `/threads/${threadId}/messages`,
      });

      const body = response.json();
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('Hello');
      expect(body.messages[1].role).toBe('assistant');
      expect(body.messages[1].content).toBe('Hi there!');

      await server.close();
    });
  });

  describe('DELETE /threads/:id', () => {
    it('returns 404 for nonexistent thread', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'DELETE',
        url: '/threads/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Thread not found' });

      await server.close();
    });

    it('deletes a thread and returns success', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const createRes = await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'To delete' },
      });
      const threadId = createRes.json().thread.id;

      const deleteRes = await server.inject({
        method: 'DELETE',
        url: `/threads/${threadId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json()).toEqual({ success: true });

      // Verify it's gone
      const listRes = await server.inject({ method: 'GET', url: '/threads' });
      expect(listRes.json().threads).toHaveLength(0);

      await server.close();
    });

    it('deletes thread messages along with the thread', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const createRes = await server.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'With messages' },
      });
      const threadId = createRes.json().thread.id;

      const { addMessage } = await import('../services/thread.js');
      await addMessage(threadId, 'user', 'Hello', testDb);

      await server.inject({ method: 'DELETE', url: `/threads/${threadId}` });

      // Thread is gone, so messages endpoint returns 404
      const msgRes = await server.inject({
        method: 'GET',
        url: `/threads/${threadId}/messages`,
      });
      expect(msgRes.statusCode).toBe(404);

      await server.close();
    });
  });

  describe('CORS', () => {
    it('includes CORS headers in responses', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'GET',
        url: '/threads',
        headers: { origin: config.webOrigin },
      });

      expect(response.headers['access-control-allow-origin']).toBe(
        config.webOrigin,
      );

      await server.close();
    });

    it('handles CORS preflight requests', async () => {
      const server = buildServer({ logger: false, database: testDb });

      const response = await server.inject({
        method: 'OPTIONS',
        url: '/threads',
        headers: {
          origin: config.webOrigin,
          'access-control-request-method': 'POST',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(
        config.webOrigin,
      );

      await server.close();
    });
  });
});
