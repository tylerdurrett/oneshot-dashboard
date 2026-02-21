import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('WebSocket plugin', () => {
  let server: ReturnType<typeof buildServer>;

  afterEach(async () => {
    await server?.close();
  });

  it('accepts a WebSocket upgrade and supports bidirectional messaging', async () => {
    server = buildServer({ logger: false });

    // Register echo route inside after() so the websocket plugin's onRoute hook is active
    server.after(() => {
      server.get('/ws-test', { websocket: true }, (socket) => {
        socket.on('message', (data: Buffer) => {
          socket.send(data.toString());
        });
      });
    });

    await server.ready();

    const ws = await server.injectWS('/ws-test');

    const echo = await new Promise<string>((resolve) => {
      ws.on('message', (data: Buffer) => resolve(data.toString()));
      ws.send('hello');
    });

    expect(echo).toBe('hello');
    ws.close();
  });

  it('exposes the websocketServer property on the Fastify instance', async () => {
    server = buildServer({ logger: false });
    await server.ready();

    expect(server.websocketServer).toBeDefined();
  });
});
