import { spawn as defaultSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';

/** Possible states a sandbox probe can return. */
export type SandboxStatus = 'healthy' | 'auth_failed' | 'unavailable';

/** Structured result from probing the sandbox. */
export interface SandboxProbeResult {
  status: SandboxStatus;
  /** Human-readable explanation of what happened. */
  message: string;
}

/** Minimal interface for the spawn function dependency (for DI in tests). */
export type SpawnFn = typeof defaultSpawn;

/** Default probe timeout: 30 seconds. */
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

/** Default inactivity timeout for Claude invocations: 10 minutes. */
const DEFAULT_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval for checking inactivity (5 seconds). */
const INACTIVITY_CHECK_INTERVAL_MS = 5_000;

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
    const args = [
      'sandbox',
      'exec',
      '-w',
      config.sandboxWorkspace,
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
        typeof obj.session_id === 'string'
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
  const args = [
    'sandbox',
    'exec',
    '-w',
    config.sandboxWorkspace,
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
      emitter.emit('result', {
        result: obj.result as string,
        sessionId: obj.session_id as string,
      });
    }
  }
}

/** Internal: run a single invocation attempt (may be called recursively on resume failure). */
function runInvocation(
  emitter: EventEmitter,
  prompt: string,
  sessionId: string | undefined,
  spawnFn: SpawnFn,
  inactivityTimeoutMs: number,
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
      // Result event was already emitted during streaming; just close cleanly
      emitter.emit('close');
      return;
    }

    // Resume failure: retry without --resume (check auth first per ref doc)
    if (sessionId && !matchesPatterns(stderr, stdout, AUTH_FAILURE_PATTERNS) && isResumeFailure(stderr, stdout)) {
      emitter.emit('resume_failed');
      runInvocation(emitter, prompt, undefined, spawnFn, inactivityTimeoutMs);
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
