# Implementation Guide: Doc System v1 — Phase 3: Doc-Aware Chat Agent

**Date:** 2026-04-04
**Feature:** Give the chat agent read access to docs via MCP tools
**Source:** [Feature Description](2026-04-04_feature-description.md)

## Overview

Phase 3 adds doc awareness to the existing chat agent. The agent already runs as Claude Code in a Docker sandbox with MCP tools for timers. This phase adds three doc-related MCP tools (`get_current_doc`, `list_docs`, `read_doc`) using the same proven pattern — thin MCP wrappers that call host API endpoints.

The implementation sequence is: server-side markdown conversion first (since every tool needs it), then the active-doc tracking endpoint, then the MCP tools themselves, then the sandbox injection updates (rename + config), then the frontend hook to report the active doc, and finally a smoke test.

**Key constraint discovered during research:** BlockNote's `blocksToMarkdownLossy()` requires a DOM environment. Server-side conversion uses `linkedom` (lightweight DOM polyfill) to create a headless BlockNote editor instance. This avoids writing a custom converter that would need to track BlockNote's internal block schema.

**Scope:** Read-only doc access only. Write tools (`write_doc`, `create_doc`) are deferred to Phase 3b per the feature description.

## File Structure

```
apps/server/
  src/
    services/document.ts               # Add blocksToMarkdown() utility
    routes/docs.ts                     # Add PUT/GET /docs/active endpoints
    chat/
      timer-mcp-server.ts             # RENAME to → mcp-server.ts
      timer-mcp-helpers.ts            # RENAME to → mcp-helpers.ts
      mcp-server.ts                    # Add doc tools alongside timer tools
      mcp-helpers.ts                   # Add resolveDoc() helper
      soul.md                          # Add doc tool documentation
    __tests__/
      doc-markdown.test.ts             # NEW — markdown conversion tests
      doc-mcp-tools.test.ts            # NEW — MCP doc tool tests
      doc-active.test.ts               # NEW — active doc tracking tests

  dist/
    oneshot-mcp-server.mjs             # RENAMED output bundle

scripts/
  build-mcp-server.mjs                # Update entry/output paths
  ensure-sandbox.mjs                   # Update bundle name + MCP config

apps/web/src/
  app/(shell)/docs/
    _hooks/use-active-doc-reporter.ts  # NEW — reports active doc to server
    [docId]/page.tsx                   # Wire up active doc reporter
```

## Phase 1: Server-Side Markdown Conversion

**Purpose:** Enable converting BlockNote JSONB content to markdown on the server, which every MCP doc tool needs for its responses.

**Rationale:** This is the foundation — without markdown conversion, the MCP tools can't return useful content. Must come first because it's a dependency for all three tools.

### 1.1 Add linkedom + BlockNote to server dependencies

- [ ] Install `linkedom` as a dependency of `apps/server`
- [ ] Install `@blocknote/core` as a dependency of `apps/server` (same version as `apps/web`: `^0.47.3`)
- [ ] Verify both packages resolve correctly in the server's module graph

**Acceptance Criteria:**
- `apps/server/package.json` lists `linkedom` and `@blocknote/core` as dependencies
- `pnpm install` succeeds with no peer dependency errors

### 1.2 Build blocksToMarkdown utility

- [ ] Create a `blocksToMarkdown(blocks: unknown[]): string` function in `apps/server/src/services/document.ts`
- [ ] The function creates a minimal `linkedom` document, sets it as `globalThis.document` temporarily, instantiates a headless `BlockNoteEditor`, calls `blocksToMarkdownLossy()`, then restores the global state
- [ ] Handle edge cases: empty blocks array returns empty string, null/undefined content returns empty string
- [ ] Ensure the function is safe to call concurrently (no leaked global state between calls)
- [ ] Write tests in `apps/server/src/__tests__/doc-markdown.test.ts` covering:
  - Empty content → empty string
  - Single paragraph → plain text
  - Headings → `#` / `##` / `###` markdown
  - Bullet list items → `- ` prefixed lines
  - Numbered list items → `1. ` prefixed lines
  - Bold/italic inline styles → `**bold**` / `_italic_`
  - Mixed content (heading + paragraphs + list) → correct combined output
  - Nested children (sub-lists) → indented markdown

