# Feature: MCP over Streamable HTTP

**Date:** 2026-04-05
**Status:** Scoped

## Problem

When you change MCP tool code (`apps/server/src/chat/mcp-server.ts`), the chat agent doesn't pick up the changes. The server restarts via `tsx watch`, but the MCP tools run as a separate bundled process inside the Docker sandbox — completely disconnected from the server lifecycle. Getting changes to the agent requires manually rebuilding the bundle, re-injecting it into the sandbox, and restarting the chat session.

This is the only part of the codebase where changing source code doesn't automatically update the running system.

## Root Cause

The MCP server currently runs as a **stdio process inside the Docker sandbox**. This means:

1. The MCP tool source is bundled into a standalone `.mjs` file by esbuild (`scripts/build-mcp-server.mjs`)
2. The bundle is injected into the sandbox by `scripts/ensure-sandbox.mjs` via `docker sandbox exec`
3. A `.mcp.json` config tells Claude Code to spawn the bundle as a child process
4. The MCP tools then make HTTP calls *back* to the Fastify server on the host

This is a roundabout architecture: the tools live in the server source, get bundled out, get injected into a sandbox, and then call back into the server over HTTP. The bundle/inject pipeline is the source of the disconnect.

## Solution

Serve MCP tools directly from the Fastify server using **Streamable HTTP transport** instead of stdio. The MCP SDK (`@modelcontextprotocol/sdk` v1.29.0, already installed) has `StreamableHTTPServerTransport` for exactly this. Claude Code supports `"type": "http"` in `.mcp.json`.

### How it works today

```
Claude Code (sandbox) → spawns node oneshot-mcp-server.mjs (stdio)
  → MCP tool called → HTTP request to host Fastify server
  → Fastify handles request → response back through the chain
```

### How it works after

```
Claude Code (sandbox) → HTTP request to host Fastify server /mcp endpoint
  → Fastify handles MCP tool call directly
  → response back
```

The MCP tools become Fastify routes. `tsx watch` restarts the server on changes — MCP tools restart with it. Same developer experience as every other piece of server code.

## What Changes

### Added

- **MCP route on Fastify** — A `/mcp` endpoint (POST, GET, DELETE per the Streamable HTTP spec) that serves the MCP tools. The tool definitions (`get_timer_status`, `list_docs`, etc.) stay the same — only the transport layer changes.
- **Direct service calls** — MCP tool handlers call server services directly (e.g., query the database, call internal functions) instead of making HTTP round-trips through `api()`. This is simpler and faster.

### Removed

- **`scripts/build-mcp-server.mjs`** — No longer needed. MCP tools are part of the server, not a separate bundle.
- **MCP bundle injection in `ensure-sandbox.mjs`** — The `injectMcpBundle()` and `injectMcpConfig()` functions are removed. The `.mcp.json` is still written, but with `"type": "http"` pointing at the server URL instead of a local file path.
- **`apps/server/dist/oneshot-mcp-server.mjs`** — The bundled artifact goes away.
- **`pnpm build:mcp`** — The npm script is removed from `package.json`, along with the `build:mcp` step in `prego`.
- **`mcp-helpers.ts` HTTP proxy logic** — The `api()` helper and its `HTTP_PROXY` workaround for Docker's MITM proxy are no longer needed since tools run on the host, not in the sandbox.

### Changed

- **`ensure-sandbox.mjs`** — Still injects the soul file (`CLAUDE.md`), but the MCP config it writes to `workspace/.mcp.json` changes from `"type": "stdio"` to `"type": "http"` with the server URL.
- **`mcp-server.ts`** — Restructured to export an MCP server instance (or a Fastify plugin) instead of connecting to `StdioServerTransport` at the bottom of the file. Tool definitions are unchanged.
- **`mcp-helpers.ts`** — The `resolveOrError`, `resolveDocOrError`, `extractPlainText`, and other pure helpers stay. The `api()` HTTP helper and proxy config are removed since tools can call services directly.

## What Stays the Same

- All 14 MCP tool definitions (names, parameters, behavior)
- The soul file (`soul.md`) and its injection into the sandbox
- The sandbox itself — still runs Claude Code in Docker
- The chat UI and how users interact with the agent

## Constraints

- **Single-user app** — No auth or multi-tenant session management needed on the MCP endpoint. A simple stateless or single-session setup is fine.
- **Streamable HTTP, not SSE** — SSE transport is deprecated in the MCP spec (sunset April 2026). Use `StreamableHTTPServerTransport`, not `SSEServerTransport`.
- **Keep existing tests passing** — The 33 MCP tool tests in `mcp-server.test.ts` should continue to work. They test tool logic, not transport, so they should need minimal changes.
- **Preserve the `ONESHOT_API_BASE` env var convention** — The `.mcp.json` URL should use the server port from `project.config.json`, not a hardcoded port.

## Out of Scope

- MCP authentication (not needed for local single-user app)
- Session resumability / event stores
- Write-side doc tools (`write_doc`, `create_doc`) — still deferred to Phase 3b
- Changes to the sandbox Docker setup beyond updating `.mcp.json`
