import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { timerDailyProgress } from '@repo/db';
import {
  timerRoutes,
  broadcast,
  getConnectedClientCount,
  _resetSSEClients,
  SSE_EVENTS,
  type TimerSchedulerLike,
} from '../routes/timers.js';
import { createTimerTestDb, seedBucket } from './timer-test-helpers.js';
import { getResetDate } from '../services/timer-progress.js';
import type { Database } from '../services/thread.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Fastify server with timer routes registered. */
function buildTimerTestServer(
  database?: Database,
  scheduler?: TimerSchedulerLike,
) {
  const server = Fastify({ logger: false });
  server.register(cors, { origin: true });
  server.register(timerRoutes, { database, scheduler });
  return server;
}

/** Connect to the SSE endpoint and collect received data chunks. */
function connectSSE(
  port: number,
): Promise<{ chunks: string[]; response: http.IncomingMessage; destroy: () => void }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/timers/events`, (res) => {
      const chunks: string[] = [];
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => chunks.push(chunk));
      resolve({
        chunks,
        response: res,
        destroy: () => {
          res.destroy();
          req.destroy();
        },
      });
    });
    req.on('error', reject);
  });
}

/** Wait for a condition to become true, polling every 10ms. */
async function waitFor(
  fn: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SSE infrastructure', () => {
  let server: ReturnType<typeof buildTimerTestServer>;
  let port: number;

  beforeEach(async () => {
    _resetSSEClients();
    server = buildTimerTestServer();
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    port = Number(new URL(address).port);
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /timers/events', () => {
    it('responds with correct SSE headers', async () => {
      const client = await connectSSE(port);
      try {
        expect(client.response.headers['content-type']).toBe(
          'text/event-stream',
        );
        expect(client.response.headers['cache-control']).toBe('no-cache');
        expect(client.response.headers['connection']).toBe('keep-alive');
      } finally {
        client.destroy();
      }
    });

    it('sends initial :ok comment on connection', async () => {
      const client = await connectSSE(port);
      try {
        // Wait for the initial chunk to arrive
        await waitFor(() => client.chunks.length > 0);
        expect(client.chunks[0]).toBe(':ok\n\n');
      } finally {
        client.destroy();
      }
    });

    it('tracks connected clients', async () => {
      expect(getConnectedClientCount()).toBe(0);

      const client1 = await connectSSE(port);
      await waitFor(() => getConnectedClientCount() === 1);
      expect(getConnectedClientCount()).toBe(1);

      const client2 = await connectSSE(port);
      await waitFor(() => getConnectedClientCount() === 2);
      expect(getConnectedClientCount()).toBe(2);

      client1.destroy();
      client2.destroy();
    });

    it('removes client from map on disconnect', async () => {
      const client = await connectSSE(port);
      await waitFor(() => getConnectedClientCount() === 1);

      client.destroy();

      // Wait for the server to process the close event
      await waitFor(() => getConnectedClientCount() === 0);
      expect(getConnectedClientCount()).toBe(0);
    });
  });

  describe('broadcast()', () => {
    it('sends formatted SSE events to all connected clients', async () => {
      const client1 = await connectSSE(port);
      const client2 = await connectSSE(port);

      try {
        await waitFor(() => getConnectedClientCount() === 2);

        broadcast(SSE_EVENTS.TIMER_STARTED, {
          bucketId: 'abc-123',
          startedAt: '2026-03-24T10:00:00.000Z',
        });

        // Wait for both clients to receive the broadcast (initial :ok + broadcast)
        await waitFor(() => client1.chunks.length >= 2);
        await waitFor(() => client2.chunks.length >= 2);

        const expected =
          'event: timer-started\ndata: {"bucketId":"abc-123","startedAt":"2026-03-24T10:00:00.000Z"}\n\n';
        expect(client1.chunks[1]).toBe(expected);
        expect(client2.chunks[1]).toBe(expected);
      } finally {
        client1.destroy();
        client2.destroy();
      }
    });

    it('handles broadcast with no connected clients without error', () => {
      // Should not throw when no clients are connected
      expect(() =>
        broadcast(SSE_EVENTS.DAILY_RESET, {}),
      ).not.toThrow();
    });

    it('sends multiple events in sequence', async () => {
      const client = await connectSSE(port);

      try {
        await waitFor(() => getConnectedClientCount() === 1);

        broadcast(SSE_EVENTS.TIMER_STARTED, { bucketId: 'a' });
        broadcast(SSE_EVENTS.TIMER_STOPPED, { bucketId: 'a' });

        await waitFor(() => client.chunks.length >= 3);

        expect(client.chunks[1]).toContain('event: timer-started');
        expect(client.chunks[1]).toContain('"bucketId":"a"');

        // The stop event may arrive in the same chunk or a separate one
        const allData = client.chunks.slice(1).join('');
        expect(allData).toContain('event: timer-stopped');
        expect(allData).toContain('"bucketId":"a"');
      } finally {
        client.destroy();
      }
    });
  });

  describe('SSE_EVENTS', () => {
    it('exports all expected event names', () => {
      expect(SSE_EVENTS.TIMER_STARTED).toBe('timer-started');
      expect(SSE_EVENTS.TIMER_STOPPED).toBe('timer-stopped');
      expect(SSE_EVENTS.TIMER_GOAL_REACHED).toBe('timer-goal-reached');
      expect(SSE_EVENTS.TIMER_RESET).toBe('timer-reset');
      expect(SSE_EVENTS.TIMER_UPDATED).toBe('timer-updated');
      expect(SSE_EVENTS.DAILY_RESET).toBe('daily-reset');
    });
  });
});

// ---------------------------------------------------------------------------
// Bucket CRUD route tests
// ---------------------------------------------------------------------------

describe('Bucket CRUD routes', () => {
  let testDb: Database;
  let server: ReturnType<typeof buildTimerTestServer>;

  beforeEach(async () => {
    testDb = await createTimerTestDb();
    server = buildTimerTestServer(testDb);
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /timers/buckets', () => {
    it('returns an empty array when no buckets exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/timers/buckets',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ buckets: [] });
    });

    it('returns buckets sorted by sortOrder', async () => {
      await seedBucket(testDb, { name: 'Second', sortOrder: 1 });
      await seedBucket(testDb, { name: 'First', sortOrder: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/timers/buckets',
      });

      const body = response.json();
      expect(body.buckets).toHaveLength(2);
      expect(body.buckets[0].name).toBe('First');
      expect(body.buckets[1].name).toBe('Second');
    });

    it('returns daysOfWeek as number array', async () => {
      await seedBucket(testDb, { daysOfWeek: [1, 3, 5] });

      const response = await server.inject({
        method: 'GET',
        url: '/timers/buckets',
      });

      const body = response.json();
      expect(body.buckets[0].daysOfWeek).toEqual([1, 3, 5]);
    });
  });

  describe('POST /timers/buckets', () => {
    it('creates a bucket and returns 201', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/timers/buckets',
        payload: {
          name: 'Study',
          totalMinutes: 120,
          colorIndex: 2,
          daysOfWeek: [1, 2, 3, 4, 5],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.bucket.name).toBe('Study');
      expect(body.bucket.totalMinutes).toBe(120);
      expect(body.bucket.colorIndex).toBe(2);
      expect(body.bucket.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
      expect(body.bucket.id).toBeDefined();
    });

    it('created bucket appears in list', async () => {
      await server.inject({
        method: 'POST',
        url: '/timers/buckets',
        payload: {
          name: 'Reading',
          totalMinutes: 30,
          colorIndex: 0,
          daysOfWeek: [0, 6],
        },
      });

      const listRes = await server.inject({
        method: 'GET',
        url: '/timers/buckets',
      });

      expect(listRes.json().buckets).toHaveLength(1);
      expect(listRes.json().buckets[0].name).toBe('Reading');
    });
  });

  describe('PATCH /timers/buckets/:id', () => {
    it('updates a bucket and returns the updated bucket', async () => {
      const bucket = await seedBucket(testDb, { name: 'Old Name' });

      const response = await server.inject({
        method: 'PATCH',
        url: `/timers/buckets/${bucket.id}`,
        payload: { name: 'New Name', totalMinutes: 90 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.bucket.name).toBe('New Name');
      expect(body.bucket.totalMinutes).toBe(90);
    });

    it('returns 404 for nonexistent bucket', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/timers/buckets/nonexistent',
        payload: { name: 'Nope' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Bucket not found' });
    });

    it('partial update only changes specified fields', async () => {
      const bucket = await seedBucket(testDb, {
        name: 'Keep This',
        totalMinutes: 60,
        colorIndex: 1,
      });

      const response = await server.inject({
        method: 'PATCH',
        url: `/timers/buckets/${bucket.id}`,
        payload: { colorIndex: 3 },
      });

      const body = response.json();
      expect(body.bucket.name).toBe('Keep This');
      expect(body.bucket.totalMinutes).toBe(60);
      expect(body.bucket.colorIndex).toBe(3);
    });
  });

  describe('DELETE /timers/buckets/:id', () => {
    it('deletes a bucket and returns success', async () => {
      const bucket = await seedBucket(testDb);

      const response = await server.inject({
        method: 'DELETE',
        url: `/timers/buckets/${bucket.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Verify it's gone
      const listRes = await server.inject({
        method: 'GET',
        url: '/timers/buckets',
      });
      expect(listRes.json().buckets).toHaveLength(0);
    });

    it('returns 404 for nonexistent bucket', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/timers/buckets/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Bucket not found' });
    });

    it('cancels scheduled goal job on delete', async () => {
      const mockScheduler = createMockScheduler();
      // Scheduler tests need their own server instance with the mock injected
      const schedulerServer = buildTimerTestServer(testDb, mockScheduler);
      const bucket = await seedBucket(testDb);

      await schedulerServer.inject({
        method: 'DELETE',
        url: `/timers/buckets/${bucket.id}`,
      });

      expect(mockScheduler.cancelGoalJob).toHaveBeenCalledWith(bucket.id);

      await schedulerServer.close();
    });

    it('does not call scheduler.cancelGoalJob on 404', async () => {
      const mockScheduler = createMockScheduler();
      const schedulerServer = buildTimerTestServer(testDb, mockScheduler);

      await schedulerServer.inject({
        method: 'DELETE',
        url: '/timers/buckets/nonexistent',
      });

      expect(mockScheduler.cancelGoalJob).not.toHaveBeenCalled();

      await schedulerServer.close();
    });
  });
});

