# Implementation Guide: Goal Management v1 — Database + Goals Area + Domains CRUD

**Date:** 2026-04-05
**Feature:** Goal Management System v1
**Source:** [05_goal-management.md](05_goal-management.md)

## Overview

This guide covers the first vertical slice of the goal management system: database tables for the full structural hierarchy (domains, goals, projects, tasks) and the temporal planning layer (periods, period_items), a new "Goals" feature area in the app, and a Domains CRUD page as the first UI.

Only the Domains page gets UI in this phase. The remaining tables are created now so the schema is complete and stable — no future migration needed when we build goal/project/task UI later.

The implementation follows the existing patterns exactly: Drizzle schema → Fastify route plugin → fetch wrappers → React Query hooks → page with dialog-based CRUD. The timers feature is the template throughout.

## File Structure

```
packages/db/src/
  schema.ts                              # Add 6 new tables

apps/server/src/
  routes/goals.ts                        # New Fastify plugin (domains CRUD)
  services/domain.ts                     # Domain service layer

apps/web/src/
  lib/nav-items.ts                       # Add Goals nav item
  lib/app-areas.ts                       # Add Goals app area
  lib/features.ts                        # Add goals feature flag
  router.tsx                             # Add goals routes
  app/(shell)/goals/
    layout.tsx                           # Goals layout
    page.tsx                             # Domains list page
    _lib/
      goals-api.ts                       # Fetch wrappers
      goals-types.ts                     # Type definitions
    _hooks/
      use-domain-queries.ts              # React Query hooks
    _components/
      domain-list.tsx                    # Domain list display
      domain-settings-dialog.tsx         # Create/edit dialog
    __tests__/
      domain-service.test.ts             # Service tests
      use-domain-queries.test.ts         # Query hook tests
```

## Phase 1: Database Schema

**Purpose:** Create all goal management tables in a single migration.

**Rationale:** Batching all schema changes into one migration avoids future migration churn. Tables that don't have UI yet cost nothing to create but save a migration cycle later.

### 1.1 Add tables to schema.ts

- [ ] Add `domains` table: id (uuid PK), name (text, not null), type (text, not null — 'venture' | 'client' | 'personal'), colorIndex (integer, not null, default 0), description (text), sortOrder (integer, not null, default 0), deactivatedAt (timestamp), createdAt, updatedAt
- [ ] Add `goals` table: id (uuid PK), title (text, not null), description (text), status (text, not null, default 'not_started'), targetDate (date), domainId (uuid FK → domains.id, not null), sortOrder (integer, not null, default 0), createdAt, updatedAt
- [ ] Add `projects` table: id (uuid PK), title (text, not null), description (text), status (text, not null, default 'not_started'), dueDate (date), goalId (uuid FK → goals.id — optional), domainId (uuid FK → domains.id, not null), sortOrder (integer, not null, default 0), createdAt, updatedAt
- [ ] Add `tasks` table: id (uuid PK), title (text, not null), status (text, not null, default 'not_started'), dueDate (date), projectId (uuid FK → projects.id — optional), goalId (uuid FK → goals.id — optional), domainId (uuid FK → domains.id, not null), sortOrder (integer, not null, default 0), createdAt, updatedAt
- [ ] Add `periods` table: id (uuid PK), type (text, not null — 'year' | 'month' | 'week' | 'day'), startDate (date, not null), endDate (date, not null), narrative (text), intention (text), createdAt, updatedAt
- [ ] Add `periodItems` table: id (uuid PK), periodId (uuid FK → periods.id, not null), goalId (uuid FK → goals.id — optional), projectId (uuid FK → projects.id — optional), taskId (uuid FK → tasks.id — optional), sortOrder (integer, not null, default 0), timeBlockStart (text — optional, for daily time slots), timeBlockEnd (text — optional), createdAt. Add unique constraint on (periodId, goalId, projectId, taskId) to prevent duplicate links.
- [ ] Follow existing patterns: `withTimezone: true, mode: 'string'` for timestamps, `.$defaultFn(() => new Date().toISOString())` for defaults, `mode: 'string'` for date columns
- [ ] All foreign keys use `.references(() => table.id)` with default (no cascade) behavior, matching existing schema

