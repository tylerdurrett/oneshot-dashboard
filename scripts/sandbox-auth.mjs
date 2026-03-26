#!/usr/bin/env node

/**
 * One Shot — Sandbox Auth
 * Sets up and authenticates the Docker sandbox. Handles everything automatically.
 * Run with: pnpm sandbox
 */

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureHostTokenFresh } from './lib/host-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config ──────────────────────────────────────────────

function getConfig() {
  const name = process.env.SANDBOX_NAME ?? 'oneshot-sandbox';
  const workspace = process.env.SANDBOX_WORKSPACE ?? ROOT;
  return { name, workspace };
}

// ── Checks ──────────────────────────────────────────────

function isSandboxPluginAvailable() {
  try {
    execSync('docker sandbox ls', { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function sandboxExists(name, workspace) {
  try {
    execSync(
      `docker sandbox exec -w ${workspace} ${name} echo ok`,
      { stdio: 'pipe', timeout: 10_000 },
    );
    return true;
  } catch {
    return false;
  }
}

function checkAuthStatus(name, workspace) {
  try {
    const output = execSync(
      `docker sandbox exec -w ${workspace} ${name} claude auth status --json`,
      { stdio: 'pipe', timeout: 30_000 },
    ).toString();
    return JSON.parse(output);
  } catch {
    return { loggedIn: false };
  }
}

// ── Keychain Injection ───────────────────────────────────

/**
 * Try to inject credentials from the macOS Keychain into the sandbox.
 * Returns true on success, false on any failure (non-macOS, no keychain entry, etc.).
 * This lets returning users skip the interactive browser login entirely.
 */
function tryKeychainInjection(name) {
  if (process.platform !== 'darwin') return false;

  console.log('  Trying Keychain credential injection...');

  let raw;
  try {
    raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      stdio: 'pipe',
      timeout: 10_000,
    }).toString().trim();
  } catch {
    console.log('  No Keychain credentials found (first-time setup).');
    return false;
  }

  let creds;
  try {
    creds = JSON.parse(raw);
  } catch {
    console.log('  Keychain credentials are not valid JSON.');
    return false;
  }

  // Refresh host token if near expiry before injecting into sandbox.
  // Only re-read credentials if a refresh was actually triggered.
  const refreshed = ensureHostTokenFresh(creds);
  if (refreshed) {
    try {
      raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
        stdio: 'pipe',
        timeout: 10_000,
      }).toString().trim();
      creds = JSON.parse(raw);
    } catch (err) {
      console.log(`  [setup] Re-read after refresh failed, using original credentials: ${err.message}`);
    }
  }

  if (creds.claudeAiOauth && typeof creds.claudeAiOauth === 'object') {
    delete creds.claudeAiOauth.refreshToken;
  }

  // Atomic write: stage to /tmp then mv to avoid partial reads
  const atomicWriteCmd = [
    'cat > /tmp/.creds-staging',
    'mv /tmp/.creds-staging /home/agent/.claude/.credentials.json',
    'chmod 600 /home/agent/.claude/.credentials.json',
  ].join(' && ');

  const result = spawnSync(
    'docker',
    ['sandbox', 'exec', '-i', name, 'sh', '-c', atomicWriteCmd],
    { input: JSON.stringify(creds), stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
  );

  if (result.status !== 0) {
    console.log('  Credential injection failed.');
    return false;
  }

  console.log('  ✓ Credentials injected from Keychain');
  return true;
}

// ── Actions ─────────────────────────────────────────────

function createAndAuth(name, workspace) {
  console.log(`  Creating sandbox "${name}" and opening login...`);
  console.log('');
  console.log('  A browser window will open. Log in with your Anthropic account,');
  console.log('  then come back here and type /exit to continue.');
  console.log('');

  // Runs interactively — user sees the Claude session and browser opens
  const result = spawnSync('docker', ['sandbox', 'run', '--name', name, 'claude', workspace], {
    stdio: 'inherit',
    timeout: 300_000, // 5 minutes for login
  });

  if (result.status !== 0 && result.status !== null) {
    console.log('');
    console.log('  ✗ Sandbox creation failed. Make sure Docker is running.');
    console.log('');
    process.exit(1);
  }
}

function reauth(name, workspace) {
  console.log('  Opening login...');
  console.log('');
  console.log('  A browser window will open. Log in with your Anthropic account,');
  console.log('  then come back here and type /exit to continue.');
  console.log('');

  const result = spawnSync('docker', ['sandbox', 'run', '--name', name, 'claude', workspace], {
    stdio: 'inherit',
    timeout: 300_000,
  });

  if (result.status !== 0 && result.status !== null) {
    console.log('');
    console.log('  ✗ Login failed. Try running `pnpm sandbox` again.');
    console.log('');
    process.exit(1);
  }
}

function reauthOrDie(name, workspace) {
  reauth(name, workspace);
  console.log('');

  const status = checkAuthStatus(name, workspace);
  if (!status.loggedIn) {
    console.log('  ✗ Still not logged in. Try running `pnpm sandbox` again.');
    console.log('');
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────

function main() {
  const { name, workspace } = getConfig();

  console.log('');
  console.log('  One Shot — Sandbox Setup');
  console.log('  ════════════════════════════');
  console.log('');

  // Step 1: Check Docker sandbox plugin
  console.log('  Checking Docker sandbox plugin...');
  if (!isSandboxPluginAvailable()) {
    console.log('');
    console.log('  ✗ Docker sandbox plugin not found.');
    console.log('');
    console.log('  Install it from: https://docs.docker.com/sandbox/');
    console.log('  Then run `pnpm sandbox` again.');
    console.log('');
    process.exit(1);
  }
  console.log('  ✓ Docker sandbox plugin available');
  console.log('');

  // Step 2: Create sandbox if it doesn't exist
  const exists = sandboxExists(name, workspace);
  if (!exists) {
    createAndAuth(name, workspace);
    console.log('');
  }

  // Step 3: Check auth status
  console.log(`  Verifying sandbox "${name}"...`);
  const status = checkAuthStatus(name, workspace);

  if (!status.loggedIn) {
    if (exists) {
      // Sandbox exists but not logged in — try Keychain injection first
      console.log('  Sandbox exists but is not logged in.');
      console.log('');

      const injected = tryKeychainInjection(name);
      const keychainWorked = injected && checkAuthStatus(name, workspace).loggedIn;

      if (!keychainWorked) {
        if (injected) {
          console.log('  Injected credentials did not restore auth. Falling back to browser login.');
          console.log('');
        }
        reauthOrDie(name, workspace);
      }
    } else {
      console.log('  ✗ Login was not completed. Run `pnpm sandbox` again to retry.');
      console.log('');
      process.exit(1);
    }
  }

  if (status.apiProvider && status.apiProvider !== 'firstParty') {
    console.log(`  ✗ Using "${status.apiProvider}" auth instead of first-party OAuth.`);
    console.log('  The agent requires first-party OAuth (not API keys).');
    console.log('');
    console.log('  Logging out and re-authenticating...');
    try {
      execSync(`docker sandbox exec -w ${workspace} ${name} claude auth logout`, { stdio: 'pipe', timeout: 10_000 });
    } catch {
      // Ignore logout errors
    }
    reauth(name, workspace);

    const recheck = checkAuthStatus(name, workspace);
    if (!recheck.loggedIn || recheck.apiProvider !== 'firstParty') {
      console.log('  ✗ Re-authentication failed. Run `pnpm sandbox` again.');
      console.log('');
      process.exit(1);
    }
  }

  // All good
  console.log('  ✓ Sandbox ready');
  console.log('');
  console.log(`  Name:      ${name}`);
  console.log(`  Workspace: ${workspace}`);
  console.log(`  Auth:      first-party OAuth`);
  console.log('');
  console.log('  Run `pnpm dev` to start building!');
  console.log('');
}

main();