**Acceptance Criteria:**
- `blocksToMarkdown()` converts BlockNote JSONB to readable markdown
- All tests pass
- Function is exported and callable from the routes layer

### 1.3 Add markdown field to doc API responses

- [ ] Add a `GET /docs/:id/markdown` endpoint that returns `{ markdown: string }` for a single doc
- [ ] This endpoint is used by the MCP tools (lighter than returning full JSONB + converting)
- [ ] Also add an optional `?format=markdown` query param to `GET /docs/:id` that includes a `markdown` field in the response alongside the existing JSONB `content`
- [ ] Write a test verifying the markdown endpoint returns correct content

**Acceptance Criteria:**
- `GET /docs/:id/markdown` returns markdown conversion of the doc's content
- 404 for non-existent doc IDs
- `GET /docs/:id?format=markdown` includes both `content` (JSONB) and `markdown` (string) fields

## Phase 2: Active Doc Tracking

**Purpose:** Let the server know which doc the user is currently viewing, so `get_current_doc` can return it.

**Rationale:** This is a prerequisite for the most useful MCP tool (`get_current_doc`). Comes before the MCP tools so the endpoint is ready when the tools need it.

### 2.1 Server-side active doc state

- [ ] Add an in-memory `activeDocId: string | null` variable in `apps/server/src/routes/docs.ts` (module-level, single-user app — no database needed)
- [ ] Add `PUT /docs/active` endpoint: accepts `{ docId: string }`, stores the ID, returns `{ ok: true }`
- [ ] Add `GET /docs/active` endpoint: returns the active doc's full data (ID, title, markdown content) or `404` if no active doc is set
- [ ] When a doc is deleted, clear `activeDocId` if it matches the deleted doc
- [ ] Write tests in `apps/server/src/__tests__/doc-active.test.ts`:
  - PUT sets active doc, GET retrieves it
  - GET returns 404 when no active doc set
  - GET returns 404 when active doc has been deleted
  - PUT with non-existent doc ID returns 404

**Acceptance Criteria:**
- `PUT /docs/active` + `GET /docs/active` round-trips correctly
- Active doc state resets when the referenced doc is deleted
- Single-user, in-memory — no database tables needed

### 2.2 Frontend active doc reporting

- [ ] Create `apps/web/src/app/(shell)/docs/_hooks/use-active-doc-reporter.ts`
- [ ] The hook accepts a `docId` and fires `PUT /docs/active` whenever the `docId` changes (debounced, fire-and-forget — failures are silent)
- [ ] Wire the hook into `DocViewPage` (`apps/web/src/app/(shell)/docs/[docId]/page.tsx`) — call it with the current `docId`
- [ ] Add `reportActiveDoc(docId: string)` to `apps/web/src/app/(shell)/docs/_lib/docs-api.ts`

**Acceptance Criteria:**
- Navigating between docs sends `PUT /docs/active` with the new doc ID
- The call is fire-and-forget — network failures don't affect doc navigation
- `GET /docs/active` returns the correct doc after switching in the UI

## Phase 3: MCP Doc Tools

**Purpose:** Add `get_current_doc`, `list_docs`, and `read_doc` tools to the MCP server.

**Rationale:** This is the core deliverable. Phases 1 and 2 provide the server endpoints these tools call.

### 3.1 Rename MCP server files

- [ ] Rename `apps/server/src/chat/timer-mcp-server.ts` → `apps/server/src/chat/mcp-server.ts`
- [ ] Rename `apps/server/src/chat/timer-mcp-helpers.ts` → `apps/server/src/chat/mcp-helpers.ts`
- [ ] Update all import paths in the renamed files
- [ ] Update `scripts/build-mcp-server.mjs`: change entry point to `apps/server/src/chat/mcp-server.ts`, output to `apps/server/dist/oneshot-mcp-server.mjs`
- [ ] Update any `package.json` scripts that reference the old filenames (e.g., `build:mcp`)
- [ ] Verify `pnpm build:mcp` produces `apps/server/dist/oneshot-mcp-server.mjs`
- [ ] Update existing MCP server tests if they import from the old paths