**Acceptance Criteria:**
- All six tables defined in schema.ts with correct column types
- Foreign key relationships match the hierarchy: goals → domains, projects → goals (optional) + domains, tasks → projects (optional) + goals (optional) + domains, periodItems → periods + goals/projects/tasks (all optional)
- TypeScript compiles with no errors: `pnpm --filter @repo/db tsc --noEmit`

### 1.2 Generate and run migration

- [ ] Run `pnpm --filter @repo/db db:generate`
- [ ] Review generated SQL file — verify it creates all 6 tables with correct columns, foreign keys, and constraints
- [ ] Verify `when` timestamp in `packages/db/drizzle/meta/_journal.json` is after all previous entries
- [ ] Run `pnpm --filter @repo/db db:migrate`
- [ ] Verify tables exist: `psql postgresql://oneshot:oneshot@localhost:5432/oneshot -c "\dt"` shows all 6 new tables

**Acceptance Criteria:**
- Migration generates and applies without errors
- All 6 tables visible in the database
- Journal timestamp ordering is correct

## Phase 2: Domain Service + Server Routes

**Purpose:** Create the backend CRUD for domains following existing service/route patterns.

**Rationale:** Backend before frontend — the API must exist before the UI can consume it. Domain CRUD is the only API needed for this slice.

### 2.1 Domain service layer

- [ ] Create `apps/server/src/services/domain.ts`
- [ ] Implement `listDomains(database)` — returns all domains ordered by sortOrder, excluding deactivated
- [ ] Implement `getDomain(id, database)` — returns single domain or undefined
- [ ] Implement `createDomain(input, database)` — input: { name, type, colorIndex?, description?, sortOrder? }. Auto-assign sortOrder to max+1 if not provided. Returns created domain.
- [ ] Implement `updateDomain(id, updates, database)` — partial updates, bumps updatedAt. Returns updated domain or undefined.
- [ ] Implement `deleteDomain(id, database)` — returns boolean. For now, only allow deletion if domain has no goals (check and return false if goals exist).
- [ ] All functions take optional `database` parameter defaulting to `defaultDb`
- [ ] Write service tests in `apps/web/src/app/(shell)/goals/__tests__/domain-service.test.ts` (or colocate with server tests if a pattern exists) — test list, create, update, delete, and the "can't delete domain with goals" guard

**Acceptance Criteria:**
- All 5 CRUD functions implemented and exported
- Delete guard prevents deletion of domains that have goals
- Tests pass: list returns ordered domains, create assigns sortOrder, update bumps updatedAt, delete guard works

### 2.2 Goals route plugin

- [ ] Create `apps/server/src/routes/goals.ts` as a Fastify plugin
- [ ] `GET /goals/domains` — returns `{ domains }` via `listDomains(db)`
- [ ] `POST /goals/domains` — accepts `{ name, type, colorIndex?, description? }`, returns `{ domain }` with status 201
- [ ] `PATCH /goals/domains/:id` — accepts partial updates, returns `{ domain }` or 404
- [ ] `DELETE /goals/domains/:id` — returns `{ success: true }` or 400 if domain has goals
- [ ] Register plugin conditionally in server setup: `if (features.goals) { server.register(goalsRoutes, { database }) }`
- [ ] Use Fastify generic type params for request typing: `server.patch<{ Params: { id: string }; Body: UpdateDomainInput }>`

**Acceptance Criteria:**
- All 4 endpoints respond correctly (test with curl after server restart)
- 404 returned for unknown domain ID on PATCH/DELETE
- 400 returned when deleting a domain that has goals
- Route only registered when goals feature flag is enabled

## Phase 3: Feature Flag + Navigation

**Purpose:** Wire up the Goals area in the app shell so it appears in navigation.

**Rationale:** This phase is independent of the UI page content — it just makes the area routable and navigable. Separating it keeps each phase focused.

### 3.1 Feature flag

