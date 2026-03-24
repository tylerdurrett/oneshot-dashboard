import { spawn as defaultSpawn } from 'node:child_process';
import { config } from '../config.js';
import type { SpawnFn } from './sandbox.js';

export type { SpawnFn } from './sandbox.js';

/** Where in the credential pipeline a failure occurred. */
export type CredentialPhase = 'keychain' | 'docker-exec' | 'parse';

/** Discriminated union for credential injection results. Never throws. */
export type CredentialInjectionResult =
  | { ok: true; credentials: unknown }
  | { ok: false; phase: CredentialPhase; message: string };

/** Status of the host token after a refresh check. */
export type HostTokenStatus =
  | { fresh: true; expiresAt: number | null }
  | { fresh: false; refreshed: boolean; message: string };

/** Testable wrapper — `process.platform` is read-only so tests mock this function instead. */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Deep-clone credentials and remove the refresh token.
 * The refresh token must never leave the host — injecting it into the sandbox
 * would let the sandbox silently refresh its own access.
 */
export function stripRefreshToken(credentials: unknown): unknown {
  if (typeof credentials !== 'object' || credentials === null) {
    return credentials;
  }

  const cloned = structuredClone(credentials) as Record<string, unknown>;
  const oauth = cloned.claudeAiOauth as Record<string, unknown> | undefined;
  if (oauth && typeof oauth === 'object') {
    delete oauth.refreshToken;
  }
  return cloned;
}

/**
 * Extract the `claudeAiOauth.expiresAt` field as epoch milliseconds.
 * Returns `null` if the field is missing or not a number.
 */
export function getHostTokenExpiresAt(credentials: unknown): number | null {
  if (typeof credentials !== 'object' || credentials === null) return null;
  const oauth = (credentials as Record<string, unknown>).claudeAiOauth;
  if (typeof oauth !== 'object' || oauth === null) return null;
  const expiresAt = (oauth as Record<string, unknown>).expiresAt;
  return typeof expiresAt === 'number' ? expiresAt : null;
}

/**
 * Read Claude credentials from the macOS Keychain.
 * Guards on macOS — returns a phase-tagged failure on other platforms.
 * Never rejects.
 */
export async function readKeychainCredentials(
  spawnFn: SpawnFn = defaultSpawn,
): Promise<CredentialInjectionResult> {
  if (!isMacOS()) {
    return {
      ok: false,
      phase: 'keychain',
      message: 'Keychain injection is only available on macOS',
    };
  }

  return new Promise((resolve) => {
    let child: ReturnType<SpawnFn>;
    try {
      child = spawnFn(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      resolve({
        ok: false,
        phase: 'keychain',
        message: `Failed to spawn security command: ${(err as Error).message}`,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let resolved = false;

    function resolveOnce(result: CredentialInjectionResult) {
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
        ok: false,
        phase: 'keychain',
        message: `Keychain read timed out after ${config.keychainTimeoutMs}ms`,
      });
    }, config.keychainTimeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        resolveOnce({
          ok: false,
          phase: 'keychain',
          message: `Keychain read failed (exit ${code}): ${(stderr || stdout).slice(0, 500)}`,
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        resolveOnce({
          ok: false,
          phase: 'parse',
          message: `Keychain returned invalid JSON: ${stdout.slice(0, 200)}`,
        });
        return;
      }

      resolveOnce({ ok: true, credentials: parsed });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolveOnce({
        ok: false,
        phase: 'keychain',
        message: `Failed to spawn security command: ${err.message}`,
      });
    });
  });
}

/**
 * Inject credentials JSON into the Docker sandbox using an atomic write.
 * Pipes JSON to stdin of `docker sandbox exec -i`, which stages to a temp
 * file then atomically moves it into place. Never rejects.
 *
 * Atomic write prevents partial reads by other processes in the sandbox.
 */
export async function injectCredentials(
  credentialsJson: string,
  spawnFn: SpawnFn = defaultSpawn,
): Promise<CredentialInjectionResult> {
  return new Promise((resolve) => {
    const atomicWriteCmd = [
      'cat > /tmp/.creds-staging',
      'mv /tmp/.creds-staging /home/agent/.claude/.credentials.json',
      'chmod 600 /home/agent/.claude/.credentials.json',
    ].join(' && ');

    let child: ReturnType<SpawnFn>;
    try {
      child = spawnFn(
        'docker',
        [
          'sandbox', 'exec', '-i',
          config.sandboxName,
          'sh', '-c', atomicWriteCmd,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (err) {
      resolve({
        ok: false,
        phase: 'docker-exec',
        message: `Failed to spawn docker exec: ${(err as Error).message}`,
      });
      return;
    }

    let stderr = '';
    let resolved = false;

    function resolveOnce(result: CredentialInjectionResult) {
      if (resolved) return;
      resolved = true;
      resolve(result);
    }

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolveOnce({
        ok: false,
        phase: 'docker-exec',
        message: `Credential injection timed out after ${config.injectTimeoutMs}ms`,
      });
    }, config.injectTimeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        resolveOnce({
          ok: false,
          phase: 'docker-exec',
          message: `Credential injection failed (exit ${code}): ${stderr.slice(0, 500)}`,
        });
        return;
      }

      resolveOnce({ ok: true, credentials: null });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolveOnce({
        ok: false,
        phase: 'docker-exec',
        message: `Failed to spawn docker exec: ${err.message}`,
      });
    });

    child.stdin?.write(credentialsJson);
    child.stdin?.end();
  });
}
