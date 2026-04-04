# Implementation Guide: Doc System v1 — Phase 1: Multi-Doc

**Date:** 2026-04-04
**Feature:** Multi-Doc with Pinning, Inline Titles, Doc List Navigation
**Source:** [Feature Description](2026-04-04_feature-description.md)

## Overview

Phase 1 evolves the single-document editor into a multi-doc system. The implementation sequence is: schema first (workspaces table + documents evolution), then server CRUD APIs, then frontend routing and editor changes, then the doc list navigation UI.

Database changes are batched into one migration. The server layer is built and tested before any frontend work begins — this means the API is stable and testable via `server.inject()` before wiring up the UI. Frontend work splits into two stages: first make the editor work with multiple docs (routing + title editing), then build the doc list/switcher UI on top.

The existing single-doc flow (auto-create on first access, `/docs` route) continues working throughout — no breaking change at any point.

## File Structure

```
packages/db/
  src/schema.ts                          # Add workspaces table, evolve documents
  drizzle/NNNN_*.sql                     # Generated migration

apps/server/src/
  routes/docs.ts                         # Expand from 2 endpoints → full CRUD
  services/document.ts                   # Expand with multi-doc operations
  services/workspace.ts                  # NEW — workspace seeding
  __tests__/document.test.ts             # Expand with multi-doc tests
  __tests__/workspace.test.ts            # NEW

apps/web/src/
  router.tsx                             # Add /docs/:id route
  app/(shell)/docs/
    page.tsx                             # Redirect to most recent doc
    [docId]/page.tsx                     # NEW — single doc view
    _components/
      editor.tsx                         # Add title prop + inline title input
      docs-layout.tsx                    # Add left nav panel (desktop)
      doc-list.tsx                       # NEW — pinned/recent doc list
      doc-list-item.tsx                  # NEW — single item with context menu
      doc-title.tsx                      # NEW — inline editable title
      mobile-doc-selector.tsx            # NEW — popover doc switcher
    _hooks/
      use-doc-query.ts                   # Expand with multi-doc hooks
    _lib/
      docs-api.ts                        # Expand with CRUD endpoints
```

## Phase 1: Schema & Migration

**Purpose:** Create the `workspaces` table, evolve `documents` with new columns, and set up workspace seeding.

**Rationale:** Database changes go first so everything downstream (server, frontend) builds on a stable schema. Batching all schema changes into one migration avoids ordering issues.

### 1.1 Create `workspaces` table and evolve `documents`

