import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { probeSandbox, type SpawnFn } from '../services/sandbox.js';

// ---------------------------------------------------------------------------
// Fake spawn factory — returns a SpawnFn that produces a controllable child
// Uses plain EventEmitters for stdout/stderr to avoid Readable buffering.
// ---------------------------------------------------------------------------

interface FakeSpawnOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** Simulate a spawn error (e.g., ENOENT) instead of emitting close. */
  error?: Error;
  /** If true, never emit close (for timeout tests). */
  hang?: boolean;
}

function createFakeSpawn(options: FakeSpawnOptions): SpawnFn {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return ((_command: string, _args: string[]) => {
    const child = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();

    Object.assign(child, {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      kill: () => {
        process.nextTick(() => child.emit('close', null));
      },
    });

    process.nextTick(() => {
      if (options.error) {
        child.emit('error', options.error);
        return;
      }

      if (options.hang) {
        return;
      }

      if (options.stdout) stdoutEmitter.emit('data', Buffer.from(options.stdout));
      if (options.stderr) stderrEmitter.emit('data', Buffer.from(options.stderr));

      child.emit('close', options.exitCode ?? 0);
    });

    return child;
  }) as unknown as SpawnFn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('probeSandbox', () => {
  describe('healthy sandbox', () => {
    it('returns healthy when sandbox is authenticated with first-party OAuth', async () => {
      const spawnFn = createFakeSpawn({
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'oauth',
          apiProvider: 'firstParty',
        }),
        exitCode: 0,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('authenticated');
      expect(result.message).toContain('oauth');
      expect(result.message).toContain('firstParty');
    });
  });

  describe('auth failures', () => {
    it('returns auth_failed when loggedIn is false', async () => {
      const spawnFn = createFakeSpawn({
        stdout: JSON.stringify({ loggedIn: false }),
        exitCode: 0,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('not logged in');
    });

    it('returns auth_failed when using API key auth method', async () => {
      const spawnFn = createFakeSpawn({
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'api_key_helper',
          apiProvider: 'apiKey',
        }),
        exitCode: 0,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('API key auth');
    });

    it('returns auth_failed when apiProvider is not firstParty', async () => {
      const spawnFn = createFakeSpawn({
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'oauth',
          apiProvider: 'thirdParty',
        }),
        exitCode: 0,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('API key auth');
    });

    it('returns auth_failed when stderr contains "oauth token has expired"', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Error: oauth token has expired',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('oauth token has expired');
    });

    it('returns auth_failed when stderr contains "not logged in"', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Error: not logged in',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('not logged in');
    });
  });

  describe('sandbox unavailable', () => {
    it('returns unavailable when sandbox does not exist', async () => {
      const spawnFn = createFakeSpawn({
        stderr: "Error: sandbox 'my-sandbox' does not exist",
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('does not exist');
    });

    it('returns unavailable when Docker daemon is not running', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Cannot connect to the Docker daemon',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('cannot connect to the docker daemon');
    });

    it('returns unavailable when container is not running', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Error: container is not running',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('is not running');
    });

    it('returns unavailable when docker command is not found (spawn error)', async () => {
      const spawnFn = createFakeSpawn({
        error: new Error('spawn docker ENOENT'),
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('ENOENT');
    });

    it('returns unavailable for unknown non-zero exit code', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'some completely unexpected error',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('unknown error');
    });
  });

  describe('timeout', () => {
    it('returns unavailable when probe times out', async () => {
      const spawnFn = createFakeSpawn({ hang: true });

      const result = await probeSandbox(spawnFn, 50);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('timed out');
    });
  });

  describe('edge cases', () => {
    it('returns unavailable when stdout is not valid JSON', async () => {
      const spawnFn = createFakeSpawn({
        stdout: 'not json at all',
        exitCode: 0,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
      expect(result.message).toContain('invalid JSON');
    });

    it('prioritizes unavailability patterns over auth patterns', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'no such container; not logged in',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('unavailable');
    });

    it('passes correct docker command and arguments', async () => {
      let capturedCommand = '';
      let capturedArgs: string[] = [];

      const capturingSpawn = ((cmd: string, args: string[]) => {
        capturedCommand = cmd;
        capturedArgs = [...args];

        // Delegate to a normal fake spawn for the response
        const inner = createFakeSpawn({
          stdout: JSON.stringify({
            loggedIn: true,
            authMethod: 'oauth',
            apiProvider: 'firstParty',
          }),
          exitCode: 0,
        });
        return inner('docker', []);
      }) as unknown as SpawnFn;

      await probeSandbox(capturingSpawn);

      expect(capturedCommand).toBe('docker');
      expect(capturedArgs).toEqual([
        'sandbox',
        'exec',
        '-w',
        '/workspace',
        'my-sandbox',
        'claude',
        'auth',
        'status',
        '--json',
      ]);
    });
  });
});
