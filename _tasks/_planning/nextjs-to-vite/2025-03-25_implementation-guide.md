# Implementation Guide: Migrate Frontend from Next.js to Vite + React Router

**Date:** 2025-03-25
**Feature:** Next.js to Vite Migration
**Source:** [feature-description.md](feature-description.md)

## Overview

This migration replaces Next.js with Vite + React Router in `apps/web`. The app is already a client-side SPA in practice — all pages use `'use client'`, data fetching is TanStack Query against a separate Fastify server, and there are zero server components, server actions, or API routes.

The strategy is **scaffold first, then migrate routes one at a time**, keeping the app functional at each step. We sequence Vite scaffolding and routing setup before page migration so that each migrated page can be tested immediately. Font and metadata changes are done last since they're cosmetic and low-risk.

## File Structure

After migration, `apps/web/` will look like this:

```
apps/web/
├── index.html                    # NEW — Vite entry point
├── vite.config.ts                # NEW — replaces next.config.ts
├── tsconfig.json                 # UPDATED — remove Next.js plugin
├── postcss.config.mjs            # UNCHANGED
├── components.json               # UPDATED — rsc: false
├── package.json                  # UPDATED — scripts + deps
├── vitest.config.ts              # UPDATED — extend from vite.config
├── eslint.config.js              # UNCHANGED
└── src/
    ├── main.tsx                  # NEW — React entry + router mount
    ├── router.tsx                # NEW — route definitions
    ├── vite-env.d.ts             # NEW — replaces next-env.d.ts
    ├── app/globals.css           # UNCHANGED
    ├── app/route-metadata.ts     # UPDATED — remove Metadata type
    ├── app/root-layout.tsx       # RENAMED from layout.tsx, now a component
    ├── app/(shell)/layout.tsx    # MINOR — now just a component (no export default convention)
    ├── app/(shell)/chat/...      # UPDATED — swap next/navigation imports
    ├── app/(shell)/timers/...    # UPDATED — swap metadata export
    ├── app/prototype/...         # UPDATED — swap next/link
    ├── app/video/...             # UNCHANGED (already pure React)
    ├── components/
    │   ├── app-shell.tsx         # UPDATED — swap Link + usePathname
    │   ├── providers.tsx         # UPDATED — remove 'use client'
    │   └── error-boundary.tsx    # NEW — generic React error boundary
    └── lib/                      # UNCHANGED
```

---

## Phase 1: Scaffold Vite + React Router

**Purpose:** Get a working Vite dev server serving a minimal React app with routing, before touching any existing pages.

**Rationale:** This is the foundation everything else depends on. By getting Vite running first with a "hello world" route, we can validate the build toolchain, monorepo resolution, Tailwind, and font loading before migrating real pages.

### 1.1 Swap dependencies

- [x] Remove `next` from `dependencies` in `apps/web/package.json`
- [x] Add `vite`, `@vitejs/plugin-react`, `react-router` to dependencies
- [x] Remove `next-env.d.ts`
- [x] Run `pnpm install`

> **Notes (1.1):** `vite` and `@vitejs/plugin-react` added to `devDependencies` (not `dependencies`) since they are build tools. `react-router` added to `dependencies`.

**Acceptance Criteria:**
- `pnpm install` succeeds with no errors
- No `next` package in `node_modules` for `@repo/web`

### 1.2 Create Vite config

- [x] Create `apps/web/vite.config.ts` with React plugin, path aliases (`@/*`, `@repo/ui/*`), and env variable handling
- [x] Set dev server to read port from `project.config.json` (same as current Next.js setup)
- [x] Configure `server.host: true` for network access (equivalent to Next.js `-H 0.0.0.0`)
- [x] Add `envPrefix: 'VITE_'` and define `VITE_SERVER_PORT` (replacing `NEXT_PUBLIC_SERVER_PORT`)

> **Notes (1.2):** `VITE_SERVER_PORT` is injected via Vite's `define` option (reading from `project.config.json` at build time) so it works immediately, before `.env` files are updated in section 1.3. Alias for `@repo/ui` points to directory (not glob) to match the vitest.config.ts convention.

