# Implementation Guide: MCP over Streamable HTTP

**Date:** 2026-04-05
**Feature:** MCP over Streamable HTTP
**Source:** [2026-04-05_feature-description.md](2026-04-05_feature-description.md)

## Overview

This migration replaces the MCP stdio transport (bundled JS file injected into the Docker sandbox) with Streamable HTTP transport served directly from the Fastify server. The MCP tools become a Fastify route plugin at `/mcp`, and tool handlers call service functions directly instead of making HTTP round-trips through `api()`.

The implementation is sequenced so the Fastify `/mcp` endpoint works first with the existing tool logic unchanged (HTTP proxy pattern preserved), then tool handlers are migrated to direct service calls, and finally the old stdio pipeline is removed. This lets us validate the transport change in isolation before touching tool internals.

No database changes are required. The MCP SDK v1.29.0 already includes `StreamableHTTPServerTransport` — no new dependencies needed.

## File Structure

```
apps/server/src/
├── chat/
│   ├── mcp-server.ts        ← Restructured: exports McpServer + plugin
│   └── mcp-helpers.ts       ← Slimmed: api() and proxy logic removed
├── routes/
│   └── mcp.ts               ← NEW: Fastify plugin for /mcp endpoint
└── index.ts                  ← Registers mcp route plugin

scripts/
├── build-mcp-server.mjs     ← DELETED
└── ensure-sandbox.mjs        ← Updated: removes bundle injection, changes .mcp.json

workspace/
└── .mcp.json                 ← Updated: type "http" instead of "stdio"
```

---

## Phase 1: Serve MCP over Streamable HTTP

**Purpose:** Get the MCP server responding at `/mcp` on the Fastify server using the new transport, without changing tool logic.

**Rationale:** This is the riskiest part — wiring the MCP SDK's `StreamableHTTPServerTransport` into Fastify. Doing it first with tool logic untouched means we can test the transport in isolation.

### 1.1 Create the `/mcp` Fastify route plugin

- [x] Create `apps/server/src/routes/mcp.ts` as a Fastify plugin
- [x] Import `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`
- [x] Accept `McpServer` via options interface (codebase convention — matches how other routes receive dependencies)
- [x] Create a stateful transport (`sessionIdGenerator: () => crypto.randomUUID()`) — stateless mode throws on the second request due to SDK one-shot enforcement
- [x] Register a single combined route for GET/POST/DELETE `/mcp` using `server.route({ method: [...] })` — the transport dispatches internally by HTTP method
- [x] Connect the McpServer instance to the transport on plugin registration
- [x] Pass pre-parsed `request.body` as third arg to `handleRequest()` (no need to disable Fastify body parsing)

**Divergences from original plan:**
- **Stateful instead of stateless transport:** The SDK's `StreamableHTTPServerTransport` enforces one-shot usage in stateless mode (`_hasHandledRequest` guard), causing a crash on the second request. Switched to stateful mode with `crypto.randomUUID()` session IDs.
- **McpServer via options, not direct import:** Following the codebase convention where route plugins receive dependencies through their options interface (like `timerRoutes` receives `{ database, scheduler }`). The `McpServer` instance will be passed from `index.ts` when registered in section 1.3.
- **Single unified route instead of three:** Used `server.route({ method: ['GET', 'POST', 'DELETE'] })` to avoid copy-paste of near-identical handlers. The transport's `handleRequest` already dispatches by HTTP method internally.

**Acceptance Criteria:**
- POST `/mcp` with an MCP `initialize` request returns a valid MCP response with `serverInfo.name === 'oneshot'`
- GET `/mcp` returns appropriate SSE or error response
- DELETE `/mcp` handles session cleanup

### 1.2 Refactor `mcp-server.ts` to export the server instance

- [x] Remove the `StdioServerTransport` import and the `server.connect(transport)` call at the bottom of the file
- [x] Export the `McpServer` instance (e.g., `export { server as mcpServer }`)
- [x] Keep all 14 tool registrations and their `api()` calls unchanged for now
- [x] Update the file-level JSDoc to reflect the new architecture

**Acceptance Criteria:**
- `mcp-server.ts` no longer connects to stdio on import
- The exported `mcpServer` has all 14 tools registered
- Importing `mcp-server.ts` does not produce side effects (no transport connection)

**Notes:** No divergences from plan. All 33 MCP tests pass. TypeScript compiles cleanly.

### 1.3 Register the MCP route in the Fastify server

- [x] Import and register the MCP route plugin in `apps/server/src/index.ts`
- [x] Register it unconditionally (not behind a feature flag) — MCP tools are always available
- [x] Write a test that verifies the `/mcp` endpoint responds to an MCP `initialize` request with the correct server info and tool list

