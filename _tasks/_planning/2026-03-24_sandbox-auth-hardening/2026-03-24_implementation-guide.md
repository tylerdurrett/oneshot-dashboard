# Implementation Guide: Production Auth & Credential Injection for Docker Sandboxes

**Date:** 2026-03-24
**Feature:** Sandbox Auth Hardening
**Source:** [Docker Sandbox Claude Guide](../../docs/_reference/docker-sandbox-claude_UPDATED.md)

## Context

The sandbox auth system currently relies on interactive login only (`docker sandbox run`). When OAuth tokens expire (~8 hours), auth breaks silently and requires manual re-login. The [reference guide](../../docs/_reference/docker-sandbox-claude_UPDATED.md) documents a production-grade model where credentials are injected from the host's macOS Keychain with refresh tokens stripped. This implementation brings those lessons into the codebase: automated credential injection, inject-on-failure recovery, a circuit breaker, a background credential sweep, and an updated setup script.

**Inject strategy:** Probe first without injection. If auth fails, inject fresh credentials from Keychain and retry. This avoids adding 5-15s latency to the happy path.

## File Structure

```
apps/server/src/
├── services/
│   ├── credentials.ts          ← NEW: Keychain read, token strip, inject, host refresh
│   ├── sandbox.ts              ← MODIFY: preflight, circuit breaker, auth recovery
│   └── thread.ts               (unchanged)
├── config.ts                   ← MODIFY: add timeout/threshold/sweep config values
├── index.ts                    ← MODIFY: background credential sweep lifecycle
├── routes/
│   ├── chat.ts                 ← MODIFY: add preflight before invokeClaude
│   └── threads.ts              (unchanged)
└── __tests__/
    ├── helpers.ts              ← NEW: shared test utilities (extracted from duplication)
    ├── credentials.test.ts     ← NEW: credential service tests
    ├── sandbox.test.ts         ← MODIFY: preflight + circuit breaker tests
    ├── chat-routes.test.ts     ← MODIFY: preflight integration tests
    └── health.test.ts          ← MODIFY: credential sweep tests

scripts/
└── sandbox-auth.mjs            ← MODIFY: prefer Keychain injection over interactive login
```

## Phase 1: Shared Test Helpers & Config Additions

**Purpose:** Extract duplicated test utilities and add config values that all later phases depend on.

**Rationale:** `createFakeSpawn` and `ndjson` are duplicated across `sandbox.test.ts` and `chat-routes.test.ts`. Extracting them prevents a third copy in `credentials.test.ts`. Config values must exist before any credential service code references them.

### 1.1 Extract Shared Test Helpers

- [x] Create `apps/server/src/__tests__/helpers.ts`
- [x] Move `FakeSpawnOptions`, `createFakeSpawn`, and `ndjson` helper from `sandbox.test.ts` into the shared file
- [x] Add a new `createRoutingSpawn(routes: Record<string, FakeSpawnOptions>)` helper that returns different responses based on the command (needed to mock both `security` and `docker` in the same test)
- [x] Update `sandbox.test.ts` and `chat-routes.test.ts` to import from `./helpers.js`
- [x] Run `pnpm --filter @repo/server test` — all existing tests still pass

> **Notes:** Also updated `health.test.ts` to use shared `createFakeSpawn` instead of its own duplicated `createHealthySpawn`/`createUnavailableSpawn` helpers (~50 lines removed). Used `Object.entries` in `createRoutingSpawn` for type safety.

**Acceptance Criteria:**
- No duplicated `createFakeSpawn` definitions remain in test files
- All existing tests pass without modification to assertions
- `createRoutingSpawn` is available for credential tests

### 1.2 Add Config Values

- [x] Add `envInt()` and `envBool()` utility functions to `apps/server/src/config.ts`
- [x] Add config fields: `keychainTimeoutMs` (default 10s), `injectTimeoutMs` (default 15s), `hostRefreshThresholdMs` (default 10min), `credentialSweepIntervalMs` (default 4hr), `healMaxAttempts` (default 3), `healWindowMs` (default 15min), `credentialSweepEnabled` (default true)
- [x] Each field reads from an env var with the matching name, falling back to the default
- [x] Run `pnpm --filter @repo/server test` — existing tests unaffected

