# Dev Cycle

One Shot includes a structured workflow for building larger features. For quick fixes and small changes, just make them directly. For anything bigger, the dev cycle keeps you organized.

## The Idea

Features move through stages, tracked by folders in `_tasks/`:

```
_tasks/
├── _goals/              ← High-level project goals
├── _ideas/              ← Feature ideas (haven't been scoped yet)
├── _planning/           ← Being scoped and planned
├── _ready-to-start/     ← Planned and ready for implementation
├── _in-progress/        ← Currently being built
├── _complete/           ← Done
├── _icebox/             ← Shelved for later
└── _abandoned/          ← Not happening
```

Each feature gets its own folder (like `2026-02-19_user-auth/`) containing a feature description and an implementation guide. Moving the folder between status directories is how you track progress.

## The Stages

### 1. Scope

Start with an idea and turn it into a clear feature description. Ask Claude Code:

> "I want to add user authentication. Help me scope it out."

This creates a feature description document in `_tasks/_planning/your-feature/`. It captures what the feature does, who it's for, and what "done" looks like.

### 2. Plan

Turn the feature description into a step-by-step implementation guide:

> "Create an implementation plan for the auth feature."

The guide breaks the feature into small, manageable phases — each with specific tasks, acceptance criteria, and testing steps. This is the roadmap your agent follows during implementation.

### 3. Build

Work through the implementation guide section by section. The agent implements each part, runs tests, and checks off completed tasks:

> "Start working on the auth feature."

Or if you want to go section-by-section:

> "Do the next section of the auth implementation guide."

### 4. Complete

Once all tasks are checked off and documentation is updated, the feature moves to `_complete/`.

## Using It Day-to-Day

You don't have to memorize any of this. Just tell Claude Code what you want:

- **"Start a new feature for X"** — kicks off scoping
- **"What features are in progress?"** — shows current status
- **"Continue working on X"** — picks up where you left off
- **"Shelve the X feature for now"** — moves it to the icebox

The agent reads the `_tasks/` folder to understand where everything stands and guides you through the next step.

## Automation Scripts

For fully automated feature development (no human in the loop), two shell scripts orchestrate the process:

- **`dev-cycle.sh`** — Takes a feature from its current stage all the way to completion
- **`ralph.sh`** — Iteratively implements an entire plan, section by section

These are power tools. For most people, working interactively with Claude Code through the stages above is the way to go.

## When to Use the Dev Cycle

| Situation | Approach |
| --- | --- |
| Fix a typo | Just fix it |
| Add a small feature (< 1 hour) | Build it directly |
| Add a medium feature (1-4 hours) | Consider the dev cycle |
| Add a large feature (4+ hours) | Definitely use the dev cycle |
| Multi-session project | Use the dev cycle — it preserves context between sessions |
