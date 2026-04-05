I want to incorporate memory into my chat system, and maybe my docs system.

We're at the early research phase of how this might work.

I did some research about how openclaw does it. See the docs here:
docs/research

I wrote up some early notes here (take these with a grain of salt):
_ideas/memory.human.md

This file from the docs/research folder (docs/research/karpathy-llm-wiki.md) is specifically about building a wiki from a growing knowledgebase.

So, please read all those sources, and look through the codebase to understand our current docs and chat system.

Please also look at what's available to us in terms of running hooks at various stages of the sandboxed claude code session lifecycle.

Help me gain some clarity around these ideas.

I want a growing knowledgebase wiki to act as a form of crystalized memory.
I also want some episodic memory from chats (and maybe even episodic memory from doc diffs).

Get up to speed, then let's discuss.
---
What You Have Today
Chat system: Threads + messages stored in Postgres. Session resumption via claudeSessionId. The agent sees: soul file (CLAUDE.md), MCP tools (timers + docs), and the current conversation. Zero memory across conversations — each thread is an island.

Docs system: BlockNote JSONB snapshots in Postgres. Markdown conversion exists. Auto-titling via Gemini. No versioning, no diffs, no change history. The pipelineEnabled / processedAt schema fields exist but are unused — they were designed for exactly this kind of future processing.

Sandbox: Docker-isolated. Agent only sees workspace/. Communicates via MCP over HTTP. No Claude Agent SDK hooks — you're spawning docker sandbox exec claude directly. There's no pre-compaction flush hook, no session-end hook, no lifecycle events from the SDK.

The Two Memory Types You Want
1. Crystallized Memory (Wiki / Knowledgebase)
This is the Karpathy pattern. A persistent, growing set of interlinked markdown files that represent synthesized knowledge — not raw conversation logs, but distilled understanding.

Where it could live: workspace/wiki/ (agent-accessible in sandbox) or a dedicated table in Postgres with markdown files generated as artifacts.

How it grows: After conversations, a process extracts salient facts/decisions/preferences and either creates new wiki pages or updates existing ones. The wiki has an index.md and cross-references.

How the agent uses it: At conversation start, relevant wiki pages are retrieved (via search) and injected into context. This is the "memory recall" step OpenClaw puts in their system prompt.

2. Episodic Memory (Conversation Summaries + Doc Diffs)
Raw-ish records of what happened, organized chronologically.

Chat episodes: Post-conversation summaries — what was discussed, what was decided, what the user cared about. Like OpenClaw's daily logs.

Doc episodes: Diffs between document versions — what changed, when, potentially why (inferred from nearby chat context). This requires adding some form of versioning to the doc system.

Key Architecture Questions
Here's where I think the real decisions are:

A. When does memory get written?
OpenClaw has three write paths:

Agent writes directly during conversation (via memory_search/memory_get tools)
Pre-compaction flush — a silent agentic turn before context compaction that dumps important context to disk
Post-conversation processing — after the conversation ends
Your constraint: You don't have SDK hooks for pre-compaction flush. Your invocation is docker sandbox exec claude -p "..." --output-format stream-json. You get streaming tokens out, then it's done. No mid-session lifecycle events.

Options:

MCP tools for in-conversation writes: Add memory_save and memory_search MCP tools. The agent can write memories during conversation. This is the simplest path and doesn't require SDK hooks.
Post-conversation processing: After invokeClaude() completes and you have the full assistant response, run a separate LLM call to extract memories. This is where Gemini (which you already use for auto-titling) could do extraction.
Session transcript processing: You already store all messages in Postgres. A background job could periodically process recent conversations for memory extraction.
Pre-compaction flush would require either switching to the Claude Agent SDK (which has hooks) or accepting you'll lose some context from very long conversations. For now, I'd say this is fine to skip — most of your chat interactions seem focused (timer management, doc queries), not marathon sessions.

B. Where does memory physically live?
Two camps:

File-first (OpenClaw/Karpathy pattern): Markdown files on disk. Human-readable, git-trackable, the agent reads them directly. The workspace/ directory is already mounted in the sandbox.

DB-first: Memory entries in Postgres with full-text search and/or vector embeddings. More structured, easier to query, but the agent needs MCP tools to access it.

My read: You probably want both. Wiki pages as markdown files (in workspace/wiki/ or similar), with a search index in Postgres or SQLite. The agent reads/writes files; the index is a derived artifact for search.