> **Notes:** Removed `as const` from the config object since `envBool` returns a `boolean` value that conflicts with const assertion. Env var names use SCREAMING_SNAKE_CASE matching the field names (e.g., `KEYCHAIN_TIMEOUT_MS` for `keychainTimeoutMs`). All 88 existing tests pass. Env var overrides verified manually.

**Acceptance Criteria:**
- All new config values are accessible via `config.*`
- Env var overrides work (e.g., `HEAL_MAX_ATTEMPTS=5` changes the value)
- No existing tests break

## Phase 2: Credential Injection Service

**Purpose:** Build the core credential injection pipeline — the foundation everything else depends on.

**Rationale:** This phase has zero dependencies on existing sandbox code. It's a standalone service that reads the Keychain, strips the refresh token, and pipes credentials into the sandbox atomically.

### 2.1 Core Credential Functions

- [x] Create `apps/server/src/services/credentials.ts`
- [x] Implement types: `CredentialPhase` (`'keychain' | 'docker-exec' | 'parse'`), `CredentialInjectionResult` (ok/fail discriminated union), `HostTokenStatus`
- [x] Implement `readKeychainCredentials(spawnFn?)` — guards on `process.platform === 'darwin'`, spawns `security find-generic-password -s "Claude Code-credentials" -w`, parses JSON, returns result type. Timeout from `config.keychainTimeoutMs`. Extract platform check to `isMacOS()` function for testability.
- [x] Implement `stripRefreshToken(credentials)` — pure function, deep clones, deletes `claudeAiOauth.refreshToken`, returns stripped copy
- [x] Implement `getHostTokenExpiresAt(credentials)` — pure function, returns `claudeAiOauth.expiresAt` as epoch ms or null
- [x] Implement `injectCredentials(credentialsJson, spawnFn?)` — spawns `docker sandbox exec -i <name> sh -c 'cat > /tmp/.creds-staging && mv /tmp/.creds-staging /home/agent/.claude/.credentials.json && chmod 600 /home/agent/.claude/.credentials.json'`, pipes JSON to stdin. Uses `stdio: ['pipe', 'pipe', 'pipe']`. Timeout from `config.injectTimeoutMs`.
- [x] Export the `SpawnFn` type re-used from `sandbox.ts` (or use a shared type)

> **Notes:** Used `structuredClone` instead of `JSON.parse(JSON.stringify(...))` for deep cloning in `stripRefreshToken`. `injectCredentials` returns `{ ok: true, credentials: null }` on success rather than re-parsing its own string input — the caller (pipeline in 2.2) already has the parsed credentials from the keychain read step. Removed unnecessary "what" comments per code review; kept "why" comments. All 88 existing tests pass.

**Acceptance Criteria:**
- `readKeychainCredentials` returns `{ ok: false, phase: 'keychain' }` on non-macOS
- `stripRefreshToken` removes the refresh token and preserves all other fields
- `injectCredentials` writes JSON to child stdin and returns success/failure
- All functions follow the DI pattern (accept `spawnFn`)

### 2.2 Host Token Refresh & Pipeline

- [x] Implement `ensureHostTokenFresh(spawnFn?)` — reads Keychain, checks `expiresAt` against `config.hostRefreshThresholdMs`, spawns `claude -p "."` on host if near-expiry. Concurrent call dedup via module-level inflight promise. Non-fatal: never rejects, returns `HostTokenStatus`.
- [x] Implement `refreshAndInjectCredentials(spawnFn?)` — convenience pipeline: `ensureHostTokenFresh()` → `readKeychainCredentials()` → `stripRefreshToken()` → `injectCredentials()`. Returns `CredentialInjectionResult`.
- [x] Export `refreshAndInjectCredentials` as the primary public API for other modules

