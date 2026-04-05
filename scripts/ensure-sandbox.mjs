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
import { buildStartArgs, buildCreateArgs, parseSandboxList } from './lib/sandbox-commands.mjs';
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
// Only the workspace/ subdirectory is mounted — NOT the project root.
// This prevents the agent from accessing or modifying project source code.
const SANDBOX_WORKSPACE = process.env.SANDBOX_WORKSPACE ?? path.join(ROOT, 'workspace');

// ── Helpers ─────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', timeout: 15_000, ...opts }).toString().trim();
}

/**
 * Atomic-write a file into the sandbox via stdin.
 * Stages to a temp file then `mv`s to avoid partial reads.
 */
function injectFileIntoSandbox(content, destPath, { chmod, mkdir } = {}) {
  const staging = '/tmp/.inject-staging';
  const steps = [];
  if (mkdir) steps.push(`mkdir -p ${mkdir}`);
  steps.push(`cat > ${staging}`, `mv ${staging} ${destPath}`);
  if (chmod) steps.push(`chmod ${chmod} ${destPath}`);

  const result = spawnSync(
    'docker',
    ['sandbox', 'exec', '-i', SANDBOX_NAME, 'sh', '-c', steps.join(' && ')],
    { input: content, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
  );
  return result.status === 0;
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
    return parseSandboxList(output, SANDBOX_NAME);
  } catch {
    return { exists: false, status: null };
  }
}

/**
 * Resume a stopped sandbox.
 * There is no `docker sandbox start` command — `docker sandbox run <name>`
 * resumes an existing sandbox the same way it creates a new one.
 * Uses async spawn + polling (same as createSandbox) because the command
 * blocks until the agent exits.
 */
function startSandbox() {
  console.log(`  Starting sandbox "${SANDBOX_NAME}"...`);
  return new Promise((resolve) => {
    const child = spawn('docker', buildStartArgs(SANDBOX_NAME), {
      stdio: 'pipe',
      detached: true,
    });

    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearInterval(poller);
      clearTimeout(deadline);
      child.unref();
      resolve(success);
    };

    child.on('error', () => finish(false));
    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        console.log('  ✓ Sandbox started');
        finish(true);
      } else {
        const stderr = child.stderr?.read()?.toString() ?? '';
        console.log(`  ✗ Failed to start sandbox: ${stderr.slice(0, 200)}`);
        finish(false);
      }
    });

    const poller = setInterval(() => {
      try {
        execFileSync('docker', ['sandbox', 'exec', SANDBOX_NAME, 'echo', 'ready'], { stdio: 'pipe', timeout: 5_000 });
        console.log('  ✓ Sandbox started');
        finish(true);
      } catch {
        // Not ready yet
      }
    }, 3_000);

    const deadline = setTimeout(() => {
      console.log('  ✗ Sandbox start timed out');
      finish(false);
    }, 30_000);
  });
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
    const child = spawn('docker', buildCreateArgs(SANDBOX_NAME, SANDBOX_WORKSPACE), {
      stdio: 'pipe',
      detached: true,
    });

    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearInterval(poller);
      clearTimeout(deadline);
      // Don't SIGKILL — the sandbox may still be loading its container image.
      // Killing the process during initialization corrupts the sandbox state.
      // Just detach; Claude exits on its own since there's no stdin.
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

    // Poll with actual exec to verify the sandbox is ready — `docker sandbox list`
    // shows "running" before the container is fully initialized, so checking list
    // alone leads to premature success and broken exec calls.
    const poller = setInterval(() => {
      try {
        execSync(`docker sandbox exec ${SANDBOX_NAME} echo ready`, { stdio: 'pipe', timeout: 5_000 });
        console.log('  ✓ Sandbox created');
        finish(true);
      } catch {
        // Not ready yet — keep polling
      }
    }, 3_000);

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

  return injectFileIntoSandbox(
    JSON.stringify(creds),
    '/home/agent/.claude/.credentials.json',
    { chmod: '600', mkdir: '/home/agent/.claude' },
  );
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
 * Allow the sandbox to connect to host.docker.internal (loopback).
 * The MCP timer server calls the host API via host.docker.internal:<port>,
 * which resolves to 127.0.0.1 — blocked by default sandbox network policy.
 */
