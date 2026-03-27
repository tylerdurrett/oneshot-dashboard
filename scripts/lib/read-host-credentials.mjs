/**
 * Shared helper: read Claude credentials from the host system.
 * macOS: reads from Keychain via the `security` command.
 * Linux: reads from ~/.claude/.credentials.json directly.
 *
 * Returns { ok: true, credentials } or { ok: false, message }.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Read host credentials using the appropriate method for the current platform.
 * @returns {{ ok: true, credentials: unknown } | { ok: false, message: string }}
 */
export function readHostCredentials() {
  if (process.platform === 'darwin') {
    return readKeychainCredentials();
  }
  if (process.platform === 'linux') {
    return readLinuxCredentials();
  }
  return { ok: false, message: `Unsupported platform: ${process.platform}` };
}

function readKeychainCredentials() {
  let raw;
  try {
    raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      stdio: 'pipe',
      timeout: 10_000,
    }).toString().trim();
  } catch {
    return { ok: false, message: 'No Keychain credentials found' };
  }

  try {
    return { ok: true, credentials: JSON.parse(raw) };
  } catch {
    return { ok: false, message: 'Keychain credentials are not valid JSON' };
  }
}

function readLinuxCredentials() {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  let raw;
  try {
    raw = fs.readFileSync(credPath, 'utf8');
  } catch {
    return { ok: false, message: `Credential file not found: ${credPath}` };
  }

  try {
    return { ok: true, credentials: JSON.parse(raw) };
  } catch {
    return { ok: false, message: 'Credential file contains invalid JSON' };
  }
}