**Acceptance Criteria:**
- All timer tools still work after the rename
- Build produces `oneshot-mcp-server.mjs` instead of `timer-mcp-server.mjs`
- No broken imports

### 3.2 Add doc resolution helper

- [ ] Add `resolveDoc(nameOrId: string)` to `apps/server/src/chat/mcp-helpers.ts`, following the same pattern as `resolveBucket()`
- [ ] Resolution order: UUID exact match → exact case-insensitive title match → substring title match
- [ ] If multiple docs match a substring, return an error listing the ambiguous matches
- [ ] If no docs match, return an error listing available doc titles
- [ ] Add `resolveDocOrError()` wrapper (same pattern as `resolveOrError()` for buckets)
- [ ] Write tests for the resolution logic

**Acceptance Criteria:**
- UUID input → direct lookup, no list fetch
- Exact title match → returns that doc's ID
- Unique substring match → returns that doc's ID
- Ambiguous substring → descriptive error with matching titles
- No match → error listing all available doc titles

### 3.3 Add get_current_doc tool

- [ ] Add `get_current_doc` tool to `mcp-server.ts`
- [ ] No parameters
- [ ] Calls `GET /docs/active` on the host API
- [ ] Returns: doc title + full content as markdown
- [ ] If no active doc is set, returns a helpful message ("No doc is currently open. Use list_docs to see available docs.")
- [ ] Write a test

**Acceptance Criteria:**
- Returns the currently viewed doc's title and markdown content
- Gracefully handles "no active doc" state

### 3.4 Add list_docs tool

- [ ] Add `list_docs` tool to `mcp-server.ts`
- [ ] No parameters
- [ ] Calls `GET /docs` on the host API
- [ ] Returns: list of docs with ID, title, updatedAt, pinned status, and a content snippet (first ~200 chars of plain text)
- [ ] Format the output for readability (one doc per section, not raw JSON)
- [ ] Write a test

**Acceptance Criteria:**
- Returns all docs with identifying info
- Content snippets are truncated, not full documents
- Output is formatted for LLM readability

### 3.5 Add read_doc tool

- [ ] Add `read_doc` tool to `mcp-server.ts`
- [ ] Parameters: `{ doc: string }` — accepts doc title (fuzzy) or UUID
- [ ] Uses `resolveDocOrError()` to find the doc, then calls `GET /docs/:id/markdown`
- [ ] Returns: doc title + full markdown content
- [ ] Write a test

**Acceptance Criteria:**
- Finds docs by exact title, substring match, or UUID
- Returns full markdown content
- Descriptive error when doc can't be resolved

## Phase 4: Sandbox & Soul Updates

**Purpose:** Wire the renamed MCP server into the Docker sandbox and teach the agent about doc tools.

**Rationale:** Comes after the tools are built and tested, since this is the integration step.

### 4.1 Update ensure-sandbox.mjs

- [ ] Update `MCP_BUNDLE_DEST` constant from `/home/agent/timer-mcp-server.mjs` to `/home/agent/oneshot-mcp-server.mjs`
- [ ] Update `injectMcpBundle()` to read from `apps/server/dist/oneshot-mcp-server.mjs`
- [ ] Update `injectMcpConfig()`: change the MCP server name from `oneshot-timers` to `oneshot` and update the args to point to the new bundle path
- [ ] Update log messages to reflect the new name
- [ ] Verify the old bundle path (`timer-mcp-server.mjs`) is no longer referenced anywhere

**Acceptance Criteria:**
- `ensure-sandbox.mjs` injects the renamed bundle
- `.mcp.json` written to workspace uses the new bundle path and server name
- No references to old `timer-mcp-server` remain in the injection pipeline

### 4.2 Update soul.md

- [ ] Add a "Docs" section to `apps/server/src/chat/soul.md` documenting the three new tools
- [ ] Include guidance on when to use each tool:
  - `get_current_doc`: "When the user mentions 'this doc', 'my doc', or seems to be referring to what they're currently writing"
  - `list_docs`: "When the user asks what docs they have, or you need to find a doc by topic"
  - `read_doc`: "When you need to read a specific doc's content — by name or ID"
