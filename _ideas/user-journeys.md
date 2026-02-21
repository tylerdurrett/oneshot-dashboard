# User Journeys

## Journey 1: First Run — Birth the Prime Agent

**Version:** v0

### The Experience

You open the app for the first time. There's no dashboard, no sidebar, no tabs. Just a fullscreen chat.

Your prime agent introduces itself. This is your homeslice — the root agent from which all others descend. Right now, it has one job: get to know you.

The agent has a built-in objective sequence: "Get to Know Each Other." This is a structured set of sub-objectives, each with required and optional fields:

1. **Build a user bio** — name, age, location, partner, kids, job. The agent draws this out conversationally — you don't fill in a form. Required fields must be answered; optional fields earn bonus progress.
2. **Understand your values and life goals** — what do you want out of life? What matters to you? The agent genuinely wants to know and will ask follow-ups.
3. **Define the agent's identity** — how do you want your agent to be? This produces a self-identity doc that appends to the immutable soul doc. Again, required and optional fields, filled through conversation.

Each sub-objective can be fulfilled opportunistically — if you mention your kids while talking about life goals, that field gets filled in without the agent needing to ask later.

As sub-objectives complete, you see progress advance. When the full "Get to Know Each Other" objective completes, there's a satisfying moment — a dopamine hit, maybe a badge or trophy.

Then the system transitions: what's next? You might get a choice of paths, or the agent suggests the next objective based on what it's learned about you. The UI begins to unlock — tabs appear, the context view opens up. The system grows with you.

### What This Reveals About the System

- **Progressive disclosure** — UI complexity unlocks as you advance, not all at once.
- **Objectives drive the experience** — the onboarding isn't special-cased; it uses the same objective/deliverable system that powers everything else.
- **Conversational data gathering** — agents extract structured data from natural conversation, not forms.
- **Agents can have built-in objective sequences** — pre-authored flows that guide interaction.
- **Progress and rewards** — completing objectives feels good and is visually tracked.

### Open Questions

- What preset paths should exist for the onboarding objective? (Life goals track, business track, etc.)
- How does the trophy/badge system work? Is it lightweight or a full gamification layer?

---

## Journey 2: The Clarity Funnel — From Self to Initiative

**Version:** v0–v1

### The Experience

After birthing the bot, you move through a guided clarity-building process. Each stage is an objective sequence that produces deliverables feeding the next stage. The system is guiding you — not presenting a blank canvas.

**Stage 1: Clarify Self** — Deepen understanding of what you want in life, in career, in whatever matters. This forms the bedrock — values, intent, hopes, dreams. Every future idea must be compatible with this foundation. This may be a lengthy objective sequence, but only one pass is needed to advance. Future passes bring more introspection, more clarity, more trophies — and hopefully a human with clearer vision.

**Stage 2: Career Goals** *(or whatever track applies — the system is prompt-programmable)* — The agent teases out career-specific goals and context. Some of this may already be filled in from earlier conversations (opportunistic completion). Key pieces of information get extracted and structured.

**Stage 3: Refine into Initiatives** — Move from broad goals to specific ideas. The human might be prescriptive ("I want to build a business around agentic engineering") or exploratory. Either way, we're converging on 1-3 **initiatives** — big bets, each potentially containing many sub-projects (marketing site, YouTube channel, the app itself, ads, taxes, etc.). Each initiative is essentially a business-scale endeavor.

**Stage 4: Research Before Committing** — The system doesn't let you just jump into an initiative blind. It suggests setting up a research program — understand the landscape, competition, opportunities. This is where the human gets their first chance to spin up a **second agent**: a research agent with a specific goal, tools, and a schedule or one-off task. This is the moment the system goes from "chat app" to "agent management system."

### The Clarity Funnel (summary)

```
Know each other → Clarify self → Career goals → Initiatives → Research → Execute
```

Each stage:
- Uses the same objective system
- Produces deliverables that feed the next stage
- Can be revisited and deepened over time
- Is prompt-programmable (different users, different tracks)

### What This Reveals About the System

- **The system is a mentor, not a tool** — it guides you toward clarity, not just task completion.
- **"Initiative" as a concept** — a top-level, business-scale work container (1-3 per person). Potentially the name for the big nestable work structure, with objectives nested inside.
- **Spinning up agent #2 is a key UX milestone** — deserves careful design. The transition from single-agent chat to multi-agent management.
- **Research before execution** — the system's bias is toward informed decision-making, not rushing to build.

### Open Questions

- What does the "spin up a second agent" flow look like? (UI, configuration, what you see)
- How do initiatives relate to the primitive list? Is "Initiative" its own primitive, or a top-level Objective?
- How much of the clarity funnel is built-in vs. prompt-authored?
