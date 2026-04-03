#!/usr/bin/env node

/**
 * One Shot — Ensure Sandbox
 * Non-interactive pre-flight check that runs as part of `prego`.
 *
 * - If the sandbox exists and is running → no-op.
 * - If the sandbox exists but is stopped → starts it + injects credentials.
 * - If the sandbox doesn't exist → creates it, injects credentials from host.
 *   Falls back to prompting the user to run `pnpm sandbox` for interactive auth.
 */

import { execFileSync, execSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureHostTokenFresh } from './lib/host-token.mjs';
import { readHostCredentials } from './lib/read-host-credentials.mjs';
import { buildSandboxExecArgs } from './lib/sandbox-exec.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Read server port from project.config.json (same convention as config.ts). */
function readServerPort() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.serverPort === 'number') return parsed.serverPort;
    if (typeof parsed.port === 'number') return parsed.port + 2;
  } catch { /* fall through */ }
  return 4902;
}

// ── Config ──────────────────────────────────────────────

const SANDBOX_NAME = process.env.SANDBOX_NAME ?? 'oneshot-sandbox';
// IMPORTANT: `docker sandbox run claude WORKSPACE` mounts the workspace directory into the
// sandbox via VirtioFS at the SAME absolute path as the host (e.g. /Users/foo/project is at
// /Users/foo/project inside the sandbox, NOT at /home/agent/workspace/).
// The default CWD for `docker sandbox exec` is /home/agent/workspace/ which is a separate,
// empty, persistent directory — NOT the mounted workspace.
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
 *
 * On WSL2, `docker sandbox run` spawns docker.exe on the Windows side which
 * ignores SIGTERM, causing spawnSync's timeout to block indefinitely.
 * We use async spawn + polling to detect when the sandbox is up and move on.
 */
function createSandbox() {
  console.log(`  Creating sandbox "${SANDBOX_NAME}"...`);
  return new Promise((resolve) => {
    const child = spawn('docker', ['sandbox', 'run', '--name', SANDBOX_NAME, 'claude', SANDBOX_WORKSPACE], {
      stdio: 'pipe',
      detached: true,
    });

    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearInterval(poller);
      clearTimeout(deadline);
      // Kill the process tree — SIGKILL because SIGTERM doesn't work on WSL2
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      child.unref();
      resolve(success);
    };

    child.on('error', () => finish(false));
    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        console.log('  ✓ Sandbox created');
        finish(true);
      } else {
        const stderr = child.stderr?.read()?.toString() ?? '';
        console.log(`  ✗ Sandbox creation failed: ${stderr.slice(0, 200)}`);
        finish(false);
      }
    });

    // Poll for sandbox existence — handles the WSL2 case where the process hangs
    // but the sandbox is actually created in the background.
    const poller = setInterval(() => {
      const state = getSandboxState();
      if (state.exists && state.status === 'running') {
        console.log('  ✓ Sandbox created');
        finish(true);
      }
    }, 2_000);

    // Hard deadline so we don't hang forever
    const deadline = setTimeout(() => {
      console.log('  ✗ Sandbox creation timed out');
      finish(false);
    }, 60_000);
  });
}

function checkAuth() {
  try {
    const output = execFileSync(
      'docker',
      buildSandboxExecArgs({
        name: SANDBOX_NAME,
        workspace: SANDBOX_WORKSPACE,
        command: ['claude', 'auth', 'status', '--json'],
      }),
      { timeout: 30_000 },
    ).toString().trim();
    const parsed = JSON.parse(output);
    return parsed.loggedIn === true;
  } catch {
    return false;
  }
}

/**
 * Inject credentials from the host into the sandbox.
 * macOS: reads from Keychain. Linux: reads from ~/.claude/.credentials.json.
 * Returns true on success, false on any failure.
 */
