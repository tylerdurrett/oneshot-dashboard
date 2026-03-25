#!/usr/bin/env node

/**
 * One Shot — Ensure Sandbox
 * Non-interactive pre-flight check that runs as part of `prego`.
 *
 * - If the sandbox exists and is running → no-op.
 * - If the sandbox exists but is stopped → starts it + injects credentials.
 * - If the sandbox doesn't exist → creates it, injects credentials from Keychain.
 *   Falls back to prompting the user to run `pnpm sandbox` for interactive auth.
 */

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config ──────────────────────────────────────────────

const SANDBOX_NAME = process.env.SANDBOX_NAME ?? 'oneshot-sandbox';
const SANDBOX_WORKSPACE = process.env.SANDBOX_WORKSPACE ?? ROOT;

// ── Helpers ─────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', timeout: 15_000, ...opts }).toString().trim();
}

function isSandboxPluginAvailable() {
  try {
    run('docker sandbox ls');
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse `docker sandbox list` output to find our sandbox.
 * Returns { exists: boolean, status: string | null }.
 */
function getSandboxState() {
  try {
    const output = run('docker sandbox list');
    for (const line of output.split('\n')) {
      // Columns: NAME  AGENT  STATUS  WORKSPACE
      const cols = line.trim().split(/\s{2,}/);
      if (cols[0] === SANDBOX_NAME) {
        return { exists: true, status: cols[2]?.toLowerCase() ?? 'unknown' };
      }
    }
    return { exists: false, status: null };
  } catch {
    return { exists: false, status: null };
  }
}

function startSandbox() {
  console.log(`  Starting sandbox "${SANDBOX_NAME}"...`);
  try {
    run(`docker sandbox start ${SANDBOX_NAME}`, { timeout: 30_000 });
    console.log('  ✓ Sandbox started');
    return true;
  } catch (err) {
    console.log(`  ✗ Failed to start sandbox: ${err.message}`);
    return false;
  }
}

/**
 * Create the sandbox non-interactively (no TTY).
 * `docker sandbox run` with no -it flag creates and starts the sandbox,
 * then Claude exits immediately since there's no prompt.
 */
function createSandbox() {
  console.log(`  Creating sandbox "${SANDBOX_NAME}"...`);
  const result = spawnSync('docker', ['sandbox', 'run', '--name', SANDBOX_NAME, 'claude', SANDBOX_WORKSPACE], {
    stdio: 'pipe',
    timeout: 60_000,
  });

  if (result.status !== 0 && result.status !== null) {
    const stderr = result.stderr?.toString() ?? '';
    console.log(`  ✗ Sandbox creation failed: ${stderr.slice(0, 200)}`);
    return false;
  }

  console.log('  ✓ Sandbox created');
  return true;
}

function checkAuth() {
  try {
    const output = run(
      `docker sandbox exec -w ${SANDBOX_WORKSPACE} ${SANDBOX_NAME} claude auth status --json`,
      { timeout: 30_000 },
    );
    const parsed = JSON.parse(output);
    return parsed.loggedIn === true;
  } catch {
    return false;
  }
}

/**
 * Inject credentials from the macOS Keychain into the sandbox.
 * Returns true on success, false on any failure.
 */
function tryKeychainInjection() {
  if (process.platform !== 'darwin') return false;

  let raw;
  try {
    raw = run('security find-generic-password -s "Claude Code-credentials" -w', { timeout: 10_000 });
  } catch {
    return false;
  }

  let creds;
  try {
    creds = JSON.parse(raw);
  } catch {
    return false;
  }

  // Strip refresh token — it never leaves the host
  if (creds.claudeAiOauth && typeof creds.claudeAiOauth === 'object') {
    delete creds.claudeAiOauth.refreshToken;
  }

  const atomicWriteCmd = [
    'cat > /tmp/.creds-staging',
    'mv /tmp/.creds-staging /home/agent/.claude/.credentials.json',
    'chmod 600 /home/agent/.claude/.credentials.json',
  ].join(' && ');

  const result = spawnSync(
    'docker',
    ['sandbox', 'exec', '-i', SANDBOX_NAME, 'sh', '-c', atomicWriteCmd],
    { input: JSON.stringify(creds), stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
  );

  return result.status === 0;
}

// ── Main ────────────────────────────────────────────────

function main() {
  // Skip entirely if Docker sandbox plugin isn't available
  if (!isSandboxPluginAvailable()) {
    console.log('');
    console.log('  ⚠ Docker sandbox plugin not found — skipping sandbox check.');
    console.log('  Chat features will be unavailable. Install from: https://docs.docker.com/sandbox/');
    console.log('');
    return;
  }

  const state = getSandboxState();

  if (state.exists && state.status === 'running') {
    // Already running — quick auth check, inject if needed
    if (!checkAuth()) {
      console.log('  Sandbox running but not authenticated — injecting credentials...');
      if (tryKeychainInjection() && checkAuth()) {
        console.log('  ✓ Credentials injected');
      } else {
        console.log('');
        console.log('  ⚠ Sandbox is not authenticated. Run `pnpm sandbox` to log in.');
        console.log('');
      }
    }
    return;
  }

  console.log('');
  console.log(`  Ensuring sandbox "${SANDBOX_NAME}" is ready...`);

  if (state.exists && state.status === 'stopped') {
    if (!startSandbox()) {
      console.log('  ⚠ Could not start sandbox. Chat features will be unavailable.');
      console.log('');
      return;
    }
  } else if (!state.exists) {
    if (!createSandbox()) {
      console.log('');
      console.log('  ⚠ Could not create sandbox. Run `pnpm sandbox` for interactive setup.');
      console.log('');
      return;
    }
  }

  // Sandbox is now running — ensure it's authenticated
  if (!checkAuth()) {
    console.log('  Injecting credentials from Keychain...');
    if (tryKeychainInjection() && checkAuth()) {
      console.log('  ✓ Sandbox authenticated via Keychain');
    } else {
      console.log('');
      console.log('  ⚠ Sandbox created but not authenticated.');
      console.log('  Run `pnpm sandbox` to complete login.');
      console.log('');
      return;
    }
  }

  console.log('  ✓ Sandbox ready');
  console.log('');
}

main();
