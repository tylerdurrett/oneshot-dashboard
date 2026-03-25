import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { _resetSSEClients } from '../routes/timers.js';
import { seedDefaultBuckets } from '../services/timer-bucket.js';
import type { Database } from '../services/thread.js';
import { createTimerTestDb, seedBucket } from './timer-test-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestServer = ReturnType<typeof buildServer>;

function buildTestServer(database: Database): TestServer {
  return buildServer({ logger: false, database });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('timer server wiring', () => {
  let testDb: Database;
  let server: TestServer;

  beforeEach(() => {
    testDb = createTimerTestDb();
    server = buildTestServer(testDb);
  });

  afterEach(async () => {
    _resetSSEClients();
    await server.close();
  });

  it('registers timer bucket routes', async () => {
    const res = await server.inject({ method: 'GET', url: '/timers/buckets' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ buckets: [] });
  });

  it('registers timer today route', async () => {
    const res = await server.inject({ method: 'GET', url: '/timers/today' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('date');
    expect(body).toHaveProperty('buckets');
  });

  it('seeds default buckets and scheduler can initialize', async () => {
    const didSeed = await seedDefaultBuckets(testDb);
    expect(didSeed).toBe(true);

    // Scheduler init recovers running timers and schedules daily reset
    await server.initScheduler();

    // Verify seeded buckets appear via the route
    const res = await server.inject({ method: 'GET', url: '/timers/buckets' });
    expect(res.statusCode).toBe(200);
    const { buckets } = res.json();
    expect(buckets).toHaveLength(4);
  });

  it('scheduler initializes and recovers a running timer', async () => {
    const bucket = await seedBucket(testDb, {
      name: 'Test',
      totalMinutes: 60,
    });

    // Start the timer via the route
    const startRes = await server.inject({
      method: 'POST',
      url: `/timers/buckets/${bucket.id}/start`,
    });
    expect(startRes.statusCode).toBe(200);

    // Init scheduler — should detect the running timer and schedule completion
    await server.initScheduler();

    // Timer should still be running (reflected in today state)
    const todayRes = await server.inject({
      method: 'GET',
      url: '/timers/today',
    });
    const { buckets } = todayRes.json();
    const running = buckets.find(
      (b: { id: string }) => b.id === bucket.id,
    );
    expect(running.startedAt).toBeTruthy();
  });

  it('scheduler is destroyed on server close', async () => {
    await server.initScheduler();

    // Closing the server should destroy the scheduler without errors
    await server.close();

    // Re-create server for afterEach cleanup (close is idempotent but avoid double-close warnings)
    server = buildTestServer(testDb);
  });

  it('full lifecycle: seed → init → start → stop', async () => {
    await seedDefaultBuckets(testDb);
    await server.initScheduler();

    // Get seeded buckets
    const listRes = await server.inject({
      method: 'GET',
      url: '/timers/buckets',
    });
    const { buckets } = listRes.json();
    const bucketId = buckets[0].id;

    // Start timer
    const startRes = await server.inject({
      method: 'POST',
      url: `/timers/buckets/${bucketId}/start`,
    });
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json().bucketId).toBe(bucketId);

    // Stop timer
    const stopRes = await server.inject({
      method: 'POST',
      url: `/timers/buckets/${bucketId}/stop`,
    });
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json()).toHaveProperty('elapsedSeconds');
  });
});
