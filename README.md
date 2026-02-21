# One Shot

A starter kit for faster better vibe coding.

## Quick start

1. Click the green **"Use this template"** button at the top of this repo, then **"Create a new repository"**
2. Clone your new repo and install:

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git my-project
cd my-project
pnpm install
pnpm go
```

Then open Claude Code and start building.

## How to build with Claude Code

### Small tasks

For quick fixes and small features, just open Claude Code in your project and tell it what to build. It knows the project structure and handles the rest.

### Larger features

For anything bigger, use the structured dev cycle:

1. **Scope** — Use `/feature-request` to scope your idea through conversational discovery. Creates a feature description in `_tasks/_planning/`.
2. **Plan** — Use `/implementation-guide` to turn the feature description into a phased implementation plan with acceptance criteria and tests.
3. **Build** — Run `ralph.sh` to automatically implement the plan section by section, or work through it interactively with Claude Code.

## Why One Shot?

Starting a new project with a coding agent (like Claude Code) usually means spending your first few sessions just wiring shit up: TypeScript configs, linting, a component library, a database, testing. By the time everything works, you've burned through a bunch of those sweet, sweet tokens.

One Shot gives you a clean, working monorepo with all that stuff already connected. It's built specifically for vibe coding: it's set up to get you to better specs and a better execution loop so you can one-shot more ambitious ideas without all the babysitting.

## The Stack

I chose this stack for a couple of reasons.

1. It's super standard, for one. You'll have zero problem finding libraries and support for it, and your agent was trained on this stack.

2. On Next.js specifically - I considered Sveltekit or Tanstack Start, and I may end up using one of those in a future version, but Next.js is just such an easy button, allowing non-devs to quickly spin up full-stack apps. Tanstack Start is newer and was just coming out of beta last time I checked. I want to give it a little more time in the oven. Svelte is amazing, but there are more UI components for React. Again, will likely revisit this later, but this feels like an easy pragmatic choice at the moment.

3. Drizzle with SQLite - the intent here was to keep it simple (SQLite) but provide an easy upgrade path in case a project ends up needing a little more database juice. You can swap out the underlying database without rewriting all your DB code.

- ⚡ **Next.js 15** with the App Router — your full-stack web framework
- 🎨 **Shadcn + Tailwind CSS v4** — beautiful UI components, ready to use
- 🗄️ **Drizzle ORM + SQLite** — a real database with type-safe queries, zero setup
- 📦 **Turborepo** — fast builds across all your packages
- ✅ **Testing, linting, formatting** — all pre-configured and passing
- 🎬 **Remotion** — create videos programmatically with React, preview in Studio
- 🤖 **Agent-friendly workflows** — built-in skills and dev cycle automation for Claude Code

## Learn More

- [Project Structure](docs/project-structure.md) — How the monorepo is organized
- [UI Components](docs/ui-components.md) — Adding and using Shadcn components
- [Video](docs/video.md) — Creating videos with Remotion
- [Database](docs/database.md) — Working with Drizzle ORM and SQLite
- [Dev Cycle](docs/dev-cycle.md) — The built-in feature development workflow
- [For Agents](docs/for-agents.md) — How the agent-friendly tooling works
- [Advanced Topics](docs/advanced-topics.md) — Upstream updates and more

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) v10+
- A coding agent like [Claude Code](https://claude.ai/code) (recommended, not required)
