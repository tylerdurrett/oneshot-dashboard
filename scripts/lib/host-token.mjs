/**
 * Shared helper: check if the host's OAuth token is near expiry and refresh
 * if needed. Used by both ensure-sandbox.mjs and sandbox-auth.mjs.
 *
 * Returns true if a refresh was triggered (caller should re-read credentials),
 * false if the token was already fresh or had no expiry.
 */

import { spawnSync } from 'node:child_process';

const REFRESH_THRESHOLD_MS = 600_000; // 10 minutes — same as config.hostRefreshThresholdMs

/**
 * @param {unknown} creds — parsed Keychain credentials JSON
 * @returns {boolean} true if a host refresh was triggered (credentials may have rotated)
 */
export function ensureHostTokenFresh(creds) {
  const expiresAt = creds?.claudeAiOauth?.expiresAt;

  if (typeof expiresAt !== 'number') {
    console.log('  [setup] Token has no expiresAt — skipping freshness check');
    return false;
  }

  const remaining = expiresAt - Date.now();
  if (remaining > REFRESH_THRESHOLD_MS) {
    console.log(`  [setup] Token fresh (expires in ${Math.round(remaining / 60_000)}m)`);
    return false;
  }

  console.log(`  [setup] Token near expiry (${Math.round(remaining / 60_000)}m remaining) — refreshing on host...`);
  try {
    spawnSync('claude', ['-p', '.'], { stdio: 'pipe', timeout: 30_000 });
    console.log('  [setup] Host token refresh completed');
    return true;
  } catch (err) {
    console.log(`  [setup] Host token refresh failed: ${err.message}`);
    return false;
  }
}
