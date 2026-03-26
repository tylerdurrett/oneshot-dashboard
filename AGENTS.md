## Project Mission

This is a Turborepo monorepo starter kit, fully set up for efficient agentic development.

This repo is meant to be used by NON-DEVELOPERS who are using coding agents to vibe code. When you create documentation, do not make it too technical. The users may not understand or care about code, but they're very interested in creating things in the repo with agents, so frame documentation around that process. Think: what can the user do with agents and how do I share that with them - NOT, how can the user code this. The exception to that is any AGENTS.md file like this - this is used exclusively by the agent.

AGENTS.md should be VERY concise because it goes into every context

## UI Conventions

When building UI, follow `docs/ui-conventions.md`. Key rules:
- Reusable components → `packages/ui/`, feature-specific → colocated
- Dark-theme-first
- Optimistic updates via TanStack Query
- Scrollbar is styled globally — don't add per-component scrollbar styles.

## Database Workflow

Schema lives in `packages/db/src/schema.ts`. **Always use generate + migrate** (never `db:push`) for real work. For column renames, use a two-step migration (add new → drop old) — never hand-write migration files. After generating a migration, verify the `when` timestamp in `drizzle/meta/_journal.json` is **after** all previous entries — out-of-order timestamps cause migrations to silently skip. See `docs/database.md`.

## Environment Variables

Uses a two-file convention, applied consistently across all apps:
- **`.env`** — Committed to git. Contains non-sensitive defaults with comments explaining each variable. This is the documentation for what env vars exist.
- **`.env.local`** — NOT committed (gitignored). Contains secrets and local overrides.

## Conventions

- Package names use `@repo/*` scope
- All packages use TypeScript strict mode and ESM (`"type": "module"`)
- Vitest configs are per-package (for Turbo cache compatibility)
- SQLite database files (`*.db`) are gitignored; `DATABASE_URL` env var defaults to `file:local.db`
- Ports are set via `pnpm hello` and stored in `project.config.json` (agent-readable). Convention: Web = N, Remotion Studio = N+1, Agent Server = N+2. Read ports from `project.config.json`, never hardcode them.

## Development Workflow

Small changes are one-offs. Larger features use `_tasks/` with status folders: `_ideas`, `_planning`, `_ready-to-start`, `_in-progress`, `_complete`, `_icebox`, `_abandoned`. Move the feature folder between status folders as work progresses. See `docs/dev-cycle.md`.

## Restarting Dev Servers

The app runs via `pnpm launchd:install` (persistent launchd service) or `pnpm go` (foreground). The safe restart sequence:

1. `pnpm launchd:uninstall` — stops launchd from auto-respawning old processes
2. `pnpm stop` — kills processes on the configured ports
3. Verify ports are free: `lsof -ti :4900,:4901,:4902` should return nothing
4. `pnpm launchd:install` — starts fresh with new code

**Do NOT** `kill` processes without first uninstalling launchd — it will immediately restart them with stale code, causing port conflicts. If you see `EADDRINUSE` errors, there are stale processes; use `pkill -9 -f "vite.*dev"; pkill -9 -f "tsx"` as a last resort.

After schema changes (`packages/db/src/schema.ts`), `tsx watch` auto-restarts the server. If the server is crashing after a migration, verify the migration actually applied: `sqlite3 packages/db/local.db "PRAGMA table_info(TABLE_NAME);"`.

## Remember

- Never edit files ending in .human.md. Those were created by a person and should stay that way.
- Always create tests for your code
- When you fix a bug, add a comment documenting why you're updating the code so we prevent regressions.
- To type-check without a full build, use `pnpm --filter @repo/web tsc --noEmit`.
- When doing UI work, visually test your code using the chrome devtools skill
- Do as much as possible to verify your work yourself without asking the user
- Use best-practice software architecture patterns
- Create minimal code, and be pragmatic with your choices. We do not want to overengineer. Our focus is on creating exactly the functionality we need, nothing more
- Security is always important: always flag security issues
- Always update docs when you are finished
- Always run the code review when you're done implementing a plan
