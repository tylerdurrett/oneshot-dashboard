import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { config, isAllowedOrigin } from '../config.js';
import type { Database } from '../services/thread.js';
import {
  listBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  getBucket,
  type CreateBucketInput,
  type UpdateBucketInput,
} from '../services/timer-bucket.js';
import {
  getTodayState,
  startTimer,
  stopTimer,
  resetProgress,
  setElapsedTime,
  computeGoalMs,
  dismissBucket,
} from '../services/timer-progress.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface so routes can schedule/cancel goal-reached jobs
 *  without depending on the full TimerScheduler class. */
export interface TimerSchedulerLike {
  scheduleGoalReached(bucketId: string, goalAtMs: number): void;
  cancelGoalJob(bucketId: string): void;
}

export interface TimerRoutesOptions {
  database?: Database;
  scheduler?: TimerSchedulerLike;
}

/** SSE event names broadcast by the timer system. */
export const SSE_EVENTS = {
  TIMER_STARTED: 'timer-started',
  TIMER_STOPPED: 'timer-stopped',
  TIMER_GOAL_REACHED: 'timer-goal-reached',
  TIMER_RESET: 'timer-reset',
  TIMER_UPDATED: 'timer-updated',
  TIMER_DISMISSED: 'timer-dismissed',
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
 * Exported so the TimerScheduler can broadcast goal-reached and reset events.
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

    // reply.hijack() bypasses Fastify's response pipeline, so @fastify/cors
    // never injects headers. We must set the CORS origin manually, applying
    // the same port check the main CORS callback uses.
    const reqOrigin = request.headers.origin;
    const allowedOrigin =
      reqOrigin && isAllowedOrigin(reqOrigin)
        ? reqOrigin
        : `http://localhost:${config.webPort}`;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': allowedOrigin,
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
      scheduler?.cancelGoalJob(id);
      return reply.status(200).send({ success: true });
    },
  );

  // -------------------------------------------------------------------------
  // Timer control routes
  // -------------------------------------------------------------------------

  /** Returns all buckets with today's merged progress. */
  server.get('/timers/today', async () => {
    return getTodayState(db);
  });

  /** Start a timer. Enforces single-active: stops any other running timer. */
  server.post<{ Params: { id: string } }>(
    '/timers/buckets/:id/start',
    async (request, reply) => {
      const { id } = request.params;

      const bucket = await getBucket(id, db);
      if (!bucket) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }

      const now = new Date();
      const result = await startTimer(id, db, now);

      // Cancel goal job for the previously-running timer (if any)
      if (result.stoppedBucketId) {
        scheduler?.cancelGoalJob(result.stoppedBucketId);
        broadcast(SSE_EVENTS.TIMER_STOPPED, {
          bucketId: result.stoppedBucketId,
        });
      }

      // Schedule goal-reached for the newly-started timer
      const goalAtMs = await computeGoalMs(id, db, now);
      if (goalAtMs) {
        scheduler?.scheduleGoalReached(id, goalAtMs);
      }

      broadcast(SSE_EVENTS.TIMER_STARTED, {
        bucketId: result.bucketId,
        startedAt: result.startedAt,
      });

      return result;
    },
  );

  /** Stop a running timer. Accumulates elapsed time. */
  server.post<{ Params: { id: string } }>(
    '/timers/buckets/:id/stop',
    async (request) => {
      const { id } = request.params;
      const result = await stopTimer(id, db);

      if (result.changed) {
        scheduler?.cancelGoalJob(id);
        broadcast(SSE_EVENTS.TIMER_STOPPED, { bucketId: id });
        // Goal-reached is only fired while the timer is running (by the
        // scheduler). Stopping a timer does NOT trigger goal-reached.
      }

      return {
        elapsedSeconds: result.elapsedSeconds ?? 0,
        goalReachedAt: result.goalReachedAt ?? null,
      };
    },
  );

  /** Reset a bucket's progress for today — zero elapsed, clear goal state. */
  server.post<{ Params: { id: string } }>(
    '/timers/buckets/:id/reset',
    async (request) => {
      const { id } = request.params;
      await resetProgress(id, db);
      scheduler?.cancelGoalJob(id);
      broadcast(SSE_EVENTS.TIMER_RESET, { bucketId: id });
      return { success: true };
    },
  );

  /** Set elapsed time for a bucket. Reschedules goal if running. */
  server.post<{ Params: { id: string }; Body: { elapsedSeconds: number } }>(
    '/timers/buckets/:id/set-time',
    async (request, reply) => {
      const { id } = request.params;
      const { elapsedSeconds } = request.body;

      let result;
      try {
        result = await setElapsedTime(id, elapsedSeconds, db);
      } catch (err) {
        if (err instanceof Error && err.message.includes('Bucket not found')) {
          return reply.status(404).send({ error: 'Bucket not found' });
        }
        throw err;
      }

      // Reschedule goal if the timer is currently running
      const goalAtMs = await computeGoalMs(id, db);
      if (goalAtMs) {
        scheduler?.scheduleGoalReached(id, goalAtMs);
      } else {
        scheduler?.cancelGoalJob(id);
      }

      broadcast(SSE_EVENTS.TIMER_UPDATED, {
        bucketId: id,
        elapsedSeconds: result.elapsedSeconds,
        goalReachedAt: result.goalReachedAt,
      });

      return {
        elapsedSeconds: result.elapsedSeconds,
        goalReachedAt: result.goalReachedAt,
      };
    },
  );

  /** Dismiss a bucket for today — hides it until the next 3 AM reset. */
  server.post<{ Params: { id: string } }>(
    '/timers/buckets/:id/dismiss',
    async (request, reply) => {
      const { id } = request.params;

      const bucket = await getBucket(id, db);
      if (!bucket) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }

      const result = await dismissBucket(id, db);

      // If the bucket was running, stop the goal job and notify clients.
      if (result.wasStopped) {
        scheduler?.cancelGoalJob(id);
        broadcast(SSE_EVENTS.TIMER_STOPPED, { bucketId: id });
      }

      broadcast(SSE_EVENTS.TIMER_DISMISSED, { bucketId: id });

      return { success: true, dismissedAt: result.dismissedAt };
    },
  );
}
