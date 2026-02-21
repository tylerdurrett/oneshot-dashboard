# Domain Model — Working Draft

## Design Philosophy

Build composable primitives. Let higher-level concepts (brands, roadmaps, research libraries, idea pipelines) emerge from how primitives are combined. Only add convenience layers when a pattern proves itself in practice.

## Core Primitives

- **Agent** — an entity that does work. Has identity, personality, soul/context, memory, skills, and configuration (autonomy level, schedule).
- **Goal** — directional intent. Appears at many levels — personal, project, agent, system.
- **Project** — nestable container for work. Can contain sub-projects. Has goals, tasks, schedules, status.
- **Document** — unit of knowledge or content. Covers notes, guides, specs, research summaries, etc.
- **Asset** — a file or external resource (images, fonts, code, etc.).
- **Collection** — a way to group any of the above.
- **Memory** — time-hierarchical record of what's happened. Has personal (per-agent) and shared dimensions, with daily/weekly/monthly/forever layers.
- **Skill** — a reusable capability assigned to agents.
- **Schedule** — defines when something should happen.
- **Person** — a human in the system.

## Cross-Cutting Capabilities

- **Taxonomy / Tagging** — the mechanism for categorizing and grouping things across the system. Enables collections, filtering, and emergent higher-level concepts.
- **Goal** also behaves cross-cuttingly — it's a primitive, but it attaches to many other primitives (projects, agents, the system itself).

## Concept Layers

These aren't objects to build — they're lenses for thinking about what the system does:

| Layer | What it's about | Primitives involved |
|---|---|---|
| **Direction** | Why are we doing this? | Goals, Documents (vision/strategy docs) |
| **Knowledge** | What do we know? | Documents, Assets, Collections, Memory |
| **Work** | What are we doing? | Projects, Schedules, Goals |
| **Agents** | Who does it? | Agents, Skills, Memory, Schedules |
| **Output** | What gets made? | Assets, Documents, Collections |

## Emergent Concepts (composed from primitives, not built separately)

- **Brand** — a Collection of Assets + a Document (brand guide) + Context fed to agents during creation.
- **Roadmap** — Goals + Projects + Schedules, viewed together.
- **Research Library** — a Collection of Documents produced by research agents.
- **Idea Pipeline** — Documents (ideas) with status/taxonomy, moving through stages.
- **Knowledge Base** — Documents + Memory + taxonomy, searchable.

## Open Questions

- Where exactly does "goal" land — its own object, a property on other objects, or both?
- How do People relate to Agents? (People direct agents, but agents also have "user files" about people)
- What's the right granularity for Memory as a primitive vs. a subsystem with its own internal structure?
- Taxonomy: flat tags, hierarchical categories, or something else?
