#!/usr/bin/env node

/**
 * One Shot — Sandbox Auth
 * Sets up and authenticates the Docker sandbox. Handles everything automatically.
 * Run with: pnpm sandbox
 */

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      // Sandbox exists but not logged in — open interactive login
      console.log('  Sandbox exists but is not logged in.');
      console.log('');
      reauth(name, workspace);
      console.log('');

      // Re-check after login
      const recheck = checkAuthStatus(name, workspace);
      if (!recheck.loggedIn) {
        console.log('  ✗ Still not logged in. Try running `pnpm sandbox` again.');
        console.log('');
        process.exit(1);
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
