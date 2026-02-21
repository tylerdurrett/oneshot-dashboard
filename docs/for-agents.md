# For Agents

One Shot is designed to work well with coding agents like Claude Code. This page explains the built-in tooling that makes agent-assisted development smoother.

> **If you're new to coding with an agent**, you don't need to understand any of this to get started. Just open Claude Code in your project and describe what you want to build. This page is for when you're curious about how the agent-friendly features work under the hood.

## How Agents Stay on Track

The project includes two key files that give coding agents context about the codebase:

- **`AGENTS.md`** — Project structure, conventions, key commands, and workflow guidelines. This is the agent's "orientation document."
- **`CLAUDE.md`** — Points to AGENTS.md. Claude Code reads this automatically when it opens your project.

These files mean your agent doesn't start from scratch every session. It knows the monorepo structure, the naming conventions, where things live, and how to run builds and tests.

## Skills

Skills are reusable workflows stored in `.claude/skills/`. They teach the agent how to perform specific multi-step tasks:

| Skill | What it does |
| --- | --- |
| **dev-cycle** | Guides a feature through the full lifecycle (scope → plan → build → complete) |
| **feature-request** | Helps scope a new feature idea into a clear description |
| **implementation-guide** | Turns a feature description into a phased implementation plan |
| **skill-creator** | Creates new skills to extend the agent's capabilities |
| **chrome-devtools** | Browser automation and debugging with Puppeteer |

You invoke these naturally in conversation:

> "Start a new feature for adding search functionality."

> "Create an implementation plan for the feature in `_tasks/_planning/search/`."

## Commands

Quick commands in `.claude/commands/` handle common status changes:

| Command | What it does |
| --- | --- |
| `/set-status-ready` | Move a feature to "ready to start" |
| `/set-status-in-progress` | Move a feature to "in progress" |
| `/set-status-complete` | Mark a feature as complete |
| `/set-status-icebox` | Shelve a feature for later |
| `/set-status-abandoned` | Mark a feature as abandoned |
| `/do-section` | Implement one section of an implementation guide |

## Conventions That Help Agents

The project follows consistent patterns so agents can predict where things are and how they work:

- **`@repo/*` package names** — All shared packages use this naming convention
- **ESM everywhere** — `"type": "module"` in all packages, no CommonJS confusion
- **Flat ESLint config** — Modern `eslint.config.js` format, not the legacy `.eslintrc`
- **Per-package Vitest** — Each package has its own test config for clean Turbo caching
- **TypeScript strict mode** — Catches issues at compile time, not runtime

## Customizing Agent Behavior

### Settings

Agent settings live in `.claude/settings.json`. This controls things like:

- Which external URLs the agent can access
- Which files it should never read (like `.env` files)

### Adding Skills

You can teach your agent new workflows by creating skills. Ask Claude Code:

> "Create a new skill for deploying to production."

Or use the `/skill-creator` command. Skills are just Markdown files with instructions — no code required.

## Tips for Working with Agents

1. **Be specific about what you want** — "Add a login page with email and password" is better than "add auth."
2. **Let it verify its own work** — The agent runs tests and builds. Let it confirm things work before you review.
3. **Use the dev cycle for big features** — It keeps both you and the agent organized across sessions.
4. **Check the `_tasks/` folder** — It shows you what's in progress, what's planned, and what's done.
5. **Ask questions** — If you're not sure how something works, just ask. The agent has full context on the project.
