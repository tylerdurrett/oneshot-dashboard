# Chat Agent Sandbox

The chat feature runs a Claude agent inside a [Docker sandbox](https://docs.docker.com/sandbox/). This page explains how the sandbox works and how the pieces connect.

## How the project gets into the sandbox

When the sandbox is created (`docker sandbox run claude /path/to/project`), Docker mounts the project directory into the sandbox. The project appears at the **exact same absolute path** inside the sandbox as on the host (e.g. if your project is at `/Users/you/repos/oneshot-dashboard/` on your Mac, it's at the same path inside the sandbox).

The sandbox also has a directory at `/home/agent/workspace/` — but this is a separate, empty directory, **not** where the project is mounted. The chat agent's working directory is set to `/home/agent/workspace/` on purpose so it doesn't browse or modify the project source code.

## What gets injected at startup

Two things are injected into the sandbox each time it starts (via `scripts/ensure-sandbox.mjs`):

1. **Soul file** → `/home/agent/.claude/CLAUDE.md` — The agent's identity and instructions (sourced from `apps/server/src/chat/soul.md`). Claude Code auto-loads this at session start.

2. **MCP server config** → `/home/agent/.claude/settings.json` — Tells Claude Code where to find the timer tools MCP server. The MCP server bundle itself (`apps/server/dist/timer-mcp-server.mjs`) is **not** copied in — it's already accessible at its host path via the mount.

## Timer MCP tools

The MCP server gives the chat agent tools to manage timers: start, stop, create buckets, check status, etc. It communicates with the host's API server over `http://host.docker.internal:<port>`. The port is read from `project.config.json` at injection time.

The MCP server source is in `apps/server/src/chat/timer-mcp-server.ts` and gets bundled to `apps/server/dist/timer-mcp-server.mjs` by `scripts/build-mcp-server.mjs`.

## Troubleshooting

- **"Agent is offline"** — Run `pnpm sandbox` to set up or re-authenticate the sandbox
- **Timer tools not working** — Restart with `pnpm service:uninstall && pnpm stop && pnpm service:install` to re-inject the MCP config
- **Stale soul file** — Same restart sequence; the soul file is re-injected each time
