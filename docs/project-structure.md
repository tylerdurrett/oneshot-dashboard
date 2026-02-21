# Project Structure

One Shot is a **monorepo** — one repository containing multiple packages that work together. This keeps everything organized and lets packages share code without publishing to npm.

## The Big Picture

```
your-project/
├── apps/
│   └── web/                  ← Your Next.js app (where you build your product)
│
├── packages/
│   ├── ui/                   ← Shared UI components (buttons, cards, inputs, etc.)
│   ├── video/                ← Remotion video compositions and Studio
│   ├── db/                   ← Database (schemas, queries, migrations)
│   ├── typescript-config/    ← TypeScript settings everyone shares
│   └── eslint-config/        ← Linting rules everyone shares
│
├── scripts/
│   ├── setup.mjs             ← Interactive project setup (pnpm hello)
│   ├── check-setup.mjs       ← Pre-dev configuration check
│   ├── new-video.mjs         ← Scaffold new Remotion compositions
│   ├── get-port.mjs          ← Read dev server port from config
│   └── get-studio-port.mjs   ← Read Remotion Studio port from config
├── _tasks/                ← Feature planning (for larger features)
├── .claude/                  ← Claude Code skills and configuration
├── package.json              ← Root-level scripts and dependencies
├── turbo.json                ← Build orchestration config
└── pnpm-workspace.yaml       ← Tells pnpm which folders are packages
```

## Where Things Live

### `apps/web/` — Your App

This is where you spend most of your time. It's a [Next.js 15](https://nextjs.org/) app using the App Router.

- **`src/app/`** — Your pages and layouts (file-based routing)
- **`src/app/globals.css`** — Global styles and Tailwind theme
- **`src/__tests__/`** — Tests for your app

Your app imports components from `@repo/ui` and database utilities from `@repo/db`. These imports just work — Turborepo and pnpm handle the wiring.

### `packages/ui/` — Shared Components

Pre-configured with [Shadcn](https://ui.shadcn.com/) and Tailwind CSS v4. Currently includes Button, Card, and Input components. You add more as you need them — see [UI Components](ui-components.md).

### `packages/video/` — Video Compositions

[Remotion](https://www.remotion.dev/) video compositions for programmatic video creation. Compositions are React components that render frame-by-frame — write them once, preview in Remotion Studio (`pnpm studio`), and embed in your app via the `<Player>` component.

- **`src/compositions/`** — Your video components (one per file, PascalCase)
- **`src/Root.tsx`** — Registers all compositions for Studio
- **`src/entry.ts`** — Studio entry point
- **`src/index.ts`** — Barrel exports for Player consumers

Create new compositions with `pnpm new-video <Name>` or use the `/new-video` Claude Code skill.

### `packages/db/` — Database

[Drizzle ORM](https://orm.drizzle.team/) with SQLite. Define your tables in TypeScript, get type-safe queries, and manage schema changes with migrations. See [Database](database.md).

### `packages/typescript-config/` and `packages/eslint-config/`

Shared configuration so all packages use the same TypeScript and linting rules. You rarely need to touch these — they just work in the background.

## How Packages Connect

Every package has a name starting with `@repo/`:

| Package | Name |
| --- | --- |
| `apps/web` | `@repo/web` |
| `packages/ui` | `@repo/ui` |
| `packages/video` | `@repo/video` |
| `packages/db` | `@repo/db` |
| `packages/typescript-config` | `@repo/typescript-config` |
| `packages/eslint-config` | `@repo/eslint-config` |

To use a shared package in your app, just import it:

```tsx
import { Button } from '@repo/ui';
import { db, users } from '@repo/db';
```

Turborepo makes sure packages build in the right order. When you run `pnpm build`, it builds `ui` and `db` first (since `web` depends on them), then builds `web`.

## Adding a New Package

If you need a new shared package, ask Claude Code:

> "Create a new shared package called `@repo/auth` for authentication utilities."

It knows the conventions and will set it up correctly.

## Adding a New App

Same approach — the monorepo supports multiple apps:

> "Add a new app called `admin` that uses the shared UI and database packages."

The new app goes in `apps/admin/` and follows the same patterns as `apps/web/`.