**Acceptance Criteria:**
- `vite.config.ts` exists and exports a valid config
- Path aliases resolve `@/*` and `@repo/ui/*`
- Port is read from `project.config.json`, not hardcoded

### 1.3 Migrate environment variables (must happen before any page works)

- [x] Rename `NEXT_PUBLIC_SERVER_PORT` → `VITE_SERVER_PORT` in `.env` and `.env.example`
- [x] Update `apps/web/src/lib/server-url.ts`: change `process.env.NEXT_PUBLIC_SERVER_PORT` → `import.meta.env.VITE_SERVER_PORT` (Vite does not inject `process.env` in browser builds — without this, all API calls and WebSocket connections will fail)
- [x] Update all other source code references to use `import.meta.env.VITE_SERVER_PORT`
- [x] Update `chat/__tests__/api.test.ts`: change `vi.stubEnv('NEXT_PUBLIC_SERVER_PORT', ...)` → `vi.stubEnv('VITE_SERVER_PORT', ...)` and replace `delete process.env.NEXT_PUBLIC_SERVER_PORT` with `vi.unstubAllEnvs()` (cannot `delete` from `import.meta.env`)
- [x] Ensure `vite.config.ts` (from 1.2) injects server port from `project.config.json` via `define` or env var

> **Notes (1.3):** No `.env` or `.env.example` files exist — the server port is injected entirely via `vite.config.ts`'s `define` option (reading from `project.config.json` at build time), which was already set up in Phase 1.2. The only source code reference to `NEXT_PUBLIC_SERVER_PORT` was in `server-url.ts`; all other files consume it indirectly via `getServerHttpUrl()`/`getServerWsUrl()`. The `delete process.env.NEXT_PUBLIC_SERVER_PORT` line in the test was replaced with `vi.unstubAllEnvs()` which was already being called — the extra delete was redundant.

**Acceptance Criteria:**
- `server-url.ts` reads port from `import.meta.env.VITE_SERVER_PORT`
- No references to `NEXT_PUBLIC_*` remain in the codebase
- API tests pass with updated env var name and cleanup pattern

### 1.4 Create HTML entry point and React mount

- [x] Create `apps/web/index.html` with `<html lang="en" class="dark">`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<div id="root">`, font preloads for Geist, and `<script type="module" src="/src/main.tsx">`
- [x] Create `apps/web/src/main.tsx` that renders `<RouterProvider>` inside `<Providers>`
- [x] Create `apps/web/src/vite-env.d.ts` with `/// <reference types="vite/client" />`
- [x] Import `globals.css` in `main.tsx`
- [x] Delete `apps/web/src/app/page.tsx` (root redirect — imports `next/navigation` which no longer exists; redirect moves to router config)
- [x] Delete `apps/web/src/__tests__/page.test.tsx` (tested the Next.js redirect)

> **Notes (1.4):** Font preloads for Geist are deferred to Phase 2.3 (font loading setup) since `next/font/google` is still referenced in `layout.tsx`. The `main.tsx` renders `<Providers>` with an empty placeholder div instead of `<RouterProvider>` — the router mount is Phase 1.5. The `<body>` tag in `index.html` includes the layout classes (`bg-background text-foreground antialiased`) so they apply immediately without waiting for React hydration.

**Acceptance Criteria:**
- `pnpm --filter @repo/web vite dev` starts without errors ✅
- Browser shows a blank page with no console errors ✅
- Tailwind styles are loaded (dark background visible) ✅
- `<html>` has `lang="en"` and `class="dark"` ✅
- Viewport meta tag includes `viewport-fit=cover` (was previously set via Next.js `Viewport` export) ✅

### 1.5 Set up React Router with placeholder routes

- [x] Create `apps/web/src/router.tsx` with route definitions for all 7 routes
- [x] Add root redirect: `/` navigates to `/timers`
- [x] Add placeholder components for each route (just `<div>Route name</div>`)
- [x] Wrap shell routes in a layout route that renders `<AppShell>`
- [x] Write a smoke test: router config renders without errors

