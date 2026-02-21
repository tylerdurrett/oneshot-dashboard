# Feature: Fullscreen Chat with Sessions

**Date:** 2026-02-21
**Status:** Scoped

## Overview

The foundational chat experience for the app. A fullscreen chat interface at `/chat` connected to a Fastify agent server that communicates with Claude Code running in a Docker sandbox. Messages stream in real-time over WebSocket. Conversations persist as threads in SQLite, and users can start new threads, resume previous ones, and browse their thread history. This is v0.0 — the spine that everything else builds on.

## End-User Capabilities

1. Open the app and land in an empty chat, ready to type
2. Send a message and see Claude's response stream in token-by-token in real time
3. Have a multi-turn conversation within a single thread
4. See the current thread's title at the top of the chat (auto-generated from the first user message)
5. Open a thread dropdown to browse previous threads (showing title + timestamp)
6. Select a previous thread to resume it, with full message history loaded
7. Start a new thread via a "+" button in the top-right corner
8. See inline error messages if the sandbox is down or Claude encounters an error (the page never crashes)

## Architecture / Scope

### Frontend — `apps/web`

**Route:** `/chat`

**Layout:**
- Fullscreen — chat fills the entire viewport, no sidebar, no nav
- Full width, with container-query-based scaling of internals (message content width, input area) so lines don't get uncomfortably wide on large screens
- Dark theme
- Custom styled scrollbar (global — subtle, visible on hover, matching dark theme)

**Components:**
- Build on the existing AI Elements components from `@repo/ui` (Conversation, Message, PromptInput)
- Thread title bar at the top with dropdown for thread selection
- "+" new thread button, top-right
- Message list with auto-scroll to bottom on new messages
- Input area at the bottom with submit button
- Input is disabled while Claude is streaming a response
- Messages render markdown (bold, italic, lists, links) and code blocks with syntax highlighting
- Inline error display for backend/sandbox failures

**Data flow:**
- WebSocket connection to the agent server for real-time streaming
- HTTP requests (via TanStack Query) for thread CRUD: list threads, load thread messages, create thread

### Agent Server — `apps/server`

A new Fastify application in the monorepo.

**WebSocket endpoint:** Handles chat streaming
- Receives user messages from the frontend
- Passes them to the Docker sandbox via `docker sandbox exec` with `--output-format stream-json`
- Parses NDJSON stream events (`content_block_delta` for streaming tokens, `result` for final response + session ID)
- Forwards tokens to the frontend over WebSocket as they arrive
- Persists the complete user message and assistant response to SQLite when the response finishes
- Uses `--resume <session_id>` to continue conversations within a thread

**HTTP endpoints:**
- `GET /threads` — list all threads (id, title, timestamp), ordered by most recent
- `GET /threads/:id/messages` — get all messages for a thread
- `POST /threads` — create a new thread (returns thread ID)

**System prompt:** A simple default system prompt for v0.0. No soul doc, no personality, no memory injection yet — those come in later v0 features.

**Docker sandbox management:**
- Assumes one pre-authenticated sandbox exists (developer sets it up manually)
- On startup, probes the sandbox to verify it's alive and authenticated
- If the sandbox is unavailable, logs a clear error with instructions to create/auth it
- Passes `--permission-mode bypassPermissions` and `--output-format stream-json` on every invocation

### Database — `@repo/db`

New Drizzle schema tables:

**threads**
- `id` — primary key (UUID or CUID)
- `title` — string, auto-generated from first user message (truncated)
- `claude_session_id` — string, nullable. The Claude `--resume` session ID for this thread
- `created_at` — timestamp
- `updated_at` — timestamp

**messages**
- `id` — primary key
- `thread_id` — foreign key to threads
- `role` — enum: "user" | "assistant"
- `content` — text (the message body)
- `created_at` — timestamp

### Monorepo Integration

- `apps/server` is a new Turborepo app, sharing `@repo/db`
- In dev, Turborepo runs both the Next.js frontend and Fastify server concurrently
- Both processes share the same SQLite database file

## Technical Details

### Thread Title Generation

When the first user message is sent in a new thread, the title is set to a truncation of that message (e.g. first 60 characters, trimmed to a word boundary). No LLM-generated titles for v0.0 — keep it simple.

### WebSocket Protocol

Frontend ↔ Server messages are JSON:

```
// Client → Server
{ "type": "message", "threadId": "...", "content": "..." }

// Server → Client (streaming token)
{ "type": "token", "text": "..." }

// Server → Client (stream complete)
{ "type": "done", "messageId": "..." }

// Server → Client (error)
{ "type": "error", "message": "..." }
```

### Session Resumption

Each thread maps to a Claude session. When the user resumes a thread:
1. Load messages from SQLite (for display)
2. Use the stored `claude_session_id` with `--resume` to continue the Claude conversation
3. If resume fails (stale session), start a new Claude session for that thread. Claude won't have the prior context, but the user still sees their message history. Log this as a warning.

### Error Handling

- **Sandbox unavailable:** Show an inline error in the chat: "Agent is offline. Check the Docker sandbox."
- **Claude error during streaming:** Show partial response (if any tokens arrived) plus an error indicator. Don't lose what was already streamed.
- **WebSocket disconnect:** Show a connection status indicator. Auto-reconnect with backoff.

## Risks and Considerations

- **Streaming complexity:** Parsing NDJSON from `docker sandbox exec` stdout and forwarding over WebSocket in real-time requires careful stream piping. The reference doc at `docs/_reference/docker-sandbox-claude.md` has proven patterns for this.
- **Session ID staleness:** If the Docker sandbox is recreated, all previous Claude session IDs become invalid. The fallback (start fresh, keep message history) is acceptable for v0.0 but should be surfaced clearly to the developer.
- **SQLite concurrent access:** Both the Next.js app (for TanStack Query SSR, if used) and the Fastify server access the same SQLite file. For v0.0 with one user this is fine, but use WAL mode to avoid locking issues.
- **Container queries:** The AI Elements components may need modification to work well with container-query-based scaling. Test with varying viewport widths.

## Non-Goals / Future Iterations

- Memory system (agent remembering across threads)
- Document system (agent reading/writing docs)
- Agent tools (beyond basic chat)
- Agent birthing / onboarding flow
- File uploads
- Agent selector (only one agent in v0.0)
- Thread deletion or editing
- Thread search
- Message queuing (sending while streaming)
- LLM-generated thread titles
- Mobile optimization (important later, not v0.0)
- Light theme

## Success Criteria

- `/chat` loads a fullscreen chat interface with dark theme and styled scrollbar
- User can type a message and see Claude's response stream in real-time
- Multi-turn conversation works within a thread
- Thread title appears at top, auto-generated from first message
- Thread dropdown shows previous threads with titles and timestamps
- Selecting a previous thread loads its messages and resumes the conversation
- "+" button starts a new empty thread
- Errors from the sandbox display inline without crashing the page
- Agent server starts alongside the frontend via Turborepo
- Messages and threads persist in SQLite across app restarts
