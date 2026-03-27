import { spawn as defaultSpawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import type { SpawnFn } from './sandbox.js';

export type { SpawnFn } from './sandbox.js';

/** Where in the credential pipeline a failure occurred. */
export type CredentialPhase = 'keychain' | 'credential-file' | 'docker-exec' | 'parse';

/** Discriminated union for credential injection results. Never throws. */
export type CredentialInjectionResult =
  | { ok: true; credentials: unknown }
  | { ok: false; phase: CredentialPhase; message: string };

/** Status of the host token after a refresh check. */
export type HostTokenStatus =
  | { fresh: true; expiresAt: number | null; credentials: unknown }
  | { fresh: false; refreshed: boolean; message: string };

/** Testable wrapper — `process.platform` is read-only so tests mock this function instead. */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Whether the current platform supports reading host credentials and injecting
 * them into the Docker sandbox. macOS uses Keychain; Linux reads the credential
 * file directly. Separates capability from platform identity.
 */
export function supportsHostCredentialInjection(): boolean {
  return process.platform === 'darwin' || process.platform === 'linux';
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
        console.warn(`[credentials] keychain read failed (exit ${code})`);
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
        console.warn('[credentials] keychain returned invalid JSON');
        resolveOnce({
          ok: false,
          phase: 'parse',
          message: `Keychain returned invalid JSON: ${stdout.slice(0, 200)}`,
        });
        return;
      }

      console.log('[credentials] keychain read: success');
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
 * Read Claude credentials from the Linux credential file at
 * `~/.claude/.credentials.json`. This is the same JSON format that macOS
 * Keychain returns — on Linux, Claude Code stores it as a plain file.
 * Guards on Linux — returns a phase-tagged failure on other platforms.
 * Never rejects.
 */
export async function readCredentialFile(): Promise<CredentialInjectionResult> {
  if (process.platform !== 'linux') {
    return {
      ok: false,
      phase: 'credential-file',
      message: 'Credential file injection is only available on Linux',
    };
  }

  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  let raw: string;
  try {
    raw = await fs.promises.readFile(credPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      console.warn(`[credentials] credential file not found: ${credPath}`);
      return {
        ok: false,
        phase: 'credential-file',
        message: `Credential file not found: ${credPath}`,
      };
    }
    console.warn(`[credentials] credential file read failed: ${(err as Error).message}`);
    return {
      ok: false,
      phase: 'credential-file',
      message: `Failed to read credential file: ${(err as Error).message}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[credentials] credential file returned invalid JSON');
    return {
      ok: false,
      phase: 'parse',
      message: `Credential file contains invalid JSON: ${raw.slice(0, 200)}`,
    };
  }

  console.log('[credentials] credential file read: success');
  return { ok: true, credentials: parsed };
}

/**
 * Platform-dispatching credential reader. Routes to the macOS Keychain reader
 * on Darwin or the credential file reader on Linux.
 */
export async function readHostCredentials(
  spawnFn: SpawnFn = defaultSpawn,
): Promise<CredentialInjectionResult> {
  if (process.platform === 'darwin') {
    return readKeychainCredentials(spawnFn);
  }
  if (process.platform === 'linux') {
    return readCredentialFile();
  }
  return {
    ok: false,
    phase: 'credential-file',
    message: `Unsupported platform for credential reading: ${process.platform}`,
  };
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
        console.warn(`[credentials] injection failed (exit ${code})`);
        resolveOnce({
          ok: false,
          phase: 'docker-exec',
          message: `Credential injection failed (exit ${code}): ${stderr.slice(0, 500)}`,
        });
        return;
      }

      console.log('[credentials] injection: success');
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

// ---------------------------------------------------------------------------
// Host Token Refresh & Pipeline
// ---------------------------------------------------------------------------

let inflightRefresh: Promise<HostTokenStatus> | null = null;

/**
 * Check whether the host's OAuth token is near expiry and refresh if needed.
 * Spawns `claude -p "."` on the host to trigger the CLI's built-in OAuth refresh.
 * Concurrent calls share a single in-flight spawn. Never rejects.
 */
export async function ensureHostTokenFresh(
  spawnFn: SpawnFn = defaultSpawn,
): Promise<HostTokenStatus> {
  if (inflightRefresh) return inflightRefresh;

  const promise = doEnsureHostTokenFresh(spawnFn).finally(() => {
    inflightRefresh = null;
  });
  inflightRefresh = promise;
  return promise;
}

async function doEnsureHostTokenFresh(
  spawnFn: SpawnFn,
): Promise<HostTokenStatus> {
  // Platform-dispatching read: macOS Keychain or Linux credential file.
  const hostResult = await readHostCredentials(spawnFn);
  if (!hostResult.ok) {
    return { fresh: false, refreshed: false, message: hostResult.message };
  }

  const expiresAt = getHostTokenExpiresAt(hostResult.credentials);
  const remainingMs = expiresAt !== null ? expiresAt - Date.now() : null;
  console.log(`[credentials] host token check: remainingMs=${remainingMs}, threshold=${config.hostRefreshThresholdMs}`);

  if (remainingMs === null || remainingMs > config.hostRefreshThresholdMs) {
    console.log('[credentials] host token is fresh, no refresh needed');
    return { fresh: true, expiresAt, credentials: hostResult.credentials };
  }

  console.log('[credentials] host token near expiry, triggering refresh via claude -p "."');
  return new Promise<HostTokenStatus>((resolve) => {
    let child: ReturnType<SpawnFn>;
    try {
      child = spawnFn('claude', ['-p', '.'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        fresh: false,
        refreshed: false,
        message: `Failed to spawn host refresh: ${(err as Error).message}`,
      });
      return;
    }

    let resolved = false;
    function resolveOnce(result: HostTokenStatus) {
      if (resolved) return;
      resolved = true;
      resolve(result);
    }

    // Host refresh spawns the Claude CLI, which may trigger an OAuth flow —
    // use the longer inject timeout rather than the keychain read timeout.
    const timeout = setTimeout(() => {
      child.kill();
      resolveOnce({
        fresh: false,
        refreshed: false,
        message: `Host token refresh timed out after ${config.injectTimeoutMs}ms`,
      });
    }, config.injectTimeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || code === null) {
        console.log('[credentials] host token refresh succeeded');
        resolveOnce({ fresh: false, refreshed: true, message: 'Host token refreshed' });
      } else {
        console.warn(`[credentials] host token refresh failed (code=${code})`);
        resolveOnce({
          fresh: false,
          refreshed: false,
          message: `Host refresh exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolveOnce({
        fresh: false,
        refreshed: false,
        message: `Host refresh error: ${err.message}`,
      });
    });
  });
}

/**
 * Full credential injection pipeline. Primary public API for credential injection.
 * Ensures host token freshness, reads credentials, strips the refresh token
 * (sandbox must not hold it), then injects into the Docker sandbox.
 */
export async function refreshAndInjectCredentials(
  spawnFn: SpawnFn = defaultSpawn,
): Promise<CredentialInjectionResult> {
  console.log('[credentials] pipeline: starting refresh-and-inject');
  const hostStatus = await ensureHostTokenFresh(spawnFn);

  // Reuse credentials from the freshness check when no refresh was needed,
  // otherwise re-read since the host CLI may have rotated the token.
  let credentials: unknown;
  if (hostStatus.fresh) {
    console.log('[credentials] pipeline: using cached credentials from freshness check');
    credentials = hostStatus.credentials;
  } else {
    console.log('[credentials] pipeline: re-reading credentials after host refresh');
    const hostResult = await readHostCredentials(spawnFn);
    if (!hostResult.ok) return hostResult;
    credentials = hostResult.credentials;
  }

  const stripped = stripRefreshToken(credentials);
  return injectCredentials(JSON.stringify(stripped), spawnFn);
}
