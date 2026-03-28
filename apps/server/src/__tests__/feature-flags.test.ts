import { describe, expect, it } from 'vitest';
import type { FeatureFlags } from '@repo/features';
import { buildServer } from '../index.js';

function createServer(features: FeatureFlags) {
  return buildServer({ logger: false, features });
}

describe('feature flags — server route gating', () => {
  it('disables timer routes when timers feature is off', async () => {
    const server = createServer({ timers: false, chat: true, video: true });

    const today = await server.inject({ method: 'GET', url: '/timers/today' });
    expect(today.statusCode).toBe(404);

    const buckets = await server.inject({ method: 'GET', url: '/timers/buckets' });
    expect(buckets.statusCode).toBe(404);

    await server.close();
  });

  it('disables chat and thread routes when chat feature is off', async () => {
    const server = createServer({ timers: true, chat: false, video: true });

    const threads = await server.inject({ method: 'GET', url: '/threads' });
    expect(threads.statusCode).toBe(404);

    const chatRun = await server.inject({
      method: 'POST',
      url: '/chat/run',
      payload: { content: 'hello' },
    });
    expect(chatRun.statusCode).toBe(404);

    await server.close();
  });

  it('keeps health endpoint active even when all features are off', async () => {
    const server = createServer({ timers: false, chat: false, video: false });

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const body = health.json();
    expect(body.status).toBe('ok');
    expect(body.features).toEqual({ timers: false, chat: false, video: false });

    await server.close();
  });

  it('reports features in the health endpoint', async () => {
    const flags: FeatureFlags = { timers: true, chat: false, video: true };
    const server = createServer(flags);

    const health = await server.inject({ method: 'GET', url: '/health' });
    const body = health.json();

    expect(body.features).toEqual(flags);
    // Chat-related fields show disabled when chat is off
    expect(body.sandbox.status).toBe('disabled');
    expect(body.credentialInjection.status).toBe('disabled');

    await server.close();
  });

  it('enables all routes when all features are on', async () => {
    const server = createServer({ timers: true, chat: true, video: true });

    const timers = await server.inject({ method: 'GET', url: '/timers/buckets' });
    expect(timers.statusCode).toBe(200);

    const threads = await server.inject({ method: 'GET', url: '/threads' });
    expect(threads.statusCode).toBe(200);

    await server.close();
  });
});

describe('feature flags — lifecycle no-ops', () => {
  it('initScheduler is a no-op when timers are off', async () => {
    const server = createServer({ timers: false, chat: true, video: true });
    // Should resolve without error (no scheduler was created)
    await expect(server.initScheduler()).resolves.toBeUndefined();
    await server.close();
  });

  it('runSandboxProbe returns disabled status when chat is off', async () => {
    const server = createServer({ timers: true, chat: false, video: true });
    const result = await server.runSandboxProbe();
    expect(result.status).toBe('unavailable');
    expect(result.message).toContain('disabled');
    await server.close();
  });

  it('runCredentialSweep is a no-op when chat is off', async () => {
    const server = createServer({ timers: true, chat: false, video: true });
    await expect(server.runCredentialSweep()).resolves.toBeUndefined();
    await server.close();
  });
});
