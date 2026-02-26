## Project Mission

This is a Turborepo monorepo starter kit, fully set up for efficient agentic development.

This repo is meant to be used by NON-DEVELOPERS who are using coding agents to vibe code. With that in mind, whenever you create documentation, do not make it overly technical. The users may not understand or care about code, but they're very interested in creating things in the repo with agents, so frame documentation around that process. Think: what can the user do with agents and how do I share that with them - NOT, how can the user code this. The exception to that is any AGENTS.md file like this - this is used exclusively by the agent.

AGENTS.md should be VERY concise because it goes into every context, and it should have just enough to keep the agent in line and productive.

## UI Conventions

When building UI, follow `docs/ui-conventions.md`. Key rules:
- Reusable components → `packages/ui/`, feature-specific → colocated
- Dark-theme-first. Only animate `transform`/`opacity`.
- Optimistic updates via TanStack Query.
- Scrollbar is styled globally — don't add per-component scrollbar styles.

## Database Workflow

Schema lives in `packages/db/src/schema.ts`. **Always use generate + migrate** (never `db:push`) for real work.

## Environment Variables

Follows the Next.js convention, applied consistently across all apps:
- **`.env`** — Committed to git. Contains non-sensitive defaults with comments explaining each variable. This is the documentation for what env vars exist.
- **`.env.local`** — NOT committed (gitignored). Contains secrets and local overrides.

## Conventions

- Package names use `@repo/*` scope
- All packages use TypeScript strict mode and ESM (`"type": "module"`)
- ESLint uses flat config (`eslint.config.js`), not legacy `.eslintrc`
- Vitest configs are per-package (for Turbo cache compatibility)
- SQLite database files (`*.db`) are gitignored; `DATABASE_URL` env var defaults to `file:local.db`
- Ports are set via `pnpm hello` and stored in `project.config.json` (agent-readable). Convention: Web = N, Remotion Studio = N+1, Agent Server = N+2. Read ports from `project.config.json`, never hardcode them.

## Development Workflow

Small changes are one-offs. Larger features use `_tasks/` with status folders: `_ideas`, `_planning`, `_ready-to-start`, `_in-progress`, `_complete`, `_icebox`, `_abandoned`. Move the feature folder between status folders as work progresses. See `docs/dev-cycle.md`.

## Remember

- Never edit files ending in .human.md. Those were created by a person and should stay that way.
- Always create tests for your code
- When you fix a bug, add a comment documenting why you're updating the code so we prevent regressions.
- Never run `pnpm build` while the dev server is running — it overwrites the `.next` directory and causes internal server errors / broken CSS. To type-check without affecting the dev server, use `pnpm --filter @repo/web tsc --noEmit`.
- When doing UI work, visually test your code using the chrome devtools skill
- Do as much as possible to verify your work yourself without asking the user
- Use best-practice software architecture patterns
- Strive to create minimal code, and be pragmatic with your choices. We do not want to overengineer. Our focus is on creating exactly the functionality we need, and keeping the code footprint manageable.
- Security is always important
- Always update docs when you are finished
- Always run the code review when you're done implementing a plan
