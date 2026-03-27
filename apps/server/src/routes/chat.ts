import type { FastifyInstance, FastifyReply } from 'fastify';
import { config, isAllowedOrigin } from '../config.js';
import {
  addMessage,
  createThread,
  getThread,
  getThreadMessages,
  updateThreadSessionId,
  updateThreadTitle,
  type Database,
} from '../services/thread.js';
import {
  invokeClaude,
  prepareSandboxForPrompt,
  type SpawnFn,
  type ClaudeResult,
} from '../services/sandbox.js';
import {
  ChatRunRegistry,
  type ChatRunError,
  type ChatRunRecord,
  type ChatRunSnapshot,
} from '../services/chat-run.js';

export interface ChatRoutesOptions {
  database?: Database;
  spawnFn?: SpawnFn;
}

interface ChatRunBody {
  threadId?: string;
  content?: string;
  clientRequestId?: string;
}

type ChatRunEvent =
  | {
      type: 'ready';
      runId: string;
      threadId: string;
      createdThread: boolean;
      userMessageId: string;
    }
  | { type: 'token'; text: string }
  | { type: 'done'; assistantMessageId: string; sessionId: string }
  | { type: 'error'; code: string; message: string };

const runRegistry = new ChatRunRegistry();

/**
 * Generate a thread title from the user's first message.
 * Takes the first 60 characters, trimmed to the last word boundary.
 */