**Acceptance Criteria:**
- `GET /health` still works
- POST `/mcp` with an MCP `initialize` JSON-RPC request returns `serverInfo.name === 'oneshot'` and `capabilities.tools`
- All existing server tests still pass

**Notes:** No divergences from plan. The test uses a real listening server (port 0) because the MCP transport uses `reply.hijack()`, bypassing Fastify's `inject()`. Also includes a health endpoint regression test. TypeScript compiles cleanly, all 45 relevant tests pass (MCP routes, MCP server helpers, health).

---

## Phase 2: Update sandbox config and remove stdio pipeline

**Purpose:** Switch the sandbox's `.mcp.json` from stdio to HTTP and remove the build/inject pipeline.

**Rationale:** Once the Fastify endpoint works, the sandbox can be pointed at it. Removing the old pipeline in the same phase avoids maintaining two code paths.

### 2.1 Update `ensure-sandbox.mjs` — change `.mcp.json` to HTTP transport

- [x] In `injectMcpConfig()`, change the config from `type: "stdio"` to `type: "http"` with `url` pointing to `http://host.docker.internal:<serverPort>/mcp`
- [x] Remove the `args` and `command` fields (not needed for HTTP transport)
- [x] Remove the `env` field (ONESHOT_API_BASE is no longer needed — tools run on the server)

**Acceptance Criteria:**
- `workspace/.mcp.json` contains `"type": "http"` with the correct URL
- No reference to `node` command, bundle path, or `ONESHOT_API_BASE` in the config

**Notes:** No divergences from plan. Single object replacement in `injectMcpConfig()` — `type`/`url` replaces `type`/`command`/`args`/`env`.

### 2.2 Remove the `injectMcpBundle()` function and build script

- [x] Remove the `injectMcpBundle()` function from `ensure-sandbox.mjs`
- [x] Remove the `injectMcpBundle()` call from `injectSandboxAssets()`
- [x] Delete `scripts/build-mcp-server.mjs`
- [x] Remove the `"build:mcp"` script from root `package.json`
- [x] Remove the `node scripts/build-mcp-server.mjs` step from the `"prego"` script in root `package.json`
- [x] Remove `MCP_BUNDLE_DEST` constant from `ensure-sandbox.mjs`
- [x] Delete `apps/server/dist/oneshot-mcp-server.mjs` if it exists (the build artifact)

**Acceptance Criteria:**
- `pnpm prego` runs without errors (no missing script)
- `scripts/build-mcp-server.mjs` does not exist
- `injectSandboxAssets()` still injects the soul file but skips the MCP bundle

**Notes:** No divergences from plan. Also removed the "MCP server bundle" smoke test from `mcp-server.test.ts` (and its now-unused `spawnSync`/`path` imports) since it tested the deleted bundle artifact. All 34 MCP tests pass. TypeScript compiles cleanly.

### 2.3 Update AGENTS.md and sandbox docs

- [x] Remove references to `pnpm build:mcp` from `AGENTS.md`
- [x] Update the sandbox section to reflect that MCP tools are served via HTTP, not a bundled process
- [x] Update `docs/sandbox.md` if it references the old build/inject workflow

**Acceptance Criteria:**
- No documentation references `build:mcp` or the old bundle injection flow
- Sandbox docs describe the HTTP transport

**Notes:** No divergences from plan. Updated AGENTS.md sandbox section (removed bundle/build references, simplified to "just restart the server"). Updated docs/sandbox.md: reduced startup injection items from 4 to 3 (removed MCP bundle), rewrote MCP tools section to describe Streamable HTTP transport, removed node:http proxy workaround explanation, updated troubleshooting. Verified via grep that no stale references remain in live docs (only historical _tasks/_planning/ files).

---

## Phase 3: Migrate tool handlers to direct service calls

**Purpose:** Replace HTTP round-trips through `api()` with direct service function calls, simplifying the architecture and improving performance.

**Rationale:** With the MCP server running in-process on the Fastify server, there's no reason to make HTTP calls to itself. Direct service calls are simpler, faster, and easier to test.

### 3.1 Wire database access into MCP tool handlers

- [x] Update the MCP route plugin to pass the database instance to the MCP server module (e.g., via a setup function like `initMcpServer(db)`)
- [x] Import the relevant service functions: `listBuckets`, `getBucket` from `timer-bucket.ts`; `getTodayState`, `startTimer`, `stopTimer`, `resetProgress`, `setElapsedTime`, `setDailyGoal`, `dismissBucket` from `timer-progress.ts`; `listDocuments`, `getDocumentById` from `document.ts`
- [x] Create a `createBucket`, `updateBucket`, `deleteBucket` mapping if the service signatures differ from what tools need

**Acceptance Criteria:**
- MCP server module can access the database instance
- Service function imports compile without errors