// ---------------------------------------------------------------------------
// Timer control route tests
// ---------------------------------------------------------------------------

/** Helper: create a mock scheduler with both methods as vi.fn(). */
function createMockScheduler(): TimerSchedulerLike & {
  scheduleGoalReached: ReturnType<typeof vi.fn>;
  cancelGoalJob: ReturnType<typeof vi.fn>;
} {
  return {
    scheduleGoalReached: vi.fn(),
    cancelGoalJob: vi.fn(),
  };
}

/** Helper: insert a progress row directly for test setup. */
async function insertProgress(
  db: Database,
  bucketId: string,
  overrides: {
    date?: string;
    elapsedSeconds?: number;
    startedAt?: string | null;
    goalReachedAt?: string | null;
  } = {},
) {
  await db.insert(timerDailyProgress).values({
    id: crypto.randomUUID(),
    bucketId,
    date: overrides.date ?? getResetDate(),
    elapsedSeconds: overrides.elapsedSeconds ?? 0,
    startedAt: overrides.startedAt ?? null,
    goalReachedAt: overrides.goalReachedAt ?? null,
  });
}

describe('Timer control routes', () => {
  let testDb: Database;
  let server: ReturnType<typeof buildTimerTestServer>;
  let mockScheduler: ReturnType<typeof createMockScheduler>;

  beforeEach(async () => {
    testDb = await createTimerTestDb();
    mockScheduler = createMockScheduler();
    server = buildTimerTestServer(testDb, mockScheduler);
  });

  afterEach(async () => {
    await server.close();
  });

  // -------------------------------------------------------------------------
  // GET /timers/today
  // -------------------------------------------------------------------------

  describe('GET /timers/today', () => {
    it('returns all buckets with merged progress for today', async () => {
      const bucketA = await seedBucket(testDb, { name: 'A', totalMinutes: 60 });
      const bucketB = await seedBucket(testDb, { name: 'B', totalMinutes: 120 });
      await insertProgress(testDb, bucketA.id, { elapsedSeconds: 300 });

      const res = await server.inject({ method: 'GET', url: '/timers/today' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.date).toBe(getResetDate());
      expect(body.buckets).toHaveLength(2);

      const a = body.buckets.find((b: { id: string }) => b.id === bucketA.id);
      const b = body.buckets.find((b: { id: string }) => b.id === bucketB.id);
      expect(a.elapsedSeconds).toBe(300);
      expect(a.startedAt).toBeNull();
      expect(b.elapsedSeconds).toBe(0);
    });

    it('returns empty buckets array when no buckets exist', async () => {
      const res = await server.inject({ method: 'GET', url: '/timers/today' });
      expect(res.statusCode).toBe(200);
      expect(res.json().buckets).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // POST /timers/buckets/:id/start
  // -------------------------------------------------------------------------

  describe('POST /timers/buckets/:id/start', () => {
    it('starts a timer and returns result', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.bucketId).toBe(bucket.id);
      expect(body.startedAt).toBeDefined();
      expect(body.stoppedBucketId).toBeNull();
    });

    it('returns 404 for nonexistent bucket', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/timers/buckets/nonexistent/start',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Bucket not found' });
    });

    it('stops the previously running timer', async () => {
      const bucketA = await seedBucket(testDb, { name: 'A', totalMinutes: 60 });
      const bucketB = await seedBucket(testDb, { name: 'B', totalMinutes: 60 });

      // Start A
      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucketA.id}/start`,
      });

      // Start B — should stop A
      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucketB.id}/start`,
      });

      const body = res.json();
      expect(body.stoppedBucketId).toBe(bucketA.id);
    });

    it('calls scheduler.scheduleGoalReached', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      expect(mockScheduler.scheduleGoalReached).toHaveBeenCalledWith(
        bucket.id,
        expect.any(Number),
      );

      // Goal should be ~60 minutes from now
      const goalAtMs = mockScheduler.scheduleGoalReached.mock.calls[0]![1] as number;
      const expectedMs = Date.now() + 60 * 60 * 1000;
      expect(goalAtMs).toBeGreaterThan(expectedMs - 5000);
      expect(goalAtMs).toBeLessThan(expectedMs + 5000);
    });

    it('cancels goal job for previously running timer', async () => {
      const bucketA = await seedBucket(testDb, { name: 'A' });
      const bucketB = await seedBucket(testDb, { name: 'B' });

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucketA.id}/start`,
      });

      mockScheduler.cancelGoalJob.mockClear();

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucketB.id}/start`,
      });

      expect(mockScheduler.cancelGoalJob).toHaveBeenCalledWith(bucketA.id);
    });

    it('schedules correct goal time when bucket has prior elapsed', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });
      // Pre-insert 300 seconds of prior progress
      await insertProgress(testDb, bucket.id, { elapsedSeconds: 300 });

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      const goalAtMs = mockScheduler.scheduleGoalReached.mock.calls[0]![1] as number;
      // Remaining: 3600 - 300 = 3300 seconds
      const expectedMs = Date.now() + 3300 * 1000;
      expect(goalAtMs).toBeGreaterThan(expectedMs - 5000);
      expect(goalAtMs).toBeLessThan(expectedMs + 5000);
    });
  });

  // -------------------------------------------------------------------------
  // POST /timers/buckets/:id/stop
  // -------------------------------------------------------------------------

  describe('POST /timers/buckets/:id/stop', () => {
    it('stops a running timer and returns elapsed', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });
      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/stop`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(body.goalReachedAt).toBeNull();
    });

    it('returns defaults when timer is not running', async () => {
      const bucket = await seedBucket(testDb);

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/stop`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ elapsedSeconds: 0, goalReachedAt: null });
    });

    it('returns goalReachedAt when stopping an over-budget timer', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 1 });
      // Pre-insert a progress row with 59s elapsed and startedAt 2s ago
      const twoSecondsAgo = new Date(Date.now() - 2000).toISOString();
      await insertProgress(testDb, bucket.id, {
        elapsedSeconds: 59,
        startedAt: twoSecondsAgo,
      });

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/stop`,
      });

      const body = res.json();
      // 59 + ~2 = ~61, so stopping should persist goalReachedAt even if the
      // background scheduler did not mark it first.
      expect(body.elapsedSeconds).toBeGreaterThanOrEqual(60);
      expect(body.goalReachedAt).toEqual(expect.any(String));
    });

    it('cancels scheduled goal job on stop', async () => {
      const bucket = await seedBucket(testDb);
      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      mockScheduler.cancelGoalJob.mockClear();

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/stop`,
      });

      expect(mockScheduler.cancelGoalJob).toHaveBeenCalledWith(bucket.id);
    });

    it('does not cancel goal job when timer was not running', async () => {
      const bucket = await seedBucket(testDb);

      mockScheduler.cancelGoalJob.mockClear();

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/stop`,
      });

      expect(mockScheduler.cancelGoalJob).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /timers/buckets/:id/reset
  // -------------------------------------------------------------------------

  describe('POST /timers/buckets/:id/reset', () => {
    it('resets progress and returns success', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });
      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/reset`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      // Verify progress is zeroed via GET /timers/today
      const todayRes = await server.inject({
        method: 'GET',
        url: '/timers/today',
      });
      const b = todayRes.json().buckets.find(
        (x: { id: string }) => x.id === bucket.id,
      );
      expect(b.elapsedSeconds).toBe(0);
      expect(b.startedAt).toBeNull();
      expect(b.goalReachedAt).toBeNull();
    });

    it('cancels goal job on reset', async () => {
      const bucket = await seedBucket(testDb);

      mockScheduler.cancelGoalJob.mockClear();

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/reset`,
      });

      expect(mockScheduler.cancelGoalJob).toHaveBeenCalledWith(bucket.id);
    });
  });

  // -------------------------------------------------------------------------
  // POST /timers/buckets/:id/set-time
  // -------------------------------------------------------------------------

  describe('POST /timers/buckets/:id/set-time', () => {
    it('sets elapsed time correctly', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/set-time`,
        payload: { elapsedSeconds: 1800 },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.elapsedSeconds).toBe(1800);
      // goalReachedAt is always cleared when manually setting time
      expect(body.goalReachedAt).toBeNull();
    });

    it('clears goalReachedAt when elapsed equals total', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });

      const res = await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/set-time`,
        payload: { elapsedSeconds: 3600 },
      });

      const body = res.json();
      expect(body.elapsedSeconds).toBe(3600);
      // Manually setting time always clears goalReachedAt
      expect(body.goalReachedAt).toBeNull();
    });

    it('returns 404 for nonexistent bucket', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/timers/buckets/nonexistent/set-time',
        payload: { elapsedSeconds: 100 },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Bucket not found' });
    });

    it('reschedules goal if timer is running', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });
      // Start the timer first so it's running
      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/start`,
      });

      mockScheduler.scheduleGoalReached.mockClear();

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/set-time`,
        payload: { elapsedSeconds: 2700 },
      });

      // Should reschedule goal for the still-running timer
      expect(mockScheduler.scheduleGoalReached).toHaveBeenCalledWith(
        bucket.id,
        expect.any(Number),
      );
    });

    it('cancels goal job if timer is not running after set-time', async () => {
      const bucket = await seedBucket(testDb, { totalMinutes: 60 });
      // Don't start the timer — just set time on a non-running bucket
      await insertProgress(testDb, bucket.id, { elapsedSeconds: 100 });

      mockScheduler.cancelGoalJob.mockClear();

      await server.inject({
        method: 'POST',
        url: `/timers/buckets/${bucket.id}/set-time`,
        payload: { elapsedSeconds: 500 },
      });

      expect(mockScheduler.cancelGoalJob).toHaveBeenCalledWith(bucket.id);
    });
  });
});

// ---------------------------------------------------------------------------
// SSE broadcast integration tests (routes → SSE clients)
// ---------------------------------------------------------------------------

describe('Timer control SSE broadcasts', () => {
  let testDb: Database;
  let server: ReturnType<typeof buildTimerTestServer>;
  let port: number;

  beforeEach(async () => {
    _resetSSEClients();
    testDb = await createTimerTestDb();
    server = buildTimerTestServer(testDb);
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    port = Number(new URL(address).port);
  });

  afterEach(async () => {
    await server.close();
  });

  /** POST to a route via raw http.request (needed when server.listen is used). */
  function httpPost(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body ?? {});
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () =>
            resolve({ statusCode: res.statusCode ?? 0, body: data }),
          );
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  }

  it('broadcasts timer-started event when a timer is started', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const client = await connectSSE(port);

    try {
      await waitFor(() => getConnectedClientCount() === 1);

      await httpPost(`/timers/buckets/${bucket.id}/start`);

      await waitFor(() => {
        const all = client.chunks.join('');
        return all.includes('event: timer-started');
      });

      const all = client.chunks.join('');
      expect(all).toContain('event: timer-started');
      expect(all).toContain(`"bucketId":"${bucket.id}"`);
    } finally {
      client.destroy();
    }
  });

  it('broadcasts timer-stopped event when a timer is stopped', async () => {
    const bucket = await seedBucket(testDb, { totalMinutes: 60 });
    const client = await connectSSE(port);

    try {
      await waitFor(() => getConnectedClientCount() === 1);

      await httpPost(`/timers/buckets/${bucket.id}/start`);
      await httpPost(`/timers/buckets/${bucket.id}/stop`);

      await waitFor(() => {
        const all = client.chunks.join('');
        return all.includes('event: timer-stopped');
      });

      const all = client.chunks.join('');
      expect(all).toContain('event: timer-stopped');
    } finally {
      client.destroy();
    }
  });

  it('broadcasts timer-stopped for previous timer when starting another', async () => {
    const bucketA = await seedBucket(testDb, { name: 'A', totalMinutes: 60 });
    const bucketB = await seedBucket(testDb, { name: 'B', totalMinutes: 60 });
    const client = await connectSSE(port);

    try {
      await waitFor(() => getConnectedClientCount() === 1);

      await httpPost(`/timers/buckets/${bucketA.id}/start`);
      await httpPost(`/timers/buckets/${bucketB.id}/start`);

      await waitFor(() => {
        const all = client.chunks.join('');
        // Should have timer-stopped for A and timer-started for B
        return (
          all.includes('event: timer-stopped') &&
          all.includes(`"bucketId":"${bucketA.id}"`)
        );
      });

      const all = client.chunks.join('');
      expect(all).toContain('event: timer-stopped');
      expect(all).toContain(`"bucketId":"${bucketA.id}"`);
    } finally {
      client.destroy();
    }
  });
});
