import { EventEmitter } from 'node:events';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { threads, messages } from '@repo/db';
import { buildServer } from '../index.js';
import type { Database } from '../services/thread.js';
import type { SpawnFn } from '../services/sandbox.js';

// ---------------------------------------------------------------------------
// Test helpers (same patterns as sandbox.test.ts and threads-routes.test.ts)
// ---------------------------------------------------------------------------

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

interface FakeSpawnOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
  hang?: boolean;
}

function createFakeSpawn(options: FakeSpawnOptions): SpawnFn {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return ((_command: string, _args: string[]) => {
    const child = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();

    Object.assign(child, {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      kill: () => {
        process.nextTick(() => child.emit('close', null));
      },
    });

    process.nextTick(() => {
      if (options.error) {
        child.emit('error', options.error);
        return;
      }

      if (options.hang) {
        return;
      }

      if (options.stdout)
        stdoutEmitter.emit('data', Buffer.from(options.stdout));
      if (options.stderr)
        stderrEmitter.emit('data', Buffer.from(options.stderr));

      child.emit('close', options.exitCode ?? 0);
    });

    return child;
  }) as unknown as SpawnFn;
}

/** Build multi-line NDJSON stdout from event objects. */
function ndjson(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/** Parse a WebSocket message buffer as JSON. */
function parseMsg(data: Buffer): Record<string, unknown> {
  return JSON.parse(data.toString());
}

/** Create a thread via HTTP and return its ID. */
async function createThread(
  server: ReturnType<typeof buildServer>,
  title = 'Test thread',
): Promise<string> {
  const res = await server.inject({
    method: 'POST',
    url: '/threads',
    payload: { title },
  });
  return res.json().thread.id;
}

/**
 * Collect all WebSocket messages until a `done` or `error` event,
 * or until the timeout expires.
 */
function collectWsMessages(
  ws: Awaited<ReturnType<ReturnType<typeof buildServer>['injectWS']>>,
  opts?: { timeoutMs?: number },
): Promise<Record<string, unknown>[]> {
  const timeout = opts?.timeoutMs ?? 5000;

  return new Promise((resolve) => {
    const msgs: Record<string, unknown>[] = [];
    const timer = setTimeout(() => resolve(msgs), timeout);

    ws.on('message', (data: Buffer) => {
      const msg = parseMsg(data);
      msgs.push(msg);

      if (msg.type === 'done' || msg.type === 'error') {
        clearTimeout(timer);
        resolve(msgs);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chat WebSocket route', () => {
  let testDb: Database;
  let server: ReturnType<typeof buildServer>;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(async () => {
    await server?.close();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  describe('happy path', () => {
    it('streams tokens and sends done after successful Claude invocation', async () => {
      const spawnFn = createFakeSpawn({
        stdout: ndjson(
          {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
          },
          {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' world' },
          },
          { type: 'result', result: 'Hello world', session_id: 'sess-1' },
        ),
        exitCode: 0,
      });

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server);
      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({ type: 'message', threadId, content: 'Hi Claude' }),
      );

      const msgs = await collecting;

      const tokens = msgs.filter((m) => m.type === 'token');
      const done = msgs.find((m) => m.type === 'done');

      expect(tokens).toHaveLength(2);
      expect(tokens[0]!.text).toBe('Hello');
      expect(tokens[1]!.text).toBe(' world');
      expect(done).toBeDefined();
      expect(done!.messageId).toBeDefined();

      ws.close();
    });

    it('persists user and assistant messages to the database', async () => {
      const spawnFn = createFakeSpawn({
        stdout: ndjson({
          type: 'result',
          result: 'Bot reply',
          session_id: 'sess-2',
        }),
        exitCode: 0,
      });

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server);
      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({
          type: 'message',
          threadId,
          content: 'User says hi',
        }),
      );
      await collecting;
      ws.close();

      // Verify messages via HTTP endpoint
      const res = await server.inject({
        method: 'GET',
        url: `/threads/${threadId}/messages`,
      });
      const body = res.json();

      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('User says hi');
      expect(body.messages[1].role).toBe('assistant');
      expect(body.messages[1].content).toBe('Bot reply');
    });

    it("updates the thread's claudeSessionId after response", async () => {
      const spawnFn = createFakeSpawn({
        stdout: ndjson({
          type: 'result',
          result: 'ok',
          session_id: 'new-session-abc',
        }),
        exitCode: 0,
      });

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server);
      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({ type: 'message', threadId, content: 'test' }),
      );
      await collecting;
      ws.close();

      // Check the thread's session ID via the service layer
      const { getThread } = await import('../services/thread.js');
      const thread = await getThread(threadId, testDb);

      expect(thread?.claudeSessionId).toBe('new-session-abc');
    });
  });

  // -----------------------------------------------------------------------
  // Thread title auto-generation
  // -----------------------------------------------------------------------

  describe('thread title auto-generation', () => {
    it('updates thread title from first user message', async () => {
      const spawnFn = createFakeSpawn({
        stdout: ndjson({
          type: 'result',
          result: 'ok',
          session_id: 'sid',
        }),
        exitCode: 0,
      });

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      // Create a thread with the default "New conversation" title
      const threadId = await createThread(server, 'New conversation');
      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({
          type: 'message',
          threadId,
          content: 'What is the weather today?',
        }),
      );
      await collecting;
      ws.close();

      // Verify the thread title was updated
      const { getThread } = await import('../services/thread.js');
      const thread = await getThread(threadId, testDb);

      expect(thread?.title).toBe('What is the weather today?');
    });

    it('does not overwrite title on subsequent messages', async () => {
      // We need a spawnFn that can handle two invocations
      let callCount = 0;
      const spawnFn = ((_cmd: string, _args: string[]) => {
        callCount++;
        const inner = createFakeSpawn({
          stdout: ndjson({
            type: 'result',
            result: `reply ${callCount}`,
            session_id: `sid-${callCount}`,
          }),
          exitCode: 0,
        });
        return inner(_cmd, _args);
      }) as unknown as SpawnFn;

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server, 'New conversation');
      const ws = await server.injectWS('/chat');

      // First message — sets the title
      const first = collectWsMessages(ws);
      ws.send(
        JSON.stringify({
          type: 'message',
          threadId,
          content: 'First message sets title',
        }),
      );
      await first;

      // Second message — should NOT change title
      const second = collectWsMessages(ws);
      ws.send(
        JSON.stringify({
          type: 'message',
          threadId,
          content: 'Second message should not change title',
        }),
      );
      await second;
      ws.close();

      const { getThread } = await import('../services/thread.js');
      const thread = await getThread(threadId, testDb);

      expect(thread?.title).toBe('First message sets title');
    });
  });

  // -----------------------------------------------------------------------
  // Error scenarios
  // -----------------------------------------------------------------------

  describe('error scenarios', () => {
    it('returns error for invalid JSON', async () => {
      const spawnFn = createFakeSpawn({ stdout: '', exitCode: 0 });
      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send('not valid json {{{');
      const msgs = await collecting;

      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe('error');
      expect(msgs[0]!.message).toBe('Invalid JSON');

      ws.close();
    });

    it('returns error for invalid message format (missing fields)', async () => {
      const spawnFn = createFakeSpawn({ stdout: '', exitCode: 0 });
      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      // Missing content field
      ws.send(JSON.stringify({ type: 'message', threadId: 'some-id' }));
      const msgs = await collecting;

      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe('error');
      expect(msgs[0]!.message).toBe('Invalid message format');

      ws.close();
    });

    it('returns error for nonexistent thread ID', async () => {
      const spawnFn = createFakeSpawn({ stdout: '', exitCode: 0 });
      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({
          type: 'message',
          threadId: 'nonexistent-thread',
          content: 'Hello',
        }),
      );
      const msgs = await collecting;

      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe('error');
      expect(msgs[0]!.message).toBe('Thread not found');

      ws.close();
    });

    it('forwards sandbox errors to the client', async () => {
      const spawnFn = createFakeSpawn({
        stderr: "Error: sandbox 'my-sandbox' does not exist",
        exitCode: 1,
      });

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server);
      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({ type: 'message', threadId, content: 'Hello' }),
      );
      const msgs = await collecting;

      const errorMsg = msgs.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.message).toBeDefined();

      ws.close();
    });
  });

  // -----------------------------------------------------------------------
  // Streaming lock
  // -----------------------------------------------------------------------

  describe('streaming lock', () => {
    it('ignores messages sent while streaming is in progress', async () => {
      // Use a spawn that emits a token first, then waits before the result,
      // giving us time to send a second message during streaming.
      let invocationCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const spawnFn = ((_cmd: string, _args: string[]) => {
        invocationCount++;

        const child = new EventEmitter();
        const stdoutEmitter = new EventEmitter();
        const stderrEmitter = new EventEmitter();

        Object.assign(child, {
          stdout: stdoutEmitter,
          stderr: stderrEmitter,
          kill: () => {
            process.nextTick(() => child.emit('close', null));
          },
        });

        process.nextTick(() => {
          // Emit first token immediately
          const token = JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'streaming...' },
          }) + '\n';
          stdoutEmitter.emit('data', Buffer.from(token));

          // Delay the result to keep the streaming lock active
          setTimeout(() => {
            const result = JSON.stringify({
              type: 'result',
              result: 'streaming...',
              session_id: 'sid',
            }) + '\n';
            stdoutEmitter.emit('data', Buffer.from(result));
            child.emit('close', 0);
          }, 100);
        });

        return child;
      }) as unknown as SpawnFn;

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server);
      const ws = await server.injectWS('/chat');

      // Wait for the first token to confirm streaming lock is active
      const firstToken = new Promise<void>((resolve) => {
        ws.on('message', (data: Buffer) => {
          const msg = parseMsg(data);
          if (msg.type === 'token') resolve();
        });
      });

      ws.send(
        JSON.stringify({
          type: 'message',
          threadId,
          content: 'First message',
        }),
      );

      await firstToken;

      // Now send second message — streaming lock should reject it
      ws.send(
        JSON.stringify({
          type: 'message',
          threadId,
          content: 'Second message (ignored)',
        }),
      );

      // Wait for the done event
      await new Promise<void>((resolve) => {
        ws.on('message', (data: Buffer) => {
          const msg = parseMsg(data);
          if (msg.type === 'done') resolve();
        });
      });
      ws.close();

      // Only one invocation should have occurred
      expect(invocationCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Session resume
  // -----------------------------------------------------------------------

  describe('session resume', () => {
    it('passes --resume flag when thread has a claudeSessionId', async () => {
      let capturedArgs: string[] = [];
      let callCount = 0;

      const spawnFn = ((cmd: string, args: string[]) => {
        callCount++;
        capturedArgs = [...args];
        const inner = createFakeSpawn({
          stdout: ndjson({
            type: 'result',
            result: 'ok',
            session_id: `sid-${callCount}`,
          }),
          exitCode: 0,
        });
        return inner(cmd, args);
      }) as unknown as SpawnFn;

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      const threadId = await createThread(server);
      const ws = await server.injectWS('/chat');

      // First message: no session ID yet, so no --resume
      const first = collectWsMessages(ws);
      ws.send(
        JSON.stringify({ type: 'message', threadId, content: 'msg 1' }),
      );
      await first;

      // Second message: thread now has a session ID from first response
      capturedArgs = [];
      const second = collectWsMessages(ws);
      ws.send(
        JSON.stringify({ type: 'message', threadId, content: 'msg 2' }),
      );
      await second;
      ws.close();

      // The second invocation should have used --resume
      expect(capturedArgs).toContain('--resume');
      expect(capturedArgs).toContain('sid-1');
    });

    it('handles resume failure by retrying without --resume', async () => {
      const calls: string[][] = [];

      const spawnFn = ((cmd: string, args: string[]) => {
        calls.push([...args]);
        const isResume = args.includes('--resume');

        if (isResume) {
          // Resume failure
          const inner = createFakeSpawn({
            stderr: 'Error: session not found',
            exitCode: 1,
          });
          return inner(cmd, args);
        }
        // Success without resume
        const inner = createFakeSpawn({
          stdout: ndjson({
            type: 'result',
            result: 'fresh',
            session_id: 'new-sid',
          }),
          exitCode: 0,
        });
        return inner(cmd, args);
      }) as unknown as SpawnFn;

      server = buildServer({ logger: false, database: testDb, spawnFn });
      await server.ready();

      // Create thread and manually set a stale session ID
      const threadId = await createThread(server);
      const { updateThreadSessionId } = await import('../services/thread.js');
      await updateThreadSessionId(threadId, 'stale-sid', testDb);

      const ws = await server.injectWS('/chat');
      const collecting = collectWsMessages(ws);

      ws.send(
        JSON.stringify({ type: 'message', threadId, content: 'test' }),
      );

      const msgs = await collecting;
      ws.close();

      // Should have received a done (not just an error)
      const done = msgs.find((m) => m.type === 'done');
      expect(done).toBeDefined();

      // Should have made two spawn calls: first with --resume, then without
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[0]).toContain('--resume');
      expect(calls[0]).toContain('stale-sid');
      // The retry call should NOT contain --resume
      const retryCall = calls.find((c) => !c.includes('--resume'));
      expect(retryCall).toBeDefined();

      // Session ID should be updated to the new one
      const { getThread } = await import('../services/thread.js');
      const thread = await getThread(threadId, testDb);
      expect(thread?.claudeSessionId).toBe('new-sid');
    });
  });
});
