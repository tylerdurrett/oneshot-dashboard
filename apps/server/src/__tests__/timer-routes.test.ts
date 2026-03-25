import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  timerRoutes,
  broadcast,
  getConnectedClientCount,
  _resetSSEClients,
  SSE_EVENTS,
} from '../routes/timers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Fastify server with just the timer routes registered. */
function buildTestServer() {
  const server = Fastify({ logger: false });
  server.register(cors, { origin: true });
  server.register(timerRoutes, {});
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
  let server: ReturnType<typeof buildTestServer>;
  let port: number;

  beforeEach(async () => {
    _resetSSEClients();
    server = buildTestServer();
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
      expect(SSE_EVENTS.TIMER_COMPLETED).toBe('timer-completed');
      expect(SSE_EVENTS.TIMER_RESET).toBe('timer-reset');
      expect(SSE_EVENTS.TIMER_UPDATED).toBe('timer-updated');
      expect(SSE_EVENTS.DAILY_RESET).toBe('daily-reset');
    });
  });
});
