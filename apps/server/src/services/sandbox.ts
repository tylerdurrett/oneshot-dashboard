import { spawn as defaultSpawn } from 'node:child_process';
import { config } from '../config.js';

/** Possible states a sandbox probe can return. */
export type SandboxStatus = 'healthy' | 'auth_failed' | 'unavailable';

/** Structured result from probing the sandbox. */
export interface SandboxProbeResult {
  status: SandboxStatus;
  /** Human-readable explanation of what happened. */
  message: string;
}

/** Minimal interface for the spawn function dependency (for DI in tests). */
export type SpawnFn = typeof defaultSpawn;

/** Default probe timeout: 30 seconds. */
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

/** Shape of the JSON returned by `claude auth status --json`. */
interface AuthStatusResponse {
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
}

const UNAVAILABLE_PATTERNS = [
  'no such container',
  'is not running',
  'cannot connect to the docker daemon',
  'sandbox not found',
  'docker daemon is not running',
  'does not exist',
];

const AUTH_FAILURE_PATTERNS = [
  'not logged in',
  'unauthenticated',
  'authentication required',
  'oauth token has expired',
  'token has expired',
];

/** Check if auth credentials indicate API-key fallback (not first-party OAuth). */
function isApiKeyAuth(authMethod?: string, apiProvider?: string): boolean {
  if (authMethod && /api[_-]?key/i.test(authMethod)) return true;
  if (apiProvider && !/^first[_-]?party$/i.test(apiProvider)) return true;
  return false;
}

/** Classify a non-zero exit error based on stderr/stdout patterns. */
function classifyError(stderr: string, stdout: string): SandboxProbeResult {
  const combined = (stderr + ' ' + stdout).toLowerCase();

  for (const pattern of UNAVAILABLE_PATTERNS) {
    if (combined.includes(pattern)) {
      return {
        status: 'unavailable',
        message: `Sandbox "${config.sandboxName}" is not available: matched "${pattern}"`,
      };
    }
  }

  for (const pattern of AUTH_FAILURE_PATTERNS) {
    if (combined.includes(pattern)) {
      return {
        status: 'auth_failed',
        message: `Sandbox "${config.sandboxName}" authentication failed: matched "${pattern}"`,
      };
    }
  }

  return {
    status: 'unavailable',
    message: `Sandbox "${config.sandboxName}" probe failed with unknown error`,
  };
}

/**
 * Probe the Docker sandbox to verify it is alive and authenticated with first-party OAuth.
 * Never rejects — always resolves with a SandboxProbeResult.
 */
export async function probeSandbox(
  spawnFn: SpawnFn = defaultSpawn,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<SandboxProbeResult> {
  return new Promise((resolve) => {
    const args = [
      'sandbox',
      'exec',
      '-w',
      config.sandboxWorkspace,
      config.sandboxName,
      'claude',
      'auth',
      'status',
      '--json',
    ];

    let child: ReturnType<SpawnFn>;
    try {
      child = spawnFn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        status: 'unavailable',
        message: `Failed to spawn docker process: ${(err as Error).message}`,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let resolved = false;

    function resolveOnce(result: SandboxProbeResult) {
      if (resolved) return;
      resolved = true;
      resolve(result);
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolveOnce({
        status: 'unavailable',
        message: `Sandbox probe timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        resolveOnce(classifyError(stderr, stdout));
        return;
      }

      // Zero exit — parse the JSON response
      let parsed: AuthStatusResponse;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        resolveOnce({
          status: 'unavailable',
          message: `Sandbox probe returned invalid JSON: ${stdout.slice(0, 200)}`,
        });
        return;
      }

      if (!parsed.loggedIn) {
        resolveOnce({
          status: 'auth_failed',
          message: `Sandbox "${config.sandboxName}" is not logged in`,
        });
        return;
      }

      if (isApiKeyAuth(parsed.authMethod, parsed.apiProvider)) {
        resolveOnce({
          status: 'auth_failed',
          message: `Sandbox "${config.sandboxName}" is using API key auth (authMethod: ${parsed.authMethod}, apiProvider: ${parsed.apiProvider}). First-party OAuth is required.`,
        });
        return;
      }

      resolveOnce({
        status: 'healthy',
        message: `Sandbox "${config.sandboxName}" is authenticated (${parsed.authMethod}, ${parsed.apiProvider})`,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolveOnce({
        status: 'unavailable',
        message: `Failed to spawn docker process: ${err.message}`,
      });
    });
  });
}
