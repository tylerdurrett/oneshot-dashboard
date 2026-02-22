import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import {
  extractTextFromStreamLine,
  invokeClaude,
  probeSandbox,
  type ClaudeResult,
  type SpawnFn,
} from '../services/sandbox.js';

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
        config.sandboxWorkspace,
        config.sandboxName,
        'claude',
        'auth',
        'status',
        '--json',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// extractTextFromStreamLine
// ---------------------------------------------------------------------------

describe('extractTextFromStreamLine', () => {
  it('extracts text from content_block_delta event', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello ' },
    });
    expect(extractTextFromStreamLine(line)).toBe('Hello ');
  });

  it('extracts text from assistant event with text blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Part one' },
          { type: 'text', text: 'Part two' },
        ],
      },
    });
    expect(extractTextFromStreamLine(line)).toBe('Part one\nPart two');
  });

  it('returns null for assistant event with no text blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'abc' }] },
    });
    expect(extractTextFromStreamLine(line)).toBeNull();
  });

  it('extracts text from result event', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'Final answer',
      session_id: 'abc-123',
    });
    expect(extractTextFromStreamLine(line)).toBe('Final answer');
  });

  it('returns null for empty string', () => {
    expect(extractTextFromStreamLine('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(extractTextFromStreamLine('   \n  ')).toBeNull();
  });

  it('returns null for non-JSON input', () => {
    expect(extractTextFromStreamLine('not json')).toBeNull();
  });

  it('returns null for unknown event type', () => {
    const line = JSON.stringify({ type: 'tool_use', id: 'abc' });
    expect(extractTextFromStreamLine(line)).toBeNull();
  });

  it('returns null for content_block_delta with empty text', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: '' },
    });
    expect(extractTextFromStreamLine(line)).toBeNull();
  });

  it('returns null for assistant event with non-array content', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: 'not an array' },
    });
    expect(extractTextFromStreamLine(line)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// invokeClaude
// ---------------------------------------------------------------------------

/** Helper to build multi-line NDJSON stdout from event objects. */
function ndjson(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/** Collect events from an invokeClaude emitter into a promise. */
function collectEvents(
  emitter: EventEmitter,
): Promise<{
  texts: string[];
  result: ClaudeResult | null;
  errors: Error[];
  resumeFailed: boolean;
}> {
  return new Promise((resolve) => {
    const texts: string[] = [];
    let result: ClaudeResult | null = null;
    const errors: Error[] = [];
    let resumeFailed = false;

    emitter.on('text', (t: string) => texts.push(t));
    emitter.on('result', (r: ClaudeResult) => {
      result = r;
    });
    emitter.on('error', (e: Error) => errors.push(e));
    emitter.on('resume_failed', () => {
      resumeFailed = true;
    });
    emitter.on('close', () => {
      resolve({ texts, result, errors, resumeFailed });
    });
  });
}

describe('invokeClaude', () => {
  describe('successful streaming', () => {
    it('emits text events for content_block_delta and result at end', async () => {
      const stdout = ndjson(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
        { type: 'result', result: 'Hello world', session_id: 'sess-123' },
      );

      const spawnFn = createFakeSpawn({ stdout, exitCode: 0 });
      const emitter = invokeClaude({
        prompt: 'say hello',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });

      const events = await collectEvents(emitter);

      expect(events.texts).toEqual(['Hello', ' world']);
      expect(events.result).toEqual({ result: 'Hello world', sessionId: 'sess-123' });
      expect(events.errors).toHaveLength(0);
    });

    it('emits text for assistant event type', async () => {
      const stdout = ndjson(
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Full response' }] },
        },
        { type: 'result', result: 'Full response', session_id: 'sess-456' },
      );

      const spawnFn = createFakeSpawn({ stdout, exitCode: 0 });
      const emitter = invokeClaude({ prompt: 'test', spawnFn, inactivityTimeoutMs: 5000 });
      const events = await collectEvents(emitter);

      expect(events.texts).toContain('Full response');
      expect(events.result?.sessionId).toBe('sess-456');
    });
  });

  describe('docker command arguments', () => {
    it('passes correct args without session ID', async () => {
      let capturedArgs: string[] = [];

      const capturingSpawn = ((cmd: string, args: string[]) => {
        capturedArgs = [...args];
        const inner = createFakeSpawn({
          stdout: ndjson({ type: 'result', result: 'ok', session_id: 'sid' }),
          exitCode: 0,
        });
        return inner(cmd, args);
      }) as unknown as SpawnFn;

      const emitter = invokeClaude({
        prompt: 'hello',
        spawnFn: capturingSpawn,
        inactivityTimeoutMs: 5000,
      });
      await collectEvents(emitter);

      expect(capturedArgs).toEqual([
        'sandbox', 'exec', '-w', config.sandboxWorkspace, config.sandboxName,
        'claude',
        '-p', 'hello',
        '--output-format', 'stream-json',
        '--permission-mode', 'bypassPermissions',
        '--verbose',
      ]);
    });

    it('includes --resume flag when sessionId is provided', async () => {
      let capturedArgs: string[] = [];

      const capturingSpawn = ((cmd: string, args: string[]) => {
        capturedArgs = [...args];
        const inner = createFakeSpawn({
          stdout: ndjson({ type: 'result', result: 'ok', session_id: 'new-sid' }),
          exitCode: 0,
        });
        return inner(cmd, args);
      }) as unknown as SpawnFn;

      const emitter = invokeClaude({
        prompt: 'hello',
        sessionId: 'old-sid',
        spawnFn: capturingSpawn,
        inactivityTimeoutMs: 5000,
      });
      await collectEvents(emitter);

      expect(capturedArgs).toContain('--resume');
      expect(capturedArgs).toContain('old-sid');
      // --resume and session ID should appear before -p
      const resumeIdx = capturedArgs.indexOf('--resume');
      const promptIdx = capturedArgs.indexOf('-p');
      expect(resumeIdx).toBeLessThan(promptIdx);
    });
  });

  describe('resume failure fallback', () => {
    it('retries without --resume on resume failure', async () => {
      const calls: string[][] = [];

      const spawnFn = ((cmd: string, args: string[]) => {
        calls.push([...args]);
        const isResume = args.includes('--resume');

        if (isResume) {
          // First call: resume failure
          const inner = createFakeSpawn({
            stderr: 'Error: session not found',
            exitCode: 1,
          });
          return inner(cmd, args);
        }
        // Second call: success without resume
        const inner = createFakeSpawn({
          stdout: ndjson({ type: 'result', result: 'fresh response', session_id: 'new-sid' }),
          exitCode: 0,
        });
        return inner(cmd, args);
      }) as unknown as SpawnFn;

      const emitter = invokeClaude({
        prompt: 'test',
        sessionId: 'stale-sid',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      expect(events.resumeFailed).toBe(true);
      expect(events.result?.sessionId).toBe('new-sid');
      expect(events.errors).toHaveLength(0);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toContain('--resume');
      expect(calls[1]).not.toContain('--resume');
    });

    it('classifies auth error even during resume (auth takes priority)', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Error: not logged in; session not found',
        exitCode: 1,
      });

      const emitter = invokeClaude({
        prompt: 'test',
        sessionId: 'some-sid',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      // Should be classified as auth failure, NOT trigger resume retry
      expect(events.resumeFailed).toBe(false);
      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('authentication failed');
    });
  });

  describe('inactivity timeout', () => {
    it('kills process and emits error when no output arrives', async () => {
      const spawnFn = createFakeSpawn({ hang: true });

      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 50,
      });
      const events = await collectEvents(emitter);

      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('timed out');
      expect(events.errors[0]!.message).toContain('50ms');
    });
  });

  describe('non-zero exit handling', () => {
    it('emits result cleanly when non-zero exit has valid NDJSON output', async () => {
      const stdout = ndjson(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial ' } },
        { type: 'result', result: 'partial answer', session_id: 'sid-ok' },
      );

      const spawnFn = createFakeSpawn({ stdout, exitCode: 1 });
      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      // Should still get the result despite non-zero exit
      expect(events.result).toEqual({ result: 'partial answer', sessionId: 'sid-ok' });
      expect(events.errors).toHaveLength(0);
    });

    it('emits error when non-zero exit has no valid output', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'some unexpected error',
        exitCode: 1,
      });

      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('exited with code 1');
    });
  });

  describe('error classification', () => {
    it('emits auth failure error for auth-related stderr', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Error: oauth token has expired',
        exitCode: 1,
      });

      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('authentication failed');
    });

    it('emits unavailable error for sandbox-not-found stderr', async () => {
      const spawnFn = createFakeSpawn({
        stderr: "Error: sandbox 'my-sandbox' does not exist",
        exitCode: 1,
      });

      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('unavailable');
    });

    it('emits error on spawn failure', async () => {
      const spawnFn = createFakeSpawn({
        error: new Error('spawn docker ENOENT'),
      });

      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('Docker process error');
    });
  });

  describe('line buffering', () => {
    it('handles NDJSON split across multiple chunks', async () => {
      // Simulate data arriving in two chunks that split a line
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const spawnFn = ((_command: string, _args: string[]) => {
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
          // First chunk: partial line
          const chunk1 = '{"type":"content_block_del';
          const chunk2 = 'ta","delta":{"text":"hello"}}\n{"type":"result","result":"hello","session_id":"s1"}\n';

          stdoutEmitter.emit('data', Buffer.from(chunk1));
          stdoutEmitter.emit('data', Buffer.from(chunk2));
          child.emit('close', 0);
        });

        return child;
      }) as unknown as SpawnFn;

      const emitter = invokeClaude({
        prompt: 'test',
        spawnFn,
        inactivityTimeoutMs: 5000,
      });
      const events = await collectEvents(emitter);

      expect(events.texts).toEqual(['hello']);
      expect(events.result).toEqual({ result: 'hello', sessionId: 's1' });
    });
  });
});
