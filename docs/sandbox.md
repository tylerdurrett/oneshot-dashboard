# Chat Agent Sandbox

The chat feature runs a Claude agent inside a [Docker sandbox](https://docs.docker.com/sandbox/). This page explains how the sandbox works and how the pieces connect.

## Isolation

The sandbox only has access to the `workspace/` directory in the project root — **not** the full project. The agent cannot read or modify your source code, configuration, or any other project files.

When the sandbox is created (`docker sandbox run claude workspace/`), Docker mounts only that directory via VirtioFS. The agent's working directory is set to the mounted `workspace/` path, so any files it creates appear there on the host.

## What gets injected at startup

Three things are injected into the sandbox each time it starts (via `scripts/ensure-sandbox.mjs`):

1. **Soul file** → `/home/agent/.claude/CLAUDE.md` — The agent's identity and instructions (sourced from `apps/server/src/chat/soul.md`). Claude Code auto-loads this at session start.

2. **MCP server bundle** → `/home/agent/timer-mcp-server.mjs` — The pre-built timer tools server. Injected via stdin since the project source is not mounted.

3. **MCP server config** → `/home/agent/.claude/settings.json` — Tells Claude Code where to find the timer tools MCP server (`/home/agent/timer-mcp-server.mjs`) and how to reach the host API server.

## Timer MCP tools

The MCP server gives the chat agent tools to manage timers: start, stop, create buckets, check status, etc. It communicates with the host's API server over `http://host.docker.internal:<port>`. The port is read from `project.config.json` at injection time.

The MCP server source is in `apps/server/src/chat/timer-mcp-server.ts` and gets bundled to `apps/server/dist/timer-mcp-server.mjs` by `scripts/build-mcp-server.mjs`.

## Troubleshooting

- **"Agent is offline"** — Run `pnpm sandbox` to set up or re-authenticate the sandbox
- **Timer tools not working** — Restart with `pnpm service:uninstall && pnpm stop && pnpm service:install` to re-inject the MCP config and bundle
- **Stale soul file** — Same restart sequence; all assets are re-injected each time
- **After upgrading** — If the sandbox was created before isolation changes, destroy and recreate it: `docker sandbox rm oneshot-sandbox && pnpm prego`
