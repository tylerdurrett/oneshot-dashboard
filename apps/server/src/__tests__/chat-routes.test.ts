import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import type { Database } from '../services/thread.js';
import type { SpawnFn } from '../services/sandbox.js';
import { createFakeSpawn, ndjson } from './helpers.js';
import { createCleanTestDb } from './test-db.js';

function healthySpawnForInvocation(invocationSpawn: SpawnFn): SpawnFn {
  const healthyAuth = JSON.stringify({
    loggedIn: true,
    authMethod: 'firstPartyOauth',
    apiProvider: 'firstParty',
  });
  const creds = JSON.stringify({
    claudeAiOauth: {
      accessToken: 'fresh-token',
      expiresAt: Date.now() + 3_600_000,
      refreshToken: 'rt-secret',
    },
  });

  return ((command: string, args: string[]) => {
    if (command === 'security') {
      return createFakeSpawn({ stdout: creds, exitCode: 0 })(command, args);
    }

    if (command === 'docker' && args.includes('-i')) {
      return createFakeSpawn({ exitCode: 0 })(command, args);
    }

    if (command === 'docker' && args.includes('auth') && args.includes('status')) {
      return createFakeSpawn({ stdout: healthyAuth, exitCode: 0 })(command, args);
    }

    if (command === 'docker' && args.includes('-p')) {
      return invocationSpawn(command, args);
    }

    return createFakeSpawn({ exitCode: 1, stderr: `Unhandled command: ${command}` })(
      command,
      args,
    );
  }) as SpawnFn;
}

async function startServer(server: ReturnType<typeof buildServer>): Promise<string> {
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  return address;
}

async function createThread(baseUrl: string, title = 'Test thread') {
  const response = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const body = await response.json();
  return body.thread as { id: string };
}

async function readRunStream(
  response: Response,
  opts?: { stopOn?: 'ready' | 'done' | 'error' },
): Promise<Record<string, unknown>[]> {
  const reader = response.body?.getReader();
  if (!reader) return [];

  const decoder = new TextDecoder();
  let buffer = '';
  const events: Record<string, unknown>[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      events.push(event);

      if (opts?.stopOn && event.type === opts.stopOn) {
        await reader.cancel();
        return events;
      }
    }
  }

  if (buffer.trim()) {
    events.push(JSON.parse(buffer.trim()) as Record<string, unknown>);
  }

  return events;
}

