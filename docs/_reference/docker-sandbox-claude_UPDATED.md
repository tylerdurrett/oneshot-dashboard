# Running Authenticated Claude in Docker Sandboxes

A standalone guide for developers building apps that invoke the Claude CLI inside Docker sandboxes. Distilled from hard-won production experience.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Prerequisites](#2-prerequisites)
3. [Creating and Authenticating a Sandbox](#3-creating-and-authenticating-a-sandbox)
4. [Invoking Claude Non-Interactively](#4-invoking-claude-non-interactively)
5. [Resuming Conversations](#5-resuming-conversations)
6. [Parsing stream-json Output](#6-parsing-stream-json-output)
7. [Auth Verification (Probe)](#7-auth-verification-probe)
8. [Error Classification](#8-error-classification)
9. [Timeouts and Stall Detection](#9-timeouts-and-stall-detection)
10. [~~Templates~~ (Removed)](#10-templates-removed)
11. [~~Backup and Restore~~ (Simplified)](#11-backup-and-restore-simplified)
12. [Self-Healing](#12-self-healing)
13. [Resource Constraints: `max_running_vms`](#13-resource-constraints-max_running_vms)
14. [Parity Checks (Host/Sandbox Sync)](#14-parity-checks-hostsandbox-sync)
15. [Docker Desktop vs Docker CLI](#15-docker-desktop-vs-docker-cli)
16. [Common Failure Modes](#16-common-failure-modes)
17. [Environment Variable Reference](#17-environment-variable-reference)
18. [Gotchas and Hard-Won Lessons](#18-gotchas-and-hard-won-lessons)

---

## 1. Core Concepts

A **Docker sandbox** is an isolated container managed by the `docker sandbox` CLI plugin. Claude Code runs inside it with full filesystem access to a mounted workspace directory. The key insight: **auth credentials are injected from the host's macOS Keychain** at runtime and persist inside the sandbox until they expire or are re-injected. Once credentials are present, you can invoke Claude non-interactively via `docker sandbox exec`.

**Why sandboxes instead of running Claude directly?**
- Isolation: Claude's file operations are contained
- Persistence: Auth tokens survive process restarts
- Multi-sandbox: Inject the same Keychain credentials into any number of sandboxes — no per-sandbox interactive login needed

**Sandbox VMs have lifecycle states.** A sandbox VM is either **running** or **stopped**. A stopped VM is idle, not broken — it can be cold-started on demand (typically ~5-15 seconds including credential injection). Critically, **`docker sandbox exec` transparently cold-starts a stopped VM.** This means any exec call — even a read-only health check like `claude auth status` — has the side effect of waking the VM. This is the single most important operational subtlety: it affects how you design health monitoring, credential refresh, and resource management. See [Section 12](#12-self-healing) for the implications.

**The workspace mount is critical.** When you create a sandbox, you specify a workspace path. This path is mounted inside the container. Claude operates on files at this path. If the workspace doesn't match what your app expects, everything breaks silently.

---

## 2. Prerequisites

- **Docker CLI** with the sandbox plugin installed (`docker sandbox ls` must work)
- **Docker Desktop** is **not required** for any production operation. Core sandbox operations (create, exec, ls, rm) and credential injection all work with the Docker CLI alone.
- **Claude CLI** is bundled inside the sandbox — you don't install it separately

Verify your setup:

```bash
# Plugin available?
docker sandbox ls
```

---

## 3. Creating and Authenticating a Sandbox

### Primary path: Create + inject credentials (production)

Create a plain sandbox and inject credentials from the host's macOS Keychain:

```bash
# Create a named sandbox with your workspace directory.
# "claude" is the base image — it includes the Claude CLI.
docker sandbox create --name my-sandbox claude /path/to/your/workspace

# Inject credentials from macOS Keychain (strips refresh token — requires jq)
security find-generic-password -s "Claude Code-credentials" -w \
  | jq 'del(.claudeAiOauth.refreshToken)' \
  | docker sandbox exec -i my-sandbox \
    sh -c 'cat > /tmp/.creds-staging \
      && mv /tmp/.creds-staging /home/agent/.claude/.credentials.json \
      && chmod 600 /home/agent/.claude/.credentials.json'
```

The refresh token is **deliberately stripped** before injection. We originally passed full credentials (including the refresh token) into sandboxes, expecting each to manage its own token lifecycle. This broke immediately in multi-sandbox setups: the first sandbox to refresh rotated the token server-side, invalidating every other sandbox's copy — and the host's. The fix is the current model: the host is the single owner of the refresh token and the only process that performs token rotation. Sandboxes receive access-token-only credentials and rely on periodic re-injection from the host when the access token nears expiry.

The write inside the sandbox is atomic (temp file + `mv` + `chmod 600`) to prevent Claude from reading a partially-written credentials file.

**Prerequisite:** The host machine must have an active Claude Code session (i.e., the Keychain entry `Claude Code-credentials` must exist with valid tokens). If the host has never logged in, use the fallback path below first.

### Fallback path: Interactive login (first-time bootstrap only)

If the host has no Claude session yet, or the Keychain entry is missing:

```bash
docker sandbox run --name my-sandbox claude /path/to/your/workspace
```

This drops you into an interactive Claude session. A browser window opens for OAuth login. Complete the login, then exit with `/exit` or `Ctrl+C`. Once the host has a valid session, all subsequent sandboxes should use the credential injection path above.

### Verify it worked

```bash
docker sandbox exec -w /path/to/your/workspace my-sandbox claude auth status --json
```

Expected output:

```json
{"loggedIn": true, "authMethod": "oauth", "apiProvider": "firstParty"}
```

**What matters:**
- `loggedIn: true` — OAuth token is cached
- `apiProvider: firstParty` — using Anthropic's first-party auth (not an API key)

> **Caveat:** `claude auth status` checks whether a credentials file exists — it does **not** validate the access token against the server. An expired token will still report `loggedIn: true`. See [Section 7](#7-auth-verification-probe) for the inject-before-check pattern that handles this.

### Critical rule: workspace MUST match

The workspace path you pass at creation time is mounted inside the sandbox. If you later exec with a different `-w` path, or your app expects a different directory, the sandbox won't find the right files and probes will fail with an empty `SandboxUnavailableError`.

```bash
# WRONG — workspace mismatch
docker sandbox create --name my-sandbox claude /path/A
docker sandbox exec -w /path/B my-sandbox claude -p "hello"  # may fail

# RIGHT — consistent workspace
docker sandbox create --name my-sandbox claude /path/to/workspace
docker sandbox exec -w /path/to/workspace my-sandbox claude -p "hello"
```

---

## 4. Invoking Claude Non-Interactively

Once authenticated, invoke Claude via `docker sandbox exec`:

```bash
docker sandbox exec \
  -w /path/to/workspace \
  my-sandbox \
  claude \
  -p "Your prompt here" \
  --permission-mode bypassPermissions \
  --verbose \
  --output-format stream-json
```

**Flag breakdown:**

| Flag | Purpose |
|------|---------|
| `-p "message"` | Non-interactive prompt (no TTY needed) |
| `--permission-mode bypassPermissions` | Skip interactive permission prompts. Required in non-interactive mode — otherwise Claude hangs waiting for user input. |
| `--verbose` | Include tool use and intermediate steps in output |
| `--output-format stream-json` | NDJSON output — one JSON object per line. This is what you parse. |
| `--model <model>` | Optional. Override the default model (e.g., `claude-sonnet-4-6`) |
| `--system-prompt "..."` | Optional. Set a system prompt for this invocation |

### Minimal example

```bash
docker sandbox exec -w /workspace my-sandbox \
  claude -p "What files are in the current directory?" \
  --permission-mode bypassPermissions \
  --output-format stream-json
```

---

## 5. Resuming Conversations

Claude supports multi-turn conversations via session IDs. The first call returns a `session_id` in its output. Pass it back with `--resume` to continue the conversation:

```bash
# First turn — get the session_id from the result event
docker sandbox exec -w /workspace my-sandbox \
  claude -p "Remember the code word: BANANA" \
  --permission-mode bypassPermissions \
  --output-format stream-json

# Parse session_id from the result event (see next section)

# Second turn — resume the conversation
docker sandbox exec -w /workspace my-sandbox \
  claude --resume <session_id> \
  -p "What was the code word?" \
  --permission-mode bypassPermissions \
  --output-format stream-json
```

**Resume failures:** If the session ID is invalid or stale, Claude exits with an error containing patterns like `"invalid session"`, `"session not found"`, `"could not resume"`, or `"no conversation found"`. Your app should catch this and fall back to starting a new conversation.

---

## 6. Parsing stream-json Output

The `--output-format stream-json` flag produces **NDJSON** (newline-delimited JSON). Each line is an independent JSON object with a `type` field.

### Event types you'll encounter

**1. `assistant` — Full assistant message (contains content blocks)**
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {"type": "text", "text": "Here is my response..."}
    ]
  }
}
```

**2. `content_block_delta` — Streaming text chunk**
```json
{
  "type": "content_block_delta",
  "delta": {"type": "text_delta", "text": "partial text..."}
}
```

**3. `result` — Final output (this is the one you MUST parse)**
```json
{
  "type": "result",
  "result": "The complete response text",
  "session_id": "uuid-format-session-id"
}
```

### Parsing strategy

1. Split stdout by newlines
2. Parse each line as JSON (skip empty lines and non-JSON noise gracefully)
3. Find the event with `type === "result"`
4. Extract `result` (response text) and `session_id` (for resuming)

```typescript
interface ClaudeExecutionResult {
  /** The text response from Claude. */
  result: string;
  /** Claude session ID for resuming via --resume. */
  sessionId: string;
}

function parseClaudeStream(stdout: string): ClaudeExecutionResult {
  const lines = stdout.split("\n");
  const parsed: Record<string, unknown>[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    try {
      const obj = JSON.parse(line);
      if (typeof obj === "object" && obj !== null) {
        parsed.push(obj);
      }
    } catch {
      // Skip non-JSON lines (noise, progress indicators, etc.)
    }
  }

  const resultEvent = parsed.find((obj) => obj.type === "result");
  if (!resultEvent) {
    throw new Error(`No "result" event found in ${parsed.length} events`);
  }

  if (typeof resultEvent.result !== "string") {
    throw new Error(`"result" event missing "result" field`);
  }
  if (typeof resultEvent.session_id !== "string") {
    throw new Error(`"result" event missing "session_id" field`);
  }

  return { result: resultEvent.result, sessionId: resultEvent.session_id };
}
```

### Streaming text for real-time display

If you want to show text as it arrives (before the final `result` event), process chunks as they come:

```typescript
function extractTextFromStreamLine(ndjsonLine: string): string | null {
  const trimmed = ndjsonLine.trim();
  if (trimmed === "") return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Full assistant message — concatenate text blocks
  if (obj.type === "assistant") {
    const content = (obj.message as any)?.content;
    if (!Array.isArray(content)) return null;
    return content
      .filter((b: any) => b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n") || null;
  }

  // Streaming delta — small text chunk
  if (obj.type === "content_block_delta") {
    const text = (obj.delta as any)?.text;
    return typeof text === "string" && text.length > 0 ? text : null;
  }

  // Final result
  if (obj.type === "result") {
    return typeof obj.result === "string" ? obj.result : null;
  }

  // System events, tool_use, etc. — not displayable text
  return null;
}
```

---

## 7. Auth Verification (Probe)

Before executing a prompt, verify the sandbox is alive and authenticated:

```bash
docker sandbox exec -w /workspace my-sandbox claude auth status --json
```

### What to check

1. **`loggedIn: true`** — Credentials file exists
2. **`apiProvider: firstParty`** — Using Anthropic OAuth (not an API key)
3. **No API key fallback** — If `authMethod` contains `api_key` or `apiProvider` is not `firstParty`, the sandbox fell back to API-key auth, which bills to your API account instead of your Claude subscription

> **Critical limitation:** `claude auth status` reports `loggedIn: true` based on the credentials file **existing** — it does **not** validate the access token against the server. An expired access token will still pass this check. This is why production health checks use the **inject-before-check** pattern: inject fresh credentials from the Keychain *before* running `auth status`. Without pre-injection, the probe sees "healthy" and skips recovery even when the token is expired.

> **Warning: exec-based probes wake VMs.** Running `docker sandbox exec ... claude auth status` as a background health check will **cold-start a stopped VM** (see [Section 1](#1-core-concepts)). If you probe multiple sandboxes on a timer, you inadvertently keep them all running, which can fill Docker's `max_running_vms` cap (see [Section 13](#13-resource-constraints-max_running_vms)). Reserve exec-based probes for **point-of-use verification** — just before running a real prompt — not for background health monitoring. For background checks, use the daemon control-plane API instead (see [Section 12](#12-self-healing)).

### Rejecting API-key auth

By default, you should reject API-key-backed auth modes. This prevents accidental billing if the OAuth token expires and Claude silently falls back to an API key:

```typescript
function isApiKeyAuth(authMethod?: string, apiProvider?: string): boolean {
  if (authMethod && /api[_-]?key/i.test(authMethod)) return true;
  if (apiProvider && !/^first[_-]?party$/i.test(apiProvider)) return true;
  return false;
}
```

### Handling `--json` flag not supported

Older Claude CLI versions may not support `auth status --json`. If the command fails with "unknown option" / "unknown flag", fall back to `claude auth status` (without `--json`) and regex-parse the output.

---

## 8. Error Classification

When invoking Claude in sandboxes, errors fall into distinct categories. Classifying them correctly lets you choose the right recovery strategy.

### Error types and their patterns

| Error Class | Stderr/Stdout Patterns | Recovery |
|---|---|---|
| **Auth failure** | `"not logged in"`, `"unauthenticated"`, `"authentication required"`, `"failed to authenticate"`, `"authentication_error"`, `"oauth token has expired"`, `"token has expired"` | Inject fresh credentials from Keychain. If injection fails, fall back to interactive re-auth. |
| **Sandbox unavailable** | `"no such container"`, `"is not running"`, `"cannot connect to the docker daemon"`, `"sandbox not found"`, `"docker daemon is not running"`, `sandbox '<name>' does not exist` | Recreate sandbox or start Docker |
| **Resume failure** | `"invalid session"`, `"session not found"`, `"could not resume"`, `"no conversation found"` | Start a new conversation |
| **Command timeout** | Process exceeds hard timeout | Kill and retry |
| **Command stalled** | No stdout/stderr for inactivity period | Kill and retry |
| **Command cancelled** | Abort signal received | Session persists; can resume |

### Classification priority

Check **auth patterns first**, then unavailability, then resume errors. An auth failure during a resume call should be classified as an auth error (not a resume error), because the fix is re-auth, not starting a new conversation.

### Probe vs prompt context

For **probe** operations (health checks): ANY non-zero exit from `docker sandbox exec` means the sandbox isn't usable. Treat all exec errors as unavailability.

For **prompt/resume** operations: Only map known error patterns. Unrecognized errors might be legitimate Claude CLI output (e.g., Claude hitting its own error handling).

### Non-zero exit codes with valid output

Sometimes Claude exits non-zero but still produces valid NDJSON with a `result` event. This happens when Claude encounters an internal error after generating output. **Always try to parse stdout before throwing**, since the response may be perfectly usable:

```typescript
try {
  const result = await exec("docker", [...args]);
  return parseClaudeStream(result.stdout);
} catch (error) {
  if (error instanceof ExecError && error.stdout) {
    // Try parsing — Claude may have produced valid output before failing
    try {
      return parseClaudeStream(error.stdout);
    } catch {
      // Nope, genuinely bad output
    }
  }
  classifyAndThrow(error);
}
```

---

## 9. Timeouts and Stall Detection

Claude can take a long time on complex tasks. You need two timeout mechanisms:

### Hard timeout

Maximum wall-clock time for a single invocation. Kill the process if it exceeds this.

```
Recommended defaults:
  Probe (auth check):  30 seconds
  New prompt:          2–60 minutes (depends on your use case)
  Resume:              2–60 minutes
```

### Inactivity timeout (stall detection)

If Claude produces **no stdout or stderr** for a period, it's likely hung. This catches scenarios where Claude is stuck in an infinite loop or waiting for input that will never come.

```
Recommended default: 10 minutes of silence → kill
```

The inactivity timeout is more useful than the hard timeout in practice — it fires earlier and catches the actual failure mode (Claude stalled) rather than punishing legitimately long but active work.

### Implementation sketch

```typescript
const child = spawn("docker", [...args]);

let lastActivity = Date.now();
child.stdout.on("data", () => { lastActivity = Date.now(); });
child.stderr.on("data", () => { lastActivity = Date.now(); });

const inactivityCheck = setInterval(() => {
  if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
    child.kill();
    clearInterval(inactivityCheck);
  }
}, 5000);

const hardTimeout = setTimeout(() => {
  child.kill();
}, HARD_TIMEOUT_MS);
```

---

## 10. ~~Templates~~ (Removed)

> **Removed as of 2026-02-24.** Template-based auth (baking OAuth tokens into Docker images via `docker sandbox save`, cloning with `--template`) has been fully replaced by credential injection from the macOS Keychain. See [Section 3](#3-creating-and-authenticating-a-sandbox) for the current auth approach and [`credential-injection-auth.md`](credential-injection-auth.md) for the full migration story.

---

## 11. ~~Backup and Restore~~ (Simplified)

> Template tar backups are no longer needed. The host's macOS Keychain is the single source of truth for auth credentials. If a sandbox is lost or corrupted, create a fresh one and inject credentials — no backup restoration required. See [Section 3](#3-creating-and-authenticating-a-sandbox) and the [recovery runbook](runbook-sandbox-recovery.md).

---

## 12. Self-Healing

When your app detects a broken sandbox at runtime, it can automatically recover — usually by injecting fresh credentials, without destroying the sandbox.

### Persistent vs on-demand strategies

There are two valid approaches to sandbox lifecycle management. Choose based on your resource constraints and multi-sandbox needs.

**Persistent strategy:** Sandbox provisioned at startup, background health loop, scheduled credential sweeps, circuit breaker recovery. Good for a single always-on sandbox where you want guaranteed sub-second readiness. The primary sandbox in a bot is a typical use case.

**On-demand strategy:** Sandboxes created or woken only when a job or user request actually needs one. Idle sandboxes stop naturally (the Docker daemon idle-stops them). Credentials are injected at job-time, not on a background sweep. No background health loop for secondary sandboxes. Better for multi-sandbox setups or resource-constrained machines where `max_running_vms` is tight (see [Section 13](#13-resource-constraints-max_running_vms)).

**Hybrid approach:** Use persistent monitoring for a single primary sandbox (always ready, low-latency) and on-demand for secondary/repo sandboxes (created when needed, allowed to idle). This is the recommended pattern for apps managing multiple sandboxes on a single machine.

#### The preflight pattern (on-demand)

Before executing a prompt against an on-demand sandbox, run a **preflight check** to ensure the sandbox is ready and authenticated:

1. **Check control-plane state** via the daemon API (not exec — see [Health monitoring](#health-monitoring) below). This returns the VM's state without waking it.
2. **If running:** Verify credentials are fresh — check the host Keychain's `expiresAt` and inject if stale (see [Auth recovery](#auth-recovery-inject-first-strategy)). Without the background credential sweep, nothing else keeps on-demand sandboxes' tokens current. Then proceed to the prompt.
3. **If stopped:** Probe to cold-start the VM (`docker sandbox exec ... claude auth status --json`, ~5-15s). This is the one place where exec-as-probe is intentional — you *want* to wake the VM because a prompt is about to run. Then inject fresh credentials — the sandbox may have been idle for hours with an expired access token.
4. **If missing:** Full provision — create the sandbox, inject credentials.
5. **If daemon unreachable:** Fail fast. Don't burn circuit breaker slots on daemon outages.
6. **If the wake probe fails** (e.g., exit code 255 from `max_running_vms` contention): Escalate to the full heal path (credential injection → check → recreate as last resort).

**Credential injection is essential at every on-demand use.** The on-demand model deliberately removes background credential sweeps for secondary sandboxes. This means no background process is refreshing their tokens — the preflight is the only opportunity. Always call `ensureHostTokenFresh()` before injecting so the host token itself is current.

This replaces background monitoring with point-of-use readiness. The trade-off is cold-start latency (~5-15 seconds for VM boot + credential injection), which is acceptable for scheduled jobs and messaging interfaces but may not be acceptable for sub-second API responses.

#### Cache semantics

If your app maintains a map or cache of sandbox objects (name, exec function, config), treat it as a **configuration cache, not a liveness signal.** A cached sandbox entry does not mean the VM is running or even provisioned. All liveness decisions must go through control-plane inspection (daemon API), never through cache presence. A missing cache entry means the sandbox hasn't been used recently, not that it's broken.

### Heal-eligible failures

Auto-heal when:
- Sandbox is unauthenticated (OAuth expired) — most common, handled by credential injection
- Sandbox is unavailable (missing or Docker daemon down) — note: `stopped` is idle, not broken; use the preflight pattern to wake it on demand rather than auto-healing
- Sandbox command timed out or stalled
- Host/sandbox parity mismatch

### Auth recovery: inject-first strategy

For auth failures (the most common case), recovery **does not require recreating the sandbox**. The inject-first strategy preserves the existing container and all its state, including Claude session IDs:

1. **`ensureHostTokenFresh()`** — Check the host Keychain's `expiresAt` timestamp. If the access token is expired or within 10 minutes of expiry (`HOST_REFRESH_THRESHOLD_MS`), spawn a host-side `claude -p "."` command to force the Claude binary to refresh via the OAuth refresh-token flow (~5-10s). Concurrent calls are deduped (single in-flight promise). Non-fatal — failures are logged but don't block injection.
2. **`injectCredentials()`** — Read fresh credentials from the Keychain, strip the `refreshToken` (see below), and pipe the sanitized JSON into the sandbox via `docker sandbox exec -i` (~5s). The write is atomic (temp file + `mv` + `chmod 600`).
3. **Verify** — Run `claude auth status --json` to confirm `loggedIn: true`. Because this check runs immediately after injection, the credentials are guaranteed fresh (inject-before-check pattern).
4. **If still broken** — The sandbox is structurally damaged. Fall through to full recreation (below).

**Why strip the refresh token?** The `refreshToken` is deliberately removed before injection via `stripRefreshToken()`. If a sandbox held the refresh token and its access token expired, the sandbox's Claude binary would use it to obtain new tokens from the OAuth server. The server rotates the refresh token during this exchange (invalidating the old one), but the sandbox only writes the new token to its local file. The host Keychain would still hold the old, now-invalidated refresh token — logging out the host. Stripping ensures only the host controls token rotation.

### Full recreation: structural failures

For non-auth failures (sandbox missing, daemon down, structural damage), the system falls back to delete + recreate:

1. **Daemon API check** — Query `daemonClient.getVM(name)` for VM state, then verify the VM's socket file exists on disk via `socketFileExists(vm.socketPath)`.
2. **Probe existing VM** — If daemon reports a registered VM with a live socket, probe it (auth check + parity). If the probe times out but the socket exists, skip destructive recovery — the daemon is slow, not the sandbox missing.
3. **Pre-flight daemon liveness** — Before any destructive action, call `isDaemonUp()`. Refuse to delete if the daemon may not be able to recreate.
4. **Delete + recreate** — Delete the stale VM via daemon API (`deleteVM`), create fresh via CLI (`docker sandbox create --name <name> claude <workspace>`), inject credentials from the macOS Keychain.
5. **Retry with exponential backoff** — If create fails, retry up to 3 times with exponential backoff (5s, 15s, 45s). Check daemon liveness before each retry.

The sandbox is always recreated with the **same name** — no name swapping or heal-suffixed sandboxes.

### Circuit breaker

Prevent heal flapping when the sandbox can't stabilize:

```
Max attempts: 3
Window: 15 minutes
```

If 3 heal attempts fail within 15 minutes, stop trying and alert the operator. Resume after the window resets. Docker-daemon-down errors don't count against the circuit breaker.

### Failure observability

When adding self-heal and preflight recovery paths, don't forget the user-facing side:

- **Persist error messages, not just error states.** When a heal or preflight fails, write the actual error reason to whatever data model tracks execution runs. If your app has a dashboard or status UI, verify that failed runs display the specific error message — not just a "failed" badge with an empty detail panel. A resilient backend that silently fails is only half the fix.
- **Capture diagnostic snapshots.** On the first failure in a recovery sequence (before escalating to heavier recovery), capture the daemon state, running VM list, sandbox status, and error details. Rate-limit captures per sandbox to prevent a noisy failure from flooding storage.
- **Include resource context.** When a sandbox fails, the relevant question is often "what else was running?" Capture the set of currently running VMs at failure time to diagnose `max_running_vms` contention (see [Section 13](#13-resource-constraints-max_running_vms)).

### Health monitoring

#### Why exec-based health loops are harmful

A common first design is a background loop that runs `docker sandbox exec ... claude auth status --json` every N minutes to check sandbox health. **This is an anti-pattern for multi-sandbox setups.** Each exec call cold-starts a stopped VM (see [Section 1](#1-core-concepts)). If your loop probes 3+ sandboxes, it keeps them all running — filling Docker's `max_running_vms` cap and blocking other sandboxes from starting when actually needed. This was the root cause of recurring scheduled job failures in production: the health loop biased a "warm set" of VMs that consumed all available slots.

Credential injection via `docker sandbox exec -i` has the same effect — it wakes the target VM.

#### The fix: daemon API control-plane inspection

The Docker sandbox daemon exposes a REST API (typically via Unix socket at `~/.docker/sandboxes/sandboxd.sock`) that returns VM state **without waking anything**. Use this for background health monitoring:

```
GET /vm          → list all VMs with status (running, stopped, etc.)
GET /vm/:name    → detail for one VM (see caveat below about response shape)
```

A health loop that queries the daemon API instead of running exec never wakes a VM. This is the single most important change for multi-sandbox resource management.

#### State classification for health loops

| Daemon state | Meaning | Health loop action |
|---|---|---|
| `running` | VM is active | Healthy — clear circuit breaker |
| `stopped` | VM is idle | **Not unhealthy** — do NOT trigger recovery. The VM can be cold-started on demand when needed. |
| Not found | VM was deleted or never created | Needs provisioning — trigger recovery |
| Daemon unreachable | Connection refused, timeout | Skip this tick — don't burn circuit breaker slots on transient daemon issues |

The key behavioral insight: **`stopped` is not broken.** In the on-demand model, stopped is the expected default state. Only `missing` warrants reprovisioning.

#### Keep exec for point-of-use verification only

Use `docker sandbox exec ... claude auth status` in these contexts:
- **After credential injection** — to verify the injection worked
- **After provisioning** — to verify the new sandbox is healthy
- **As a preflight probe** — immediately before running a real prompt (the wake is intentional)

Never use it in a background polling loop.

#### Primary sandbox watchdog

For a single always-on primary sandbox (persistent strategy), a background watchdog is still appropriate:

1. **Fast daemon pre-check** — Query the daemon API: is the VM registered? Does the socket file exist on disk? This avoids expensive exec calls when the sandbox is clearly gone.
2. **CLI probe** — If the fast check passes, run a full `docker sandbox exec ... claude auth status` probe. For a single primary sandbox, the keepalive effect is intentional — you *want* it running.
3. **Heal threshold** — 3 consecutive failures required before triggering recovery. Prevents destructive action on transient blips.
4. **Recovery** — On threshold breach, trigger the auth recovery or full recreation strategy above.

Intervals are adaptive: **10 minutes** when degraded, **30 minutes** when healthy. After a macOS sleep/wake event, probes are suppressed for 90 seconds to avoid false failures.

#### Multi-sandbox health: use on-demand, not polling

For secondary sandboxes (per-repo, per-user, etc.), **do not run a background health loop.** Use the preflight pattern described above: check control-plane state at job-time, wake if needed, heal if broken. This eliminates the accidental keepalive entirely.

#### Daemon API pitfalls

Two hard-won lessons about using the daemon API:

1. **List vs detail endpoints return different response shapes.** The list endpoint (`GET /vm`) includes a `status` field on each VM. The detail endpoint (`GET /vm/:name`) may **not** include `status` — it returns a different response shape. If your code uses a single type for both, you'll get `undefined` where you expect a status string. Downstream code may treat `undefined` as "missing," triggering **destructive reprovisioning of healthy sandboxes**. Prefer the list endpoint (filtered by name) if you need the status field. Always verify actual API response shapes empirically — do not trust type definitions alone.

2. **Concurrent provision races.** If multiple code paths (health loop tick + job preflight, or two simultaneous jobs) independently conclude a sandbox is missing, they can race into simultaneous delete-then-create cycles. One caller deletes the sandbox while the other is mid-exec inside it — producing the exact exit code 255 failure you're trying to prevent. Protect destructive operations with a per-sandbox lock or join pattern so concurrent callers share one recovery cycle.

### Scheduled credential sweep

For a **primary sandbox** (persistent strategy), a background credential sweep is appropriate. The bot runs a credential injection sweep on startup, then repeats every 4 hours via `setInterval`. Each sweep:

1. Calls `ensureHostTokenFresh()` to refresh the host token if near-expiry
2. Injects fresh credentials into the primary sandbox

This ensures the primary sandbox never holds expired tokens for long — even on a headless server where nothing else triggers OAuth refresh.

**For secondary sandboxes (on-demand strategy), skip the background sweep.** Credential injection via `docker sandbox exec -i` wakes the VM, creating the same keepalive problem as exec-based health checks. Instead, inject credentials at job-time as part of the preflight: call `ensureHostTokenFresh()` first, then inject into the target sandbox immediately before executing the prompt. The host OAuth token has ~8-hour TTL, so job-time injection guarantees fresh credentials without background wakeups.

---

## 13. Resource Constraints: `max_running_vms`

Docker enforces a cap on simultaneously running sandbox VMs via the `max_running_vms` daemon setting. As of Docker sandbox plugin v0.12.0, this is **not user-configurable** — it defaults to a low number (typically 3). Attempting to start a VM when the cap is full produces **exit code 255** with no clear error message.

### How you hit the cap

Any operation that wakes a VM counts against the cap:
- `docker sandbox exec` (including health checks and credential injection)
- `docker sandbox run`
- Background health loops that probe multiple sandboxes
- Scheduled credential sweeps that iterate all sandboxes

On resource-constrained machines (laptops, CI runners, small VMs), it's easy to fill the cap with background infrastructure, leaving no room for the sandbox you actually need.

### Mitigation strategies

1. **Use daemon API inspection for background health checks** — the daemon REST API returns VM state without waking anything (see [Section 12](#12-self-healing)).
2. **Inject credentials at job-time, not on a background sweep** — avoids waking secondary sandboxes during the credential refresh cycle.
3. **Let sandboxes idle-stop naturally** — the daemon stops idle VMs after a timeout. Don't fight this by keeping them warm with health checks.
4. **Use the preflight pattern** — jobs check control-plane state, wake if needed, and handle contention gracefully (see [Section 12](#12-self-healing)).
5. **Protect against concurrent cold-starts** — if N jobs fire simultaneously and all need cold starts, the Nth may hit the cap. A retry queue with backoff provides a safety net.

### Detecting cap contention

When a sandbox exec returns exit code 255 with no clear error pattern (not auth, not "container not found"), suspect `max_running_vms` contention. Capture the set of running VMs at failure time (via `GET /vm` on the daemon API) to confirm. If all slots are occupied by sandboxes woken by background infrastructure, the fix is eliminating the background wakeups, not increasing the cap.

---

## 14. Parity Checks (Host/Sandbox Sync)

If your sandbox mounts a git repo, verify the host and sandbox see the same commit. Parity drift means Claude is operating on different code than your app expects.

```bash
# Host HEAD
git -C /path/to/workspace rev-parse HEAD

# Sandbox HEAD
docker sandbox exec -w /path/to/workspace my-sandbox git rev-parse HEAD

# Compare
```

If they differ, the sandbox is stale. Common causes:
- `git pull` on host but sandbox not restarted
- Workspace path mounted incorrectly
- Host and sandbox pointing at different clones

Fix: recreate the sandbox (self-heal will do this automatically if configured).

---

## 15. Docker Desktop vs Docker CLI

| Operation | Docker CLI Only | Docker Desktop Required |
|-----------|:-:|:-:|
| `docker sandbox create` | Yes | -- |
| `docker sandbox exec` | Yes | -- |
| `docker sandbox ls` / `rm` | Yes | -- |
| Credential injection (Keychain → sandbox pipe) | Yes | -- |

**Docker Desktop is not required for any production operation.** All core sandbox operations — create, exec, ls, rm — and credential injection work with the Docker CLI alone. Self-heal uses the sandbox daemon API for lifecycle checks and the CLI for creation; neither requires Docker Desktop.

---

## 16. Common Failure Modes

### OAuth token expired

**Symptoms:** `"oauth token has expired"`, `"not logged in"` in probe output

**Fix:** The bot auto-injects fresh credentials from the macOS Keychain via the health loop. If auto-injection failed, inject manually:

```bash
security find-generic-password -s "Claude Code-credentials" -w \
  | jq 'del(.claudeAiOauth.refreshToken)' \
  | docker sandbox exec -i my-sandbox \
    sh -c 'cat > /tmp/.creds-staging \
      && mv /tmp/.creds-staging /home/agent/.claude/.credentials.json \
      && chmod 600 /home/agent/.claude/.credentials.json'
```

Interactive re-auth (`docker sandbox exec -it my-sandbox claude`) is a last resort if the host Keychain has no valid session.

### Sandbox doesn't exist

**Symptoms:** `"no such container"`, `"sandbox 'my-sandbox' does not exist"`

**Fix:** Create a fresh sandbox and inject credentials:
```bash
docker sandbox create --name my-sandbox claude /workspace
# Then inject credentials (see Section 3)
```

### Docker daemon not running

**Symptoms:** `"cannot connect to the docker daemon"`

**Fix:** Start Docker Desktop. Existing sandboxes will become available again.

### Workspace path mismatch

**Symptoms:** Probe returns empty output or SandboxUnavailableError with no detail. This is the sneakiest failure — there's no clear error message.

**Fix:** Check `docker sandbox ls` — the Workspace column must match your app's configured workspace path exactly.

### Claude hangs (no output)

**Symptoms:** Process runs indefinitely with no stdout/stderr

**Cause:** Usually missing `--permission-mode bypassPermissions` — Claude is waiting for interactive permission approval that will never come.

**Fix:** Always pass `--permission-mode bypassPermissions` in non-interactive invocations.

### API key fallback

**Symptoms:** `authMethod: "api_key_helper"` or `apiProvider` is not `"firstParty"`

**Cause:** OAuth expired and Claude fell back to an API key configured in the environment. This bills to your API account.

**Fix:** Inject fresh OAuth credentials from the Keychain. Optionally, reject API-key auth modes in your probe logic to catch this early.

### Credential injection fails (keychain phase)

**Symptoms:** `CredentialInjectionError("keychain", ...)` in logs

**Causes:**
- Keychain locked or access denied (user clicked "Deny" on the macOS prompt)
- Keychain returns empty output (credentials entry exists but has no data)
- Interactive prompt blocked in an unattended context (launchd) because the one-time "Always Allow" setup wasn't completed

**Fix:** Unlock the keychain, or re-run the one-time setup from an interactive terminal: `security find-generic-password -s "Claude Code-credentials" -w > /dev/null` → click "Always Allow". If the entry is empty, re-authenticate on the host (`claude auth` in the terminal).

### Credential injection fails (docker-exec phase)

**Symptoms:** `CredentialInjectionError("docker-exec", ...)` in logs

**Causes:** Sandbox not running, doesn't exist, or filesystem is damaged (read-only, disk full, missing `/home/agent/.claude/` directory).

**Fix:** If the sandbox exists but is damaged, recreate it. The heal loop handles this automatically.

### `max_running_vms` cap hit (exit code 255)

**Symptoms:** `docker sandbox exec` returns exit code 255 with no clear error pattern (not auth, not "container not found"). The sandbox exists and is healthy — it just can't start.

**Cause:** Docker's `max_running_vms` cap is full. Other sandboxes — often kept warm by background health loops or credential sweeps — are occupying all available VM slots. See [Section 13](#13-resource-constraints-max_running_vms).

**Fix:** Identify what's keeping the other VMs warm. Query the daemon API (`GET /vm`) to see which VMs are running. The most common cause is exec-based health checks inadvertently keeping secondary sandboxes alive. Switch background health monitoring to the daemon API (see [Section 12](#12-self-healing)) and move credential injection to job-time for secondary sandboxes.

### Host token expired on headless server

**Symptoms:** Freshly injected credentials are immediately stale; `claude -p` returns 401.

**Cause:** On a headless server, nothing triggers the host's OAuth refresh. The Keychain holds an expired access token for hours.

**Fix:** `ensureHostTokenFresh()` handles this automatically — it runs before every injection. It resolves the `claude` binary via `~/.local/bin/claude` first (launchd PATH often doesn't include it), then falls back to PATH. All launchd install scripts include `~/.local/bin` in PATH. If it still fails, check the bot's stderr log for `[ensureHostTokenFresh]` lines — every failure path is logged with the specific reason.

---

## 17. Environment Variable Reference

These are the variables we use in production. Adapt naming to your project.

```bash
# --- Core ---
CLAUDE_SANDBOX_NAME=my-sandbox          # Primary sandbox name
BOT_RUNTIME_DIR=/path/to/workspace      # Workspace mounted in sandbox (MUST match)

# --- Timeouts ---
SANDBOX_PROBE_TIMEOUT_MS=30000          # Auth check timeout (default: 30s)
SANDBOX_PROMPT_TIMEOUT_MS=3600000       # New prompt hard limit (default: varies)
SANDBOX_RESUME_TIMEOUT_MS=3600000       # Resume hard limit
SANDBOX_PROMPT_INACTIVITY_TIMEOUT_MS=600000   # Stall detection (default: 10min)
SANDBOX_RESUME_INACTIVITY_TIMEOUT_MS=600000

# --- Model ---
SANDBOX_CLAUDE_MODEL=                   # Override model (optional, uses account default)

# --- Auth policy ---
SANDBOX_ALLOW_API_KEY_AUTH=false         # Reject API-key fallback (recommended: false)

# --- Self-healing ---
SANDBOX_SELF_HEAL=true                  # Enable auto-recovery
SANDBOX_SELF_HEAL_MAX_ATTEMPTS=3        # Circuit breaker: max attempts
SANDBOX_SELF_HEAL_WINDOW_MS=900000      # Circuit breaker: window (15min)

# --- Health watchdog ---
SANDBOX_HEALTH_WATCHDOG_ENABLED=true
SANDBOX_HEALTH_WATCHDOG_INTERVAL_MS=600000    # Degraded interval (10min)
SANDBOX_WATCHDOG_HEALTHY_INTERVAL_MS=1800000  # Healthy interval (30min)

```

---

## 18. Gotchas and Hard-Won Lessons

These are things we learned by breaking them. Save yourself the pain.

1. **Workspace MUST match everywhere.** The workspace path at sandbox creation, the `-w` flag on exec, and your app's configured directory must all be identical. Mismatches cause silent failures with unhelpful empty errors.

2. **Always use `--permission-mode bypassPermissions` for non-interactive calls.** Without it, Claude waits for interactive permission approval and your process hangs forever.

3. **Always use `--output-format stream-json`.** Raw text output is unparseable for programmatic use. The stream-json format gives you structured events.

4. **Check auth patterns before resume patterns.** An auth failure during a resume call looks like a resume error but the fix is re-auth, not starting a new conversation.

5. **Non-zero exit doesn't mean no output.** Claude may exit non-zero but still have valid NDJSON in stdout. Always try to parse before throwing.

6. **Inactivity timeout > hard timeout for catching stalls.** A 10-minute silence is a much stronger signal than hitting a 1-hour wall clock.

7. **OAuth tokens expire every ~8 hours.** Expect 2-3 token refreshes per day. The bot handles this automatically: `ensureHostTokenFresh()` detects near-expiry and triggers host-side refresh, then `injectCredentials()` pipes fresh credentials into sandboxes. Manual re-auth should rarely be needed.

8. **Docker Desktop is not required for any production operation.** Core sandbox operations (create, exec, rm) and credential injection all work with the Docker CLI alone. Sandbox state survives Docker Desktop restarts.

9. **The `claude auth status --json` flag may not exist in older CLI versions.** Fall back to `claude auth status` (plain text) and regex-parse the output.

10. **Session IDs go stale on recreation, but survive re-injection.** If the sandbox is recreated, previous session IDs are lost. But credential re-injection preserves the existing container and all its state, including sessions. This is a major advantage over the old template-based recovery.

11. **Self-heal recreates in-place.** The sandbox is always recreated with the same name — no heal-suffixed or differently-named sandboxes. This simplifies cleanup and avoids orphaned VMs.

12. **Circuit-breaker your self-heal.** Without it, a persistently broken sandbox causes an infinite heal loop that burns resources and floods logs.

13. **`claude auth status --json` does NOT validate tokens.** It reports `loggedIn: true` based on the credentials file existing, not by checking the access token against the server. An expired token passes this check. This is why the inject-before-check pattern exists.

14. **Inject-before-check is essential.** Always inject fresh credentials from the Keychain *before* running `claude auth status` in health checks. Without this, the probe sees "healthy" and skips recovery even when the access token is expired. This was the root cause of a 24-hour validation failure during the credential injection spike test.

15. **Multiple concurrent `claude` processes can race on token refresh.** The OAuth refresh token rotates on each use — if two processes refresh simultaneously, only one gets a valid new token; the other's is invalidated. This is why sandboxes receive credentials with the refresh token stripped: it prevents them from independently rotating the host's token.

16. **Keychain ACL "Always Allow" must be completed from an interactive terminal.** The one-time `security find-generic-password -s "Claude Code-credentials" -w > /dev/null` + "Always Allow" click must happen interactively before launchd can read credentials. Without it, `security` blocks waiting for a macOS prompt that never appears in a daemon context.

17. **Credential injection is atomic.** The write inside the sandbox is temp file + `mv` + `chmod 600`. This prevents Claude from reading a partially-written credentials file mid-injection.

18. **`docker sandbox exec` cold-starts stopped VMs.** Any exec call — health check, credential injection, auth status — wakes a stopped VM. If you run exec-based health checks against multiple sandboxes on a timer, you keep them all running. On machines with a `max_running_vms` cap, this fills the cap and blocks other sandboxes from starting when actually needed. Use the daemon API for background health monitoring; reserve exec for point-of-use verification.

19. **Daemon API list and detail endpoints return different response shapes.** `GET /vm` (list) includes a `status` field on each VM. `GET /vm/:name` (detail) may **not** include `status`. If your code uses a single type for both responses, you'll get `undefined` where you expect a status string — and downstream code may interpret `undefined` as "missing," triggering destructive reprovisioning of healthy sandboxes. Always verify actual API response shapes empirically, not just from type definitions.

20. **Multiple callers can race into destructive sandbox recovery.** If two code paths (health loop + job preflight, or two concurrent jobs) independently conclude a sandbox is missing, they can both do `rm → create` simultaneously. One caller deletes the sandbox while the other is mid-exec inside it. Use per-sandbox locks or a join pattern for destructive operations so concurrent callers share one recovery cycle instead of racing.

21. **When adding failure/recovery paths, verify user-facing reporting.** A backend that catches errors, logs them, and retries is only half the fix. If the error message isn't persisted to the run/job record, dashboards and status UIs show empty or generic failure panels. Thread error messages through your full stack: catch block → data store → API response → UI component.
