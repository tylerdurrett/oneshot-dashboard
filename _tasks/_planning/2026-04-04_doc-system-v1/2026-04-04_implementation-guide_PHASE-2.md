# Implementation Guide: Doc System v1 — Phase 2: Auto-Title

**Date:** 2026-04-04
**Feature:** Auto-Title Generation via Gemini Flash 2.5
**Source:** [Feature Description](2026-04-04_feature-description.md)

## Overview

Phase 2 adds automatic title generation to the multi-doc system built in Phase 1. When a user creates a new doc and starts writing, the system generates a descriptive title via Gemini Flash 2.5 (through the Vercel AI SDK). Titles auto-update if content changes significantly, and manual title edits disable auto-titling for that doc.

Implementation sequence: schema first (add tracking columns + backfill existing docs), then server (AI SDK setup + title generation endpoint), then frontend (debounce hook + component wiring). The server-side title generation is built and tested before any frontend work begins — the API is stable and testable via `server.inject()` before wiring up the UI.

The existing doc editing flow continues working throughout — auto-title is purely additive.

## File Structure

```
packages/db/
  src/schema.ts                          # Add isTitleManual, titleGeneratedFromBlockIds to documents
  drizzle/NNNN_*.sql                     # Generated migration

apps/server/
  .env                                   # NEW — document GOOGLE_GEMINI_API_KEY
  src/
    config.ts                            # Add googleGeminiApiKey
    services/document.ts                 # Add extractTextFromBlocks, generateDocumentTitle
    services/workspace.ts                # Add backfillManualTitles for existing docs
    routes/docs.ts                       # Add POST /docs/:id/generate-title, update PATCH
    __tests__/auto-title.test.ts         # NEW — title generation tests

apps/web/src/app/(shell)/docs/
  _lib/docs-api.ts                       # Add generateTitle(), update DocumentResponse + saveDocument
  _hooks/
    use-doc-query.ts                     # Add useGenerateTitle()
    use-auto-title.ts                    # NEW — debounce + threshold + trigger logic
  _components/
    editor.tsx                           # Add onContentChange callback
    doc-title.tsx                        # isTitleManual: true on unmount flush
  [docId]/page.tsx                       # Wire useAutoTitle hook, update handleSaveTitle
```

## Phase 1: Schema & Migration

**Purpose:** Add `isTitleManual` and `titleGeneratedFromBlockIds` columns to the `documents` table, and backfill existing docs.

**Rationale:** Schema changes go first so server and frontend can build on a stable data model. A startup backfill handles the edge case of docs manually titled before the column existed.

### 1.1 Add auto-title columns to documents

- [x] Add `isTitleManual` column to `documents` in `packages/db/src/schema.ts`: `boolean('is_title_manual').notNull().default(false)`. Place after `processedAt`, before `createdAt`.
- [x] Add `titleGeneratedFromBlockIds` column: `text('title_generated_from_block_ids').array()`. Nullable — null means no auto-title has been generated yet.
- [x] Run `pnpm --filter @repo/db db:generate` to generate the migration SQL.
- [x] Review the generated SQL. Verify the `when` timestamp in `drizzle/meta/_journal.json` is after all previous entries.
- [x] Run `pnpm --filter @repo/db db:migrate` to apply.
- [x] Verify via docker psql: queried `documents` table and confirmed new columns exist with correct defaults. *(Used docker exec instead of tsx script — same verification.)*

**Acceptance Criteria:**
- `documents` table has `is_title_manual` (boolean, default false) and `title_generated_from_block_ids` (text[], nullable) columns.
- Existing document rows have `is_title_manual = false` and `title_generated_from_block_ids = null`.
- Migration journal timestamps are in order.

### 1.2 Backfill existing manually-titled docs