function allowHostNetworking() {
  try {
    execFileSync(
      'docker',
      ['sandbox', 'network', 'proxy', SANDBOX_NAME, '--allow-cidr', '127.0.0.0/8'],
      { stdio: 'pipe', timeout: 15_000 },
    );
    console.log('  ✓ Host networking allowed (127.0.0.0/8)');
  } catch {
    console.log('  ⚠ Could not configure sandbox network — MCP timer tools may not reach host API');
  }
}

/** Inject all sandbox assets. None are available via the mount — only workspace/ is mounted. */
function injectSandboxAssets() {
  const soulPath = path.join(ROOT, 'apps', 'server', 'src', 'chat', 'soul.md');
  let soulContent;
  try {
    soulContent = fs.readFileSync(soulPath, 'utf8');
  } catch {
    console.log(`  ⚠ Soul file not found at ${soulPath}`);
    return;
  }

  if (injectFileIntoSandbox(soulContent, '/home/agent/.claude/CLAUDE.md', { mkdir: '/home/agent/.claude' })) {
    console.log('  ✓ Soul file injected as CLAUDE.md');
  } else {
    console.log('  ⚠ Could not inject soul file');
  }
}

/**
 * Write MCP server config to the workspace's .mcp.json.
 * Claude Code reads MCP server definitions from .mcp.json (project scope),
 * NOT from settings.json which is for general settings only.
 *
 * Written to the host workspace directory (not injected via docker exec)
 * because the server invokes Claude with `-w <host-path>` and Docker
 * preserves the host path inside the sandbox via VirtioFS. Claude's cwd
 * is the host path, so .mcp.json must be there.
 */
function injectMcpConfig() {
  const serverPort = readServerPort();
  const mcpConfig = {
    mcpServers: {
      'oneshot': {
        type: 'http',
        url: `http://host.docker.internal:${serverPort}/mcp`,
      },
    },
  };

  try {
    fs.writeFileSync(path.join(SANDBOX_WORKSPACE, '.mcp.json'), JSON.stringify(mcpConfig, null, 2));
    console.log('  ✓ MCP server config written (.mcp.json)');
  } catch (err) {
    console.log(`  ⚠ Could not write .mcp.json — chat tools may be unavailable: ${err.message}`);
  }
}

// ── Main ────────────────────────────────────────────────

async function main() {
  // Always write .mcp.json — it's a host file write that doesn't need Docker.
  // Must be present before the sandbox starts so the chat agent sees MCP tools.
  injectMcpConfig();

  // Skip Docker-dependent setup if the sandbox plugin isn't available
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
    allowHostNetworking();
    injectSandboxAssets();
    return;
  }

  console.log('');
  console.log(`  Ensuring sandbox "${SANDBOX_NAME}" is ready...`);

  // Ensure the workspace directory exists before creating/starting the sandbox.
  fs.mkdirSync(SANDBOX_WORKSPACE, { recursive: true });

  if (state.exists && state.status === 'stopped') {
    if (!(await startSandbox())) {
      console.error('');
      console.error(`  ERROR: Sandbox "${SANDBOX_NAME}" exists (stopped) but could not be resumed.`);
      console.error(`    Try: docker sandbox rm ${SANDBOX_NAME} && pnpm prego`);
      console.error(`    Or:  docker sandbox ls   (check current state)`);
      console.error('');
      process.exit(1);
    }
  } else if (!state.exists) {
    if (!(await createSandbox())) {
      console.error('');
      console.error(`  ERROR: Could not create sandbox "${SANDBOX_NAME}".`);
      console.error('    Check that Docker Desktop is running and the sandbox plugin is installed.');
      console.error('    Try: docker sandbox ls   (verify plugin works)');
      console.error('');
      process.exit(1);
    }
  }

  // Sandbox is now running — ensure it's authenticated
  if (!checkAuth()) {
    console.log('  Injecting host credentials...');
    if (tryCredentialInjection() && checkAuth()) {
      console.log('  ✓ Sandbox authenticated via host credentials');
    } else {
      console.error('');
      console.error(`  ERROR: Sandbox "${SANDBOX_NAME}" is running but not authenticated.`);
      console.error('    Credential injection from host failed.');
      console.error('    Fix: Run `pnpm sandbox` for interactive login.');
      console.error('');
      process.exit(1);
    }
  }

  ensureProxyCACert();
  allowHostNetworking();
  injectSandboxAssets();

  console.log('  ✓ Sandbox ready');
  console.log('');
}

main();