> **Notes (1.5):** Shell routes use a `PassthroughLayout` (`<Outlet />`) instead of `<AppShell>` — AppShell still imports `next/link` and `next/navigation` which no longer exist. The real AppShell integration happens in Phase 2.1. Placeholder components use a factory function `placeholder(name)` to avoid repetition. The `getRouter()` lazy singleton pattern defers `createBrowserRouter` to runtime to avoid jsdom `AbortSignal` incompatibility in tests. The redirect test exercises the loader directly to verify the `/timers` target (status 302 + Location header). Video route is intentionally standalone with no layout wrapper, matching the existing Next.js structure.

**Acceptance Criteria:**
- Navigating to `/timers`, `/chat`, `/chat/test-id`, `/prototype`, `/prototype/chat`, `/video` each shows the correct placeholder ✅
- `/` redirects to `/timers` ✅
- Shell routes show the sidebar/bottom nav via AppShell layout ⚠️ Deferred to Phase 2.1 (AppShell uses next/link)

### 1.6 Update monorepo scripts and Turbo config

- [ ] Update `apps/web/package.json` scripts: `dev` → `vite dev`, `build` → `vite build`, `preview` → `vite preview`
- [ ] Update `turbo.json`: change build output from `.next/**` to `dist/**`
- [ ] Update root `package.json` if any scripts reference Next.js-specific commands
- [ ] Verify `pnpm dev` starts both Vite and the Fastify server via Turbo

**Acceptance Criteria:**
- `pnpm dev` starts the Vite dev server on the configured port
- `pnpm --filter @repo/web build` produces output in `apps/web/dist/`
- Turbo caching works for build output

---

## Phase 2: Migrate the App Shell and Navigation

**Purpose:** Get the real navigation working so all subsequent page migrations can be tested by clicking around.

**Rationale:** The AppShell is the shared layout used by most routes. Migrating it first means every subsequent page migration immediately has working navigation.

### 2.1 Migrate AppShell component

- [ ] Replace `import Link from 'next/link'` with `import { Link } from 'react-router'`
- [ ] Replace `usePathname()` from `next/navigation` with `useLocation().pathname` from `react-router`
- [ ] Update `Link` usage: `href` prop → `to` prop
- [ ] Remove `'use client'` directive
- [ ] Update `components/__tests__/app-shell.test.tsx`: remove `vi.mock('next/navigation')` and `vi.mock('next/link')`, wrap renders in `<MemoryRouter initialEntries={[path]}>` instead
- [ ] Verify nav highlighting works on all routes

**Acceptance Criteria:**
- Sidebar and bottom nav render correctly
- Active route is highlighted
- Clicking nav items navigates to the correct route
- Context menu on Timers nav item still works
- AppShell tests pass with React Router mocking approach

### 2.2 Create React error boundary component

- [ ] Create `apps/web/src/components/error-boundary.tsx` — a generic React error boundary with reset capability
- [ ] Wire it into the router config for the chat route (replacing Next.js `error.tsx` convention)
- [ ] Delete `apps/web/src/app/(shell)/chat/error.tsx` or refactor it to use the new boundary
- [ ] Update `chat/__tests__/error.test.tsx` to test the new error boundary component (same assertions, different import)
- [ ] Write a test: error boundary catches and displays errors

**Acceptance Criteria:**
- Chat route errors are caught and displayed with a "Try again" button
- Clicking "Try again" resets the error state
- Other routes are not affected by chat errors
- Error boundary tests pass

### 2.3 Set up font loading