- [x] Add `workspaces` table to `packages/db/src/schema.ts`: id (uuid PK), name (text), isDefault (boolean), createdAt, updatedAt. Follow existing naming conventions (snake_case columns, ISO string timestamps).
- [x] Add columns to `documents` table: `title` (text, not null, default `''`), `workspaceId` (uuid FK → workspaces, nullable initially for migration), `folderId` (uuid, nullable — FK target doesn't exist yet, add as plain column), `pinnedAt` (timestamp, nullable), `pipelineEnabled` (boolean, default true), `processedAt` (timestamp, nullable).
- [x] Run `pnpm --filter @repo/db db:generate` to generate the migration SQL.
- [x] Review the generated SQL. Verify the `when` timestamp in `drizzle/meta/_journal.json` is after all previous entries.
- [x] Run `pnpm --filter @repo/db db:migrate` to apply.
- [x] Verify tables with `psql`: `\d workspaces` and `\d documents`.

> **Notes (1.1):** Migration `0002_overrated_newton_destine.sql` generated and applied. Journal timestamps in order (1775243617588 → 1775252891547 → 1775318548150). `isDefault` column uses `default(false)` following drizzle boolean conventions. Verified via tsx script since psql CLI not installed — existing document row preserved with safe defaults/nulls. All 4 document tests pass, type-check clean.

**Acceptance Criteria:**
- `workspaces` table exists with all columns.
- `documents` table has new columns: title, workspace_id, folder_id, pinned_at, pipeline_enabled, processed_at.
- Existing document row is preserved (new columns have safe defaults/nulls).
- Migration journal timestamps are in order.

### 1.2 Workspace seeding and data migration

- [x] Create `apps/server/src/services/workspace.ts` with `ensureDefaultWorkspace(db)` — idempotent function that creates a default workspace if none exists (checks `isDefault = true`).
- [x] Call `ensureDefaultWorkspace()` during server startup in `apps/server/src/index.ts`, before route registration. Follow the `seedDefaultBuckets()` pattern.
- [x] Update `getDefaultDocument()` in `apps/server/src/services/document.ts` to assign the default workspace ID when auto-creating a new document, and set a default title of `"Notes [date]"`.
- [x] Write a one-time data migration in `ensureDefaultWorkspace`: after seeding the workspace, update any documents with null `workspaceId` to point to the default workspace. Give untitled docs a title based on their `createdAt` date.
- [x] Write tests in `apps/server/src/__tests__/workspace.test.ts`: seed creates workspace, second call is idempotent, existing docs get assigned.

> **Notes (1.2):** `workspace.ts` exports three functions: `titleFromDate` (shared title format), `getDefaultWorkspaceId` (workspace lookup), and `ensureDefaultWorkspace` (idempotent seeding). The backfill uses 2 bulk UPDATEs (not per-doc loop) and only runs on the `seeded: true` path since new docs always get a workspace assigned. `document.ts` imports `titleFromDate` and `getDefaultWorkspaceId` from workspace.ts to avoid duplication. Added `fileParallelism: false` to server vitest config to prevent test files from racing on the shared Postgres DB. Document test `beforeEach` now truncates `documents, workspaces` since `getDefaultDocument` queries workspaces. All 9 tests pass (5 workspace + 4 document), type-check clean.

**Acceptance Criteria:**
- Server startup creates a default workspace if none exists.
- Calling seed twice does not create a duplicate.
- Any existing document gets assigned to the default workspace and receives a title.

## Phase 2: Server CRUD APIs

**Purpose:** Build the full document API surface — create, list, read, update (title + content), delete, pin/unpin.

**Rationale:** Server APIs are built and tested before frontend work begins. The existing `GET /docs/default` and `PATCH /docs/default` endpoints remain functional during the transition — new endpoints are additive.

### 2.1 Document service layer

- [x] Add `listDocuments(workspaceId, db)` → returns all docs for workspace, ordered: pinned first (by `pinnedAt` desc), then unpinned (by `updatedAt` desc).
- [x] Add `getDocumentById(id, db)` → returns single doc or null.
- [x] Add `getMostRecentDocument(workspaceId, db)` → returns the most recently edited doc (by `updatedAt` desc), or auto-creates one if none exist.
- [x] Add `createDocument(workspaceId, title?, db)` → creates doc with default title `"Notes [date]"`, returns it.
- [x] Add `updateDocumentTitle(id, title, db)` → updates title + `updatedAt`, returns doc.
- [x] Add `deleteDocument(id, db)` → deletes doc. Returns boolean success.
- [x] Add `pinDocument(id, db)` → sets `pinnedAt` to now. `unpinDocument(id, db)` → sets `pinnedAt` to null.
- [x] Write tests for all new service functions in `apps/server/src/__tests__/document.test.ts`.

> **Notes (2.1):** All 7 service functions added to `document.ts` with full test coverage (16 new tests, 20 total document tests pass). `listDocuments` uses a SQL CASE expression for pinned-first ordering. `deleteDocument` returns boolean via `.returning({ id })` check (single round-trip). `getMostRecentDocument` delegates to `createDocument` for the auto-create path. Pin/unpin kept as separate functions for API clarity. Type-check clean.

**Acceptance Criteria:**
- `listDocuments` returns pinned docs first (sorted by pinnedAt desc), then unpinned (sorted by updatedAt desc).
- `getMostRecentDocument` returns existing doc or creates one.
- `createDocument` defaults title to "Notes [date]" format.
- `deleteDocument` removes the doc.
- `pinDocument` / `unpinDocument` toggle `pinnedAt`.
- All service functions have passing tests.

### 2.2 Route endpoints

- [x] Add `GET /docs` → list documents (calls `listDocuments` with default workspace).
- [x] Add `GET /docs/recent` → most recently edited doc (calls `getMostRecentDocument`).
- [x] Add `GET /docs/:id` → single document by ID. 404 if not found.
- [x] Add `POST /docs` → create document. Optional `{ title }` body. Returns 201.
- [x] Add `PATCH /docs/:id` → update document. Body can include `content` and/or `title`. Updates `updatedAt`.
- [x] Add `DELETE /docs/:id` → delete document. 404 if not found.
- [x] Add `POST /docs/:id/pin` → pin document. `DELETE /docs/:id/pin` → unpin.
- [x] Keep existing `GET /docs/default` and `PATCH /docs/default` working (backward compat during transition — remove in a later cleanup).
- [x] Write route-level tests in `apps/server/src/__tests__/document.test.ts` (or a new `docs-routes.test.ts`) using `server.inject()`.

> **Notes (2.2):** All 8 endpoints added to `routes/docs.ts`. Route tests in `docs-routes.test.ts` with 20 tests covering all endpoints, 404 cases, and backward compat. `requireWorkspaceId()` helper caches workspace ID in closure after first lookup (it's static after startup). `/docs/recent` registered before `/docs/:id` so Fastify doesn't treat "recent" as a param. PATCH `/docs/:id` accepts both `content` and `title` in a single call. All 45 doc-related tests pass (20 routes + 20 service + 5 workspace), type-check clean.

**Acceptance Criteria:**
- All endpoints return correct status codes (200, 201, 404).
- Response format follows project convention: `{ document: {...} }` for single, `{ documents: [...] }` for list.
- Existing `/docs/default` endpoints still work.
- All routes have passing tests.

## Phase 3: Frontend — Routing & Editor

**Purpose:** Make the frontend work with multiple documents — route to specific docs, load/save by ID, edit titles inline.

**Rationale:** Routing and editor changes come before the doc list UI because they establish the data flow. Once `/docs/:id` works, the list UI just needs to link to the right IDs.

### 3.1 API client and query hooks

- [x] Update `apps/web/src/app/(shell)/docs/_lib/docs-api.ts`:
  - `fetchDocuments()` → `GET /docs` — returns doc list.
  - `fetchRecentDocument()` → `GET /docs/recent` — returns most recent doc.
  - `fetchDocument(id)` → `GET /docs/:id` — returns single doc.
  - `createDocument(title?)` → `POST /docs` — returns new doc.
  - `saveDocument(id, { content?, title? })` → `PATCH /docs/:id` — returns updated doc.
  - `deleteDocument(id)` → `DELETE /docs/:id`.
  - `pinDocument(id)` → `POST /docs/:id/pin`.
  - `unpinDocument(id)` → `DELETE /docs/:id/pin`.
- [x] Update `apps/web/src/app/(shell)/docs/_hooks/use-doc-query.ts`:
  - New query keys: `docKeys.list`, `docKeys.detail(id)`, `docKeys.recent`.
  - `useDocuments()` → list query.
  - `useDocument(id)` → single doc query.
  - `useSaveDocument(id)` → mutation, invalidates list + updates detail cache.
  - `useCreateDocument()` → mutation, invalidates list, returns new doc.
  - `useDeleteDocument()` → mutation, invalidates list.
  - `usePinDocument()` / `useUnpinDocument()` → mutations, invalidate list.

> **Notes (3.1):** `DocumentResponse` interface expanded with all new fields (title, workspaceId, folderId, pinnedAt, pipelineEnabled, processedAt). Legacy `useSaveDocument()` renamed to `useSaveDefaultDocument()` to avoid collision with new `useSaveDocument(id)` — `page.tsx` import updated accordingly. `fetchRecentDocument` and `docKeys.recent` defined here for use by section 3.2's redirect page. Pin/unpin mutations update both detail cache (`setQueryData`) and list cache (`invalidateQueries`). Delete mutation uses `removeQueries` to clear stale detail cache. `DocumentResponse` type re-exported from hooks file for consumer convenience. Type-check clean.

**Acceptance Criteria:**
- All API functions hit correct endpoints.
- Query hooks return typed data.
- Mutations invalidate the document list cache.
- Save mutation updates the detail cache optimistically.

### 3.2 Routing — `/docs` redirect and `/docs/:id` page

- [x] Update `apps/web/src/router.tsx`: change `/docs` route to render a redirect component, add `/docs/:docId` route for the doc view.
- [x] Create `apps/web/src/app/(shell)/docs/[docId]/page.tsx` — the single-doc view. Fetches doc by ID from URL param, renders editor + layout.
- [x] Update `apps/web/src/app/(shell)/docs/page.tsx` — fetches most recent doc via `fetchRecentDocument()`, redirects to `/docs/:id` using the returned ID. Shows spinner during fetch.
- [x] Update nav items in `apps/web/src/lib/app-areas.ts` if needed — `/docs` should still be the entry point.

> **Notes (3.2):** `DOCS_NAV_ITEM` matchType changed from `'exact'` to `'prefix'` so `/docs/:docId` URLs resolve to the docs area on mobile. Added two-pass activeIndex logic in `useSwipeNavigation` (exact match first, then prefix) to prevent `/docs` from shadowing `/docs/chat`. `DocsPage` serves dual role: on desktop it's a redirect to most recent doc; on mobile the SwipeView mounts it for all `/docs/*` paths, so it extracts the docId from the URL and renders `DocViewPage` inline (same pattern as `MobileChatView` + `ThreadPage`). `DocViewPage` accepts docId from URL params (desktop) or prop (mobile), handles 404 with a "not found" page and nav back to `/docs`. `useRecentDocument` hook added to query hooks. `key={docId}` on `DocEditor` forces remount when switching docs. All 328 web tests pass (including 2 new swipe-nav tests + 1 updated app-areas test), type-check clean.

**Acceptance Criteria:**
- `/docs` redirects to `/docs/:id` where `:id` is the most recently edited doc.
- `/docs/:id` loads and displays the correct document.
- Browser back/forward navigation works between docs.
- If no docs exist, one is auto-created and navigated to.

### 3.3 Inline title editing

- [x] Create `apps/web/src/app/(shell)/docs/_components/doc-title.tsx` — an editable title component. Renders as a large text input (no border, transparent background) above the editor. Debounced save on change (same 1500ms pattern as editor). Blurs on Enter.
- [x] Wire into the doc page: pass current title + save callback. Save calls `PATCH /docs/:id` with `{ title }`.
- [x] Update editor component: it no longer needs to know about the title — title is a sibling component, not part of BlockNote.

> **Notes (3.3):** `DocTitle` component uses the same debounce pattern as `DocEditor` (1500ms, ref-based callback, flush-on-unmount). Styled as a transparent `<input>` with `text-2xl font-bold` to look like a heading. Left padding matches BlockNote editor's content indent (`px-[54px]`). Wired into `DocViewPage` as a sibling above `DocEditor` — editor unchanged. `key={`title-${docId}`}` forces remount on doc switch. 7 tests in `doc-title.test.tsx` cover debounce, flush-on-unmount, Enter blur, rapid-change reset, and prop sync. All 335 web tests pass, type-check clean.

**Acceptance Criteria:**
- Title displays above the editor, looks like a heading (not a form field).
- Typing in the title updates it with debounced save.
- New docs show default title "Notes [date]" which is fully editable.
- Title changes reflect in the document list (after list is built in Phase 4).

## Phase 4: Frontend — Doc List & Navigation

**Purpose:** Build the doc list sidebar (desktop) and popover switcher (mobile) with create, delete, and pin/unpin actions.

**Rationale:** This is the last phase because it's pure UI that consumes the routing and API work from Phases 2–3. Each sub-section adds one piece of the navigation experience.

### 4.1 Doc list component

- [x] Create `apps/web/src/app/(shell)/docs/_components/doc-list.tsx` — renders two sections: "Pinned" (if any pinned docs) and "Recent". Each section is a list of doc items. Uses `useDocuments()` hook. Highlights the currently active doc (match against URL param).
- [x] Create `apps/web/src/app/(shell)/docs/_components/doc-list-item.tsx` — single doc row: title (truncated) + relative timestamp. Clicking navigates to `/docs/:id`. Active state: `bg-accent/50`.
- [x] "Pinned" section label only shows when there are pinned docs. Visual separator between pinned and recent sections.

> **Notes (4.1):** `DocListItem` mirrors ThreadSelector's item pattern: `min-h-[44px]`, `bg-accent/50` active state, truncated title + `formatTimeAgo` timestamp. Moved `formatTimeAgo` from `chat/` to shared `@/lib/format-time-ago.ts` since it's now used by both features (old location re-exports for backward compat). `DocList` splits docs into pinned/recent arrays with `filter()`, shows "Pinned" header + separator only when pinned docs exist. 12 tests in `doc-list.test.tsx` (5 for DocListItem, 7 for DocList) cover sections, active state, navigation, loading, and empty state. All 347 web tests pass, type-check clean.

**Acceptance Criteria:**
- Doc list renders pinned docs at top, recent docs below.
- Clicking a doc navigates to it.
- Active doc is visually highlighted.
- Empty state is handled (no docs → list is empty, but auto-create ensures at least one exists).

### 4.2 Desktop inner left nav

- [x] Update `apps/web/src/app/(shell)/docs/_components/docs-layout.tsx` — add a left panel for the doc list on desktop. Use the existing `react-resizable-panels` pattern. Doc list in a narrow left panel (~240px), editor + chat in the main area.
- [x] Remove `hideDesktopSecondaryNav: true` from the docs area config if the inner left nav replaces it, or keep it if the inner nav is self-contained within the docs layout.
- [x] Add a "+" button at the top of the left nav to create a new doc. On click: calls `createDocument()`, navigates to the new doc's URL.

> **Notes (4.2):** Used a **nested Group** approach: outer Group (`docs-nav` + `docs-main`) wraps an inner Group (`docs-editor` + `docs-chat`) when chat is enabled. This allows independent resize persistence via separate `useDefaultLayout` calls (`docs-outer-layout` and `docs-inner-layout`). The `docs-nav` panel uses `defaultSize="240px"`, `minSize="180px"`, `collapsible`, `collapsedSize={0}`, `groupResizeBehavior="preserve-pixel-size"`. New `DocsNavPanel` component has a header bar matching the `docs-chat-panel` pattern ("Documents" label + Plus icon button), with `disabled={isPending}` to prevent double-click. `hideDesktopSecondaryNav: true` kept as-is since the inner nav is self-contained within `DocsLayout`. `SEPARATOR_CLASS` extracted as a shared constant within the file. 4 tests in `docs-nav-panel.test.tsx` (header, button, DocList render, create+navigate flow), 3 updated tests in `docs-layout.test.tsx` (nested Groups with chat, nav+editor without chat, mobile fallback). All 351 web tests pass, type-check clean.

**Acceptance Criteria:**
- Desktop shows a left sidebar with the doc list alongside the editor.
- Panel is resizable.
- "+" button creates a new doc and navigates to it.
- Layout doesn't break when the panel is collapsed.

### 4.3 Mobile doc switcher

- [ ] Create `apps/web/src/app/(shell)/docs/_components/mobile-doc-selector.tsx` — mirrors the ThreadSelector pattern. Popover trigger shows current doc title + chevron. Popover content lists docs in pinned/recent layout. Tapping a doc closes popover and navigates.
- [ ] Place the selector in the top bar area of the mobile docs view. Add a "+" icon button next to it for creating new docs.
- [ ] Ensure 44px minimum tap targets for accessibility.

**Acceptance Criteria:**
- Mobile shows current doc title as a tappable trigger.
- Popover lists all docs with pinned/recent sections.
- Tapping a doc navigates to it and closes the popover.
- "+" button creates a new doc.

### 4.4 Context menu — delete and pin/unpin

- [ ] Add a context menu to doc list items (right-click on desktop, long-press on mobile). Actions: "Pin" / "Unpin" (toggle based on current state), "Delete".
- [ ] Pin/unpin calls the respective mutation, which invalidates the list (doc moves between sections).
- [ ] Delete shows a confirmation dialog (use existing ConfirmationDialog from `@repo/ui`). After deletion, if the deleted doc was active, navigate to the most recent remaining doc.
- [ ] Prevent deleting the last doc — either disable the option or show a message.

**Acceptance Criteria:**
- Right-click (desktop) / long-press (mobile) opens context menu.
- "Pin" moves the doc to the pinned section. "Unpin" moves it back.
- "Delete" shows confirmation, then removes the doc.
- Deleting the active doc redirects to the most recent remaining doc.
- Cannot delete the last doc.

## Dependency Graph

```
Phase 1 (Schema)
  1.1 → 1.2
          |
Phase 2 (Server APIs)
  2.1 → 2.2
          |
Phase 3 (Frontend Core)
  3.1 → 3.2 → 3.3
                |
Phase 4 (Frontend Nav UI)
  4.1 → 4.2
  4.1 → 4.3
  4.1 → 4.4
```

Phases 4.2, 4.3, and 4.4 can be built in parallel once 4.1 (the shared doc list component) is done.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `pinnedAt` timestamp, not boolean | Doubles as pin status check (`IS NOT NULL`) and sort key — no extra column needed. |
| Keep `/docs/default` endpoints during transition | Avoids breaking anything while new endpoints are built. Remove in a cleanup pass. |
| `folderId` as plain column (no FK yet) | Folders table doesn't exist until Phase 4 of the feature. Column is there for the schema, FK added when the table exists. |
| Title defaults to "Notes [date]" | Low-friction doc creation — user doesn't need to name things upfront. Date provides minimal context. |
| Doc list is the nav, not a separate library page | No extra route to maintain. `/docs` always opens a doc. The list is always visible (desktop sidebar) or one tap away (mobile popover). |
| Mirror ThreadSelector pattern for mobile | Proven UX pattern already in the app. Consistent interaction model across features. |
| Workspace seeding at server startup | Idempotent, runs before routes, ensures FK target exists. Same pattern as timer bucket seeding. |
