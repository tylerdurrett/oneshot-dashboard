import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config.js';
import {
  extractTextFromStreamLine,
  invokeClaude,
  prepareSandboxForPrompt,
  preflightCheck,
  probeSandbox,
  resetCircuitBreaker,
  type ClaudeResult,
  type SpawnFn,
} from '../services/sandbox.js';
import {
  createFakeSpawn,
  createRoutingSpawn,
  mockPlatform,
  ndjson,
  restorePlatform,
} from './helpers.js';

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

    it('returns auth_failed when stderr contains "failed to authenticate" (401)', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Failed to authenticate. API Error: 401',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('failed to authenticate');
    });

    it('returns auth_failed when stdout contains "authentication_error" (401 JSON)', async () => {
      const spawnFn = createFakeSpawn({
        stdout: '{"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
        exitCode: 1,
      });

      const result = await probeSandbox(spawnFn);

      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('authentication_error');
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

/** Collect events from an invokeClaude emitter into a promise. */
function collectEvents(
  emitter: EventEmitter,
): Promise<{
  texts: string[];
  result: ClaudeResult | null;
  errors: Error[];
  resumeFailed: boolean;
  authRecovered: boolean;
}> {
  return new Promise((resolve) => {
    const texts: string[] = [];
    let result: ClaudeResult | null = null;
    const errors: Error[] = [];
    let resumeFailed = false;
    let authRecovered = false;

    emitter.on('text', (t: string) => texts.push(t));
    emitter.on('result', (r: ClaudeResult) => {
      result = r;
    });
    emitter.on('error', (e: Error) => errors.push(e));
    emitter.on('resume_failed', () => {
      resumeFailed = true;
    });
    emitter.on('auth_recovery', () => {
      authRecovered = true;
    });
    emitter.on('close', () => {
      resolve({ texts, result, errors, resumeFailed, authRecovered });
    });
  });
}

describe('invokeClaude', () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

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

    it('emits error (not result) when result has is_error: true', async () => {
      // Claude returns is_error: true for API/runtime errors — these should
      // surface as errors, not be persisted as assistant messages.
      const stdout = ndjson(
        { type: 'result', result: 'API Error: Self-signed certificate', session_id: 'sess-err', is_error: true, subtype: 'error' },
      );

      const spawnFn = createFakeSpawn({ stdout, exitCode: 0 });
      const emitter = invokeClaude({ prompt: 'test', spawnFn, inactivityTimeoutMs: 5000 });
      const events = await collectEvents(emitter);

      expect(events.result).toBeNull();
      expect(events.errors).toHaveLength(1);
      expect(events.errors[0]!.message).toContain('API Error: Self-signed certificate');
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
        'sandbox', 'exec', config.sandboxName,
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

    it('emits auth failure error for "failed to authenticate" stderr (401)', async () => {
      const spawnFn = createFakeSpawn({
        stderr: 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error"}}',
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

    it('emits auth failure error for "authentication_error" in stderr (401 JSON)', async () => {
      const spawnFn = createFakeSpawn({
        stderr: '{"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
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

// ---------------------------------------------------------------------------
// preflightCheck
// ---------------------------------------------------------------------------

/** SpawnFn that always probes as auth_failed and fails injection (keychain not found). */
function authFailedNoRecoverySpawn(): SpawnFn {
  return ((command: string, args: string[]) => {
    if (args.includes('auth') && args.includes('status')) {
      return createFakeSpawn({
        stdout: JSON.stringify({ loggedIn: false }),
        exitCode: 0,
      })(command, args);
    }
    if (command === 'security') {
      return createFakeSpawn({
        stderr: 'The specified item could not be found in the keychain.',
        exitCode: 44,
      })(command, args);
    }
    return createFakeSpawn({ exitCode: 1 })(command, args);
  }) as unknown as SpawnFn;
}

describe('preflightCheck', () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  afterEach(() => {
    restorePlatform();
  });

  it('returns ok when sandbox is healthy (no injection needed)', async () => {
    const spawnFn = createFakeSpawn({
      stdout: JSON.stringify({
        loggedIn: true,
        authMethod: 'oauth',
        apiProvider: 'firstParty',
      }),
      exitCode: 0,
    });

    const result = await preflightCheck(spawnFn);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.recoveryAttempted).toBe(false);
  });

  it('returns not ok immediately for unavailable sandbox (no recovery attempt)', async () => {
    const spawnFn = createFakeSpawn({
      stderr: "Error: sandbox 'my-sandbox' does not exist",
      exitCode: 1,
    });

    const result = await preflightCheck(spawnFn);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('unavailable');
    expect(result.recoveryAttempted).toBe(false);
  });

  it('recovers from auth failure via credential injection', async () => {
    mockPlatform('darwin');
    let probeCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      if (args.includes('auth') && args.includes('status')) {
        probeCount++;
        if (probeCount === 1) {
          return createFakeSpawn({
            stdout: JSON.stringify({ loggedIn: false }),
            exitCode: 0,
          })(command, args);
        }
        return createFakeSpawn({
          stdout: JSON.stringify({
            loggedIn: true,
            authMethod: 'oauth',
            apiProvider: 'firstParty',
          }),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'security') {
        return createFakeSpawn({
          stdout: JSON.stringify({
            claudeAiOauth: {
              accessToken: 'test-token',
              expiresAt: Date.now() + 3_600_000,
              refreshToken: 'secret-refresh',
            },
          }),
          exitCode: 0,
        })(command, args);
      }

      if (args.includes('-i')) {
        return createFakeSpawn({ exitCode: 0 })(command, args);
      }

      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as unknown as SpawnFn;

    const result = await preflightCheck(spawnFn);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.recoveryAttempted).toBe(true);
  });

  it('returns not ok when auth recovery fails (keychain read fails)', async () => {
    mockPlatform('darwin');

    const spawnFn = ((command: string, args: string[]) => {
      if (args.includes('auth') && args.includes('status')) {
        return createFakeSpawn({
          stdout: JSON.stringify({ loggedIn: false }),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'security') {
        return createFakeSpawn({
          stderr: 'The specified item could not be found in the keychain.',
          exitCode: 44,
        })(command, args);
      }

      return createFakeSpawn({ exitCode: 1 })(command, args);
    }) as unknown as SpawnFn;

    const result = await preflightCheck(spawnFn);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('auth_failed');
    expect(result.recoveryAttempted).toBe(true);
    expect(result.message).toContain('keychain');
  });

  describe('circuit breaker', () => {
    it('allows recovery up to healMaxAttempts, then blocks further attempts', async () => {
      mockPlatform('darwin');
      const spawnFn = authFailedNoRecoverySpawn();

      for (let i = 0; i < config.healMaxAttempts; i++) {
        const result = await preflightCheck(spawnFn);
        expect(result.ok).toBe(false);
        expect(result.recoveryAttempted).toBe(true);
      }
      const blocked = await preflightCheck(spawnFn);
      expect(blocked.ok).toBe(false);
      expect(blocked.recoveryAttempted).toBe(false);
      expect(blocked.message).toContain('circuit breaker open');
    });

    it('resetCircuitBreaker clears state so recovery can proceed again', async () => {
      mockPlatform('darwin');
      const spawnFn = authFailedNoRecoverySpawn();

      for (let i = 0; i < config.healMaxAttempts; i++) {
        await preflightCheck(spawnFn);
      }

      const blocked = await preflightCheck(spawnFn);
      expect(blocked.message).toContain('circuit breaker open');

      resetCircuitBreaker();
      const afterReset = await preflightCheck(spawnFn);
      expect(afterReset.recoveryAttempted).toBe(true);
    });

    it('prunes old attempts outside healWindowMs (natural reset)', async () => {
      mockPlatform('darwin');
      const spawnFn = authFailedNoRecoverySpawn();

      vi.useFakeTimers();
      try {
        for (let i = 0; i < config.healMaxAttempts; i++) {
          await preflightCheck(spawnFn);
        }

        const blocked = await preflightCheck(spawnFn);
        expect(blocked.message).toContain('circuit breaker open');

        vi.advanceTimersByTime(config.healWindowMs + 1);
        const afterWindow = await preflightCheck(spawnFn);
        expect(afterWindow.recoveryAttempted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// prepareSandboxForPrompt
// ---------------------------------------------------------------------------

describe('prepareSandboxForPrompt', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    mockPlatform('darwin');
  });

  afterEach(() => {
    restorePlatform();
  });

  it('injects fresh credentials and verifies readiness on the happy path', async () => {
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        expiresAt: Date.now() + 3_600_000,
        refreshToken: 'rt-secret',
      },
    });
    const spawnFn = createRoutingSpawn({
      security: { stdout: creds, exitCode: 0 },
      auth: {
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'firstPartyOauth',
          apiProvider: 'firstParty',
        }),
        exitCode: 0,
      },
      docker: { exitCode: 0 },
    });

    const result = await prepareSandboxForPrompt(spawnFn);

    expect(result.ok).toBe(true);
  });

  it('returns host_refresh_failed when the host token cannot be refreshed', async () => {
    const spawnFn = createRoutingSpawn({
      security: { stderr: 'missing creds', exitCode: 44 },
    });

    const result = await prepareSandboxForPrompt(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('host_refresh_failed');
    }
  });

  it('returns sandbox_unavailable when credential injection fails', async () => {
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        expiresAt: Date.now() + 3_600_000,
        refreshToken: 'rt-secret',
      },
    });
    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'security') {
        return createFakeSpawn({ stdout: creds, exitCode: 0 })(command, args);
      }
      if (command === 'docker' && args.includes('-i')) {
        return createFakeSpawn({ stderr: 'sandbox down', exitCode: 1 })(command, args);
      }
      if (command === 'docker' && args.includes('auth') && args.includes('status')) {
        return createFakeSpawn({
          stdout: JSON.stringify({
            loggedIn: true,
            authMethod: 'firstPartyOauth',
            apiProvider: 'firstParty',
          }),
          exitCode: 0,
        })(command, args);
      }
      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as SpawnFn;

    const result = await prepareSandboxForPrompt(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('sandbox_unavailable');
    }
  });

  it('returns verification_failed when auth still looks wrong after injection', async () => {
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        expiresAt: Date.now() + 3_600_000,
        refreshToken: 'rt-secret',
      },
    });
    const spawnFn = createRoutingSpawn({
      security: { stdout: creds, exitCode: 0 },
      auth: {
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'api_key',
          apiProvider: 'apiKey',
        }),
        exitCode: 0,
      },
      docker: { exitCode: 0 },
    });

    const result = await prepareSandboxForPrompt(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('verification_failed');
    }
  });
});

// ---------------------------------------------------------------------------
// invokeClaude — auth recovery
// ---------------------------------------------------------------------------

describe('invokeClaude auth recovery', () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  afterEach(() => {
    restorePlatform();
  });

  it('recovers from auth error by injecting credentials and retrying once', async () => {
    mockPlatform('darwin');
    let claudeCallCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'docker' && args.includes('-p')) {
        claudeCallCount++;
        if (claudeCallCount === 1) {
          return createFakeSpawn({
            stderr: 'Error: oauth token has expired',
            exitCode: 1,
          })(command, args);
        }
        return createFakeSpawn({
          stdout: ndjson(
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'recovered' } },
            { type: 'result', result: 'recovered response', session_id: 'new-sid' },
          ),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'security') {
        return createFakeSpawn({
          stdout: JSON.stringify({
            claudeAiOauth: {
              accessToken: 'fresh-token',
              expiresAt: Date.now() + 7_200_000,
              refreshToken: 'rt-secret',
            },
          }),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'docker' && args.includes('-i')) {
        return createFakeSpawn({ exitCode: 0 })(command, args);
      }

      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as unknown as SpawnFn;

    const emitter = invokeClaude({
      prompt: 'test',
      spawnFn,
      inactivityTimeoutMs: 5000,
    });
    const events = await collectEvents(emitter);

    expect(events.authRecovered).toBe(true);
    expect(events.errors).toHaveLength(0);
    expect(events.result).toEqual({ result: 'recovered response', sessionId: 'new-sid' });
    expect(claudeCallCount).toBe(2);
  });

  it('emits original auth error when credential injection fails', async () => {
    mockPlatform('darwin');

    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'docker' && args.includes('-p')) {
        return createFakeSpawn({
          stderr: 'Error: oauth token has expired',
          exitCode: 1,
        })(command, args);
      }

      if (command === 'security') {
        return createFakeSpawn({
          stderr: 'The specified item could not be found in the keychain.',
          exitCode: 44,
        })(command, args);
      }

      return createFakeSpawn({ exitCode: 1 })(command, args);
    }) as unknown as SpawnFn;

    const emitter = invokeClaude({
      prompt: 'test',
      spawnFn,
      inactivityTimeoutMs: 5000,
    });
    const events = await collectEvents(emitter);

    expect(events.authRecovered).toBe(false);
    expect(events.errors).toHaveLength(1);
    expect(events.errors[0]!.message).toContain('authentication failed');
  });

  it('does not attempt recovery when circuit breaker is open', async () => {
    mockPlatform('darwin');

    for (let i = 0; i < config.healMaxAttempts; i++) {
      await preflightCheck(authFailedNoRecoverySpawn());
    }

    // Now invokeClaude with an auth error — circuit is open, no recovery
    let securitySpawned = false;
    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'docker' && args.includes('-p')) {
        return createFakeSpawn({
          stderr: 'Error: not logged in',
          exitCode: 1,
        })(command, args);
      }
      if (command === 'security') {
        securitySpawned = true;
        return createFakeSpawn({ exitCode: 0 })(command, args);
      }
      return createFakeSpawn({ exitCode: 1 })(command, args);
    }) as unknown as SpawnFn;

    const emitter = invokeClaude({
      prompt: 'test',
      spawnFn,
      inactivityTimeoutMs: 5000,
    });
    const events = await collectEvents(emitter);

    expect(events.authRecovered).toBe(false);
    expect(events.errors).toHaveLength(1);
    expect(events.errors[0]!.message).toContain('authentication failed');
    expect(securitySpawned).toBe(false);
  });

  it('does not retry more than once per invocation', async () => {
    mockPlatform('darwin');
    let claudeCallCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'docker' && args.includes('-p')) {
        claudeCallCount++;
        return createFakeSpawn({
          stderr: 'Error: oauth token has expired',
          exitCode: 1,
        })(command, args);
      }

      if (command === 'security') {
        return createFakeSpawn({
          stdout: JSON.stringify({
            claudeAiOauth: {
              accessToken: 'fresh-token',
              expiresAt: Date.now() + 7_200_000,
              refreshToken: 'rt-secret',
            },
          }),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'docker' && args.includes('-i')) {
        return createFakeSpawn({ exitCode: 0 })(command, args);
      }

      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as unknown as SpawnFn;

    const emitter = invokeClaude({
      prompt: 'test',
      spawnFn,
      inactivityTimeoutMs: 5000,
    });
    const events = await collectEvents(emitter);

    expect(events.authRecovered).toBe(true);
    expect(events.errors).toHaveLength(1);
    expect(events.errors[0]!.message).toContain('authentication failed');
    expect(claudeCallCount).toBe(2);
  });

  it('recovers from 401 is_error NDJSON result with non-zero exit', async () => {
    // This is the critical integration test for Bug 1 + Bug 2:
    // - Bug 1: parseResultFromOutput must skip is_error results so the close
    //   handler falls through to auth recovery instead of short-circuiting.
    // - Bug 2: AUTH_FAILURE_PATTERNS must match "failed to authenticate" /
    //   "authentication_error" from the 401 NDJSON result in stdout.
    mockPlatform('darwin');
    let claudeCallCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'docker' && args.includes('-p')) {
        claudeCallCount++;
        if (claudeCallCount === 1) {
          // First call: 401 error as is_error NDJSON result with non-zero exit
          return createFakeSpawn({
            stdout: ndjson({
              type: 'result',
              result: 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
              session_id: 'sess-err',
              is_error: true,
              subtype: 'error',
            }),
            exitCode: 1,
          })(command, args);
        }
        // Second call: success after recovery
        return createFakeSpawn({
          stdout: ndjson(
            { type: 'result', result: 'recovered', session_id: 'sess-ok' },
          ),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'security') {
        return createFakeSpawn({
          stdout: JSON.stringify({
            claudeAiOauth: {
              accessToken: 'fresh-token',
              expiresAt: Date.now() + 7_200_000,
              refreshToken: 'rt-secret',
            },
          }),
          exitCode: 0,
        })(command, args);
      }

      if (command === 'docker' && args.includes('-i')) {
        return createFakeSpawn({ exitCode: 0 })(command, args);
      }

      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as unknown as SpawnFn;

    const emitter = invokeClaude({
      prompt: 'test',
      spawnFn,
      inactivityTimeoutMs: 5000,
    });
    const events = await collectEvents(emitter);

    // Before the fix: parseResultFromOutput found the is_error result line,
    // returned it, and the close handler short-circuited with no recovery.
    // After the fix: is_error results are skipped, auth patterns detect the 401,
    // credentials are injected, and Claude is retried successfully.
    expect(events.authRecovered).toBe(true);
    expect(claudeCallCount).toBe(2);
    expect(events.result).toEqual({ result: 'recovered', sessionId: 'sess-ok' });
  });
});
