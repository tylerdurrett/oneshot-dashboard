## Project Mission

This is a Turborepo monorepo starter kit, fully set up for efficient agentic development.

This repo is meant to be used by NON-DEVELOPERS who are using coding agents to vibe code. With that in mind, whenever you create documentation, do not make it overly technical. The users may not understand or care about code, but they're very interested in creating things in the repo with agents, so frame documentation around that process. Think: what can the user do with agents and how do I share that with them - NOT, how can the user code this. The exception to that is any AGENTS.md file like this - this is used exclusively by the agent. It should be extremely concise because it goes into every context, and it should have just enough to keep the agent from making stupid mistakes or having to look up too much.

## Monorepo Structure

- **`apps/web`** (`@repo/web`) — Next.js 15 app (App Router, Tailwind v4, Vitest)
- **`packages/ui`** (`@repo/ui`) — Shadcn components + Tailwind, shared across apps
- **`packages/db`** (`@repo/db`) — Drizzle ORM + SQLite (libsql), schema and migrations
- **`packages/typescript-config`** (`@repo/typescript-config`) — Shared tsconfig presets (base, nextjs, library)
- **`packages/video`** (`@repo/video`) — Remotion compositions, Studio entry, and Player exports
- **`packages/eslint-config`** (`@repo/eslint-config`) — Shared ESLint flat config (base, react)

## Key Commands

| Command | Description |
| --- | --- |
| `pnpm hello` | Interactive project setup (port, etc.) |
| `pnpm build` | Build all packages and apps via Turbo |
| `pnpm dev` | Start Next.js dev server (auto-runs setup if needed) |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run Vitest across all packages |
| `pnpm format` | Format all files with Prettier |
| `pnpm --filter @repo/db db:generate` | Generate Drizzle migrations |
| `pnpm --filter @repo/db db:migrate` | Apply Drizzle migrations |
| `pnpm studio` | Launch Remotion Studio for video preview (auto-runs setup if needed) |
| `pnpm go` | Start Next.js dev server + Remotion Studio concurrently (auto-runs setup if needed) |
| `pnpm new-video <Name>` | Scaffold a new video composition |
| `pnpm dlx shadcn@latest add <component> --cwd packages/ui` | Add a Shadcn component |

## UI Conventions

When building UI, follow `docs/ui-conventions.md`. Key rules:
- Don't extract components until the 3rd use (or if it's a semantic concept with behavior)
- Use Tailwind values directly; only create semantic tokens when a meaning clearly repeats
- Reusable components → `packages/ui/`, feature-specific → colocated
- Dark-theme-first. Only animate `transform`/`opacity`. Optimistic updates via TanStack Query.
- Scrollbar is styled globally — don't add per-component scrollbar styles.

## Database Workflow

Schema lives in `packages/db/src/schema.ts`. **Always use generate + migrate** (never `db:push`) for real work.

**Process — every time you change the schema:**
1. Edit `packages/db/src/schema.ts` (this is the source of truth)
2. Run `pnpm --filter @repo/db db:generate` — creates a versioned SQL migration file in `packages/db/drizzle/`
3. Review the generated `.sql` file to verify it does what you expect
4. Run `pnpm --filter @repo/db db:migrate` — applies the migration to your local database
5. Commit both the schema change AND the migration file together

**Rules:**
- Never edit generated migration files. If a migration is wrong, fix `schema.ts` and generate a new one.
- One migration per logical change. Don't batch unrelated schema changes.
- Migration files are committed to git — they're the reproducible history of the database.
- `db:migrate` runs automatically on `pnpm dev` / `pnpm go` / `pnpm studio`, so pending migrations are always applied.
- `db:push` exists for throwaway prototyping only. It skips migration files and can drop data.

## Conventions

- Package names use `@repo/*` scope
- All packages use TypeScript strict mode and ESM (`"type": "module"`)
- ESLint uses flat config (`eslint.config.js`), not legacy `.eslintrc`
- Vitest configs are per-package (for Turbo cache compatibility)
- SQLite database files (`*.db`) are gitignored; `DATABASE_URL` env var defaults to `file:local.db`
- Dev server port is set via `pnpm hello` and stored in `project.config.json` (agent-readable). Read port from `project.config.json`.

## Development Workflow

Small changes are one-offs. Larger features use `_tasks/` with status folders: `_ideas`, `_planning`, `_ready-to-start`, `_in-progress`, `_complete`, `_icebox`, `_abandoned`. Move the feature folder between status folders as work progresses. See `docs/dev-cycle.md`.

## Remember

- Never edit files ending in .human.md. Those were created by a person and should stay that way.
- Always create tests for your code
- When possible, visually test your code
- Do as much as possible to verify your work yourself without asking the user
- Use best-practice software architecture patterns
- Strive to create minimal code, and be pragmatic with your choices. We do not want to overengineer. Our focus is on creating exactly the functionality we need, and keeping the code footprint manageable.
- Security is always important
- Always update docs when you are finished
- Always run the code review when you're done implementing a plan