async function waitForRunCompletion(baseUrl: string, runId: string) {
  for (let i = 0; i < 50; i++) {
    const response = await fetch(`${baseUrl}/chat/runs/${runId}`);
    const body = await response.json();
    if (body.completed) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Run did not complete in time');
}

describe('chat run routes', () => {
  let testDb: Database;
  let server: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    testDb = await createCleanTestDb('messages, threads');
  });

  afterEach(async () => {
    await server?.close();
  });

  it('creates a draft thread on the server and streams a completed response', async () => {
    const spawnFn = healthySpawnForInvocation(
      createFakeSpawn({
        stdout: ndjson(
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
          { type: 'result', result: 'Hello world', session_id: 'sess-1' },
        ),
        exitCode: 0,
      }),
    );

    server = buildServer({ logger: false, database: testDb, spawnFn });
    const baseUrl = await startServer(server);

    const response = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hi Claude', clientRequestId: 'draft-1' }),
    });
    const events = await readRunStream(response);

    expect(events[0]?.type).toBe('ready');
    expect(events[1]?.type).toBe('token');
    expect(events[2]?.type).toBe('token');
    expect(events[3]?.type).toBe('done');

    const ready = events[0]!;
    const threadId = ready.threadId as string;

    const messagesResponse = await fetch(`${baseUrl}/threads/${threadId}/messages`);
    const messagesBody = await messagesResponse.json();
    expect(messagesBody.messages).toHaveLength(2);
    expect(messagesBody.messages[0].role).toBe('user');
    expect(messagesBody.messages[1].role).toBe('assistant');

    const threadsResponse = await fetch(`${baseUrl}/threads`);
    const threadsBody = await threadsResponse.json();
    expect(threadsBody.threads[0].title).toBe('Hi Claude');
    expect(threadsBody.threads[0].claudeSessionId).toBe('sess-1');
  });

  it('uses the thread session id when continuing an existing thread', async () => {
    let firstInvocation = true;
    const spawnFn = healthySpawnForInvocation(((command: string, args: string[]) => {
      const result = firstInvocation
        ? createFakeSpawn({
            stdout: ndjson({ type: 'result', result: 'First reply', session_id: 'sess-1' }),
            exitCode: 0,
          })(command, args)
        : createFakeSpawn({
            stdout: ndjson({ type: 'result', result: 'Second reply', session_id: 'sess-2' }),
            exitCode: 0,
          })(command, args);
      firstInvocation = false;
      return result;
    }) as SpawnFn);

    server = buildServer({ logger: false, database: testDb, spawnFn });
    const baseUrl = await startServer(server);

    const firstResponse = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'First', clientRequestId: 'existing-1' }),
    });
    const firstEvents = await readRunStream(firstResponse);
    const threadId = firstEvents[0]!.threadId as string;

    let capturedArgs: string[] = [];
    const captureSpawn = healthySpawnForInvocation(((command: string, args: string[]) => {
      capturedArgs = [...args];
      return createFakeSpawn({
        stdout: ndjson({ type: 'result', result: 'Continued', session_id: 'sess-2' }),
        exitCode: 0,
      })(command, args);
    }) as SpawnFn);

    await server.close();
    server = buildServer({ logger: false, database: testDb, spawnFn: captureSpawn });
    const newBaseUrl = await startServer(server);

    const secondResponse = await fetch(`${newBaseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        content: 'Second',
        clientRequestId: 'existing-2',
      }),
    });
    await readRunStream(secondResponse);

    expect(capturedArgs).toContain('--resume');
    expect(capturedArgs).toContain('sess-1');
  });

  it('returns a busy-thread conflict when a second client targets an active thread', async () => {
    const delayedSpawn = healthySpawnForInvocation((() => {
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
        stdoutEmitter.emit(
          'data',
          Buffer.from(
            `${JSON.stringify({
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'streaming...' },
            })}\n`,
          ),
        );

        setTimeout(() => {
          stdoutEmitter.emit(
            'data',
            Buffer.from(
              `${JSON.stringify({
                type: 'result',
                result: 'streaming...',
                session_id: 'sess-busy',
              })}\n`,
            ),
          );
          child.emit('close', 0);
        }, 150);
      });

      return child;
    }) as unknown as SpawnFn);

    server = buildServer({ logger: false, database: testDb, spawnFn: delayedSpawn });
    const baseUrl = await startServer(server);
    const thread = await createThread(baseUrl);
    const controller = new AbortController();

    const firstResponse = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: thread.id,
        content: 'First message',
        clientRequestId: 'busy-1',
      }),
      signal: controller.signal,
    });
    const readyEvents = await readRunStream(firstResponse, { stopOn: 'ready' });
    const runId = readyEvents[0]!.runId as string;
    controller.abort();

    const conflictResponse = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: thread.id,
        content: 'Second message',
        clientRequestId: 'busy-2',
      }),
    });
    const conflict = await conflictResponse.json();

    expect(conflictResponse.status).toBe(409);
    expect(conflict.code).toBe('thread_busy');
    expect(conflict.runId).toBe(runId);

    const completed = await waitForRunCompletion(baseUrl, runId);
    expect(completed.status).toBe('completed');
  });

  it('keeps the run going after the client disconnects and exposes completion via run status', async () => {
    const delayedSpawn = healthySpawnForInvocation((() => {
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
        setTimeout(() => {
          stdoutEmitter.emit(
            'data',
            Buffer.from(
              `${JSON.stringify({
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'done soon' },
              })}\n`,
            ),
          );
          stdoutEmitter.emit(
            'data',
            Buffer.from(
              `${JSON.stringify({
                type: 'result',
                result: 'done soon',
                session_id: 'sess-bg',
              })}\n`,
            ),
          );
          child.emit('close', 0);
        }, 100);
      });

      return child;
    }) as unknown as SpawnFn);

    server = buildServer({ logger: false, database: testDb, spawnFn: delayedSpawn });
    const baseUrl = await startServer(server);

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Keep going', clientRequestId: 'bg-1' }),
      signal: controller.signal,
    });
    const readyEvents = await readRunStream(response, { stopOn: 'ready' });
    const runId = readyEvents[0]!.runId as string;
    controller.abort();

    const completed = await waitForRunCompletion(baseUrl, runId);
    expect(completed.status).toBe('completed');
    expect(completed.assistantPreview).toBe('done soon');

    const threadId = readyEvents[0]!.threadId as string;
    const messagesResponse = await fetch(`${baseUrl}/threads/${threadId}/messages`);
    const messagesBody = await messagesResponse.json();
    expect(messagesBody.messages[1].content).toBe('done soon');
  });

  it('returns a stream error before acceptance when sandbox preparation fails', async () => {
    const failingSpawn = ((command: string, args: string[]) => {
      if (command === 'security') {
        return createFakeSpawn({ stderr: 'missing creds', exitCode: 44 })(command, args);
      }
      return createFakeSpawn({ exitCode: 1 })(command, args);
    }) as SpawnFn;

    server = buildServer({ logger: false, database: testDb, spawnFn: failingSpawn });
    const baseUrl = await startServer(server);

    const response = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Will fail', clientRequestId: 'fail-1' }),
    });
    const events = await readRunStream(response);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');

    const threadsResponse = await fetch(`${baseUrl}/threads`);
    const threadsBody = await threadsResponse.json();
    expect(threadsBody.threads).toHaveLength(0);
  });

  it('includes the CORS header on streamed chat responses', async () => {
    const spawnFn = healthySpawnForInvocation(
      createFakeSpawn({
        stdout: ndjson({ type: 'result', result: 'Hello', session_id: 'sess-cors' }),
        exitCode: 0,
      }),
    );

    server = buildServer({ logger: false, database: testDb, spawnFn });
    const baseUrl = await startServer(server);

    const response = await fetch(`${baseUrl}/chat/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:4900',
      },
      body: JSON.stringify({ content: 'Hello', clientRequestId: 'cors-1' }),
    });

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://127.0.0.1:4900',
    );
    expect(response.headers.get('vary')).toContain('Origin');

    const events = await readRunStream(response);
    expect(events.at(-1)?.type).toBe('done');
  });
});
