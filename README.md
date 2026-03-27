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

When you want to stop both long-running local processes (`dev` + `studio`), run:

```bash
pnpm stop
```

## Agent Sandbox Setup

The chat feature (`/chat`) connects to a Claude agent running inside a Docker sandbox. One-time setup:

1. Install the [Docker sandbox plugin](https://docs.docker.com/sandbox/) if you don't have it
2. Run:

```bash
pnpm sandbox
```

It will create the sandbox, open a browser for login, and verify everything is working. The sandbox stays authenticated across restarts — you only need to do this once.
On WSL2, the setup scripts keep Docker's own sandbox workspace path automatically, so you should not need to hand-tune sandbox paths.

## How Chat Reliability Works

The chat page no longer depends on keeping an idle live socket open all the time. Instead, each message prepares the sandbox right before Claude runs, starts one streamed request, and can finish in the background if your phone briefly disconnects over Tailscale or sleep/wake.

Two important mental-model updates:

- The host browser being logged into Claude is **not** the source of truth for chat auth.
- The real source of truth is the host machine's Claude credentials plus the fresh access-token-only credentials injected into the sandbox right before a prompt runs.

That means brief mobile network hiccups should usually recover on their own while a response is finishing.
Sending from another device on your LAN or over Tailscale uses that same streamed browser path, so it should behave the same way as the local desktop page instead of failing just because the host name changed.

## Quick Troubleshooting

If chat still fails, there are usually only two buckets:

- **Sandbox setup problem**: the local server or sandbox is offline, or the host needs a fresh Claude login. The fastest recovery step is usually `pnpm go`, then `pnpm sandbox` if needed.
- **WSL2 chat says "Agent is offline" right after startup**: restart with `pnpm stop` then `pnpm go` after pulling the latest code so the server picks up the Docker sandbox connection fix.
- **Response still finishing**: the page may reconnect and catch up from the saved run state. Give it a moment before retrying.
- **Immediate "load failed" on another device**: that usually points to a stale server build or a browser-origin mismatch. Restart the app with `pnpm service:uninstall && pnpm stop && pnpm service:install` if it comes back after an update.

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

2. On the frontend — we use Vite + React Router. It's fast, simple, and well-supported. The app is a client-side SPA with a separate Fastify API server, so we don't need a full-stack framework. Vite gives us instant HMR and a clean build pipeline. React Router handles the few routes we have without overhead.

3. Drizzle with SQLite - the intent here was to keep it simple (SQLite) but provide an easy upgrade path in case a project ends up needing a little more database juice. You can swap out the underlying database without rewriting all your DB code.

- ⚡ **Vite + React Router** — fast dev server, client-side routing
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
- **Linux/WSL2 only:** [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) with WSL2 backend (for sandbox features), `lsof` (`sudo apt install lsof`)