- [x] Add `backfillManualTitles(database)` in `apps/server/src/services/workspace.ts` — sets `isTitleManual = true` for docs where `isTitleManual = false` AND title doesn't match the default `Notes YYYY-MM-DD` pattern. Uses a Postgres regex: `title !~ '^Notes \d{4}-\d{2}-\d{2}$'`. Also excludes empty-title docs (never manually titled). Returns the count of updated rows.
- [x] Call `backfillManualTitles()` in server startup (`apps/server/src/index.ts`), after `ensureDefaultWorkspace()`. Idempotent — safe to run on every startup. Log when rows are updated.
- [x] Add tests in `apps/server/src/__tests__/workspace.test.ts`: docs with custom titles get `isTitleManual = true`, docs with "Notes YYYY-MM-DD" titles stay `false`, untitled (empty) docs stay `false`, second run changes nothing.

**Acceptance Criteria:**
- Existing docs with manually-set titles (non-default pattern) have `isTitleManual = true`.
- Docs with default "Notes [date]" titles retain `isTitleManual = false`.
- Function is idempotent.

## Phase 2: Server — Title Generation

**Purpose:** Install the Vercel AI SDK, configure the API key, and build the title generation service and endpoint.

**Rationale:** Server work comes before frontend because it establishes the API contract. The AI call is abstracted behind the Vercel AI SDK so the model can be swapped later without changing application code.

### 2.1 Install Vercel AI SDK and configure API key

- [x] Install `ai` and `@ai-sdk/google` in the server package: `pnpm --filter @repo/server add ai @ai-sdk/google`.
- [x] Add `googleGeminiApiKey` to `apps/server/src/config.ts`: `googleGeminiApiKey: process.env.GOOGLE_GEMINI_API_KEY ?? ''`. Place it in a new `// -- AI --` section after the credential sweep config.
- [x] Fix dotenv loading in `apps/server/src/index.ts`: the current `import 'dotenv/config'` only reads from `apps/server/` (Turbo sets cwd to the package directory), but secrets live in the root `.env.local`. Replace the bare import with explicit `dotenv.config()` calls that load from the project root:
  ```typescript
  import dotenv from 'dotenv';
  import { resolve, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const __dotenvDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  dotenv.config({ path: resolve(__dotenvDir, '.env.local') });
  dotenv.config({ path: resolve(__dotenvDir, '.env') });
  ```
  `.env.local` loads first (secrets/overrides), then `.env` (safe defaults). `dotenv` won't overwrite values already set, so `.env.local` takes precedence.
