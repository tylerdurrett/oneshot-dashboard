import { EventEmitter } from 'node:events';
import type { SpawnFn } from '../services/sandbox.js';

// ---------------------------------------------------------------------------
// Fake spawn factory — returns a SpawnFn that produces a controllable child.
// Uses plain EventEmitters for stdout/stderr to avoid Readable buffering.
// ---------------------------------------------------------------------------

export interface FakeSpawnOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** Simulate a spawn error (e.g., ENOENT) instead of emitting close. */
  error?: Error;
  /** If true, never emit close (for timeout tests). */
  hang?: boolean;
}

export interface StdinCapture {
  data: string;
  ended: boolean;
}

export function createFakeSpawn(options: FakeSpawnOptions): SpawnFn;
export function createFakeSpawn(options: FakeSpawnOptions, capture: StdinCapture): SpawnFn;
export function createFakeSpawn(options: FakeSpawnOptions, capture?: StdinCapture): SpawnFn {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return ((_command: string, _args: string[]) => {
    const child = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    const stdinObj = capture
      ? {
          write: (chunk: string | Buffer) => { capture.data += chunk.toString(); },
          end: () => { capture.ended = true; },
        }
      : { write: () => {}, end: () => {} };

    Object.assign(child, {
      stdin: stdinObj,
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

/**
 * Returns a SpawnFn that routes to different FakeSpawnOptions based on the
 * command string. Useful when a test needs to mock multiple binaries
 * (e.g., `security` and `docker`) in a single scenario.
 *
 * If no route matches, the child exits with code 1 and an error on stderr.
 */
export function createRoutingSpawn(
  routes: Record<string, FakeSpawnOptions>,
): SpawnFn {
  return ((command: string, args: string[]) => {
    // Find the first route whose key appears in the command or args
    const entry = Object.entries(routes).find(
      ([k]) => command.includes(k) || args.some((a) => a.includes(k)),
    );

    const options = entry ? entry[1] : { stderr: `unrouted command: ${command}`, exitCode: 1 };
    return createFakeSpawn(options)(command, args);
  }) as unknown as SpawnFn;
}

/**
 * Wrap any SpawnFn so that preflight auth-status probes (`claude auth status --json`)
 * return a healthy response, while all other spawns pass through to the inner function.
 * Useful for chat-routes tests that already mock invokeClaude but now also need to
 * satisfy the preflightCheck added before each Claude invocation.
 */
export function withHealthyPreflight(innerSpawnFn: SpawnFn): SpawnFn {
  const healthyAuth = JSON.stringify({
    loggedIn: true,
    authMethod: 'firstPartyOauth',
    apiProvider: 'firstParty',
  }) + '\n';
  const healthySpawn = createFakeSpawn({ stdout: healthyAuth, exitCode: 0 });

  return ((command: string, args: string[], ...rest: unknown[]) => {
    if (args.includes('auth') && args.includes('status')) {
      return healthySpawn(command, args);
    }
    return innerSpawnFn(command, args, ...(rest as [never]));
  }) as unknown as SpawnFn;
}

/** Build multi-line NDJSON stdout from event objects. */
export function ndjson(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}
