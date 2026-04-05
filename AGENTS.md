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
- PostgreSQL via Docker Compose (`pnpm db:up`); `DATABASE_URL` defaults to `postgresql://oneshot:oneshot@localhost:5432/oneshot`
- Ports are set via `pnpm hello` and stored in `project.config.json` (agent-readable). Convention: Web = N, Remotion Studio = N+1, Agent Server = N+2. Read ports from `project.config.json`, never hardcode them.
- Feature flags (`timers`, `chat`, `video`) live in `project.config.json` under `features`, default to enabled. Shared logic in `@repo/features`. See `docs/feature-flags.md`.

## Development Workflow

Small changes are one-offs. Larger features use `_tasks/` with status folders: `_ideas`, `_planning`, `_ready-to-start`, `_in-progress`, `_complete`, `_icebox`, `_abandoned`. Move the feature folder between status folders as work progresses. See `docs/dev-cycle.md`.

## Sandbox

The chat agent runs in a Docker sandbox. Only the `workspace/` subdirectory is mounted — the agent cannot access project source code. The soul file and MCP config are injected at startup by `scripts/ensure-sandbox.mjs`. MCP tools are served over Streamable HTTP from the Fastify server at `/mcp` — no bundle or build step needed. After editing MCP tool source (`apps/server/src/chat/`), just restart the server. See `docs/sandbox.md`.

## Restarting Dev Servers

The app runs via `pnpm service:install` (persistent service — launchd on macOS, systemd on Linux/WSL2) or `pnpm go` (foreground). The safe restart sequence:

1. `pnpm service:uninstall` — stops the service manager from auto-respawning old processes
2. `pnpm stop` — kills processes on the configured ports
3. Verify ports are free: `lsof -ti :4900,:4901,:4902` should return nothing
4. `pnpm service:install` — starts fresh with new code

**Do NOT** `kill` processes without first uninstalling the service — the service manager will immediately restart them with stale code, causing port conflicts. If you see `EADDRINUSE` errors, there are stale processes; use `pkill -9 -f "vite.*dev"; pkill -9 -f "tsx"` as a last resort.

After schema changes (`packages/db/src/schema.ts`), `tsx watch` auto-restarts the server. If the server is crashing after a migration, verify it applied: `psql postgresql://oneshot:oneshot@localhost:5432/oneshot -c "\d TABLE_NAME"`.

## Testing

Run tests per-package: `pnpm --filter @repo/server test`. Postgres must be running. Server tests hit a real `oneshot_test` DB — no mocks. If mixing `vi.useFakeTimers()` with DB calls, only fake `['setTimeout', 'clearTimeout', 'Date']` and set up the DB connection **before** installing fakes. See `docs/testing.md`.

## Remember

- Never edit files ending in .human.md. Those were created by a person and should stay that way.
- Always create tests for your code
- **Mocked tests are not enough.** After building a feature, restart the server and smoke-test the real endpoint (curl, browser). Mocks hide integration bugs — prove it works end-to-end. "Covered by automated tests" is never a valid substitute — actually run it.
- When you fix a bug, add a comment documenting why you're updating the code so we prevent regressions.
- To type-check without a full build, use `pnpm --filter @repo/web tsc --noEmit`.
- When doing UI work, visually test your code using the chrome devtools skill
- Always verify for YOURSELF. Do not make assumptions about the codebase or libraries.
- Use best-practice software architecture patterns
- Create minimal code, and be pragmatic with your choices. We do not want to overengineer. Our focus is on creating exactly the functionality we need, nothing more
- Security is always important: always flag security issues
- Always update docs when you are finished
- ALWAYS run your /simplify code review before you're finished