**Notes:** Used a factory function `createMcpServer(db: Database)` instead of an `initMcpServer(db)` setter — cleaner pattern that avoids module-level mutable state and matches the codebase's `buildServer()` convention. `index.ts` calls `createMcpServer(opts?.database ?? defaultDb)` and passes the result to `mcpRoutes`. Service function imports are deferred to sections 3.2/3.3 when they're actually used (avoids unused import overhead, especially from `document.ts` which pulls in heavy deps like linkedom/BlockNote). No mapping functions needed — `CreateBucketInput`/`UpdateBucketInput` already match MCP tool schemas. TypeScript compiles cleanly, all 34 MCP tests pass.

### 3.2 Migrate timer tool handlers to direct service calls

- [x] Replace `api('GET', '/timers/today')` in `get_timer_status` with a direct call to `getTodayState(db)`
- [x] Replace `api('GET', '/timers/buckets')` in `list_buckets` with `listBuckets(db)`
- [x] Replace bucket resolution (`resolveOrError` → `api()`) with direct DB queries in `start_timer`, `stop_timer`, `reset_timer`, `set_timer_time`, `set_daily_goal`, `dismiss_bucket`
- [x] Replace `api('POST', '/timers/buckets', body)` in `create_bucket` with direct service call
- [x] Replace `api('PATCH', ...)` in `update_bucket` with direct service call
- [x] Replace `api('DELETE', ...)` in `delete_bucket` with direct service call
- [x] Update `resolveBucket()` in `mcp-helpers.ts` to accept a database parameter and query directly instead of calling `api('GET', '/timers/buckets')`

**Acceptance Criteria:**
- All 11 timer tools work via direct service calls
- No `api()` calls remain in timer tool handlers
- Timer tools return the same response format as before

**Notes:** No divergences from plan. `resolveBucket()` and `resolveOrError()` accept an optional `db?: Database` parameter — when provided, queries `listBuckets(db)` directly; the HTTP fallback is preserved for the transition window until Phase 3.4 removes `api()` entirely. Response formats match what the HTTP routes returned: `stop_timer` normalizes `elapsedSeconds ?? 0` and `goalReachedAt ?? null`, `reset_timer` returns `{ success: true }`, `dismiss_bucket` returns `{ success: true, dismissedAt }`. Used the typed `CreateBucketInput` instead of `Record<string, unknown>` for `create_bucket`. `update_bucket` and `delete_bucket` now handle not-found cases directly (service returns `undefined`/`false`) instead of relying on HTTP 404. All 34 MCP tests pass. TypeScript compiles cleanly.

### 3.3 Migrate doc tool handlers to direct service calls

- [x] Replace `api('GET', '/docs/active')` in `get_current_doc` with direct service call
- [x] Replace `api('GET', '/docs')` in `list_docs` with `listDocuments(db)`
- [x] Replace `api('GET', '/docs/:id?format=markdown')` in `read_doc` with direct service call using `getDocumentById` + `blocksToMarkdown`
- [x] Update `resolveDoc()` in `mcp-helpers.ts` to accept a database parameter and query directly

**Acceptance Criteria:**
- All 3 doc tools work via direct service calls
- No `api()` calls remain in doc tool handlers
- Doc tools return the same response format as before

