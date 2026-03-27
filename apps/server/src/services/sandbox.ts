import { spawn as defaultSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import {
  ensureHostTokenFresh,
  injectCredentials,
  readHostCredentials,
  stripRefreshToken,
  refreshAndInjectCredentials,
} from './credentials.js';

/** Possible states a sandbox probe can return. */
export type SandboxStatus = 'healthy' | 'auth_failed' | 'unavailable';

/** Structured result from probing the sandbox. */
export interface SandboxProbeResult {
  status: SandboxStatus;
  /** Human-readable explanation of what happened. */
  message: string;
}

/** Structured result from a preflight check with optional auth recovery. */
export interface PreflightResult {
  ok: boolean;
  status: SandboxStatus;
  message: string;
  recoveryAttempted: boolean;
}

export type PrepareSandboxFailureCode =
  | 'auth_unavailable'
  | 'sandbox_unavailable'
  | 'host_refresh_failed'
  | 'verification_failed';

export type PrepareSandboxResult =
  | { ok: true; message: string }
  | { ok: false; code: PrepareSandboxFailureCode; message: string };

/** Minimal interface for the spawn function dependency (for DI in tests). */
export type SpawnFn = typeof defaultSpawn;

/** Default probe timeout: 30 seconds. */
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

/** Default inactivity timeout for Claude invocations: 10 minutes. */
const DEFAULT_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval for checking inactivity (5 seconds). */
const INACTIVITY_CHECK_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Circuit Breaker — prevents heal-flapping when the sandbox can't stabilize.
// Limits recovery to healMaxAttempts per healWindowMs, then fails fast.
// ---------------------------------------------------------------------------

const circuitBreaker = {
  attempts: [] as number[],
};

/** Prune stale attempts and check if recovery should be blocked. */
function isCircuitOpen(): boolean {
  const cutoff = Date.now() - config.healWindowMs;
  circuitBreaker.attempts = circuitBreaker.attempts.filter((t) => t > cutoff);
  return circuitBreaker.attempts.length >= config.healMaxAttempts;
}

/** Record a recovery attempt (call after every injection, success or failure). */
function recordHealFailure(): void {
  circuitBreaker.attempts.push(Date.now());
}

/** Clear breaker history after a healthy readiness cycle. */
function resetHealFailures(): void {
  circuitBreaker.attempts = [];
}

/** Clear circuit breaker state. Exported for test isolation. */
export function resetCircuitBreaker(): void {
  circuitBreaker.attempts = [];
}

/** Shape of the JSON returned by `claude auth status --json`. */
interface AuthStatusResponse {
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
}

const UNAVAILABLE_PATTERNS = [
  'no such container',
  'is not running',
  'cannot connect to the docker daemon',
  'sandbox not found',
  'docker daemon is not running',
  'does not exist',
];

const AUTH_FAILURE_PATTERNS = [
  'not logged in',
  'unauthenticated',
  'authentication required',
  'oauth token has expired',
  'token has expired',
  // 401 responses from the Anthropic API surface these strings in the CLI's
  // NDJSON output and/or stderr. Without them, a stale-token 401 is classified
  // as an unknown error and auth recovery never triggers.
  'failed to authenticate',
  'authentication_error',
  'invalid authentication credentials',
];

const RESUME_FAILURE_PATTERNS = [
  'invalid session',
  'session not found',
  'could not resume',
  'no conversation found',
];

/** Check if auth credentials indicate API-key fallback (not first-party OAuth). */
function isApiKeyAuth(authMethod?: string, apiProvider?: string): boolean {
  if (authMethod && /api[_-]?key/i.test(authMethod)) return true;
  if (apiProvider && !/^first[_-]?party$/i.test(apiProvider)) return true;
  return false;
}

/** Classify a non-zero exit error based on stderr/stdout patterns. */
function classifyError(stderr: string, stdout: string): SandboxProbeResult {
  const combined = (stderr + ' ' + stdout).toLowerCase();

  for (const pattern of UNAVAILABLE_PATTERNS) {
    if (combined.includes(pattern)) {
      return {
        status: 'unavailable',
        message: `Sandbox "${config.sandboxName}" is not available: matched "${pattern}"`,
      };
    }
  }

  for (const pattern of AUTH_FAILURE_PATTERNS) {
    if (combined.includes(pattern)) {
      return {
        status: 'auth_failed',
        message: `Sandbox "${config.sandboxName}" authentication failed: matched "${pattern}"`,
      };
    }
  }

  return {
    status: 'unavailable',
    message: `Sandbox "${config.sandboxName}" probe failed with unknown error`,
  };
}

/**
 * Probe the Docker sandbox to verify it is alive and authenticated with first-party OAuth.
 * Never rejects — always resolves with a SandboxProbeResult.
 */
export async function probeSandbox(
  spawnFn: SpawnFn = defaultSpawn,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<SandboxProbeResult> {
  return new Promise((resolve) => {
    // Omit -w flag: docker sandbox exec defaults CWD to the workspace directory.
    // The host path (config.sandboxWorkspace) may not match the internal sandbox path
    // (e.g. /home/agent/workspace on WSL2), causing "no such file or directory" errors.
    const args = [
      'sandbox',
      'exec',
      config.sandboxName,
      'claude',
      'auth',
      'status',
      '--json',
    ];

    let child: ReturnType<SpawnFn>;
    try {
      child = spawnFn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        status: 'unavailable',
        message: `Failed to spawn docker process: ${(err as Error).message}`,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let resolved = false;

    function resolveOnce(result: SandboxProbeResult) {
      if (resolved) return;
      console.log(`[sandbox] probe: status=${result.status}`);
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
        status: 'unavailable',
        message: `Sandbox probe timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        resolveOnce(classifyError(stderr, stdout));
        return;
      }

      // Zero exit — parse the JSON response
      let parsed: AuthStatusResponse;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        resolveOnce({
          status: 'unavailable',
          message: `Sandbox probe returned invalid JSON: ${stdout.slice(0, 200)}`,
        });
        return;
      }

      if (!parsed.loggedIn) {
        resolveOnce({
          status: 'auth_failed',
          message: `Sandbox "${config.sandboxName}" is not logged in`,
        });
        return;
      }

      if (isApiKeyAuth(parsed.authMethod, parsed.apiProvider)) {
        resolveOnce({
          status: 'auth_failed',
          message: `Sandbox "${config.sandboxName}" is using API key auth (authMethod: ${parsed.authMethod}, apiProvider: ${parsed.apiProvider}). First-party OAuth is required.`,
        });
        return;
      }

      resolveOnce({
        status: 'healthy',
        message: `Sandbox "${config.sandboxName}" is authenticated (${parsed.authMethod}, ${parsed.apiProvider})`,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolveOnce({
        status: 'unavailable',
        message: `Failed to spawn docker process: ${err.message}`,
      });
    });
  });
}

/**
 * Preflight check: probe the sandbox, and if auth has failed, attempt
 * credential injection recovery before giving up. Returns immediately
 * for healthy or unavailable sandboxes (no injection overhead on the happy path).
 */
export async function preflightCheck(
  spawnFn: SpawnFn = defaultSpawn,
): Promise<PreflightResult> {
  const probe = await probeSandbox(spawnFn);

  if (probe.status === 'healthy') {
    return { ok: true, status: 'healthy', message: probe.message, recoveryAttempted: false };
  }

  if (probe.status === 'unavailable') {
    return { ok: false, status: 'unavailable', message: probe.message, recoveryAttempted: false };
  }

  // Only auth_failed warrants recovery — unavailable means infrastructure is missing,
  // not fixable by credential injection.
  if (isCircuitOpen()) {
    console.warn('[sandbox] preflight: circuit breaker open, blocking recovery');
    return {
      ok: false,
      status: 'auth_failed',
      message: 'Auth recovery circuit breaker open — too many recent failures. Try again later.',
      recoveryAttempted: false,
    };
  }

  console.log('[sandbox] preflight: auth_failed, attempting credential injection recovery');
  const injection = await refreshAndInjectCredentials(spawnFn);

  if (!injection.ok) {
    recordHealFailure();
    console.warn(`[sandbox] preflight: injection failed (phase=${injection.phase})`);
    return {
      ok: false,
      status: 'auth_failed',
      message: `Auth recovery failed during ${injection.phase}: ${injection.message}`,
      recoveryAttempted: true,
    };
  }

  // Re-probe after injection to confirm recovery worked
  console.log('[sandbox] preflight: injection succeeded, re-probing');
  const reProbe = await probeSandbox(spawnFn);
  if (reProbe.status === 'healthy') {
    console.log('[sandbox] preflight: recovery successful');
    resetHealFailures();
    return { ok: true, status: 'healthy', message: reProbe.message, recoveryAttempted: true };
  }

  recordHealFailure();
  console.warn(`[sandbox] preflight: recovery failed, sandbox still ${reProbe.status}`);
  return {
    ok: false,
    status: reProbe.status,
    message: `Auth recovery injected credentials but sandbox still unhealthy: ${reProbe.message}`,
    recoveryAttempted: true,
  };
}

/** Inject fresh credentials at point-of-use, then verify immediately. */
export async function prepareSandboxForPrompt(
  spawnFn: SpawnFn = defaultSpawn,
): Promise<PrepareSandboxResult> {
  if (isCircuitOpen()) {
    return {
      ok: false,
      code: 'verification_failed',
      message: 'Chat agent recovery is cooling down after repeated failures. Try again in a moment.',
    };
  }

  const hostStatus = await ensureHostTokenFresh(spawnFn);
  if (!hostStatus.fresh && !hostStatus.refreshed) {
    recordHealFailure();
    return {
      ok: false,
      code: 'host_refresh_failed',
      message: 'The host could not refresh the chat agent login.',
    };
  }

  let credentials: unknown;
  if (hostStatus.fresh) {
    credentials = hostStatus.credentials;
  } else {
    // Platform-dispatching re-read: macOS Keychain or Linux credential file.
    const hostResult = await readHostCredentials(spawnFn);
    if (!hostResult.ok) {
      recordHealFailure();
      return {
        ok: false,
        code: hostResult.phase === 'keychain' || hostResult.phase === 'credential-file'
          ? 'auth_unavailable'
          : 'host_refresh_failed',
        message: 'The host could not read the chat agent credentials.',
      };
    }
    credentials = hostResult.credentials;
  }

  const injection = await injectCredentials(
    JSON.stringify(stripRefreshToken(credentials)),
    spawnFn,
  );
  if (!injection.ok) {
    recordHealFailure();
    return {
      ok: false,
      code: 'sandbox_unavailable',
      message: 'The chat agent sandbox is offline or unavailable.',
    };
  }

  const verification = await probeSandbox(spawnFn);
  if (verification.status === 'healthy') {
    resetHealFailures();
    return { ok: true, message: verification.message };
  }

  recordHealFailure();
  if (verification.status === 'unavailable') {
    return {
      ok: false,
      code: 'sandbox_unavailable',
      message: 'The chat agent sandbox is offline or unavailable.',
    };
  }

  return {
    ok: false,
    code: 'verification_failed',
    message: 'The chat agent could not verify its login after refresh.',
  };
}

// ---------------------------------------------------------------------------
// Claude Invocation — streaming NDJSON
// ---------------------------------------------------------------------------

/** Structured result extracted from a `result` NDJSON event. */
export interface ClaudeResult {
  result: string;
  sessionId: string;
}

/** Options for invoking Claude in the sandbox. */
export interface InvokeClaudeOptions {
  prompt: string;
  sessionId?: string;
  /** Override spawn for testing (same DI pattern as probeSandbox). */
  spawnFn?: SpawnFn;
  /** Kill the process if no stdout/stderr for this duration. Default: 10 min. */
  inactivityTimeoutMs?: number;
}

/**
 * Extract displayable text from a single NDJSON line.
 * Returns null for non-text events (tool_use, system, etc.) and unparseable lines.
 */
export function extractTextFromStreamLine(ndjsonLine: string): string | null {
  const trimmed = ndjsonLine.trim();
  if (trimmed === '') return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Full assistant message — concatenate text blocks
  if (obj.type === 'assistant') {
    const content = (obj.message as Record<string, unknown>)?.content;
    if (!Array.isArray(content)) return null;
    const text = content
      .filter(
        (b: Record<string, unknown>) =>
          b.type === 'text' && typeof b.text === 'string',
      )
      .map((b: Record<string, unknown>) => b.text)
      .join('\n');
    return text || null;
  }

  // Streaming delta — small text chunk
  if (obj.type === 'content_block_delta') {
    const text = (obj.delta as Record<string, unknown>)?.text;
    return typeof text === 'string' && text.length > 0 ? text : null;
  }

  // Final result
  if (obj.type === 'result') {
    return typeof obj.result === 'string' ? obj.result : null;
  }

  return null;
}

/** Scan NDJSON output for a `result` event and extract the structured result. */
function parseResultFromOutput(stdout: string): ClaudeResult | null {
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (
        obj.type === 'result' &&
        typeof obj.result === 'string' &&
        typeof obj.session_id === 'string' &&
        // Error results (is_error: true) must not be treated as valid output.
        // processStreamLine() already emitted them as errors during streaming.
        // Returning them here would short-circuit the close handler, preventing
        // auth recovery from triggering on 401 responses.
        obj.is_error !== true
      ) {
        return { result: obj.result as string, sessionId: obj.session_id as string };
      }
    } catch {
      // Skip non-JSON
    }
  }
  return null;
}

/** Check if output matches resume failure patterns. */
function isResumeFailure(stderr: string, stdout: string): boolean {
  const combined = (stderr + ' ' + stdout).toLowerCase();
  return RESUME_FAILURE_PATTERNS.some((p) => combined.includes(p));
}

/** Build the docker sandbox exec args for a Claude invocation. */
function buildClaudeArgs(prompt: string, sessionId?: string): string[] {
  // Omit -w flag: docker sandbox exec defaults CWD to the workspace directory.
  // The host path (config.sandboxWorkspace) may not match the internal sandbox path
  // (e.g. /home/agent/workspace on WSL2), causing "no such file or directory" errors.
  const args = [
    'sandbox',
    'exec',
    config.sandboxName,
    'claude',
  ];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  args.push(
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--permission-mode',
    'bypassPermissions',
    '--verbose',
  );

  return args;
}

/**
 * Classify an invocation error based on stderr/stdout patterns.
 * Priority: auth → unavailability → resume → unknown (per reference doc).
 */
function classifyInvocationError(
  stderr: string,
  stdout: string,
  code: number | null,
  sessionId?: string,
): Error {
  const combined = (stderr + ' ' + stdout).toLowerCase();

  // Auth failures first
  for (const pattern of AUTH_FAILURE_PATTERNS) {
    if (combined.includes(pattern)) {
      return new Error(
        `Claude authentication failed: ${(stderr || stdout).slice(0, 500)}`,
      );
    }
  }

  // Unavailability
  for (const pattern of UNAVAILABLE_PATTERNS) {
    if (combined.includes(pattern)) {
      return new Error(
        `Sandbox unavailable: ${(stderr || stdout).slice(0, 500)}`,
      );
    }
  }

  // Resume failures (only when a sessionId was used)
  if (sessionId) {
    for (const pattern of RESUME_FAILURE_PATTERNS) {
      if (combined.includes(pattern)) {
        return new Error(
          `Resume failed: ${(stderr || stdout).slice(0, 500)}`,
        );
      }
    }
  }

  return new Error(
    `Claude exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`,
  );
}

/**
 * Invoke Claude in the Docker sandbox and stream the response.
 *
 * Returns an EventEmitter that emits:
 * - `'text'` (string) — streaming text chunks as they arrive
 * - `'result'` ({ result: string, sessionId: string }) — final result with session ID
 * - `'error'` (Error) — error during execution
 * - `'close'` () — process completed
 * - `'resume_failed'` () — resume attempt failed, retrying without session ID
 * - `'auth_recovery'` () — auth failed mid-invocation, credentials injected, retrying once
 *
 * If `sessionId` is provided, attempts `--resume` first. On resume failure,
 * automatically retries without `--resume`.
 */
export function invokeClaude(options: InvokeClaudeOptions): EventEmitter {
  const {
    prompt,
    sessionId,
    spawnFn = defaultSpawn,
    inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
  } = options;

  const emitter = new EventEmitter();

  process.nextTick(() => {
    runInvocation(emitter, prompt, sessionId, spawnFn, inactivityTimeoutMs);
  });

  return emitter;
}

/** Process a single NDJSON line and emit appropriate events on the emitter. */
function processStreamLine(line: string, emitter: EventEmitter): void {
  const trimmed = line.trim();
  if (trimmed === '') return;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (obj.type === 'content_block_delta') {
    const text = (obj.delta as Record<string, unknown>)?.text;
    if (typeof text === 'string' && text.length > 0) {
      emitter.emit('text', text);
    }
  } else if (obj.type === 'assistant') {
    const content = (obj.message as Record<string, unknown>)?.content;
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (b: Record<string, unknown>) =>
            b.type === 'text' && typeof b.text === 'string',
        )
        .map((b: Record<string, unknown>) => b.text)
        .join('\n');
      if (text) {
        emitter.emit('text', text);
      }
    }
  } else if (obj.type === 'result') {
    if (
      typeof obj.result === 'string' &&
      typeof obj.session_id === 'string'
    ) {
      // Claude returns is_error: true for API/runtime errors — surface them
      // as errors instead of persisting as assistant messages.
      if (obj.is_error === true) {
        console.warn(`[sandbox] stream: is_error result received: ${(obj.result as string).slice(0, 200)}`);
        emitter.emit('error', new Error(obj.result as string));
      } else {
        emitter.emit('result', {
          result: obj.result as string,
          sessionId: obj.session_id as string,
        });
      }
    }
  }
}

/** Internal: run a single invocation attempt (may be called recursively on resume failure or auth recovery). */
function runInvocation(
  emitter: EventEmitter,
  prompt: string,
  sessionId: string | undefined,
  spawnFn: SpawnFn,
  inactivityTimeoutMs: number,
  isRecoveryRetry: boolean = false,
): void {
  const args = buildClaudeArgs(prompt, sessionId);

  let child: ReturnType<SpawnFn>;
  try {
    child = spawnFn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    emitter.emit(
      'error',
      new Error(`Failed to spawn docker: ${(err as Error).message}`),
    );
    emitter.emit('close');
    return;
  }

  let stdout = '';
  let stderr = '';
  let lineBuffer = '';
  let finished = false;
  let lastActivity = Date.now();

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(inactivityCheck);
  }

  const inactivityCheck = setInterval(() => {
    if (Date.now() - lastActivity > inactivityTimeoutMs) {
      finish();
      child.kill();
      emitter.emit(
        'error',
        new Error(
          `Claude invocation timed out: no output for ${inactivityTimeoutMs}ms`,
        ),
      );
      emitter.emit('close');
    }
  }, Math.min(INACTIVITY_CHECK_INTERVAL_MS, inactivityTimeoutMs));

  child.stdout?.on('data', (chunk: Buffer) => {
    lastActivity = Date.now();
    const data = chunk.toString();
    stdout += data;
    lineBuffer += data;

    // Process complete lines
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      processStreamLine(line, emitter);
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    lastActivity = Date.now();
    stderr += chunk.toString();
  });

  child.on('error', (err) => {
    finish();
    emitter.emit('error', new Error(`Docker process error: ${err.message}`));
    emitter.emit('close');
  });

  child.on('close', (code) => {
    if (finished) return;
    finish();

    // Process any remaining data in the line buffer
    if (lineBuffer.trim()) {
      processStreamLine(lineBuffer, emitter);
    }

    if (code === 0 || code === null) {
      emitter.emit('close');
      return;
    }

    // Non-zero exit: try to parse valid output first (per reference doc gotcha #6)
    const parsed = parseResultFromOutput(stdout);
    if (parsed) {
      console.log('[sandbox] invocation: non-zero exit but valid (non-error) result found, closing cleanly');
      // Result event was already emitted during streaming; just close cleanly
      emitter.emit('close');
      return;
    }

    const isAuthFailure = matchesPatterns(stderr, stdout, AUTH_FAILURE_PATTERNS);
    console.log(`[sandbox] invocation: non-zero exit (code=${code}), isAuthFailure=${isAuthFailure}, isRecoveryRetry=${isRecoveryRetry}`);

    // Resume failure: retry without --resume (check auth first per ref doc)
    if (sessionId && !isAuthFailure && isResumeFailure(stderr, stdout)) {
      emitter.emit('resume_failed');
      runInvocation(emitter, prompt, undefined, spawnFn, inactivityTimeoutMs);
      return;
    }

    // Auth failure during invocation: attempt credential injection and retry once.
    // isRecoveryRetry prevents infinite loops — at most one recovery per invocation.
    if (!isRecoveryRetry && isAuthFailure) {
      const authError = classifyInvocationError(stderr, stdout, code, sessionId);

      if (isCircuitOpen()) {
        console.warn('[sandbox] invocation: auth recovery blocked by circuit breaker');
        emitter.emit('error', authError);
        emitter.emit('close');
        return;
      }

      console.log('[sandbox] invocation: attempting auth recovery (credential injection + retry)');
      refreshAndInjectCredentials(spawnFn)
        .then((injection) => {
          if (injection.ok) {
            console.log('[sandbox] invocation: auth recovery succeeded, retrying');
            resetHealFailures();
            emitter.emit('auth_recovery');
            runInvocation(emitter, prompt, sessionId, spawnFn, inactivityTimeoutMs, true);
          } else {
            recordHealFailure();
            console.warn(`[sandbox] invocation: auth recovery injection failed (phase=${injection.phase})`);
            emitter.emit('error', authError);
            emitter.emit('close');
          }
        })
        .catch(() => {
          recordHealFailure();
          emitter.emit('error', authError);
          emitter.emit('close');
        });
      return;
    }

    // Classify and emit the error
    emitter.emit(
      'error',
      classifyInvocationError(stderr, stdout, code, sessionId),
    );
    emitter.emit('close');
  });
}

/** Check if combined output matches any patterns in a list. */
function matchesPatterns(
  stderr: string,
  stdout: string,
  patterns: string[],
): boolean {
  const combined = (stderr + ' ' + stdout).toLowerCase();
  return patterns.some((p) => combined.includes(p));
}
