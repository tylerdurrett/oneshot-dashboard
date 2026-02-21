import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  getThread,
  getThreadMessages,
  addMessage,
  updateThreadSessionId,
  updateThreadTitle,
  type Database,
} from '../services/thread.js';
import {
  invokeClaude,
  type SpawnFn,
  type ClaudeResult,
  type InvokeClaudeOptions,
} from '../services/sandbox.js';

export interface ChatRoutesOptions {
  database?: Database;
  spawnFn?: SpawnFn;
}

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

  // Single long word with no spaces — just truncate
  return truncated + '...';
}

/** Send a JSON message to the WebSocket client. Silently ignores closed sockets. */
function sendJSON(socket: WebSocket, data: Record<string, unknown>): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

/** Send an error message to the WebSocket client. */
function sendError(socket: WebSocket, message: string): void {
  sendJSON(socket, { type: 'error', message });
}

/** Handle a single chat message: persist, invoke Claude, stream response. */
async function handleChatMessage(
  socket: WebSocket,
  threadId: string,
  content: string,
  db: Database | undefined,
  spawnFn: SpawnFn | undefined,
  setStreaming: (v: boolean) => void,
): Promise<void> {
  // Step 1: Validate threadId exists
  const thread = await getThread(threadId, db);
  if (!thread) {
    sendError(socket, 'Thread not found');
    return;
  }

  // Step 2: Persist the user message
  await addMessage(threadId, 'user', content, db);

  // Step 3: Auto-generate title on first message
  const existingMessages = await getThreadMessages(threadId, db);
  if (existingMessages.length === 1) {
    const title = generateTitle(content);
    await updateThreadTitle(threadId, title, db);
  }

  // Step 4: Look up claudeSessionId
  const sessionId = thread.claudeSessionId ?? undefined;

  // Step 5: Set streaming lock and invoke Claude
  setStreaming(true);

  const invokeOpts: InvokeClaudeOptions = { prompt: content, sessionId };
  if (spawnFn) invokeOpts.spawnFn = spawnFn;

  const emitter = invokeClaude(invokeOpts);
  let resultReceived = false;

  // Forward text tokens to client
  emitter.on('text', (text: string) => {
    sendJSON(socket, { type: 'token', text });
  });

  // On result: persist assistant message, update session ID, send done
  emitter.on('result', async (result: ClaudeResult) => {
    resultReceived = true;
    const assistantMessage = await addMessage(
      threadId,
      'assistant',
      result.result,
      db,
    );
    await updateThreadSessionId(threadId, result.sessionId, db);
    sendJSON(socket, { type: 'done', messageId: assistantMessage.id });
    setStreaming(false);
  });

  // On error: send error to client, release lock
  emitter.on('error', (err: Error) => {
    sendError(socket, err.message);
    setStreaming(false);
  });

  // Safety net: release lock if close fires without result or error
  emitter.on('close', () => {
    if (!resultReceived) {
      setStreaming(false);
    }
  });
}

/** Fastify plugin that registers the /chat WebSocket route. */
export async function chatRoutes(
  server: FastifyInstance,
  opts: ChatRoutesOptions,
) {
  const db = opts.database;
  const spawnFn = opts.spawnFn;

  server.get('/chat', { websocket: true }, (socket: WebSocket) => {
    let streaming = false;

    socket.on('message', async (raw: Buffer) => {
      // Ignore messages while streaming
      if (streaming) return;

      try {
        let msg: { type?: string; threadId?: string; content?: string };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          sendError(socket, 'Invalid JSON');
          return;
        }

        if (msg.type !== 'message' || !msg.threadId || !msg.content) {
          sendError(socket, 'Invalid message format');
          return;
        }

        await handleChatMessage(
          socket,
          msg.threadId,
          msg.content,
          db,
          spawnFn,
          (v: boolean) => {
            streaming = v;
          },
        );
      } catch (err) {
        sendError(
          socket,
          err instanceof Error ? err.message : 'Internal server error',
        );
        streaming = false;
      }
    });
  });
}