> **Notes:** Diverged from plan in two ways: (1) Added a `credentials` field to the `{ fresh: true }` case of `HostTokenStatus` so the pipeline can reuse cached credentials from the freshness check instead of re-reading the keychain — eliminates a redundant subprocess spawn on the happy path. (2) Used `config.injectTimeoutMs` (15s) instead of `config.keychainTimeoutMs` (10s) for the host refresh timeout, since `claude -p "."` may trigger an OAuth flow and needs more time than a simple keychain read. All 88 existing tests pass.

**Acceptance Criteria:**
- `ensureHostTokenFresh` skips refresh when token is fresh (no spawn)
- `ensureHostTokenFresh` triggers host `claude -p "."` when token is near-expiry
- Concurrent calls to `ensureHostTokenFresh` share one in-flight spawn (dedup)
- `refreshAndInjectCredentials` chains the full pipeline and returns a single result
- All failures are captured in the result type, never thrown

### 2.3 Credential Service Tests

- [x] Create `apps/server/src/__tests__/credentials.test.ts`
- [x] Test `stripRefreshToken`: strips token, preserves other fields, handles missing `claudeAiOauth` gracefully
- [x] Test `getHostTokenExpiresAt`: extracts timestamp, returns null on malformed input
- [x] Test `readKeychainCredentials`: mock `security` command via `createFakeSpawn` — success, invalid JSON, timeout. Mock `isMacOS()` for platform guard
- [x] Test `injectCredentials`: mock `docker sandbox exec -i` — success, non-zero exit, timeout. Verify stdin receives the JSON payload using a capturing spawn
- [x] Test `ensureHostTokenFresh`: fresh token (no-op), expired token (triggers refresh), concurrent dedup (two calls produce one spawn)
- [x] Test `refreshAndInjectCredentials`: full pipeline success, keychain failure short-circuits, inject failure after successful read
- [x] Run `pnpm --filter @repo/server test`

> **Notes:** Used `Object.defineProperty(process, 'platform', ...)` to mock `isMacOS()` instead of `vi.mock` — ESM doesn't intercept intra-module function calls, so mocking the export doesn't affect the internal call site. Added `StdinCapture` interface and stdin support to `createFakeSpawn` (with overloaded signatures) to verify stdin piping. Also added `refreshAndInjectCredentials` tests for the stale-token re-read path and refresh token stripping verification. 28 new tests, all 116 pass.

**Acceptance Criteria:**
- All credential functions have unit tests covering happy path and error cases
- Platform guard tested (non-macOS returns early)
- Stdin piping verified in inject tests
- Concurrent dedup verified for host refresh
- All tests pass

## Phase 3: Preflight Check & Inject-on-Failure

**Purpose:** Add a preflight check that probes the sandbox and recovers from auth failures by injecting fresh credentials.

**Rationale:** This is where the "inject on failure only" strategy comes together. The chat handler calls preflight before invoking Claude. If auth is stale, credentials are injected and the probe retried — all transparently.

### 3.1 Add Preflight to Sandbox Service