- [x] `GOOGLE_GEMINI_API_KEY` is already set in the root `.env.local`. Verify the server reads it after the dotenv fix: `config.googleGeminiApiKey` should be non-empty at startup. *(Confirmed via dotenv debug output: `.env.local` loads 2 vars from project root.)*
- [x] Verify: server starts without errors when the key is absent (for other developers who haven't set it). *(All 58 docs/health tests pass with empty default.)*

**Acceptance Criteria:**
- `ai` and `@ai-sdk/google` are in server's `package.json` dependencies.
- Server loads env vars from the project root `.env.local` and `.env`, not from `apps/server/`.
- `config.googleGeminiApiKey` reads from the environment.
- Server starts cleanly when the key is absent.

### 2.2 Title generation service

- [x] Add `extractTextFromBlocks(blocks: unknown[]): string` in `apps/server/src/services/document.ts` — recursively extracts plain text from BlockNote JSONB content. Each block has `content` (array of inline content with `type: 'text'` and `text` field) and `children` (nested blocks). Joins blocks with newlines. *(Inline spans within a single block are concatenated, not newline-separated — fixes correct text extraction for styled runs.)*
- [x] Add `countWords(text: string): number` — trims, splits on whitespace, returns length. Export for testing.
- [x] Add `extractBlockIds(blocks: unknown[]): string[]` — maps top-level blocks to their `id` field. Export for testing.
- [x] Add `generateDocumentTitle(id, database)` service function:
  1. Fetch the document by ID. Return `undefined` if not found.
  2. Guard: return the doc unchanged if `isTitleManual` is `true`.
  3. Guard: return the doc unchanged if `config.googleGeminiApiKey` is empty (log a warning on first occurrence).
  4. Guard: return the doc unchanged if `doc.content` is not an array.
  5. Extract text from `content` using `extractTextFromBlocks`.
  6. Extract block IDs using `extractBlockIds`.
  7. Guard: return the doc unchanged if content is below threshold (fewer than 50 words AND fewer than 3 top-level blocks).
  8. Truncate text to 2000 chars before sending to AI (prevents unbounded token usage).
  9. Call `generateText()` from `ai` with `google('gemini-2.5-flash')` model and a prompt instructing concise, descriptive title generation (see prompt below). Wrapped in try/catch — AI errors return doc unchanged.
  10. Update the document: set `title` to the generated text (trimmed), `isTitleManual = false`, `titleGeneratedFromBlockIds = blockIds`, bump `updatedAt`.
  11. Return the updated document.
- [x] Title generation prompt — keep it minimal and direct:
  ```
  Generate a short, descriptive title for this document (max 60 characters).
  Rules: no quotes, no generic titles like "Untitled" or "My Document",
  no explanation — just the title on a single line.

  Document content:
  {text}
  ```
- [x] Added `resetApiKeyWarning()` export for test isolation of the module-level warning flag.
- [x] Write tests in `apps/server/src/__tests__/auto-title.test.ts` (23 tests):
  - `extractTextFromBlocks` extracts text from paragraph and heading blocks.
  - `extractTextFromBlocks` handles nested children.
  - `extractTextFromBlocks` returns empty string for empty/malformed content.
  - `extractTextFromBlocks` concatenates inline spans within a block.
  - `countWords` returns correct counts (including edge cases: empty, whitespace-only).
  - `extractBlockIds` returns top-level block IDs.
  - `generateDocumentTitle` skips docs where `isTitleManual = true`.
  - `generateDocumentTitle` skips docs below content threshold.
  - `generateDocumentTitle` skips when API key is empty.
  - `generateDocumentTitle` updates title and stores block IDs on success (mock `generateText` from `ai`).
  - `generateDocumentTitle` returns doc unchanged when `generateText` throws (error handling).

**Acceptance Criteria:**
- `extractTextFromBlocks` correctly extracts text from BlockNote JSONB.
- `generateDocumentTitle` respects `isTitleManual`, content threshold, and API key guards.
- Successful generation updates `title`, sets `isTitleManual = false`, and stores `titleGeneratedFromBlockIds`.
- Missing API key returns doc unchanged (no crash).
- All tests pass with mocked AI SDK.

### 2.3 Generate-title endpoint and PATCH update

- [x] Add `POST /docs/:id/generate-title` route in `apps/server/src/routes/docs.ts`. Register it before `/docs/:id` (static before parameterized). Calls `generateDocumentTitle(id, db)`. Returns `{ document }` on success, 404 if doc not found. Catches AI SDK errors and returns 502 with `{ error: 'Title generation failed' }`.
- [x] Update `updateDocumentTitle` in `apps/server/src/services/document.ts`: add `isTitleManual: true` to the `.set()` call. *(JSDoc tightened per code review — documents the contract rather than asserting caller assumptions.)*
- [x] Add the `generateDocumentTitle` import to the route file.
- [x] Write route tests in `apps/server/src/__tests__/auto-title.test.ts` (4 tests):
  - `POST /docs/:id/generate-title` returns 200 with updated doc (mocked AI).
  - `POST /docs/:id/generate-title` returns 404 for non-existent doc.
  - `PATCH /docs/:id` with `{ title }` sets `isTitleManual = true` on the doc.
  - `POST /docs/:id/generate-title` returns doc unchanged when `isTitleManual = true`.
- [x] *(Code review)* Hoisted `buildContentBlocks` to file scope to deduplicate across test describe blocks.

**Acceptance Criteria:**
- `POST /docs/:id/generate-title` generates a title and returns the updated doc.
- `PATCH /docs/:id` with a title sets `isTitleManual = true`.
- 404 handling works correctly.
- AI errors return 502, not crash.
- All route tests pass.

## Phase 3: Frontend — Auto-Title Integration

**Purpose:** Wire up the frontend to trigger auto-title generation on debounced typing pauses, display generated titles, and handle manual overrides.

**Rationale:** Frontend work comes last because it depends on the server endpoint being stable and tested. The auto-title hook is a standalone unit that can be tested independently from the UI components.

### 3.1 API client and query hooks

- [x] Update `DocumentResponse` in `apps/web/src/app/(shell)/docs/_lib/docs-api.ts`: add `isTitleManual: boolean` and `titleGeneratedFromBlockIds: string[] | null`.
- [x] Add `generateTitle(id: string): Promise<DocumentResponse>` — `POST` to `/docs/${id}/generate-title` with empty body (`{}`). Follow the existing fetch + error-throw + unwrap pattern. *(Dropped the empty body and Content-Type header to match `pinDocument` pattern — no payload needed.)*
- [x] Update `saveDocument` fields type: `{ content?: unknown[]; title?: string; isTitleManual?: boolean }`.
- [x] Add `useGenerateTitle(id: string)` mutation hook in `apps/web/src/app/(shell)/docs/_hooks/use-doc-query.ts`. `mutationFn` calls `generateTitle(id)`. `onSuccess` updates detail cache (`setQueryData`) and invalidates list — same pattern as `usePinDocument`.
- [x] Update `useSaveDocument` mutation's `mutationFn` type to accept `isTitleManual?: boolean` in the fields object.

**Acceptance Criteria:**
- `DocumentResponse` includes `isTitleManual` and `titleGeneratedFromBlockIds`.
- `generateTitle` API function calls the correct endpoint.
- `saveDocument` accepts `isTitleManual` in the fields.
- `useGenerateTitle` hook follows the existing mutation pattern.
- Type-check clean.

### 3.2 Auto-title hook

- [ ] Create `apps/web/src/app/(shell)/docs/_hooks/use-auto-title.ts` with a `useAutoTitle(options)` hook:
  - **Options:** `{ docId: string; doc: DocumentResponse | undefined; enabled: boolean }`
  - **Returns:** `{ notifyContentChange: (blocks: Block[]) => void }`
  - **Internal state:** Uses `useGenerateTitle(docId)` mutation. Timer ref for debounce. Ref for latest blocks (to read in timer callback without stale closure).
  - **`notifyContentChange` implementation:**
    1. Store blocks in ref.
    2. Clear existing timer.
    3. If not enabled or doc is undefined, return early.
    4. Set a new 12-second timer. When it fires:
       - Re-check guards using latest `doc` (via ref): `isTitleManual` must be false.
       - Count words from blocks (use `extractTextFromBlocks` utility). Count top-level blocks.
       - If below threshold (< 50 words AND < 3 blocks), skip.
       - If `doc.titleGeneratedFromBlockIds` is not null (re-title case): compare current block IDs to stored. Calculate overlap ratio = (count of current IDs present in stored) / stored length. Calculate size ratio = current length / stored length. If overlap >= 0.5 AND size ratio < 2, skip (not enough change).
       - All checks pass → call `generateMutation.mutate()`.
  - **Cleanup:** `useEffect` cleanup clears timer on unmount and docId change.
- [ ] Add `extractTextFromBlocks(blocks: Block[]): string` utility function in the hook file — extracts text from typed BlockNote `Block` objects. Each block has `content` (array of `InlineContent` with `type === 'text'` having a `text` field) and `children` (nested `Block[]`). Joins with spaces.
- [ ] Write tests in `apps/web/src/app/(shell)/docs/_hooks/__tests__/use-auto-title.test.ts`:
  - Timer resets on each `notifyContentChange` call (use `vi.useFakeTimers`).
  - Does not fire when `isTitleManual` is true.
  - Does not fire when content is below threshold.
  - Fires after 12s debounce when conditions are met.
  - Re-title fires when >50% of original blocks are gone.
  - Re-title fires when block count doubled.
  - Re-title skips when block IDs are mostly unchanged.
  - Cleans up timer on unmount.
  - Does not fire when `enabled` is false.

**Acceptance Criteria:**
- Hook debounces at 12 seconds from last content change.
- Respects `isTitleManual` flag — never fires for manually-titled docs.
- Content threshold check works (50 words OR 3+ blocks to qualify).
- Re-title logic triggers on significant block changes (>50% blocks changed or 2x+ blocks).
- Timer cleanup on unmount and doc switch.
- All tests pass.

### 3.3 Wire into editor and page components

- [ ] Update `DocEditor` in `apps/web/src/app/(shell)/docs/_components/editor.tsx`:
  - Add optional `onContentChange?: (blocks: Block[]) => void` prop to `DocEditorProps`.
  - In `handleChange`, call `onContentChange?.(editor.document)` before the save debounce timer. This fires on every BlockNote `onChange` — it is not debounced. The auto-title hook manages its own timing.
- [ ] Update `DocTitle` unmount flush in `apps/web/src/app/(shell)/docs/_components/doc-title.tsx`:
  - Change `saveDocument(docIdRef.current, { title: valueRef.current })` to `saveDocument(docIdRef.current, { title: valueRef.current, isTitleManual: true })`.
  - This ensures that even a flushed-on-unmount title save marks the doc as manually titled (the flush only fires if the user typed in the title field).
- [ ] Update `DocViewPage` in `apps/web/src/app/(shell)/docs/[docId]/page.tsx`:
  - Import and call `useAutoTitle({ docId, doc, enabled: !!doc })`.
  - Destructure `notifyContentChange` from the hook return.
  - Pass `onContentChange={notifyContentChange}` to `DocEditor`.
  - Update `handleSaveTitle` to include `isTitleManual: true`: `saveMutation.mutate({ title, isTitleManual: true })`.
- [ ] Write/update tests:
  - `DocEditor` calls `onContentChange` on every change event.
  - `DocTitle` unmount flush includes `isTitleManual: true`.
  - `DocViewPage` wires auto-title hook correctly (integration-level test).

**Acceptance Criteria:**
- `DocEditor` fires `onContentChange` on every content change (not debounced).
- `DocTitle` saves (both debounced and unmount flush) include `isTitleManual: true`.
- Auto-title hook is wired into `DocViewPage` and receives content changes from the editor.
- After typing and pausing ~12s in a new doc with sufficient content, title auto-generates.
- Manually editing the title sets `isTitleManual = true` and stops auto-title generation.
- All tests pass, type-check clean.

## Dependency Graph

```
Phase 1 (Schema)
  1.1 → 1.2
          |
Phase 2 (Server)
  2.1 → 2.2 → 2.3
                |
Phase 3 (Frontend)
  3.1 → 3.2
  3.1 → 3.3
  3.2 → 3.3
```

3.1 (API client) can start once Phase 2 is done. 3.2 (hook) and 3.3 (wiring) both depend on 3.1, and 3.3 depends on 3.2's hook existing.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Server-side title generation | API key stays on the server. Client just calls an endpoint — no key exposure. |
| `POST /docs/:id/generate-title` dedicated endpoint | Keeps the PATCH/save path simple. Auto-title is a distinct operation from saving content or editing titles. |
| `updateDocumentTitle` always sets `isTitleManual = true` | Server-side enforcement. This function is only called from user-initiated PATCH — any user title edit marks it manual without the frontend needing to remember. |
| `onContentChange` fires every keystroke (not debounced) | Auto-title debounce resets on each keystroke for accurate 12s timing. Piggybacking on the 1.5s save debounce would make the effective delay unpredictable. |
| 12-second debounce constant | Midpoint of the spec's 10-15s range. Simple constant — tunable later without architectural changes. |
| Column default false + startup backfill | Follows the spec. Backfill handles docs that were manually titled before the column existed. Idempotent — safe on every startup. |
| Vercel AI SDK abstraction | Model-agnostic interface. Swap Gemini for another model by changing the provider import, not the application code. |
| Text extraction on both server and frontend | Server needs it for the AI prompt (operates on `unknown[]` JSONB). Frontend needs it for word-count threshold (operates on typed `Block[]`). Small utility — duplicating is simpler than a shared package for ~15 lines of code. |
| Re-title threshold: >50% blocks changed or 2x size | Prevents unnecessary API calls on minor edits while catching significant rewrites. Starting point — tunable from real usage. |
