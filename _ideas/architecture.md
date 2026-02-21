# Architecture — v0

## Overview

```
┌──────────┐      WebSocket       ┌──────────────┐    docker sandbox exec    ┌─────────────────┐
│ Frontend  │ ◄────────────────► │ Agent Server  │ ───────────────────────► │ Docker Sandbox   │
│ (Next.js) │                     │ (apps/server) │ ◄─── stream-json ─────── │ (Claude Code)    │
└──────────┘                      └──────────────┘                           └─────────────────┘
                                        │
                                        ▼
                                  ┌──────────┐
                                  │  SQLite   │
                                  │ (@repo/db)│
                                  └──────────┘
```

## Components

### Frontend — `apps/web` (Next.js 15)
- Fullscreen chat UI (v0)
- Communicates with agent server via WebSocket (streaming) and HTTP (CRUD)
- Shadcn component foundation, TanStack Query for data fetching
- See [ui-principles.md](ui-principles.md) for design constraints

### Agent Server — `apps/server` (Fastify)
- Fastify with `@fastify/websocket` for WebSocket support
- Manages Docker sandbox lifecycle (create, health check, self-heal)
- Invokes Claude Code via `docker sandbox exec` with `--output-format stream-json`
- Parses NDJSON stream, forwards tokens to frontend over WebSocket
- Composes system prompts (soul + agent personality + memory context)
- Persists messages, docs, memory to SQLite via `@repo/db`
- Handles session tracking — stores Claude session IDs, uses `--resume` for continuity

### Docker Sandbox — Claude Code runtime
- Each agent runs in an isolated Docker sandbox
- Auth persists via OAuth, templates enable cloning
- `--permission-mode bypassPermissions` for non-interactive invocation
- `--output-format stream-json` for structured NDJSON streaming
- See [docker-sandbox-claude.md](../docs/_reference/docker-sandbox-claude.md) for operational reference

### Database — `@repo/db` (Drizzle + SQLite)
- Shared between frontend and agent server
- Stores: messages, sessions, documents, memory, agent config, tags
- SQLite for v0 simplicity — sufficient for single-user local deployment

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Agent runtime | Docker sandboxes (not SDK, not raw CLI) | Isolation, auth persistence, template cloning, proven in production |
| Agent server framework | Fastify | Good balance of structure and simplicity, first-class WebSocket support |
| Frontend ↔ Server streaming | WebSocket | Bidirectional, natural fit for chat |
| Frontend ↔ Server CRUD | HTTP (REST) | Standard, simple for session/doc/memory CRUD |
| Database | SQLite via Drizzle | Already in the monorepo, sufficient for v0 single-user |
| Server location in monorepo | `apps/server` | Shares `@repo/db`, runs as separate process |

## v0 Deployment Model

Everything runs locally:
- Next.js dev server (frontend)
- Fastify server (agent server)
- One Docker sandbox (one agent)
- SQLite file on disk
- Turborepo orchestrates all processes in dev

## Future Scaling Path

- **v1:** Multiple sandboxes (one per agent), template cloning for fast agent creation
- **v2:** Agent server becomes a gateway routing to worker machines (Mac Minis), sandboxes distributed across hardware
- **Multi-user:** Agent server adds auth layer, SQLite migrates to Postgres or Turso if needed
