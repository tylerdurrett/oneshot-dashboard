import { describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createFakeSpawn } from './helpers.js';

describe('GET /health', () => {
  it('returns status ok with sandbox unknown when probe has not run', async () => {
    const server = buildServer({ logger: false });

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.sandbox.status).toBe('unknown');

    await server.close();
  });

  it('returns sandbox healthy status after successful probe', async () => {
    const server = buildServer({
      logger: false,
      spawnFn: createFakeSpawn({
        stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth', apiProvider: 'firstParty' }),
        exitCode: 0,
      }),
    });
    await server.runSandboxProbe();

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.sandbox.status).toBe('healthy');

    await server.close();
  });

  it('returns sandbox unavailable status after failed probe', async () => {
    const server = buildServer({
      logger: false,
      spawnFn: createFakeSpawn({ stderr: 'no such container', exitCode: 1 }),
    });
    await server.runSandboxProbe();

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.sandbox.status).toBe('unavailable');

    await server.close();
  });
});