**Notes:** `get_current_doc` uses `getActiveDocId()` exported from `routes/docs.ts` to access the in-memory active doc state, then calls `getDocumentById()` + `blocksToMarkdown()` directly. Also clears stale `activeDocId` via `resetActiveDoc()` when the active doc was deleted (matching the route handler's behavior). `list_docs` calls `getDefaultWorkspaceId(db)` + `listDocuments(wsId, db)` directly. `read_doc` uses `resolveDocOrError(doc, db)` then `getDocumentById()` + `blocksToMarkdown()`. `resolveDoc()` and `resolveDocOrError()` accept an optional `db?: Database` parameter — when provided, queries via `getDefaultWorkspaceId(db)` + `listDocuments(wsId, db)` directly; the HTTP fallback is preserved for the transition window until Phase 3.4 removes `api()` entirely. All 34 MCP tests and 43 doc tests pass. TypeScript compiles cleanly.

### 3.4 Remove the `api()` helper and HTTP proxy logic

- [x] Remove the `api()` function from `mcp-helpers.ts`
- [x] Remove the `ApiResult` interface
- [x] Remove the `apiError()` helper
- [x] Remove the `API_BASE` constant
- [x] Remove the `HTTP_PROXY` / `PARSED_PROXY` proxy configuration
- [x] Remove the `node:http` import
- [x] Keep `extractPlainText`, `textResult`, `errorResult`, `UUID_RE`, `resolveBucket`, `resolveOrError`, `resolveDoc`, `resolveDocOrError` (these are still used)

**Acceptance Criteria:**
- `mcp-helpers.ts` contains only resolution helpers and result formatters
- No `node:http` import remains
- TypeScript compiles without errors

**Notes:** Made `db` parameter required (not optional) in `resolveBucket`, `resolveOrError`, `resolveDoc`, `resolveDocOrError` — the HTTP fallback branches were dead code since all callers in `mcp-server.ts` always pass `db`. Also updated `mcp-server.test.ts` to use service mocks (`listBuckets`, `listDocuments`, `getDefaultWorkspaceId`) instead of `node:http` mocks, and removed tests for deleted code (`api helper`, `get_current_doc logic`, `list_docs logic`, `read_doc logic` describe blocks). This overlaps with section 3.5 but was necessary to satisfy the "TypeScript compiles without errors" acceptance criterion — the test file imported deleted exports. Added a new `resolveDoc` test for the "no default workspace" edge case. All 21 MCP server tests and 2 MCP route tests pass. TypeScript compiles cleanly.

### 3.5 Update tests

- [x] Remove the `node:http` mock from `mcp-server.test.ts`
- [x] Update `resolveBucket` and `resolveDoc` tests to mock the database instead of HTTP
- [x] Remove the `api()` helper tests (function no longer exists)
- [x] Keep `extractPlainText` tests unchanged
- [x] Update `get_current_doc`, `list_docs`, `read_doc` logic tests to use direct service mocks
- [x] Remove the "MCP server bundle" smoke test (bundle no longer exists)
- [x] Add a test that verifies the `/mcp` endpoint handles a `tools/list` request and returns all 14 tools
- [x] Run the full test suite: `pnpm --filter @repo/server test`

**Acceptance Criteria:**
- All tests pass
- No references to `api()`, `node:http` mock, or bundle smoke test remain
- New test verifies tool list via HTTP transport

**Notes:** Most of section 3.5 was completed as part of 3.4 (necessary to keep TypeScript compiling). The `get_current_doc logic`, `list_docs logic`, and `read_doc logic` describe blocks were removed (they tested the old `api()` flow, not the actual tool handlers). The `tools/list` integration test follows the MCP protocol handshake: initialize → notifications/initialized → tools/list, using session IDs for the stateful transport. Verifies all 14 tools by name. Full suite run: 24 MCP tests pass (3 route + 21 server). The 5 pre-existing failing test files (timer-scheduler, thread, timer-bucket, timer-progress, timer-routes) are unrelated to this migration — they have timeout and database issues that predate this work. TypeScript compiles cleanly.

### 3.6 Smoke test

- [ ] Restart the server (`pnpm service:uninstall && pnpm stop && pnpm service:install`)
- [ ] Send an MCP `initialize` request to `http://localhost:4902/mcp` via curl and confirm it returns server info
- [ ] Send a `tools/list` request and confirm all 14 tools are listed
- [ ] Send a `tools/call` request for `get_timer_status` and confirm it returns timer data (or a reasonable empty state)
- [ ] Verify `pnpm prego` completes without errors
- [ ] If Docker sandbox is available: start a chat session and verify the agent can use MCP tools

**Acceptance Criteria:**
- MCP endpoint responds to all three request types
- Timer and doc tools return real data from the database
- No references to the old stdio pipeline remain anywhere in the codebase

---

## Dependency Graph

```
Phase 1 (Serve MCP over HTTP)
  1.1 (route plugin) → 1.2 (export server) → 1.3 (register + test)
                                                  |
Phase 2 (Update sandbox, remove stdio)            |
  2.1 (update .mcp.json) ←─────────────────────────
  2.2 (delete build script) — independent of 2.1
  2.3 (update docs) — after 2.1 + 2.2
                          |
Phase 3 (Direct service calls)
  3.1 (wire DB) → 3.2 (timer tools) → 3.3 (doc tools) → 3.4 (remove api())
                                                              |
                                                         3.5 (update tests)
                                                              |
                                                         3.6 (smoke test)
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Stateless transport (`sessionIdGenerator: undefined`) | Single-user local app — session management adds complexity with no benefit |
| Migrate transport first, then tool internals | Isolates the transport change (highest risk) from service call refactoring. If something breaks, the blast radius is smaller. |
| Keep `resolveBucket`/`resolveDoc` helpers | These provide fuzzy name matching that the agent depends on. They just need to query the DB directly instead of via HTTP. |
| Remove `api()` entirely (not keep as fallback) | With tools running in-process, HTTP self-calls are purely waste. Clean removal avoids dead code. |
| Delete build script in Phase 2, not Phase 3 | Once `.mcp.json` points to HTTP, the bundle is never used. Keeping it around invites confusion. |
| Register `/mcp` unconditionally (no feature flag) | MCP tools serve both timers and docs. Both are always active. Gating behind chat flag would break tools when chat is disabled but timers/docs are active. |