- [ ] Add `'goals'` to `FEATURE_NAMES` tuple in `packages/features/src/index.ts`
- [ ] Add `goals: true` to `DEFAULT_FEATURES`
- [ ] Add `goals: '/goals'` to `HOME_PATHS`
- [ ] Add `goals: import.meta.env.VITE_FEATURE_GOALS ?? true` to `apps/web/src/lib/features.ts`
- [ ] Add `"goals": true` to `project.config.json` features object

**Acceptance Criteria:**
- TypeScript compiles with no errors across all packages
- Feature flag resolves to `true` by default

### 3.2 Navigation and routing

- [ ] Add Goals nav item to `ALL_NAV_ITEMS` in `apps/web/src/lib/nav-items.ts` — use an appropriate lucide icon (e.g., `Target` or `Crosshair`), href `/goals`, matchType `prefix`, feature `goals`
- [ ] Create Goals app area in `apps/web/src/lib/app-areas.ts` — id `goals`, label `Goals`, with the nav item
- [ ] Add goals route to `shellChildren` in `apps/web/src/router.tsx` — conditionally included when `features.goals` is true, with a layout element and child route for path `goals`
- [ ] Create minimal `apps/web/src/app/(shell)/goals/layout.tsx` — just renders `<Outlet />`
- [ ] Create placeholder `apps/web/src/app/(shell)/goals/page.tsx` — renders "Goals area" text

**Acceptance Criteria:**
- Goals appears in the app navigation (desktop sidebar and mobile strip)
- Clicking Goals navigates to `/goals` and renders the placeholder page
- Disabling the goals feature flag in project.config.json hides it from nav and routes

## Phase 4: Client API + React Query Hooks

**Purpose:** Build the client-side data layer for domains.

**Rationale:** API layer and hooks before UI components — the page needs data to render. This follows the timers pattern exactly.

### 4.1 Types and fetch wrappers

- [ ] Create `apps/web/src/app/(shell)/goals/_lib/goals-types.ts` — define `Domain` type (matching server response shape), `CreateDomainInput`, `UpdateDomainInput`
- [ ] Create `apps/web/src/app/(shell)/goals/_lib/goals-api.ts` — implement `fetchDomains()`, `createDomain(input)`, `updateDomain(id, updates)`, `deleteDomain(id)`. Follow timer-api.ts pattern: use `getServerHttpUrl` for base URL, check `res.ok`, return typed promises.

**Acceptance Criteria:**
- All 4 fetch functions implemented with proper error handling
- Types match the server response shapes

### 4.2 React Query hooks

- [ ] Create `apps/web/src/app/(shell)/goals/_hooks/use-domain-queries.ts`
- [ ] Define `domainKeys` object: `{ all: ['goals', 'domains'] as const }`
- [ ] Implement `useDomains()` — useQuery wrapping `fetchDomains()`
- [ ] Implement `useCreateDomain()` — useMutation, invalidates `domainKeys.all` on success
- [ ] Implement `useUpdateDomain()` — useMutation, invalidates `domainKeys.all` on success
- [ ] Implement `useDeleteDomain()` — useMutation, invalidates `domainKeys.all` on success
- [ ] Write hook tests in `__tests__/use-domain-queries.test.ts` — verify query keys, mutation invalidation patterns

**Acceptance Criteria:**
- All hooks work correctly with React Query
- Mutations invalidate the domains query on success
- Tests pass

## Phase 5: Domains UI

**Purpose:** Build the Domains page with list display and create/edit/delete functionality.

**Rationale:** Final phase — all dependencies (DB, API, hooks, routing) are in place. This is the user-facing deliverable.

### 5.1 Domain list component

- [ ] Create `apps/web/src/app/(shell)/goals/_components/domain-list.tsx`
- [ ] Display domains as a simple list — each item shows: name, type badge (venture/client/personal), description (if present)
- [ ] Empty state: icon + "No domains yet" message + "Add your first domain" button (follow timer-grid.tsx empty state pattern)
- [ ] Each domain item has a context menu (right-click) with Edit and Delete options (follow doc-item-context-menu pattern)
- [ ] Delete triggers a confirmation dialog (use ConfirmationDialog component)
- [ ] Show error message if delete fails (domain has goals)

**Acceptance Criteria:**
- Empty state renders with add button when no domains exist
- Domains display in a list with name, type, and description
- Context menu provides Edit and Delete actions
- Delete shows confirmation, and handles the "has goals" error gracefully

