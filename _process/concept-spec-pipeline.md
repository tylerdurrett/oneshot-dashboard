# Concept → Spec Pipeline

### 1. Vision & Principles Document
What: Distill the why and the non-negotiable values into a short doc. What is this system fundamentally? What design principles guide every decision?

Why it matters: When you're deep in feature decisions later, you need a north star to resolve conflicts. "Should agents auto-act or always ask?" — your principles doc answers that.

Artifact: vision.md — half a page, max.

### 2. Domain Model
What: Identify every core object in your system and how they relate. You've already started this — agents, projects, memories, skills, schedules, docs, brands. But right now they're scattered across the concept doc. This step pulls them out, names them precisely, and maps their relationships.

Why it matters: This is the skeleton everything else hangs on. Getting the nouns right early prevents massive rework later. It also forces you to resolve ambiguities — e.g., is a "schedule" a property of an agent, or its own entity that gets assigned?

Artifact: domain-model.md — entities, their attributes, and relationships.

### 3. User Journey Mapping
What: Write out 3-5 concrete "day in the life" narratives. Not abstract user stories — actual walkthroughs. "I wake up, open the dashboard, see X. I click Y. An agent has prepared Z overnight..."

Why it matters: This is where you discover what the system actually feels like to use. It forces you to think about the flow between screens, what information you need when, and where the friction points are. It also naturally surfaces what's v0 vs v2 — if a journey step requires 6 subsystems, it's not v0.

Artifact: user-journeys.md — narrative walkthroughs, annotated with which version each part belongs to.

### 4. Information Architecture & Wireframes
What: Based on the journeys, define the screens/pages, what's on each, and how you navigate between them. This can be rough — text descriptions or ASCII layouts, not pixel-perfect mockups.

Why it matters: You said yourself: "How do I want the work/UI to look? What pages in this dashboard?" This is where that gets answered. It also grounds the abstract domain model in something tangible.

Artifact: screens.md — page inventory, rough layouts, navigation flow.

### 5. Version Scoping
What: Take everything from steps 1-4 and draw hard lines. v0 is X and only X. v1 adds Y. v2 adds Z. Each version should be a coherent, usable product — not just a random feature bucket.

Why it matters: You've started this, but it's still fuzzy ("v1 we get... ..."). This step makes it crisp. Each version gets an explicit goal statement: "After v0, I can _____."

Artifact: versions.md — version goals, included features, explicit exclusions.

### 6. Feature Specifications
What: For each feature in the current version scope, write a spec: what it does, how the user interacts with it, edge cases, acceptance criteria. This is where you get granular.

Why it matters: This is what agents actually build from. A spec like "agent can chat" isn't buildable. "Agent has a chat interface with message history, supports markdown, agent responds via Claude Code CLI with a system prompt composed of soul.md + agent personality + recent memory" — that's buildable.

Artifact: One doc per feature in _tasks/_planning/.

## The Process in Practice
You don't have to do all of this linearly. Steps 1-3 inform each other and you'll bounce between them. But the key insight is: each step narrows the funnel. Vision is wide, domain model is structural, journeys are experiential, screens are concrete, versions are scoped, specs are precise.