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
10. [Templates: Cloning Auth to New Sandboxes](#10-templates-cloning-auth-to-new-sandboxes)
11. [Backup and Restore](#11-backup-and-restore)
12. [Self-Healing](#12-self-healing)
13. [Parity Checks (Host/Sandbox Sync)](#13-parity-checks-hostsandbox-sync)
14. [Docker Desktop vs Docker CLI](#14-docker-desktop-vs-docker-cli)
15. [Common Failure Modes](#15-common-failure-modes)
16. [Environment Variable Reference](#16-environment-variable-reference)
17. [Gotchas and Hard-Won Lessons](#17-gotchas-and-hard-won-lessons)

---

## 1. Core Concepts

A **Docker sandbox** is an isolated container managed by the `docker sandbox` CLI plugin. Claude Code runs inside it with full filesystem access to a mounted workspace directory. The key insight: **auth credentials persist inside the sandbox** after a one-time interactive login. Once authed, you can invoke Claude non-interactively via `docker sandbox exec`.

**Why sandboxes instead of running Claude directly?**
- Isolation: Claude's file operations are contained
- Persistence: Auth tokens survive process restarts
- Reproducibility: Snapshot an authed sandbox as a template, clone it

**The workspace mount is critical.** When you create a sandbox, you specify a workspace path. This path is mounted inside the container. Claude operates on files at this path. If the workspace doesn't match what your app expects, everything breaks silently.

---

## 2. Prerequisites

- **Docker CLI** with the sandbox plugin installed (`docker sandbox ls` must work)
- **Docker Desktop** is only needed for template operations (save/load/backup). Core operations (create, exec, ls, rm) work without it.
- **Claude CLI** is bundled inside the sandbox — you don't install it separately

Verify your setup:

```bash
# Plugin available?
docker sandbox ls

# Docker daemon running? (only needed for template ops)
docker info >/dev/null && echo "OK" || echo "Docker Desktop not running"
```

---

## 3. Creating and Authenticating a Sandbox

### One-time interactive setup (~2 minutes)

```bash
# Create a named sandbox with your workspace directory.
# "claude" is the base image — it includes the Claude CLI.
docker sandbox run --name my-sandbox claude /path/to/your/workspace
```

This drops you into an interactive Claude session. A browser window opens for OAuth login. Complete the login, then exit:

```
/exit
```

Or press `Ctrl+C`.

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

1. **`loggedIn: true`** — Token is valid
2. **`apiProvider: firstParty`** — Using Anthropic OAuth (not an API key)
3. **No API key fallback** — If `authMethod` contains `api_key` or `apiProvider` is not `firstParty`, the sandbox fell back to API-key auth, which bills to your API account instead of your Claude subscription

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
| **Auth failure** | `"not logged in"`, `"unauthenticated"`, `"authentication required"`, `"failed to authenticate"`, `"authentication_error"`, `"oauth token has expired"`, `"token has expired"` | Re-authenticate interactively |
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

## 10. Templates: Cloning Auth to New Sandboxes

The most valuable sandbox operation: **save an authenticated sandbox as a Docker image (template), then create new sandboxes from it — already authed, no browser login needed.**

### Save a template

```bash
# Snapshot an authenticated sandbox to a local Docker image
docker sandbox save my-sandbox my-app-auth:latest
```

This creates a Docker image `my-app-auth:latest` that captures the sandbox's full state, including cached OAuth credentials.

**Requires Docker Desktop running.** `docker sandbox save` needs the Docker daemon for image operations.

### Create from template

```bash
# Create a new sandbox from the template — inherits auth
docker sandbox create --template my-app-auth:latest \
  --name my-new-sandbox claude /path/to/workspace

# Verify auth carried over
docker sandbox exec -w /path/to/workspace my-new-sandbox claude auth status --json
```

### Important sandbox create syntax

```bash
docker sandbox create --template <image> --name <name> claude <workspace>
```

**Gotchas we learned the hard way:**
- `--load-local-template` does not exist as a flag (despite what you might expect)
- `--pull-template never` breaks local images — don't use it
- Just use the bare command above. It works with local images.

### Tag rotation for rollback safety

Keep two versions: `:latest` and `:prev`. If a bad template gets saved, you can roll back:

```bash
# Before saving a new template, preserve the current one
docker image tag my-app-auth:latest my-app-auth:prev

# Save new template
docker sandbox save my-sandbox my-app-auth:latest

# If the new template is bad, roll back
docker tag my-app-auth:prev my-app-auth:latest
```

---

## 11. Backup and Restore

Templates live in Docker's image store, which can be lost if Docker is reinstalled or the VM is recreated. Export templates as tar files for durable backup.

### Backup workflow

```bash
# 1. Save authenticated sandbox as template (requires Docker Desktop)
docker sandbox save my-sandbox my-app-auth:latest

# 2. Export to tar file
TIMESTAMP=$(date -u +'%Y%m%dT%H%M%SZ')
BACKUP_DIR=~/.config/my-app/templates
mkdir -p "$BACKUP_DIR"
docker image save my-app-auth:latest -o "$BACKUP_DIR/my-app-auth__latest_${TIMESTAMP}.tar"

# 3. Symlink for easy access
ln -sfn "$BACKUP_DIR/my-app-auth__latest_${TIMESTAMP}.tar" "$BACKUP_DIR/my-app-auth__latest_latest.tar"
```

### Restore workflow

```bash
# 1. Load template from backup tar
docker image load -i ~/.config/my-app/templates/my-app-auth__latest_latest.tar

# 2. Remove broken sandbox (if exists)
docker sandbox rm my-sandbox 2>/dev/null || true

# 3. Create fresh from template
docker sandbox create --template my-app-auth:latest \
  --name my-sandbox claude /path/to/workspace

# 4. Verify
docker sandbox exec -w /path/to/workspace my-sandbox claude auth status --json
```

### Backup rotation

Keep N timestamped backups and prune older ones:

```bash
# Keep 14 most recent, remove the rest
ls -1t "${BACKUP_DIR}/my-app-auth__latest_"*.tar | tail -n +15 | xargs rm -f
```

---

## 12. Self-Healing

When your app detects a broken sandbox at runtime, it can automatically recover by creating a new sandbox from a template.

### Heal-eligible failures

Auto-heal when:
- Sandbox is unavailable (missing, stopped, Docker daemon down)
- Sandbox is unauthenticated (OAuth expired)
- Sandbox command timed out or stalled
- Host/sandbox parity mismatch

### Heal strategy (in order)

1. **Try existing heal sandbox** — Check if a previously-healed sandbox (e.g., `my-sandbox-heal`) is still healthy. Reuse it.
2. **Create from template** — `docker sandbox create --template my-app-auth:latest --name my-sandbox-heal claude /workspace`
3. **Discover existing authed sandbox** — Scan all sandboxes (`docker sandbox ls`) and probe each one. Adopt the first healthy one.
4. **Create fresh (unauthenticated)** — Last resort. Alert the operator to authenticate manually.

### Circuit breaker

Prevent heal flapping when the sandbox can't stabilize:

```
Max attempts: 3
Window: 15 minutes
```

If 3 heal attempts fail within 15 minutes, stop trying and alert the operator. Resume after the window resets.

### Health watchdog

Run a background health check on an interval (e.g., every 5 minutes):

1. Probe the active sandbox
2. If unhealthy, trigger self-heal
3. If heal succeeds, swap the active sandbox name

This catches auth expiry and Docker daemon restarts before users hit them.

---

## 13. Parity Checks (Host/Sandbox Sync)

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

## 14. Docker Desktop vs Docker CLI

| Operation | Docker CLI Only | Docker Desktop Required |
|-----------|:-:|:-:|
| `docker sandbox create` (no template) | Yes | -- |
| `docker sandbox create --template` (image already loaded) | Yes | -- |
| `docker sandbox exec` | Yes | -- |
| `docker sandbox ls` / `rm` | Yes | -- |
| `docker sandbox save` (snapshot to image) | -- | Yes |
| `docker image save` / `load` (tar export/import) | -- | Yes |
| `docker image inspect` / `tag` | -- | Yes |

**Implication:** Your app can run Claude in existing sandboxes without Docker Desktop. But template creation, backup, and restore require it. Design your self-heal to degrade gracefully when Desktop is down:
- Template-based heal → falls back to discovering existing sandboxes → falls back to fresh (unauthed) sandbox + operator alert.

---

## 15. Common Failure Modes

### OAuth token expired

**Symptoms:** `"oauth token has expired"`, `"not logged in"` in probe output

**Fix:**
```bash
docker sandbox exec -it my-sandbox claude  # re-auth in browser
# or:
docker sandbox exec my-sandbox claude auth logout
docker sandbox exec -it my-sandbox claude  # fresh login
```

### Sandbox doesn't exist

**Symptoms:** `"no such container"`, `"sandbox 'my-sandbox' does not exist"`

**Fix:** Restore from template or bootstrap from scratch:
```bash
# From template (if available):
docker sandbox create --template my-app-auth:latest --name my-sandbox claude /workspace

# From scratch:
docker sandbox run --name my-sandbox claude /workspace  # interactive auth
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

**Fix:** Re-authenticate via OAuth. Optionally, reject API-key auth modes in your probe logic to catch this early.

---

## 16. Environment Variable Reference

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
SANDBOX_SELF_HEAL_TEMPLATE=my-app-auth:latest  # Template image for heal
SANDBOX_SELF_HEAL_MAX_ATTEMPTS=3        # Circuit breaker: max attempts
SANDBOX_SELF_HEAL_WINDOW_MS=900000      # Circuit breaker: window (15min)

# --- Health watchdog ---
SANDBOX_HEALTH_WATCHDOG_ENABLED=true
SANDBOX_HEALTH_WATCHDOG_INTERVAL_MS=300000   # Check every 5min

# --- Template backup ---
SANDBOX_TEMPLATE_BACKUP_DIR=~/.config/my-app/templates
SANDBOX_TEMPLATE_BACKUP_KEEP=14         # Rotate: keep 14 timestamped backups
```

---

## 17. Gotchas and Hard-Won Lessons

These are things we learned by breaking them. Save yourself the pain.

1. **Workspace MUST match everywhere.** The workspace path at sandbox creation, the `-w` flag on exec, and your app's configured directory must all be identical. Mismatches cause silent failures with unhelpful empty errors.

2. **`--load-local-template` doesn't exist.** Don't try to use it. `--pull-template never` also breaks local images. Just use `docker sandbox create --template <image> --name <name> claude <workspace>`.

3. **Always use `--permission-mode bypassPermissions` for non-interactive calls.** Without it, Claude waits for interactive permission approval and your process hangs forever.

4. **Always use `--output-format stream-json`.** Raw text output is unparseable for programmatic use. The stream-json format gives you structured events.

5. **Check auth patterns before resume patterns.** An auth failure during a resume call looks like a resume error but the fix is re-auth, not starting a new conversation.

6. **Non-zero exit doesn't mean no output.** Claude may exit non-zero but still have valid NDJSON in stdout. Always try to parse before throwing.

7. **Inactivity timeout > hard timeout for catching stalls.** A 10-minute silence is a much stronger signal than hitting a 1-hour wall clock.

8. **OAuth tokens expire.** Plan for it. Your app should detect auth failures and either self-heal or alert the operator with clear re-auth instructions.

9. **Template save requires Docker Desktop.** Core sandbox operations (create, exec, rm) work with just the CLI, but saving snapshots needs the full daemon. Design your backup/heal strategy to degrade gracefully.

10. **Sandbox state survives Docker Desktop restarts.** You don't need to re-create sandboxes when Docker restarts. But if Docker Desktop is completely reinstalled, image-based templates may be lost — that's what tar backups are for.

11. **The `claude auth status --json` flag may not exist in older CLI versions.** Fall back to `claude auth status` (plain text) and regex-parse the output.

12. **Session IDs go stale.** If the sandbox is recreated, previous session IDs are lost. Your app should handle resume failures by starting fresh.

13. **Heal sandbox naming matters.** Use a consistent pattern (e.g., `my-sandbox-heal`) so you can find and reuse healed sandboxes across restarts.

14. **Circuit-breaker your self-heal.** Without it, a persistently broken sandbox causes an infinite heal loop that burns resources and floods logs.
