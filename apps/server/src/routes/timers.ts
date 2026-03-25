import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { Database } from '../services/thread.js';
import {
  listBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  type CreateBucketInput,
  type UpdateBucketInput,
} from '../services/timer-bucket.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface for the scheduler — routes only need cancelCompletion. */
export interface TimerSchedulerLike {
  cancelCompletion(bucketId: string): void;
}

export interface TimerRoutesOptions {
  database?: Database;
  scheduler?: TimerSchedulerLike;
}

/** SSE event names broadcast by the timer system. */
export const SSE_EVENTS = {
  TIMER_STARTED: 'timer-started',
  TIMER_STOPPED: 'timer-stopped',
  TIMER_COMPLETED: 'timer-completed',
  TIMER_RESET: 'timer-reset',
  TIMER_UPDATED: 'timer-updated',
  DAILY_RESET: 'daily-reset',
} as const;

type SSEEventName = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];

/** Interval between SSE heartbeat pings (ms). Keeps connections alive
 *  through proxies and detects silently-dropped TCP connections. */
const HEARTBEAT_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// SSE client management
// ---------------------------------------------------------------------------

interface SSEClient {
  response: ServerResponse;
  heartbeat: ReturnType<typeof setInterval>;
}

/** Connected SSE clients, keyed by a unique client ID. */
const sseClients = new Map<string, SSEClient>();

/**
 * Broadcast a Server-Sent Event to all connected clients.
 * Follows the SSE protocol: `event: <name>\ndata: <json>\n\n`
 *
 * Exported so the TimerScheduler can broadcast completion and reset events.
 */
export function broadcast(event: SSEEventName, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const dead: string[] = [];
  for (const [clientId, client] of sseClients) {
    try {
      client.response.write(payload);
    } catch {
      dead.push(clientId);
    }
  }

  // Clean up dead clients after iteration to avoid modifying the Map mid-loop
  for (const id of dead) {
    removeClient(id);
  }
}

/** Number of currently connected SSE clients (exposed for testing). */
export function getConnectedClientCount(): number {
  return sseClients.size;
}

/** Clear all SSE clients and their heartbeat intervals. Used in tests. */
export function _resetSSEClients(): void {
  for (const client of sseClients.values()) {
    clearInterval(client.heartbeat);
  }
  sseClients.clear();
}

/** Remove a single client and clean up its heartbeat interval. */
function removeClient(clientId: string): void {
  const client = sseClients.get(clientId);
  if (client) {
    clearInterval(client.heartbeat);
    sseClients.delete(clientId);
  }
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

/** Fastify plugin that registers timer routes (SSE + REST). */
export async function timerRoutes(
  server: FastifyInstance,
  opts: TimerRoutesOptions,
) {
  const db = opts.database;
  const scheduler = opts.scheduler;
  /**
   * SSE endpoint — clients connect here to receive real-time timer events.
   * Sends an initial `:ok` comment as a connection confirmation.
   */
  server.get('/timers/events', (request, reply) => {
    const clientId = crypto.randomUUID();
    const raw = reply.raw;

    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    raw.write(':ok\n\n');

    // Heartbeat keeps the connection alive through proxies and detects
    // silently-dropped TCP connections (write throws on dead sockets).
    const heartbeat = setInterval(() => {
      try {
        raw.write(':ping\n\n');
      } catch {
        removeClient(clientId);
      }
    }, HEARTBEAT_INTERVAL_MS);

    sseClients.set(clientId, { response: raw, heartbeat });

    request.raw.on('close', () => {
      removeClient(clientId);
    });

    // Prevent Fastify from sending its own response — we're streaming
    reply.hijack();
  });

  // -------------------------------------------------------------------------
  // Bucket CRUD routes
  // -------------------------------------------------------------------------

  server.get('/timers/buckets', async () => {
    const buckets = await listBuckets(db);
    return { buckets };
  });

  server.post<{ Body: CreateBucketInput }>(
    '/timers/buckets',
    async (request, reply) => {
      const { name, totalMinutes, colorIndex, daysOfWeek } = request.body;
      const bucket = await createBucket(
        { name, totalMinutes, colorIndex, daysOfWeek },
        db,
      );
      return reply.status(201).send({ bucket });
    },
  );

  server.patch<{ Params: { id: string }; Body: UpdateBucketInput }>(
    '/timers/buckets/:id',
    async (request, reply) => {
      const { id } = request.params;
      const bucket = await updateBucket(id, request.body, db);
      if (!bucket) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }
      return { bucket };
    },
  );

  server.delete<{ Params: { id: string } }>(
    '/timers/buckets/:id',
    async (request, reply) => {
      const { id } = request.params;
      const deleted = await deleteBucket(id, db);
      if (!deleted) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }
      scheduler?.cancelCompletion(id);
      return reply.status(200).send({ success: true });
    },
  );
}