function tryCredentialInjection() {
  const result = readHostCredentials();
  if (!result.ok) {
    console.log(`  ${result.message}`);
    return false;
  }

  let creds = result.credentials;

  // Refresh host token if near expiry before injecting into sandbox.
  // Only re-read credentials if a refresh was actually triggered.
  const refreshed = ensureHostTokenFresh(creds);
  if (refreshed) {
    const reread = readHostCredentials();
    if (reread.ok) {
      creds = reread.credentials;
    } else {
      console.log(`  [setup] Re-read after refresh failed, using original credentials: ${reread.message}`);
    }
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

  const injectionResult = spawnSync(
    'docker',
    ['sandbox', 'exec', '-i', SANDBOX_NAME, 'sh', '-c', atomicWriteCmd],
    { input: JSON.stringify(creds), stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
  );

  return injectionResult.status === 0;
}

/**
 * Docker Desktop's sandbox proxy sets PROXY_CA_CERT_B64 but doesn't always
 * write the cert to disk. NODE_EXTRA_CA_CERTS / SSL_CERT_FILE point to
 * the file, so HTTPS calls fail with "self-signed certificate" if it's missing.
 * This writes the cert and updates the system trust store.
 */
function ensureProxyCACert() {
  try {
    // Single round-trip: check if cert exists, if not check for env var and write it.
    // Runs as root since writing to /usr/local/share/ca-certificates/ requires it.
    const script = [
      '[ -f /usr/local/share/ca-certificates/proxy-ca.crt ] && exit 0',
      '[ -z "$PROXY_CA_CERT_B64" ] && exit 0',
      'echo "$PROXY_CA_CERT_B64" | base64 -d > /usr/local/share/ca-certificates/proxy-ca.crt && update-ca-certificates',
    ].join(' && ');

    const result = spawnSync(
      'docker',
      ['sandbox', 'exec', '--user', 'root', SANDBOX_NAME, 'sh', '-c', script],
      { stdio: 'pipe', timeout: 15_000 },
    );

    // exit 0 from the first two guards means "nothing to do"
    const output = result.stdout?.toString() ?? '';
    if (output.includes('added')) {
      console.log('  ✓ Proxy CA certificate installed');
    }
  } catch {
    // Non-fatal — log and continue
    console.log('  ⚠ Could not install proxy CA certificate');
  }
}

/**
 * Inject sandbox assets that aren't available via the VirtioFS mount:
 * - Soul file → /home/agent/.claude/CLAUDE.md (agent identity, auto-loaded by Claude Code)
 * - MCP config → /home/agent/.claude/settings.json (timer tools, dynamically generated with port)
 *
 * The MCP server bundle itself is NOT injected — it's accessible at its absolute host path
 * via the VirtioFS mount (see SANDBOX_WORKSPACE comment above).
 */
function injectSandboxAssets() {
  const soulPath = path.join(ROOT, 'apps', 'server', 'src', 'chat', 'soul.md');
  let soulContent;
  try {
    soulContent = fs.readFileSync(soulPath, 'utf8');
  } catch {
    console.log(`  ⚠ Soul file not found at ${soulPath}`);
    return;
  }

  const atomicWriteCmd = 'mkdir -p /home/agent/.claude && cat > /tmp/.soul-staging && mv /tmp/.soul-staging /home/agent/.claude/CLAUDE.md';
  const result = spawnSync(
    'docker',
    ['sandbox', 'exec', '-i', SANDBOX_NAME, 'sh', '-c', atomicWriteCmd],
    { input: soulContent, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000 },
  );

  if (result.status === 0) {
    console.log('  ✓ Soul file injected as CLAUDE.md');
  } else {
    console.log('  ⚠ Could not inject soul file');
  }

  injectMcpConfig();
}

/**
 * Inject MCP server config into the sandbox's Claude settings.
 * Merges `mcpServers.oneshot-timers` into the existing settings.json,
 * preserving any other settings already present.
 */
function injectMcpConfig() {
  // Read existing settings (may not exist yet)
  let existing = {};
  try {
    const raw = execFileSync(
      'docker',
      ['sandbox', 'exec', SANDBOX_NAME, 'cat', '/home/agent/.claude/settings.json'],
      { timeout: 10_000 },
    ).toString().trim();
    existing = JSON.parse(raw);
  } catch (err) {
    // File doesn't exist → expected on first run. Invalid JSON → warn.
    if (err?.status === 0) {
      console.log('  ⚠ Existing settings.json was not valid JSON — starting fresh');
    }
  }

  // Merge in our MCP server config, passing the API base URL so the
  // MCP server connects to the correct host port.
  const serverPort = readServerPort();
  const mcpServers = (existing && typeof existing === 'object' && existing.mcpServers) || {};
  mcpServers['oneshot-timers'] = {
    command: 'node',
    args: [path.join(ROOT, 'apps', 'server', 'dist', 'timer-mcp-server.mjs')],
    env: { ONESHOT_API_BASE: `http://host.docker.internal:${serverPort}` },
  };
  const merged = { ...existing, mcpServers };

  // Atomic write via temp file
  const atomicWriteCmd = [
    'cat > /tmp/.settings-staging',
    'mv /tmp/.settings-staging /home/agent/.claude/settings.json',
  ].join(' && ');

  const result = spawnSync(
    'docker',
    ['sandbox', 'exec', '-i', SANDBOX_NAME, 'sh', '-c', atomicWriteCmd],
    { input: JSON.stringify(merged, null, 2), stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000 },
  );

  if (result.status === 0) {
    console.log('  ✓ MCP timer server config injected');
  } else {
    console.log('  ⚠ Could not inject MCP config — chat timer tools may be unavailable');
  }
}

// ── Main ────────────────────────────────────────────────

async function main() {
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
      console.log('  Sandbox running but not authenticated — injecting host credentials...');
      if (tryCredentialInjection() && checkAuth()) {
        console.log('  ✓ Host credentials injected');
      } else {
        console.log('');
        console.log('  ⚠ Sandbox is not authenticated. Run `pnpm sandbox` to log in.');
        console.log('');
      }
    }
    ensureProxyCACert();
    injectSandboxAssets();
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
    if (!(await createSandbox())) {
      console.log('');
      console.log('  ⚠ Could not create sandbox. Run `pnpm sandbox` for interactive setup.');
      console.log('');
      return;
    }
  }

  // Sandbox is now running — ensure it's authenticated
  if (!checkAuth()) {
    console.log('  Injecting host credentials...');
    if (tryCredentialInjection() && checkAuth()) {
      console.log('  ✓ Sandbox authenticated via host credentials');
    } else {
      console.log('');
      console.log('  ⚠ Sandbox created but not authenticated.');
      console.log('  Run `pnpm sandbox` to complete login.');
      console.log('');
      return;
    }
  }

  ensureProxyCACert();
  injectSandboxAssets();

  console.log('  ✓ Sandbox ready');
  console.log('');
}

main();
