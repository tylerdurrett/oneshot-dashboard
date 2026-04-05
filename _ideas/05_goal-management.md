# Goal Management System

A system for organizing what you're working on, planning when to work on it, and tracking how you spend your time — all connected.

## The Problem

You have goals across different parts of your life (business ventures, personal health, family, creative work). You also have a daily practice of working in timed blocks. Today those blocks aren't connected to anything larger — you track time but can't answer questions like "am I working on the right things?" or "what should I focus on this week?"

You need a system that connects daily work to bigger goals without becoming overhead to maintain.

## Inspiration

This design synthesizes several sources:
- **IAWT (It All Works Together)** — a personal management system built on the principle that every daily task should connect upward to a weekly priority, monthly goal, and yearly trajectory. It uses five life domains, four time layers, and an agent that maintains the system.
- **Agile sprints** — work items live in a permanent backlog (structural) but get pulled into time-boxed sprints (temporal). Linear's cycles work the same way.
- **PARA (Tiago Forte)** — the distinction between Projects (completable) and Areas (ongoing responsibilities).
- **GTD** — the idea that "anything requiring more than one step is a project."

## Three Layers, One Set of Work

The system has three layers that work together. They aren't separate systems — they're different views of the same work.

### 1. Structural Layer — "What am I building and why?"

This is the permanent home for all your work. It answers: what exists, what's the goal, and how does it break down?

```
Domain (what you're building or responsible for — ongoing, never completes)
  └── Goal (a desired outcome with a target date)
       └── Project (a bounded effort that advances a goal — has a "done" condition)
            └── Task (an atomic, checkable action)
```

**Domains** are the big containers — the ventures, relationships, and life areas you're responsible for. Examples: Iterator, V47, Family, Personal. They don't complete. They're maintained.

**Goals** live inside a domain. They're specific outcomes with a "by when." For v1, goals are flat — no nesting. If a goal feels too abstract, it's probably a domain, not a goal. Nesting (goal → sub-goal) is a natural future extension if needed — it's an additive change (one optional parent column), not a redesign.

**Projects** live under goals. They're concrete efforts with a clear finish line. Also flat for v1 — no sub-projects. Same escape hatch applies if needed later. If a project gets too big, split it into two projects under the same goal. Projects are optional (tasks can live directly under goals)

**Tasks** are the leaf nodes. Checkable. Belong to a project (or standalone for one-off work).

**Example:**
```
Iterator (domain)
  └── Ship Iterator MVP by July (goal)
       ├── Build auth system (project)
       │    ├── Design auth flow (task)
       │    └── Write login endpoint (task)
       └── Build video timeline (project)
            └── Frame.io integration (task)

V47 (domain)
  └── $90-110K/mo revenue by June (goal)
       └── Launch video campaign funnel (project)
            ├── Build landing page (task)
            └── Set up performance ads (task)

Personal (domain)
  └── Run a 5K by September (goal)
       └── Couch to 5K program (project)
            └── Week 3 training runs (task)

Family (domain)
  └── Consistent presence with kids (goal)
       └── Weekend activity planning (project)
```

Everything has a **status**: `not_started | active | blocked | waiting | complete | deferred | cancelled`

### 2. Temporal Layer — "What am I doing and when?"

This is the planning rhythm. It doesn't own work — it *references* work from the structural layer and organizes it in time.

```
Period
  - type: year | month | week | day
  - date range
  - narrative or intention
  - references to goals, projects, and tasks in focus
```

Each time scale answers a different question:

| Period | Name | Question it answers |
|--------|------|---------------------|
| Year | Trajectory | Where are we going? |
| Month | Goals | What does this month need to accomplish? |
| Week | Arc | What's this week's story? |
| Day | Schedule | What am I doing right now? |

**The weekly arc** is the most important planning unit. It's not just a list of tasks — it has a *narrative*. A one-line story about what the week is about and how the priorities connect. Example: *"Vision alignment with Tyler, launch LinkedIn content cadence, domain-level progress."*

Creating a weekly arc means: pick 3-5 priorities from your structural backlog, write the story of the week, and break it into daily plans. The daily plans assign tasks to time blocks.

**Periods are lightweight.** A period is a date range, a narrative, and a set of pointers to work items. Work items keep their permanent home in the structural hierarchy. Periods just say "I'm focusing on *these* things during *this* time."

**Carry-forward:** When a period ends, incomplete items don't vanish. They explicitly carry to the next period. Nothing silently drops.

### 3. Cross-Cutting Layer — "How am I spending my time?"

Two concepts cut across both the structural and temporal layers:

**Work Modes** describe *how* you spend time, not *what on*. They're tags, not containers:
- Delivery — executing on promised work
- Promotion — sharing your work, marketing, outreach
- Research — exploring, building new things, learning
- Exercise — physical health
- Personal Dev — soul, relationships, growth

Any task in any domain can be tagged with a work mode. "Write auth endpoint" is Delivery. "Post about Iterator launch" is Promotion. "Research competitor pricing" is Research. All three live in the Iterator domain, but they represent different *types* of work.

**Timer Buckets** are the daily execution surface — timed blocks where you actually do the work. A bucket can link to:
- A **work mode** only: "1hr Research" (applies across all domains)
- A **domain** only: "2hrs Iterator" (any type of work for Iterator)
- **Both**: "3hrs Iterator Delivery" (execution work specifically for Iterator)
- **Neither**: "1hr Deep Work" (you pick tasks manually)

## How the Layers Connect

The three layers answer different questions about the same work:

| Question | Layer | How |
|----------|-------|-----|
| What's the status of Iterator? | Structural | Filter by domain, see goals → projects → tasks |
| What am I doing this week? | Temporal | This week's arc, with its narrative and daily plans |
| Am I working on the right things? | Both | Do this week's tasks trace up to goals that matter? |
| Where did my time go? | Cross-cutting | Timer buckets aggregate up through work modes and domains |
| What's falling through the cracks? | Both | Goals with no tasks in any recent period. Tasks not linked to any goal. |

The **cascade integrity check** (from IAWT) becomes simple questions:
- "Are there tasks in this week's arc that don't connect to any goal?" (orphan work)
- "Are there active goals with no tasks scheduled recently?" (stalled goals)
- "Did I spend time this week on things not in my arc?" (drift)

These don't require AI or automation — they're just views of the data.

## Shared Properties

Every entity in the system (except domains, which are ongoing) shares:

- **Status:** `not_started | active | blocked | waiting | complete | deferred | cancelled`
- **Due date:** optional, but goals should generally have one
- **Tags:** flexible, cross-cutting labels (work modes are a special type of tag)
- **Domain:** which domain this belongs to (inherited down the tree — a task inherits its project's domain)

## What This System Does NOT Do (Yet)

These are powerful capabilities from IAWT that can layer on later without changing the core model:

- **Signal processing** — classifying incoming information (emails, meetings, feedback) as updates, commitments, signals requiring decisions, or noise
- **Evolution logging** — tracking why goals changed over time with full context
- **Agent-driven briefings** — morning briefings, mid-week checks, weekly close-outs
- **Input classification pipeline** — routing real-world information to the right place in the system
- **Automated cascade checks** — an agent that actively flags broken connections

All of these build on top of the structural + temporal + cross-cutting foundation described here. The foundation comes first.

## Summary

One set of work items (Domain → Goal → Project → Task) with two ways to look at them:
1. **Structurally** — what exists and why, organized by life domain
2. **Temporally** — what's in focus and when, organized by time period

Work modes and timer buckets bridge both views, connecting daily execution to the bigger picture.