- [ ] Update the opening description from "personal time management dashboard" to include doc capabilities
- [ ] Keep the existing timer tool documentation unchanged
- [ ] Add guidance: "If the user is on the docs page and asks a question that could relate to their doc content, call get_current_doc first to check before asking for clarification."

**Acceptance Criteria:**
- Soul file documents all three doc tools with clear usage guidance
- Timer tool documentation is unchanged
- Agent has enough context to use doc tools proactively

## Phase 5: Smoke Test

**Purpose:** Verify the full pipeline works end-to-end: frontend → server → MCP → sandbox → agent.

**Rationale:** MCP tools involve multiple moving parts (build, injection, sandbox networking, API calls). Unit tests verify individual pieces; the smoke test proves they work together.

### 5.1 Build and inject

- [ ] Run `pnpm build:mcp` — verify `apps/server/dist/oneshot-mcp-server.mjs` is produced
- [ ] Restart the server (`pnpm service:uninstall && pnpm stop && pnpm service:install`)
- [ ] Verify sandbox gets the new bundle: check logs for "MCP ... server bundle injected"
- [ ] Verify `.mcp.json` in `workspace/` references the new bundle path

### 5.2 Test active doc reporting

- [ ] Open a doc in the browser
- [ ] `curl http://localhost:4902/docs/active` — should return the doc you're viewing
- [ ] Switch to a different doc
- [ ] `curl` again — should return the new doc
- [ ] Verify the response includes markdown content

### 5.3 Test agent doc awareness

- [ ] Open a doc with some content, then open the chat panel
- [ ] Ask: "What doc am I looking at?" — agent should name the current doc
- [ ] Ask: "Summarize this doc" — agent should read and summarize the content
- [ ] Ask: "What other docs do I have?" — agent should list them
- [ ] Ask: "Read my doc called [partial title]" — agent should find it by fuzzy match and return content

**Acceptance Criteria:**
- All four agent interactions produce correct, doc-aware responses
- No errors in server logs related to MCP tool calls
- Agent uses doc tools proactively when context suggests it

## Dependency Graph

```
Phase 1 (Markdown Conversion)
  1.1 → 1.2 → 1.3
                |
Phase 2 (Active Doc Tracking)
  2.1 ──────→ 2.2
    \           |
     \          |
Phase 3 (MCP Tools)
  3.1 → 3.2 ──→ 3.3 (needs 2.1)
           \──→ 3.4 (needs 1.3)
            \─→ 3.5 (needs 1.3)
                |
Phase 4 (Sandbox + Soul)
  4.1 (needs 3.1)
  4.2 (needs 3.3-3.5)
    \   /
Phase 5 (Smoke Test)
  5.1 → 5.2 → 5.3
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `linkedom` for server-side BlockNote | `blocksToMarkdownLossy()` requires DOM. `linkedom` is ~50KB, much lighter than `jsdom` (~2MB). Avoids writing a custom converter that would need to track BlockNote's internal schema changes. |
| In-memory active doc (not DB) | Single-user app — no persistence needed. A module-level variable is the simplest correct solution. Resets on server restart, which is fine. |
| Rename MCP server now | The feature description calls for consolidation. Doing it as part of Phase 3 is natural since we're adding a second tool domain. Avoids a separate cleanup task later. |
| Fuzzy doc resolution (same as buckets) | The existing `resolveBucket()` pattern works well. UUID → exact title → substring is intuitive for an LLM agent. |
| Markdown via dedicated endpoint | A `GET /docs/:id/markdown` endpoint avoids converting JSONB to markdown on every `GET /docs/:id` call (which the editor doesn't need). The MCP tools call the markdown endpoint specifically. |
| Content snippets in `list_docs` | Full doc content in a list response would overwhelm the agent's context. Snippets give enough for the agent to identify docs; it can call `read_doc` for full content. |
| Fire-and-forget active doc reporting | The frontend sends `PUT /docs/active` on doc switch but doesn't await or retry. Active doc is a convenience signal, not critical state — a missed report just means `get_current_doc` returns stale data until the next switch. |