### 5.2 Domain settings dialog

- [ ] Create `apps/web/src/app/(shell)/goals/_components/domain-settings-dialog.tsx`
- [ ] Dialog fields: name (text input, required), type (select: venture/client/personal), description (textarea, optional)
- [ ] Reuse for both create and edit — pass existing domain for edit, null for create
- [ ] Validation: name must be non-empty, type must be selected. Compute `canSave` boolean.
- [ ] On save: call create or update mutation, close dialog on success
- [ ] Follow bucket-settings-dialog.tsx pattern: controlled via open/onOpenChange props, local useState for form fields, useEffect to reinitialize on open

**Acceptance Criteria:**
- Dialog opens for create (empty fields) and edit (pre-filled fields)
- Validation prevents saving without name or type
- Create and edit both work and list updates immediately (via query invalidation)

### 5.3 Wire up the page

- [ ] Update `apps/web/src/app/(shell)/goals/layout.tsx` — initialize domain query state, add an "Add Domain" button in a header area, pass state via Outlet context
- [ ] Update `apps/web/src/app/(shell)/goals/page.tsx` — render DomainList component, wire up dialog state for create/edit
- [ ] Ensure the add button opens the domain settings dialog in create mode
- [ ] Ensure context menu edit opens the dialog in edit mode with the selected domain

**Acceptance Criteria:**
- Page loads and shows domains from the database
- Add Domain button opens create dialog
- Creating a domain adds it to the list
- Editing a domain updates it in the list
- Deleting a domain removes it from the list
- All state updates happen via React Query invalidation (no local state sync)

### 5.4 Smoke test

- [ ] Restart the server (`pnpm service:uninstall && pnpm stop && pnpm service:install`)
- [ ] Navigate to `/goals` in the browser — see empty state
- [ ] Click "Add Domain" — create a domain named "Iterator" with type "venture"
- [ ] Create a second domain "Personal" with type "personal"
- [ ] Verify both appear in the list with correct names and types
- [ ] Right-click "Iterator" → Edit → change description → Save → verify update shows
- [ ] Right-click "Personal" → Delete → confirm → verify removal
- [ ] Refresh the page — verify surviving domain persists (data is in DB, not just local state)
- [ ] Verify the Goals area appears in navigation and is reachable from other areas
- [ ] Disable `goals` feature flag in project.config.json, restart, verify Goals disappears from nav

**Acceptance Criteria:**
- Full CRUD cycle works through the real UI against the real database
- Feature flag correctly shows/hides the entire Goals area
- Data persists across page refreshes

## Dependency Graph

```
Phase 1 (Schema)
  1.1 → 1.2
          |
Phase 2 (Backend)
  2.1 → 2.2
          |
Phase 3 (Nav/Routing)          Phase 4 (Client Data)
  3.1 → 3.2                     4.1 → 4.2
          \                       /
           \                     /
            Phase 5 (UI)
         5.1 → 5.2 → 5.3 → 5.4
```

Phases 3 and 4 can run in parallel after Phase 2 is complete. Phase 5 requires both 3 and 4.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Create all 6 tables now, UI for domains only | Avoids future migration churn. Empty tables cost nothing. |
| Status stored as text, not pgEnum | Easier to extend without migrations. Validation happens at the app layer. |
| Domains route nested under `/goals/domains` | Keeps the goals area's API namespace clean for future goals, projects, tasks endpoints. |
| No cascade deletes on foreign keys | Matches existing schema pattern. Explicit delete guards in service layer are safer and more visible. |
| Delete guard on domains (no delete if goals exist) | Prevents orphan goals. User must clean up goals first — the UI will make this obvious when goal management UI ships. |
| Tasks have domainId directly (not just inherited) | Allows querying "all tasks in domain X" without joining through goals and projects. Tasks can also exist without a project or goal. |
| colorIndex on domains (not a color string) | Matches timer bucket pattern. UI maps index to a color palette for consistency. |
| sortOrder on all entities | Enables user-controlled ordering from day one. Auto-assigned on create, draggable later. |
