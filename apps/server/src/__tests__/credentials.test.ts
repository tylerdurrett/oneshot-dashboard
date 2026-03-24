import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import {
  ensureHostTokenFresh,
  getHostTokenExpiresAt,
  injectCredentials,
  readKeychainCredentials,
  refreshAndInjectCredentials,
  stripRefreshToken,
} from '../services/credentials.js';
import type { SpawnFn } from '../services/sandbox.js';
import {
  type StdinCapture,
  createFakeSpawn,
  createRoutingSpawn,
  mockPlatform,
  restorePlatform,
} from './helpers.js';

afterEach(() => {
  restorePlatform();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A full credential object matching what the macOS Keychain returns. */
function fakeCredentials(overrides: Record<string, unknown> = {}) {
  return {
    claudeAiOauth: {
      accessToken: 'at-123',
      refreshToken: 'rt-secret',
      expiresAt: Date.now() + 3_600_000,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// stripRefreshToken
// ---------------------------------------------------------------------------

describe('stripRefreshToken', () => {
  it('removes the refresh token and preserves other fields', () => {
    const creds = fakeCredentials();
    const stripped = stripRefreshToken(creds) as Record<string, unknown>;

    const oauth = stripped.claudeAiOauth as Record<string, unknown>;
    expect(oauth.refreshToken).toBeUndefined();
    expect(oauth.accessToken).toBe('at-123');
    expect(typeof oauth.expiresAt).toBe('number');
  });

  it('does not mutate the original object', () => {
    const creds = fakeCredentials();
    stripRefreshToken(creds);

    expect(creds.claudeAiOauth.refreshToken).toBe('rt-secret');
  });

  it('handles missing claudeAiOauth gracefully', () => {
    const result = stripRefreshToken({ someOtherField: 'abc' });
    expect(result).toEqual({ someOtherField: 'abc' });
  });

  it('returns non-object input as-is', () => {
    expect(stripRefreshToken(null)).toBeNull();
    expect(stripRefreshToken(42)).toBe(42);
    expect(stripRefreshToken('str')).toBe('str');
  });
});

// ---------------------------------------------------------------------------
// getHostTokenExpiresAt
// ---------------------------------------------------------------------------

describe('getHostTokenExpiresAt', () => {
  it('extracts the expiresAt timestamp', () => {
    const ts = Date.now() + 1000;
    const result = getHostTokenExpiresAt({ claudeAiOauth: { expiresAt: ts } });
    expect(result).toBe(ts);
  });

  it('returns null when claudeAiOauth is missing', () => {
    expect(getHostTokenExpiresAt({ other: 1 })).toBeNull();
  });

  it('returns null when expiresAt is not a number', () => {
    expect(getHostTokenExpiresAt({ claudeAiOauth: { expiresAt: 'never' } })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(getHostTokenExpiresAt(null)).toBeNull();
    expect(getHostTokenExpiresAt(undefined)).toBeNull();
    expect(getHostTokenExpiresAt(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readKeychainCredentials
// ---------------------------------------------------------------------------

describe('readKeychainCredentials', () => {
  it('returns credentials on success', async () => {
    const creds = fakeCredentials();
    const spawnFn = createFakeSpawn({
      stdout: JSON.stringify(creds),
      exitCode: 0,
    });

    const result = await readKeychainCredentials(spawnFn);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.credentials as Record<string, unknown>).claudeAiOauth).toBeDefined();
    }
  });

  it('returns phase "parse" for invalid JSON output', async () => {
    const spawnFn = createFakeSpawn({
      stdout: 'not valid json!!!',
      exitCode: 0,
    });

    const result = await readKeychainCredentials(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('parse');
      expect(result.message).toContain('invalid JSON');
    }
  });

  it('returns phase "keychain" for non-zero exit code', async () => {
    const spawnFn = createFakeSpawn({
      stderr: 'security: SecKeychainSearchCopyNext: The specified item could not be found',
      exitCode: 44,
    });

    const result = await readKeychainCredentials(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('keychain');
      expect(result.message).toContain('exit 44');
    }
  });

  it('returns early on non-macOS platforms', async () => {
    mockPlatform('linux');

    const spawnFn = createFakeSpawn({ stdout: '{}', exitCode: 0 });
    const result = await readKeychainCredentials(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('keychain');
      expect(result.message).toContain('only available on macOS');
    }
  });

  it('returns phase "keychain" on timeout', async () => {
    const origTimeout = config.keychainTimeoutMs;
    (config as Record<string, unknown>).keychainTimeoutMs = 50;

    try {
      const spawnFn = createFakeSpawn({ hang: true });
      const result = await readKeychainCredentials(spawnFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.phase).toBe('keychain');
        expect(result.message).toContain('timed out');
      }
    } finally {
      (config as Record<string, unknown>).keychainTimeoutMs = origTimeout;
    }
  });

  it('returns phase "keychain" on spawn error', async () => {
    const spawnFn = createFakeSpawn({
      error: new Error('spawn security ENOENT'),
    });

    const result = await readKeychainCredentials(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('keychain');
      expect(result.message).toContain('ENOENT');
    }
  });
});

// ---------------------------------------------------------------------------
// injectCredentials
// ---------------------------------------------------------------------------

describe('injectCredentials', () => {
  it('returns ok on successful injection', async () => {
    const spawnFn = createFakeSpawn({ exitCode: 0 });
    const result = await injectCredentials('{"token":"abc"}', spawnFn);

    expect(result.ok).toBe(true);
  });

  it('pipes the JSON payload to stdin', async () => {
    const capture: StdinCapture = { data: '', ended: false };
    const spawnFn = createFakeSpawn({ exitCode: 0 }, capture);

    await injectCredentials('{"token":"abc"}', spawnFn);

    expect(capture.data).toBe('{"token":"abc"}');
    expect(capture.ended).toBe(true);
  });

  it('returns phase "docker-exec" on non-zero exit', async () => {
    const spawnFn = createFakeSpawn({
      stderr: 'Error: container not found',
      exitCode: 1,
    });

    const result = await injectCredentials('{}', spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('docker-exec');
      expect(result.message).toContain('exit 1');
    }
  });

  it('returns phase "docker-exec" on timeout', async () => {
    const origTimeout = config.injectTimeoutMs;
    (config as Record<string, unknown>).injectTimeoutMs = 50;

    try {
      const spawnFn = createFakeSpawn({ hang: true });
      const result = await injectCredentials('{}', spawnFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.phase).toBe('docker-exec');
        expect(result.message).toContain('timed out');
      }
    } finally {
      (config as Record<string, unknown>).injectTimeoutMs = origTimeout;
    }
  });

  it('returns phase "docker-exec" on spawn error', async () => {
    const spawnFn = createFakeSpawn({
      error: new Error('spawn docker ENOENT'),
    });

    const result = await injectCredentials('{}', spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('docker-exec');
      expect(result.message).toContain('ENOENT');
    }
  });
});

// ---------------------------------------------------------------------------
// ensureHostTokenFresh
// ---------------------------------------------------------------------------

describe('ensureHostTokenFresh', () => {
  // Reset the module-level inflight promise between tests by importing fresh.
  // Since we can't easily reset module state, we rely on each test awaiting
  // the result so the inflight clears via `.finally()`.

  it('returns fresh when token expiry is far in the future (no spawn)', async () => {
    const freshCreds = fakeCredentials({ expiresAt: Date.now() + 7_200_000 });
    const spawnFn = createFakeSpawn({
      stdout: JSON.stringify(freshCreds),
      exitCode: 0,
    });

    const result = await ensureHostTokenFresh(spawnFn);

    expect(result.fresh).toBe(true);
    if (result.fresh) {
      expect(result.credentials).toBeDefined();
    }
  });

  it('triggers host refresh when token is near expiry', async () => {
    // Token expires in 1 minute — well within the default 10-minute threshold
    const nearExpiryCreds = fakeCredentials({ expiresAt: Date.now() + 60_000 });
    let spawnCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      spawnCount++;
      if (command === 'security') {
        return createFakeSpawn({
          stdout: JSON.stringify(nearExpiryCreds),
          exitCode: 0,
        })(command, args);
      }
      // `claude -p "."` host refresh
      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as unknown as SpawnFn;

    const result = await ensureHostTokenFresh(spawnFn);

    expect(result.fresh).toBe(false);
    if (!result.fresh) {
      expect(result.refreshed).toBe(true);
    }
    // Two spawns: one for keychain read, one for `claude -p "."`
    expect(spawnCount).toBe(2);
  });

  it('deduplicates concurrent calls into a single spawn', async () => {
    const freshCreds = fakeCredentials({ expiresAt: Date.now() + 7_200_000 });
    let spawnCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      spawnCount++;
      return createFakeSpawn({
        stdout: JSON.stringify(freshCreds),
        exitCode: 0,
      })(command, args);
    }) as unknown as SpawnFn;

    // Fire two calls concurrently — they should share the same in-flight promise
    const [r1, r2] = await Promise.all([
      ensureHostTokenFresh(spawnFn),
      ensureHostTokenFresh(spawnFn),
    ]);

    expect(r1).toEqual(r2);
    // Only one keychain read should have been spawned
    expect(spawnCount).toBe(1);
  });

  it('returns not-fresh when keychain read fails', async () => {
    mockPlatform('linux');

    const spawnFn = createFakeSpawn({ exitCode: 0 });
    const result = await ensureHostTokenFresh(spawnFn);

    expect(result.fresh).toBe(false);
    if (!result.fresh) {
      expect(result.refreshed).toBe(false);
      expect(result.message).toContain('only available on macOS');
    }
  });
});

// ---------------------------------------------------------------------------
// refreshAndInjectCredentials
// ---------------------------------------------------------------------------

describe('refreshAndInjectCredentials', () => {
  it('completes the full pipeline successfully (fresh token path)', async () => {
    const creds = fakeCredentials({ expiresAt: Date.now() + 7_200_000 });

    const spawnFn = createRoutingSpawn({
      security: { stdout: JSON.stringify(creds), exitCode: 0 },
      docker: { exitCode: 0 },
    });

    const result = await refreshAndInjectCredentials(spawnFn);

    expect(result.ok).toBe(true);
  });

  it('short-circuits on keychain read failure', async () => {
    mockPlatform('linux');

    const spawnFn = createFakeSpawn({ exitCode: 0 });
    const result = await refreshAndInjectCredentials(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('keychain');
    }
  });

  it('returns failure when injection fails after successful keychain read', async () => {
    const creds = fakeCredentials({ expiresAt: Date.now() + 7_200_000 });

    const spawnFn = createRoutingSpawn({
      security: { stdout: JSON.stringify(creds), exitCode: 0 },
      docker: { stderr: 'container not running', exitCode: 1 },
    });

    const result = await refreshAndInjectCredentials(spawnFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('docker-exec');
    }
  });

  it('re-reads keychain after host token refresh (stale token path)', async () => {
    const staleCreds = fakeCredentials({ expiresAt: Date.now() + 60_000 });
    const freshCreds = fakeCredentials({ expiresAt: Date.now() + 7_200_000 });
    let keychainReadCount = 0;

    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'security') {
        keychainReadCount++;
        // First read returns stale, second returns fresh (after host refresh)
        const creds = keychainReadCount === 1 ? staleCreds : freshCreds;
        return createFakeSpawn({
          stdout: JSON.stringify(creds),
          exitCode: 0,
        })(command, args);
      }
      if (command === 'claude') {
        return createFakeSpawn({ exitCode: 0 })(command, args);
      }
      // docker injection
      return createFakeSpawn({ exitCode: 0 })(command, args);
    }) as unknown as SpawnFn;

    const result = await refreshAndInjectCredentials(spawnFn);

    expect(result.ok).toBe(true);
    // Two keychain reads: one for freshness check, one after refresh
    expect(keychainReadCount).toBe(2);
  });

  it('strips the refresh token before injecting', async () => {
    const creds = fakeCredentials({ expiresAt: Date.now() + 7_200_000 });
    const capture: StdinCapture = { data: '', ended: false };

    const spawnFn = ((command: string, args: string[]) => {
      if (command === 'security') {
        return createFakeSpawn({
          stdout: JSON.stringify(creds),
          exitCode: 0,
        })(command, args);
      }
      return createFakeSpawn({ exitCode: 0 }, capture)(command, args);
    }) as unknown as SpawnFn;

    await refreshAndInjectCredentials(spawnFn);

    const parsed = JSON.parse(capture.data) as Record<string, unknown>;
    const oauth = parsed.claudeAiOauth as Record<string, unknown>;
    expect(oauth.refreshToken).toBeUndefined();
    expect(oauth.accessToken).toBe('at-123');
  });
});