export function generateTitle(content: string): string {
  const trimmed = content.trim();

  if (trimmed.length <= 60) {
    return trimmed;
  }

  const truncated = trimmed.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

function toRunSnapshot(run: ChatRunSnapshot) {
  return {
    runId: run.runId,
    threadId: run.threadId,
    status: run.status,
    accepted: run.accepted,
    completed: run.completed,
    createdThread: run.createdThread,
    userMessageId: run.userMessageId,
    assistantPreview: run.assistantPreview,
    assistantMessageId: run.assistantMessageId,
    error: run.error,
  };
}

function sendConflict(reply: FastifyReply, run: ChatRunRecord, code: string) {
  return reply.status(409).send({
    code,
    ...toRunSnapshot({ ...run }),
  });
}

function getAllowedOrigin(origin: string | undefined): string {
  if (origin && isAllowedOrigin(origin)) {
    return origin;
  }

  return `http://localhost:${config.webPort}`;
}

/** Send a single NDJSON event to the client. Returns false once the stream is gone. */
function writeEvent(
  reply: FastifyReply,
  streamState: { closed: boolean },
  event: ChatRunEvent,
): boolean {
  if (streamState.closed || reply.raw.writableEnded || reply.raw.destroyed) {
    return false;
  }

  try {
    reply.raw.write(`${JSON.stringify(event)}\n`);
    return true;
  } catch {
    streamState.closed = true;
    return false;
  }
}

/** Close the stream when it is still open. */
function endStream(
  reply: FastifyReply,
  streamState: { closed: boolean },
): void {
  if (streamState.closed || reply.raw.writableEnded || reply.raw.destroyed) {
    return;
  }

  try {
    reply.raw.end();
  } catch {
    streamState.closed = true;
  }
}

function buildUserFacingRunError(code: string): ChatRunError {
  switch (code) {
    case 'auth_unavailable':
      return {
        code,
        message: 'The host could not load the chat login. Run `pnpm sandbox` on the host if this keeps happening.',
      };
    case 'sandbox_unavailable':
      return {
        code,
        message: 'The chat agent sandbox is offline on the host.',
      };
    case 'host_refresh_failed':
      return {
        code,
        message: 'The host could not refresh the chat login.',
      };
    case 'verification_failed':
      return {
        code,
        message: 'The chat agent could not verify its login after refresh.',
      };
    default:
      return {
        code,
        message: 'The chat response could not be completed.',
      };
  }
}

async function maybeUpdateThreadTitle(
  threadId: string,
  content: string,
  db: Database | undefined,
): Promise<void> {
  const existingMessages = await getThreadMessages(threadId, db);
  if (existingMessages.length === 1) {
    const title = generateTitle(content);
    await updateThreadTitle(threadId, title, db);
  }
}

async function processChatRun(
  run: ChatRunRecord,
  body: { threadId?: string; content: string },
  db: Database | undefined,
  spawnFn: SpawnFn | undefined,
  reply: FastifyReply,
  streamState: { closed: boolean },
): Promise<void> {
  const finishFailure = (error: ChatRunError, keepRun: boolean) => {
    runRegistry.fail(run.runId, error);
    writeEvent(reply, streamState, { type: 'error', code: error.code, message: error.message });
    if (!keepRun) {
      runRegistry.remove(run.runId);
    }
    endStream(reply, streamState);
  };

  const readiness = await prepareSandboxForPrompt(spawnFn);
  if (!readiness.ok) {
    finishFailure(buildUserFacingRunError(readiness.code), false);
    return;
  }

  if (streamState.closed && !run.accepted) {
    runRegistry.remove(run.runId);
    endStream(reply, streamState);
    return;
  }

  let thread = body.threadId ? await getThread(body.threadId, db) : null;
  if (body.threadId && !thread) {
    runRegistry.remove(run.runId);
    endStream(reply, streamState);
    return;
  }

  if (!thread) {
    thread = await createThread('New conversation', db);
    runRegistry.updateThread(run.runId, thread.id, true);
    if (!runRegistry.claimThread(thread.id, run.runId)) {
      runRegistry.remove(run.runId);
      endStream(reply, streamState);
      return;
    }
  }

  const userMessage = await addMessage(thread.id, 'user', body.content, db);
  await maybeUpdateThreadTitle(thread.id, body.content, db);
  runRegistry.markAccepted(run.runId, userMessage.id);

  // Mark acceptance only after the user message exists so reconnects can
  // safely reattach to the same run instead of creating duplicates.
  writeEvent(reply, streamState, {
    type: 'ready',
    runId: run.runId,
    threadId: thread.id,
    createdThread: run.createdThread,
    userMessageId: userMessage.id,
  });

  const emitter = invokeClaude({
    prompt: body.content,
    sessionId: thread.claudeSessionId ?? undefined,
    spawnFn,
  });
  let settled = false;
  let resultInFlight = false;

  emitter.on('text', (text: string) => {
    runRegistry.appendPreview(run.runId, text);
    writeEvent(reply, streamState, { type: 'token', text });
  });

  emitter.on('result', async (result: ClaudeResult) => {
    if (settled) return;
    resultInFlight = true;
    try {
      const assistantMessage = await addMessage(
        thread.id,
        'assistant',
        result.result,
        db,
      );
      await updateThreadSessionId(thread.id, result.sessionId, db);
      runRegistry.complete(run.runId, assistantMessage.id, result.sessionId);
      writeEvent(reply, streamState, {
        type: 'done',
        assistantMessageId: assistantMessage.id,
        sessionId: result.sessionId,
      });
    } catch {
      const error = buildUserFacingRunError('invocation_failed');
      runRegistry.fail(run.runId, error);
      writeEvent(reply, streamState, {
        type: 'error',
        code: error.code,
        message: error.message,
      });
    } finally {
      settled = true;
      resultInFlight = false;
      endStream(reply, streamState);
    }
  });

  emitter.on('error', (err: Error) => {
    if (settled) return;
    void err;
    const error = buildUserFacingRunError('invocation_failed');
    runRegistry.fail(run.runId, error);
    writeEvent(reply, streamState, {
      type: 'error',
      code: error.code,
      message: error.message,
    });
    settled = true;
    endStream(reply, streamState);
  });

  emitter.on('close', () => {
    if (!settled && !resultInFlight) {
      endStream(reply, streamState);
    }
  });
}

/** Fastify plugin that registers request-scoped chat routes. */
export async function chatRoutes(
  server: FastifyInstance,
  opts: ChatRoutesOptions,
) {
  const db = opts.database;
  const spawnFn = opts.spawnFn;

  server.get<{ Params: { runId: string } }>(
    '/chat/runs/:runId',
    async (request, reply) => {
      const run = runRegistry.snapshot(request.params.runId);
      if (!run) {
        return reply.status(404).send({ error: 'Run not found' });
      }

      return toRunSnapshot(run);
    },
  );

  server.post<{ Body: ChatRunBody }>(
    '/chat/runs',
    async (request, reply) => {
      const threadId = request.body?.threadId?.trim();
      const content = request.body?.content?.trim();
      const clientRequestId = request.body?.clientRequestId?.trim();

      if (!content || !clientRequestId) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const existingByRequest = runRegistry.getByClientRequestId(clientRequestId);
      if (existingByRequest) {
        return sendConflict(reply, existingByRequest, 'run_exists');
      }

      if (threadId) {
        const existingThread = await getThread(threadId, db);
        if (!existingThread) {
          return reply.status(404).send({ error: 'Thread not found' });
        }

        const activeRunId = runRegistry.getActiveRunIdForThread(threadId);
        if (activeRunId) {
          const activeRun = runRegistry.getByRunId(activeRunId);
          if (activeRun) {
            return sendConflict(reply, activeRun, 'thread_busy');
          }
        }
      }

      const run = runRegistry.createPending(clientRequestId, threadId ?? null);
      if (threadId && !runRegistry.claimThread(threadId, run.runId)) {
        const activeRun = runRegistry.getByRunId(
          runRegistry.getActiveRunIdForThread(threadId)!,
        );
        runRegistry.remove(run.runId);
        if (activeRun) {
          return sendConflict(reply, activeRun, 'thread_busy');
        }
        return reply.status(409).send({ code: 'thread_busy' });
      }

      const allowedOrigin = getAllowedOrigin(request.headers.origin);

      // reply.hijack() skips Fastify's normal response pipeline, so we must
      // write CORS headers here or browser fetch treats the stream as failed.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': allowedOrigin,
        Vary: 'Origin',
      });

      const streamState = { closed: false };
      reply.raw.on('close', () => {
        streamState.closed = true;
      });

      void processChatRun(
        run,
        { threadId, content },
        db,
        spawnFn,
        reply,
        streamState,
      ).catch((err) => {
        server.log.error(err);
        const error = buildUserFacingRunError('invocation_failed');
        runRegistry.fail(run.runId, error);
        writeEvent(reply, streamState, {
          type: 'error',
          code: error.code,
          message: error.message,
        });
        endStream(reply, streamState);
      });
    },
  );
}