- [x] Add `PreflightResult` type to `apps/server/src/services/sandbox.ts`: `{ ok: boolean, status: SandboxStatus, message: string, recoveryAttempted: boolean }`
- [x] Implement `preflightCheck(spawnFn?)` in `sandbox.ts`:
  1. Call existing `probeSandbox(spawnFn)` (no injection — fast path)
  2. If `healthy`, return `{ ok: true, ... }`
  3. If `auth_failed`, attempt recovery: call `refreshAndInjectCredentials(spawnFn)`, then re-probe
  4. If recovery succeeds (re-probe healthy), return `{ ok: true, recoveryAttempted: true, ... }`
  5. If recovery fails or re-probe still unhealthy, return `{ ok: false, ... }`
  6. If `unavailable`, return `{ ok: false, ... }` immediately (can't fix missing sandbox at runtime)
- [x] Import `refreshAndInjectCredentials` from `./credentials.js`

> **Notes:** Implementation follows plan exactly. Added a "why" comment explaining that only `auth_failed` warrants recovery (unavailable = infrastructure problem, not fixable by injection). On injection failure, the error message includes the credential phase for diagnostics. All 116 existing tests pass.

**Acceptance Criteria:**
- Healthy sandbox: preflight returns ok with no injection (fast path)
- Auth-failed sandbox: preflight injects credentials, re-probes, returns ok if recovered
- Auth-failed + failed recovery: returns not ok with descriptive message
- Unavailable sandbox: returns not ok immediately (no injection attempt)

### 3.2 Wire Preflight into Chat Handler

- [x] In `apps/server/src/routes/chat.ts`, import `preflightCheck` from `../services/sandbox.js`
- [x] In `handleChatMessage`, before the existing `invokeClaude` call (before "Step 5: Set streaming lock"), add a preflight step:
  ```
  const preflight = await preflightCheck(spawnFn);
  if (!preflight.ok) {
    sendError(socket, `Sandbox not ready: ${preflight.message}`);
    return;
  }
  ```
- [x] Pass `spawnFn` through the handler chain (it's already available as a parameter)

> **Notes:** Diverged from plan: moved preflight to Step 2 (right after thread validation, before message persist) instead of Step 5 (before streaming lock). This prevents orphaned user messages when preflight fails — if the sandbox is down, no DB writes occur, so retries don't create duplicate messages or consume title-generation logic. Added `withHealthyPreflight` test helper to `helpers.ts` so existing chat-routes tests pass — it wraps any SpawnFn to intercept auth-status probes while passing Claude invocations through. All 116 tests pass.

**Acceptance Criteria:**
- Chat messages are blocked with a clear error when the sandbox is not ready
- The preflight runs before streaming lock is set (no dangling lock on preflight failure)
- The error message includes the specific failure reason (auth_failed vs unavailable)

### 3.3 Preflight & Chat Tests

- [x] Add `preflightCheck` tests to `apps/server/src/__tests__/sandbox.test.ts`:
  - Healthy sandbox returns ok (single probe, no injection)
  - Auth-failed + successful recovery returns ok with `recoveryAttempted: true`
  - Auth-failed + failed recovery returns not ok
  - Unavailable returns not ok immediately
- [x] Add preflight integration tests to `apps/server/src/__tests__/chat-routes.test.ts`:
  - Message with healthy sandbox proceeds normally (existing behavior preserved)
  - Message with auth-failed sandbox receives error via WebSocket before any Claude invocation
  - Message with auth-failed + successful recovery proceeds to Claude invocation
- [x] Run `pnpm --filter @repo/server test`

> **Notes:** Added 4 unit tests in `sandbox.test.ts` and 2 integration tests in `chat-routes.test.ts` (6 new tests, 122 total). Existing happy-path tests already cover "healthy sandbox proceeds normally" via `withHealthyPreflight`. During code review, extracted `mockPlatform()`/`restorePlatform()` helpers from `credentials.test.ts` into shared `helpers.ts` and updated all three test files to use them — eliminated platform mock duplication. Tests use multi-behavior spawn functions that route based on command/args to simulate the full preflight → recovery → re-probe flow.

**Acceptance Criteria:**
- Preflight logic fully tested at unit and integration levels
- Existing chat tests continue to pass (no regression)
- All tests pass

## Phase 4: Circuit Breaker

**Purpose:** Prevent heal-flapping when the sandbox can't stabilize.

**Rationale:** Without a circuit breaker, a persistently broken sandbox triggers endless inject-retry cycles. The breaker limits recovery to 3 attempts per 15-minute window, then fails fast with a descriptive message.

### 4.1 Circuit Breaker Implementation

- [x] Add circuit breaker state and functions to `apps/server/src/services/sandbox.ts`:
  - Module-level `circuitBreaker: { attempts: { timestamp: number }[] }`
  - `isCircuitOpen()` — prunes old attempts outside `config.healWindowMs`, returns true if `>= config.healMaxAttempts`
  - `recordHealAttempt()` — pushes current timestamp
  - `resetCircuitBreaker()` — exported for testing
- [x] Integrate into `preflightCheck`: before attempting recovery, check `isCircuitOpen()`. If open, skip recovery and return `{ ok: false, message: "Auth recovery circuit breaker open — too many recent failures. Try again later." }`
- [x] Call `recordHealAttempt()` after each recovery attempt (success or failure)

> **Notes:** Implementation follows plan exactly. `isCircuitOpen()` prunes stale attempts inline via `filter()` before checking the count — no separate pruning step needed. `recordHealAttempt()` is called after `refreshAndInjectCredentials()` regardless of its result, so both successful and failed injections count toward the breaker limit. All 122 existing tests pass unchanged — the breaker is closed by default so existing preflight recovery tests are unaffected.

**Acceptance Criteria:**
- Circuit breaker allows first 3 recovery attempts within the window
- 4th attempt within the window fails fast without attempting injection
- Attempts outside the window are pruned (circuit resets naturally)
- `resetCircuitBreaker()` clears state for test isolation

### 4.2 Auth Recovery in invokeClaude

- [x] In `runInvocation` (sandbox.ts), when the close handler classifies an auth error:
  1. Check `isCircuitOpen()` — if open, emit error and close as-is
  2. If circuit is closed, call `recordHealAttempt()`, then `refreshAndInjectCredentials(spawnFn)`
  3. If injection succeeds, emit `'auth_recovery'` event, retry the invocation once
  4. If injection fails, emit the original auth error
- [x] Add `'auth_recovery'` to the documented event types on `invokeClaude`

> **Notes:** Added `isRecoveryRetry` boolean parameter (default false) to `runInvocation` to prevent infinite retry loops — at most one recovery per invocation. Cached the `matchesPatterns(stderr, stdout, AUTH_FAILURE_PATTERNS)` result in a local `isAuthFailure` variable to avoid redundant string scanning (the resume failure check already tests this). Added a defensive `.catch()` on the `refreshAndInjectCredentials` promise chain even though the function is documented to never reject. Also added `resetCircuitBreaker()` in `beforeEach` for the `preflightCheck` test suite — the invokeClaude auth error tests now record heal attempts via the recovery path, which would otherwise accumulate and open the circuit breaker before the preflight tests run. All 122 tests pass.

**Acceptance Criteria:**
- Auth error during invocation triggers one injection + retry attempt
- Circuit breaker prevents repeated retries across invocations
- `auth_recovery` event is emitted before retry so callers know what happened
- Non-auth errors (unavailable, resume failure) are unaffected

### 4.3 Circuit Breaker Tests

- [x] Unit tests for `isCircuitOpen`, `recordHealAttempt`, `resetCircuitBreaker` in `sandbox.test.ts`
- [x] Test `preflightCheck` with open circuit breaker (skips recovery, returns fast)
- [x] Test `invokeClaude` auth error → recovery → retry flow
- [x] Test `invokeClaude` auth error with open circuit breaker → no recovery, error emitted
- [x] Run `pnpm --filter @repo/server test`

> **Notes:** Since `isCircuitOpen` and `recordHealAttempt` are intentionally unexported (internal implementation details), they are tested indirectly through `preflightCheck` and `invokeClaude` — the public APIs that exercise them. Three circuit breaker tests cover: filling the breaker to capacity and verifying it blocks, `resetCircuitBreaker()` clearing state, and natural reset via time window pruning (using `vi.useFakeTimers()`). Four `invokeClaude` auth recovery tests cover: successful recovery with retry, failed injection emitting original error, open circuit breaker blocking recovery, and the retry-once guard preventing infinite loops. Extracted `authFailedNoRecoverySpawn()` to module scope for reuse across both test suites. Added `resetCircuitBreaker()` to the original `invokeClaude` describe block's `beforeEach` for test isolation. Extended `collectEvents` with `authRecovered` field. 7 new tests, all 129 pass.

**Acceptance Criteria:**
- Circuit breaker logic fully tested at unit and integration levels
- All tests pass

## Phase 5: Background Credential Sweep

**Purpose:** Keep the primary sandbox's credentials fresh between user requests.

**Rationale:** With inject-on-failure, the first request after token expiry pays the recovery cost. A background sweep every 4 hours proactively refreshes credentials, so most requests hit the fast path. Uses `setInterval` — no external scheduling library needed.

### 5.1 Credential Sweep Lifecycle

- [ ] In `apps/server/src/index.ts`, import `refreshAndInjectCredentials` from `./services/credentials.js`
- [ ] Add sweep setup after server listen (inside the `!process.env.VITEST` block):
  1. Run initial `refreshAndInjectCredentials()` alongside the existing `runSandboxProbe()` (non-blocking)
  2. If `config.credentialSweepEnabled`, start a `setInterval` calling `refreshAndInjectCredentials()` every `config.credentialSweepIntervalMs`
  3. Log success/failure at each sweep
- [ ] Add graceful shutdown: `server.addHook('onClose', ...)` clears the interval
- [ ] Expose `stopCredentialSweep()` on the server object (same pattern as `runSandboxProbe`) for testability

**Acceptance Criteria:**
- Credential sweep runs on startup and then every 4 hours (configurable)
- Sweep failures are logged but don't crash the server
- `stopCredentialSweep()` cleanly stops the interval
- `onClose` hook clears the interval on shutdown

### 5.2 Sweep Tests

- [ ] Add tests in `apps/server/src/__tests__/health.test.ts` (or a new `credential-sweep.test.ts` if cleaner):
  - Verify sweep calls `refreshAndInjectCredentials` with the server's spawnFn
  - Verify `stopCredentialSweep` prevents further calls
  - Verify sweep error doesn't propagate (server stays up)
- [ ] Run `pnpm --filter @repo/server test`

**Acceptance Criteria:**
- Sweep lifecycle tested (start, stop, error handling)
- All tests pass

## Phase 6: Update Setup Script

**Purpose:** Make the setup script prefer automated Keychain injection over interactive login.

**Rationale:** Currently `pnpm sandbox` always opens an interactive browser login. With injection, returning users can skip the interactive flow entirely. Interactive login becomes a fallback for first-time setup only.

### 6.1 Add Keychain Injection to sandbox-auth.mjs

- [ ] Add `tryKeychainInjection(name, workspace)` function to `scripts/sandbox-auth.mjs`:
  1. Run `security find-generic-password -s "Claude Code-credentials" -w` via `execSync`
  2. If Keychain entry exists, `JSON.parse` it, `delete creds.claudeAiOauth?.refreshToken`
  3. Pipe stripped JSON into `docker sandbox exec -i <name>` using the atomic write pattern
  4. Return `true` on success, `false` on any failure
- [ ] Guard on `process.platform === 'darwin'` — return `false` on non-macOS
- [ ] In `main()`, after step 2 (sandbox exists check), try injection before interactive login:
  - If sandbox exists but not authed → try `tryKeychainInjection()` → if success, re-check auth → if good, skip interactive login
  - If sandbox doesn't exist → create it, then try injection instead of relying on the interactive session for auth
- [ ] Keep interactive login as fallback when injection fails or Keychain is empty

**Acceptance Criteria:**
- `pnpm sandbox` succeeds without opening a browser when host has valid Keychain credentials
- Falls back to interactive login when Keychain is empty or injection fails
- Works correctly on first-time setup (no Keychain entry yet → interactive login)
- Non-macOS platforms still work (skip injection, use interactive login)

### 6.2 Manual Testing of Setup Script

- [ ] Test `pnpm sandbox` with existing Keychain credentials (should skip browser)
- [ ] Test `pnpm sandbox` after `security delete-generic-password -s "Claude Code-credentials"` (should fall back to browser)
- [ ] Verify auth status after both paths shows `firstParty` OAuth

**Acceptance Criteria:**
- Both paths (injection and interactive) result in a healthy, authenticated sandbox

## Phase 7: Update Health Endpoint & Documentation

**Purpose:** Improve the health endpoint with richer status info and update docs.

**Rationale:** The health endpoint currently only shows cached probe results. With credential injection available, it should also report whether injection is available (macOS) and when credentials were last refreshed.

### 7.1 Enrich Health Endpoint

- [ ] Expand the `/health` response to include `credentialInjection: { available: boolean, lastSweep: string | null }` sourced from a module-level timestamp updated by the credential sweep
- [ ] Update startup log messages to suggest `pnpm sandbox` (Keychain injection) instead of `docker sandbox exec -it ... claude` for auth recovery

**Acceptance Criteria:**
- `/health` response includes credential injection availability and last sweep timestamp
- Startup logs guide users to `pnpm sandbox` for auth recovery

### 7.2 Update Documentation

- [ ] Update `docs/_reference/docker-sandbox-claude_UPDATED.md` with a section noting this repo's implementation of the patterns
- [ ] Add inline comments in `credentials.ts` referencing guide sections for each pattern (e.g., "See guide Section 3: inject-before-check pattern")
- [ ] Run full test suite: `pnpm --filter @repo/server test`

**Acceptance Criteria:**
- Documentation reflects the new auth capabilities
- All tests pass across the full suite

## Dependency Graph

```
Phase 1 (Helpers & Config)
  1.1 Test Helpers → 1.2 Config
                       |
Phase 2 (Credentials Service)     Phase 6 (Setup Script)
  2.1 Core Functions                 6.1 Keychain Injection
        |                            6.2 Manual Test
  2.2 Host Refresh & Pipeline
        |
  2.3 Credential Tests
        |
        ├─────────────────────────────────┐
        |                                 |
Phase 3 (Preflight)              Phase 5 (Background Sweep)
  3.1 Preflight Function           5.1 Sweep Lifecycle
  3.2 Wire into Chat               5.2 Sweep Tests
  3.3 Preflight Tests
        |
Phase 4 (Circuit Breaker)
  4.1 Breaker Implementation
  4.2 Auth Recovery in invokeClaude
  4.3 Breaker Tests
        |
Phase 7 (Health & Docs)
  7.1 Enrich Health Endpoint
  7.2 Update Documentation
```

**Parallelizable:** Phase 6 (setup script) is independent after Phase 2 design is locked. Phase 5 (sweep) is independent of Phases 3-4.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Inject on failure only (not every request) | Avoids 5-15s latency on the happy path. First request after token expiry pays recovery cost; background sweep minimizes this window. |
| Separate `credentials.ts` service | Distinct responsibility (Keychain + injection) from sandbox probing/invocation. Used by both server runtime and conceptually by the setup script. |
| Inline injection logic in `sandbox-auth.mjs` | Setup script is `.mjs` (plain JS, no build step). Can't import TS modules. ~30 lines of duplicated shell orchestration is acceptable for a bootstrapping tool. |
| Circuit breaker in module-level state | Single server process; no need for distributed state. `resetCircuitBreaker()` exported for test isolation. |
| `isMacOS()` extracted for testability | `process.platform` is read-only. A function wrapper lets tests mock it cleanly. |
| Background sweep uses `setInterval` | No external dependency needed. Aligns with existing `setTimeout`/`setInterval` usage in the codebase. |
| Preflight explicit in chat handler (not middleware) | Only Claude invocations need sandbox checks. Thread CRUD routes don't touch the sandbox. Keeps the control flow obvious. |

## Critical Existing Code to Reuse

| What | Where | Reuse How |
|------|-------|-----------|
| `SpawnFn` type + DI pattern | `sandbox.ts:16` | Same pattern for all credential functions |
| `createFakeSpawn` helper | `sandbox.test.ts:27` (→ extract to `helpers.ts`) | Shared across all test files |
| `classifyError` / error patterns | `sandbox.ts:34-91` | Referenced by preflight for status classification |
| `config` object pattern | `config.ts:34-46` | Extended with new fields, same structure |
| `buildServer` + `Object.assign` pattern | `index.ts:24-66` | Extended with `stopCredentialSweep` |
| `/health` endpoint | `index.ts:38-45` | Extended with credential injection status |

## Verification

After each phase, run `pnpm --filter @repo/server test` to confirm no regressions.

After all phases:
1. `pnpm --filter @repo/server test` — full test suite passes
2. `pnpm build` — no TypeScript errors
3. Manual: `pnpm sandbox` with valid Keychain → skips interactive login
4. Manual: Start server (`pnpm dev`), send a chat message → preflight passes, Claude responds
5. Manual: Expire credentials (delete `.credentials.json` in sandbox) → send message → see inject-on-failure recovery in server logs → Claude responds after recovery
6. Manual: `GET /health` → shows `sandbox.status: "healthy"` and `credentialInjection.available: true`
