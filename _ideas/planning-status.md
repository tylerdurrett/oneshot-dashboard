# Planning Status

## What's Done

| Document | Status | Notes |
|---|---|---|
| [vision.md](vision.md) | Solid | One-liner, core tension, 8 principles. Unlikely to change much. |
| [domain-model.md](domain-model.md) | Working draft | Core primitives identified. Goal vs Objective split established. Open questions remain. |
| [ui-principles.md](ui-principles.md) | Solid | Layout paradigm, chat panel, performance, component philosophy, feature design workflow. |
| [user-journeys.md](user-journeys.md) | Two journeys drafted | Birth the agent + clarity funnel. More journeys needed for v1+. |
| [versions.md](versions.md) | v0 scoped, v1/v2 rough | v0 is actionable. v1 and v2 need the planning process to continue. |
| [architecture.md](architecture.md) | v0 decided | Fastify agent server, Docker sandboxes, WebSocket streaming, SQLite. Scaling path outlined. |
| [initial-concept.md](initial-concept.md) | Reference | Original braindump. Still full of ideas not yet captured in other docs. |

## v0 Is Ready to Execute

v0 scope is clear: fullscreen chat + agent with memory, tools, and doc read/write/search/tag. See [versions.md](versions.md) for full scope.

An early UI prototype task is already in progress at `_tasks/_planning/2026-02-21_prototype-area-chat-ui/`.

## Where to Resume Planning (v1+)

When you're ready to continue the concept-to-spec pipeline, pick up here:

1. **User Journey: Spinning up agent #2** — What does the flow look like? What UI changes? How does the system transition from single-agent chat to multi-agent management?

2. **Memory system deep dive** — The domain model lists Memory as a primitive, but its internal structure (daily/weekly/monthly/forever layers, personal vs shared, vector search) needs its own design pass.

3. **Objective system design** — The nestable goal/deliverable structure is one of the most important primitives. Needs naming, detailed modeling, and a user journey showing how it feels in practice.

4. **Information architecture** — Once we have more journeys, map out the full set of screens/pages, navigation, and how the context view evolves beyond fullscreen chat.

5. **Domain model refinement** — Revisit open questions (see bottom of domain-model.md). Especially: relationship between Project and Objective, taxonomy design, memory granularity.

6. **Feature specs for v1** — Once the above are resolved, write buildable specs for each v1 feature.

## Process Reference

See [concept-spec-pipeline.md](../docs/concept-spec-pipeline.md) (if created) or the conversation history for the full 6-step pipeline:
Vision → Domain Model → User Journeys → Information Architecture → Version Scoping → Feature Specs