C. How does the agent find relevant memories?
Three approaches in order of complexity:

Keyword/full-text search — Postgres tsvector or SQLite FTS5. Simple, no external dependencies.
Hybrid search — BM25 + vector embeddings (OpenClaw's approach: 0.7 vector + 0.3 text). Requires an embedding provider.
Always-loaded context — Small enough memory set that you just inject it all (like OpenClaw's MEMORY.md bootstrap). Works until memory gets large.
For starting simple, I'd suggest: always inject a small MEMORY.md summary into the soul file, plus a memory_search MCP tool for deeper recall.

D. Doc diffs as episodic memory — how?
You'd need to:

Store document snapshots or diffs (content versioning)
Process changes to extract meaningful "episodes" (what changed and why)
Feed those into the memory system
The pipelineEnabled / processedAt fields in your schema were designed for exactly this. A pipeline could: detect content changes → compute diff → summarize the diff → write an episodic memory entry.

The simplest version: store the previous content JSONB on each save, compute a text diff, and log it.

Suggested Starting Point
Based on your notes ("start simple: OpenClaw style"), here's what I'd build first:

Add memory_save and memory_search MCP tools — the agent can write and read memories during conversation
Markdown files in workspace/memory/ — daily logs + curated MEMORY.md, agent-readable in sandbox
Post-conversation extraction — after each chat run completes, run a Gemini call to extract key facts/decisions from the conversation and append them to today's daily log
Inject MEMORY.md into soul file — at session start, the agent gets a curated summary of long-term memories
Full-text search via Postgres — index memory files, expose via memory_search MCP tool
Skip for now: vector embeddings, pre-compaction flush, doc diffs, hierarchical memory. Layer those on once the basics work.
---
Can I gain access to claude code hooks while still using the subscription (NOT API TOKENS)?
---
Yes, hooks work with subscription auth. They're a local CLI feature, independent of authentication method.

But there's a nuance for your architecture that matters more than auth:

Hooks Inside the Sandbox
You're spawning docker sandbox exec claude -p "..." --output-format stream-json. Claude Code runs inside the sandbox. So hooks configured there would also run inside the sandbox.

You already inject:

Soul file → /home/agent/.claude/CLAUDE.md
MCP config → workspace/.mcp.json
You could additionally inject:

Settings with hooks → workspace/.claude/settings.json or /home/agent/.claude/settings.json
The relevant hook events for memory:

Hook	When	Useful for
PreCompact	Before context compaction	Saving state before memory loss
PostCompact / SessionStart (matcher: compact)	After compaction	Re-injecting critical context
Stop	After each response	Per-turn memory extraction
SessionEnd	Session terminates	Final memory flush
The Critical Limitation
Hooks don't receive conversation content. They get metadata on stdin — session_id, hook_event_name, tool_name, etc. A PreCompact hook knows compaction is about to happen, but it can't read what's in the context window.

This means you can't do what OpenClaw does (a silent agentic turn that writes memories before compaction) purely via shell-command hooks.

However, hooks also support type: "agent" — which spawns a subagent with tool access, and type: "prompt" — which makes an LLM call. These run within the Claude Code session context. A PreCompact hook of type prompt or agent might be able to trigger memory extraction, since it runs as part of the session.

What This Means for Your Architecture
You have two viable paths:

Path A: Lean into hooks (inside sandbox)
Inject a .claude/settings.json with PreCompact and Stop hooks
Use type: "agent" or type: "prompt" hooks to trigger memory extraction within the session
Hook scripts write to workspace/memory/ (agent-accessible)
This is closer to the OpenClaw model
Path B: Server-side post-processing (what you already have the infrastructure for)
You already capture every message in Postgres
After invokeClaude() completes, run a Gemini call (you already have the integration for auto-titling) to extract memories from the full thread
Write results to workspace/memory/ or a memories table
No hooks needed — your server orchestrates everything
My recommendation: Combine both
In-conversation: Add memory_save and memory_search MCP tools. Instruct the agent in the soul file to save important things as they come up. This is the simplest, most reliable path.
Post-conversation: Server-side extraction via Gemini after each chat run. You already have the messages, the Gemini integration, and the pipeline fields in the schema.
Pre-compaction (optional, later): Once you validate the above works, add a PreCompact hook of type prompt that tells the agent to dump key context to memory files before compaction hits.
The hooks are a nice enhancement, but the MCP tools + server-side processing give you 90% of the value without needing to figure out hook behavior inside a Docker sandbox.