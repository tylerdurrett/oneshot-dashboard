# Version Scoping

## v0 — The Conversation Engine

**After v0, I can:** Chat with my birthed prime agent in a polished fullscreen experience. The agent remembers things, uses tools, and can read/write/search/tag documents. It feels like a real relationship, not a stateless chatbot.

### What's In

- **Fullscreen chat UI** — beautiful, responsive, buttery smooth. The core interaction surface.
- **Agent birthing** — create the prime agent, give it identity/personality.
- **Memory system** — the agent remembers across conversations. At minimum: persistent memory that the agent can write to and recall from.
- **Document system** — light docs stored in the DB. Agent can create, read, update, search, and tag them. This is the knowledge store primitive.
- **Tools** — the agent has baseline capabilities: read/write/search/tag docs, save to memory.
- **Sessions** — start new conversations, resume existing ones, browse previous sessions.
- **File uploads** — the user can upload files for the agent.

### What's Explicitly NOT in v0

- Multiple agents / secondary agent creation
- Schedules or automated agent runs
- Sidebar nav / context view (fullscreen chat only)
- Objective/deliverable system (the progress tracking structure)
- Skills system (custom reusable capabilities)
- Progressive UI unlocking
- Projects, initiatives, roadmaps
- Gamification / trophies

### v0 Success Criteria

You can sit down and have an extended, multi-session conversation with your agent. It knows who you are. It can save ideas, notes, and research as docs. It can find things it saved before. The chat experience feels premium.

---

## v1 — Multi-Agent & Structure (not yet scoped)

Rough direction from planning so far:
- Spinning up secondary agents (research agents, etc.)
- Skills system (reusable capabilities assigned to agents)
- Schedules (agents that run on their own)
- Objective/deliverable system with progress tracking
- Progressive UI unlocking — sidebar, context view, tabs
- The clarity funnel (guided onboarding objectives)

## v2 — Projects & Output (not yet scoped)

Rough direction from planning so far:
- Initiatives and nested projects
- Roadmaps, timelines, Gantt charts
- Brand system (emergent from asset collections + brand guide docs)
- Artifact creation (content, videos, images)
- Agent-to-agent communication
- Multi-user support

---

*v1 and v2 need further planning. See [planning-status.md](planning-status.md) for where to resume.*
