import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config.js';
import { buildServer } from '../index.js';
import type { SpawnFn } from '../services/sandbox.js';
import {
  createFakeSpawn,
  createRoutingSpawn,
  mockPlatform,
  restorePlatform,
} from './helpers.js';

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
    expect(body.credentialInjection).toEqual({
      available: expect.any(Boolean),
      lastSweep: null,
    });

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

  it('returns lastSweep timestamp after credential sweep runs', async () => {
    mockPlatform('darwin');
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        expiresAt: Date.now() + 3_600_000,
      },
    });
    const server = buildServer({
      logger: false,
      spawnFn: createRoutingSpawn({
        security: { stdout: creds, exitCode: 0 },
        docker: { exitCode: 0 },
      }),
    });
    try {
      await server.runCredentialSweep();

      const response = await server.inject({ method: 'GET', url: '/health' });
      const body = response.json();
      expect(body.credentialInjection.available).toBe(true);
      expect(body.credentialInjection.lastSweep).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await server.close();
      restorePlatform();
    }
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

describe('Credential sweep', () => {
  const SWEEP_INTERVAL = config.credentialSweepIntervalMs;

  beforeEach(() => {
    mockPlatform('darwin');
  });

  afterEach(() => {
    restorePlatform();
  });

  function sweepSuccessSpawn() {
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        expiresAt: Date.now() + 3_600_000,
      },
    });
    return createRoutingSpawn({
      security: { stdout: creds, exitCode: 0 },
      docker: { exitCode: 0 },
    });
  }

  function sweepFailSpawn() {
    return createRoutingSpawn({
      security: { stderr: 'not found', exitCode: 44 },
    });
  }

  /** Wrap a SpawnFn to count how many times `security` is invoked. */
  function createCountingSpawn(inner: SpawnFn): { spawnFn: SpawnFn; count: () => number } {
    let callCount = 0;
    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'security') callCount++;
      return inner(command, args);
    }) as SpawnFn;
    return { spawnFn, count: () => callCount };
  }

  it('runCredentialSweep completes successfully with valid credentials', async () => {
    const server = buildServer({ logger: false, spawnFn: sweepSuccessSpawn() });
    await server.runCredentialSweep();
    await server.close();
  });

  it('runCredentialSweep does not throw when injection fails', async () => {
    const server = buildServer({ logger: false, spawnFn: sweepFailSpawn() });
    await expect(server.runCredentialSweep()).resolves.toBeUndefined();
    await server.close();
  });

  it('startCredentialSweep triggers recurring calls', async () => {
    vi.useFakeTimers();
    const { spawnFn, count } = createCountingSpawn(sweepSuccessSpawn());

    const server = buildServer({ logger: false, spawnFn });
    server.startCredentialSweep();

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 2 + 100);
    expect(count()).toBeGreaterThanOrEqual(2);

    server.stopCredentialSweep();
    await server.close();
    vi.useRealTimers();
  });

  it('stopCredentialSweep prevents further sweep calls', async () => {
    vi.useFakeTimers();
    const { spawnFn, count } = createCountingSpawn(sweepSuccessSpawn());

    const server = buildServer({ logger: false, spawnFn });
    server.startCredentialSweep();
    server.stopCredentialSweep();

    const countAfterStop = count();
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 3);
    expect(count()).toBe(countAfterStop);

    await server.close();
    vi.useRealTimers();
  });

  it('onClose hook stops the sweep interval', async () => {
    vi.useFakeTimers();
    const { spawnFn, count } = createCountingSpawn(sweepSuccessSpawn());

    const server = buildServer({ logger: false, spawnFn });
    server.startCredentialSweep();

    await server.close();

    const countAfterClose = count();
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL * 3);
    expect(count()).toBe(countAfterClose);

    vi.useRealTimers();
  });
});
