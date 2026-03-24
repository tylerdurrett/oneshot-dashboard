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

export function createFakeSpawn(options: FakeSpawnOptions): SpawnFn {
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

/** Build multi-line NDJSON stdout from event objects. */
export function ndjson(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}