- [ ] Add Geist font CSS via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` packages (or use Google Fonts CDN link in `index.html`)
- [ ] Set CSS variables `--font-geist-sans` and `--font-geist-mono` on `<body>`
- [ ] Remove `next/font/google` import from old layout
- [ ] Verify fonts render correctly

**Acceptance Criteria:**
- Body text uses Geist Sans
- Code/mono elements use Geist Mono
- No FOUT (flash of unstyled text) — fonts preloaded in `index.html`

---

## Phase 3: Migrate Pages

**Purpose:** Replace placeholder route components with the real page components.

**Rationale:** With routing and navigation working, each page can be migrated independently and tested immediately. We start with the simplest pages and work toward the most complex (chat with dynamic routes).

### 3.1 Migrate Timers page

- [ ] Import the real timers page component into the router
- [ ] Remove `Metadata` export (replace with `document.title` in a `useEffect` or a small `useDocumentTitle` hook)
- [ ] Update `route-metadata.ts`: remove `Metadata` type import from `next`, export plain objects/strings instead
- [ ] Update `__tests__/route-metadata.test.ts` to match the new plain export shape
- [ ] Remove `'use client'` directive if present
- [ ] Verify timers load, start, stop, and SSE updates work

**Acceptance Criteria:**
- `/timers` shows the full timer UI
- Creating, starting, stopping, resetting timers all work
- SSE real-time updates function correctly
- Browser tab title shows "Timers"
- Route metadata tests pass

### 3.2 Migrate Chat pages

- [ ] Migrate `/chat` (draft mode page): replace `useRouter` from `next/navigation` with `useNavigate` from `react-router`
- [ ] Migrate `/chat/:threadId`: replace `useParams` and `useRouter` with React Router equivalents. **Note:** React Router's `useParams()` returns `string | undefined` (not `string`), so add a non-null assertion or runtime guard for `params.threadId`
- [ ] Update `router.push()` calls to `navigate()` and `router.replace()` to `navigate(path, { replace: true })`
- [ ] Remove `'use client'` directives
- [ ] Keep chat providers (WebSocket context, QueryClient) in the route layout
- [ ] Update `chat/__tests__/page.test.tsx`: remove `vi.mock('next/navigation')`, wrap renders in `<MemoryRouter>` with mock navigate
- [ ] Update `chat/[threadId]/__tests__/page.test.tsx`: remove `vi.mock('next/navigation')`, use `<MemoryRouter initialEntries={['/chat/thread-1']}>` and React Router's `useParams`
- [ ] Verify thread creation, message sending, WebSocket streaming, and thread switching

**Acceptance Criteria:**
- `/chat` shows empty draft state, sending a message creates a thread and navigates to `/chat/:threadId`
- `/chat/:threadId` loads thread messages from DB
- WebSocket streaming works for real-time responses
- Thread selector works for switching between threads
- Deleting active thread redirects to `/chat`
- Browser tab title shows "Chat"
- All chat page tests pass with React Router mocking

### 3.3 Migrate Prototype and Video pages

- [ ] Migrate `/prototype`: replace `next/link` with React Router `Link` (`href` → `to` prop)
- [ ] Migrate `/prototype/chat`: remove any Next.js imports
- [ ] Migrate `/video`: no Next.js imports to change (already pure React)
- [ ] Remove `'use client'` directives where present
- [ ] Update `__tests__/prototype-index.test.tsx`: wrap renders in `<MemoryRouter>` (React Router's `<Link>` requires router context)

**Acceptance Criteria:**
- `/prototype` lists prototypes with working links
- `/prototype/chat` renders the fullscreen chat prototype
- `/video` renders the Remotion player
- Prototype index test passes

---

## Phase 4: Update Config and Test Infrastructure

**Purpose:** Clean up remaining Next.js config artifacts and align tooling with Vite.

**Rationale:** With all pages migrated and env vars already handled (Phase 1.3), this phase focuses on TypeScript, ESLint, Shadcn, and test config alignment.

### 4.1 Update vitest config to extend Vite config

- [ ] Update `apps/web/vitest.config.ts` to import and extend `vite.config.ts` so path aliases, plugins, and env handling are shared (avoids duplication and drift)
- [ ] Remove manually duplicated `esbuild.jsx` and `resolve.alias` from vitest config
- [ ] Run `pnpm --filter @repo/web test` to verify all tests still pass

**Acceptance Criteria:**
- `vitest.config.ts` extends `vite.config.ts`
- No duplicated alias or plugin config between the two files
- All tests pass

### 4.2 Update TypeScript config

- [ ] Create `packages/typescript-config/vite.json` — based on `base.json`, with `"jsx": "react-jsx"`, no `next` plugin
- [ ] Update `apps/web/tsconfig.json`: extend `vite.json` instead of `nextjs.json`, remove `.next/types` and `next-env.d.ts` from includes, add `vite-env.d.ts`
- [ ] Check if any other package extends `nextjs.json` — if not, delete it; if so, leave it
- [ ] Run `pnpm --filter @repo/web tsc --noEmit` to verify no type errors

**Acceptance Criteria:**
- Zero TypeScript errors
- No references to Next.js types remain
- Path aliases resolve correctly in the IDE
- `packages/typescript-config/vite.json` exists and is referenced by `apps/web/tsconfig.json`

### 4.3 Update Shadcn config and ESLint

- [ ] Update `apps/web/components.json`: set `"rsc": false`
- [ ] Update `packages/ui/components.json`: set `"rsc": false`
- [ ] Update `apps/web/eslint.config.js`: remove `.next/**` and `next-env.d.ts` from ignores, add `dist/**` if needed
- [ ] Verify `npx shadcn@latest add` still works for adding new components

**Acceptance Criteria:**
- Both `components.json` files have `rsc: false`
- ESLint config has no Next.js-specific ignores
- Adding a new Shadcn component generates correct output (no server component wrappers)

---

## Phase 5: Cleanup and Verification

**Purpose:** Remove all Next.js remnants and verify the full app works end-to-end.

**Rationale:** Final sweep to ensure nothing was missed and the codebase is clean.

### 5.1 Remove Next.js artifacts

- [ ] Delete `apps/web/next.config.ts`
- [ ] Delete `apps/web/next-env.d.ts` (if not already removed)
- [ ] Delete `apps/web/.next/` directory
- [ ] Remove all remaining `'use client'` directives across `apps/web/src/` (20 files total)
- [ ] Remove old layout files that are now just components imported by the router (root `layout.tsx` moved to `root-layout.tsx` or inlined in `main.tsx`)
- [ ] Search for any remaining `from 'next` imports and remove them
- [ ] Update `.gitignore`: remove `.next/`, `out/`, and `# Next.js` comment, add `dist/` under a Vite section if not already present
- [ ] Update `turbo.json`: ensure build outputs only reference `dist/**`, not `.next/**`

**Acceptance Criteria:**
- `grep -r "from 'next" apps/web/src/` returns zero results
- `grep -r "'use client'" apps/web/src/` returns zero results
- No `next.config.ts`, `next-env.d.ts`, or `.next/` directory exists
- `apps/web/package.json` has no `next` dependency
- `.gitignore` has no Next.js-specific entries
- `turbo.json` has no `.next/**` in outputs

### 5.2 Run full test suite

- [ ] Run `pnpm test` — all existing tests pass
- [ ] Run `pnpm --filter @repo/web build` — production build succeeds
- [ ] Run `pnpm --filter @repo/web preview` — preview server works
- [ ] Manually verify all routes in the browser
- [ ] Run `pnpm lint` — no lint errors

**Acceptance Criteria:**
- All tests pass
- Production build completes without errors
- Preview server serves the app correctly
- All 7 routes work as expected
- No lint errors

### 5.3 Update documentation and scripts

- [ ] Update `docs/project-structure.md`: change "Next.js 15 app using the App Router" to describe Vite + React Router
- [ ] Update `docs/persistent-service.md`: change "Next.js web app" references to "Vite web app"
- [ ] Update `docs/ui-conventions.md` if it references Next.js
- [ ] Update `scripts/install-launchd.sh` comment (line 9-10): change "Next.js web app" to "Vite web app"
- [ ] Update any README references to Next.js
- [ ] Update `AGENTS.md` if it references Next.js conventions

**Acceptance Criteria:**
- No documentation or script comments reference Next.js as the frontend framework
- `grep -ri "next.js\|nextjs\|next js" docs/ scripts/ AGENTS.md` returns zero results (excluding migration plan files)
- Vite-specific conventions are documented where relevant

---

## Phase 6: Browser Smoke Test (Final Sanity Check)

**Purpose:** Visually verify the entire app works end-to-end on both localhost and the Tailscale network access point before calling the migration done.

**Rationale:** Automated tests can't catch everything — layout breakage, missing fonts, broken WebSocket connections, or subtle CSS regressions need a real browser. Testing both localhost and the Tailscale IP confirms network-accessible hosting works (Vite's `server.host` config).

### 6.1 Localhost smoke test

Use the Chrome DevTools skill to open the app at `http://localhost:4900/` (or whatever port is in `project.config.json`) and verify each route visually:

- [ ] `/timers` — page loads, timers render, dark theme is applied, fonts look correct (Geist Sans body, Geist Mono for any code)
- [ ] Create a timer bucket, start/stop a timer — verify SSE updates work in real time
- [ ] `/chat` — empty draft state renders, connection status shows "Connected"
- [ ] Send a message — verify thread is created, URL changes to `/chat/:threadId`, WebSocket streaming works
- [ ] `/chat/:threadId` — navigate to an existing thread, verify messages load from DB
- [ ] `/prototype` — page loads, links are clickable
- [ ] `/prototype/chat` — fullscreen chat prototype renders
- [ ] `/video` — Remotion player renders and plays
- [ ] Sidebar navigation — verify active route highlighting, clicking between routes works
- [ ] Mobile bottom nav — resize viewport to mobile width, verify bottom nav appears and works
- [ ] Browser tab titles — verify each route sets the correct title (e.g. "Timers", "Chat")
- [ ] Fix any issues encountered

**Acceptance Criteria:**
- All routes render correctly with no console errors
- Real-time features (SSE timers, WebSocket chat) function properly
- Navigation works across all routes
- Dark theme, fonts, and layout match pre-migration appearance

### 6.2 Tailscale network access smoke test

Use the Chrome DevTools skill to open the app at `http://100.90.21.39:4900/` and repeat the critical checks:

- [ ] `/timers` — page loads and renders correctly over the network
- [ ] `/chat` — WebSocket connection establishes (not just localhost)
- [ ] Send a message and verify streaming works over the Tailscale connection
- [ ] Navigate between routes — verify client-side routing works (no 404s on direct URL access)
- [ ] Fix any issues encountered (common: CORS, WebSocket URL construction, host header rejection)

**Acceptance Criteria:**
- App is fully functional when accessed via Tailscale IP
- No CORS or WebSocket connection failures
- Vite's dev server accepts connections from the network (not rejecting due to host header)

---

## Dependency Graph

```
Phase 1 (Scaffold Vite + Env Vars)
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
                              |
Phase 2 (Shell + Nav)         |
  2.1 ────────────────────────┘
  2.1 → 2.2
  2.1 → 2.3
         |
Phase 3 (Pages) ───────┐
  3.1 (independent)     |
  3.2 (independent)     |
  3.3 (independent)     |
                        |
Phase 4 (Config) ───────┘
  4.1 → 4.2 → 4.3
         |
Phase 5 (Cleanup) ─────┘
  5.1 → 5.2 → 5.3
         |
Phase 6 (Browser Smoke Test)
  6.1 → 6.2
```

Phases 3.1, 3.2, and 3.3 can be done in parallel or any order.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| React Router v7 (not TanStack Router) | Simpler API, widely known, sufficient for 7 routes. TanStack Router is powerful but overkill here. |
| `@fontsource-variable` for fonts | Self-hosted fonts avoid external CDN dependency. Works offline (local app). Matches Next.js font optimization behavior. |
| `document.title` via hook (not react-helmet) | Only need page titles, no complex meta tags. A 5-line `useDocumentTitle` hook avoids an extra dependency. |
| Keep existing file structure under `src/app/` | Minimizes diff size. Pages stay where they are; only imports change. Avoids unnecessary churn. |
| `VITE_` env prefix | Vite convention. Only `VITE_`-prefixed vars are exposed to client code, matching Next.js `NEXT_PUBLIC_` security model. |
| No SSR/pre-rendering | This is a local-only dashboard app. Pure SPA is the simplest and fastest option. |
