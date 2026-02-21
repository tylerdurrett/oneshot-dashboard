import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import type { SpawnFn } from '../services/sandbox.js';

/** Create a fake spawn that returns a healthy sandbox response. */
function createHealthySpawn(): SpawnFn {
  return (() => {
    const child = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();

    Object.assign(child, {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      kill: () => {},
    });

    process.nextTick(() => {
      stdoutEmitter.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            loggedIn: true,
            authMethod: 'oauth',
            apiProvider: 'firstParty',
          }),
        ),
      );
      child.emit('close', 0);
    });

    return child;
  }) as unknown as SpawnFn;
}

/** Create a fake spawn that returns a sandbox-unavailable response. */
function createUnavailableSpawn(): SpawnFn {
  return (() => {
    const child = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();

    Object.assign(child, {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      kill: () => {},
    });

    process.nextTick(() => {
      stderrEmitter.emit('data', Buffer.from('no such container'));
      child.emit('close', 1);
    });

    return child;
  }) as unknown as SpawnFn;
}

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
    const server = buildServer({ logger: false, spawnFn: createHealthySpawn() });
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
      spawnFn: createUnavailableSpawn(),
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
