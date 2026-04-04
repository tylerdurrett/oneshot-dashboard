# Journal Intelligence Pipeline — Vision & Design History

**Date:** 2026-04-04
**Status:** Vision (not a build spec — see `_tasks/_planning/2026-04-04_doc-system-v1/` for what we're actually building)

## Purpose of This Document

This captures the full design exploration for the journal intelligence pipeline. Multiple approaches were considered and refined through conversation. The pragmatic first build is scoped separately — this document preserves the thinking, rejected alternatives, and future vision so nothing is lost.

## Starting Point

The need: a "home base" for writing — one place to jot ideas without thinking about where they go. The pattern that worked in Notion was a single doc per week with daily headings, typing stream-of-consciousness under today's date. It worked because friction was near zero. It failed because over time useful nuggets got buried in noise with no way to surface them.

## Approach 1: Monolithic Doc + Snapshot/Diff Pipeline (Rejected)

The first design preserved the one-big-doc feeling with intelligence underneath. A single continuous BlockNote document with auto-inserted day/week headings as temporal landmarks. Behind the scenes:

- **Idle detection** triggers a processing run.
- **Snapshot** captures the current doc state.
- **Structural diff** (microdiff) compares against the last-processed snapshot to find changed blocks.
- **Changesets** — the delta between two snapshots — become the "session." Not a section of text, but what changed between two processing runs.
- **LLM extraction** receives the full content of changed blocks plus 2-3 surrounding blocks for context, producing semantic fragments with taxonomy terms.

This avoided the problem of defining session boundaries within a monolithic doc. A changeset captured everything: new paragraphs at the bottom, edits to old text, deletions. The LLM always got full blocks with context, not raw diff tokens.

**Why it was sound:**
- The diff-as-session concept was clean. No visible session boundaries, no user decisions about "which session does this belong to."
- Context assembly (changed blocks + N surrounding blocks, merged when adjacent) gave the LLM enough to understand meaning even for small edits.
- Cost was negligible — typical changeset is 3,500-7,000 tokens at most.

**Why it was set aside (not rejected outright):**
- The diff/snapshot machinery existed solely to reconstruct boundaries that didn't exist in the document. If we're going to build intelligence, maybe start simpler and add this complexity only when needed.
- For the pragmatic first build, sending the whole doc to the LLM for tagging is simpler and good enough at personal journal scale.
- The diff approach remains a valid optimization for later — when docs grow large enough that processing the whole thing is wasteful.

**Data model this would have required:**
- `journal_snapshots` — id, documentId, content (JSONB), capturedAt, processedAt
- `journal_changesets` — id, documentId, snapshotBeforeId, snapshotAfterId, diff (JSONB), summary, createdAt, processedAt

### Key technical details (preserved for future reference)

**Diffing:** Two-pass approach. Microdiff on the block array identifies which blocks changed. jsdiff's `diffWords()` on individual block text content for feeding to the AI summarizer. Only run text diff on blocks microdiff flagged.

**Context assembly:** For each touched block, include N blocks before and after (2-3). Adjacent changed blocks merge into one context window. Deletions include the block content from the previous snapshot. The LLM sees sections like:
```
Section 1 (block 47 modified):
[block 45 - context]
[block 46 - context]
[block 47 - changed]
[block 48 - context]
```

**Libraries considered:** microdiff (~1KB, fast structural JSON diff), diff/jsdiff (Myers algorithm, ~15KB, `diffWords()` for text), fast-diff (character-level, used by ProseMirror internally).

## Approach 2: Notes as Atoms + Feed UX (Explored, Deferred)

A later evolution proposed that the atomic unit should be a **note**, not a doc. The entire diff/snapshot pipeline disappears because each note is its own processing unit.

**The concept:** A doc becomes a collection of notes displayed as a continuous feed. Oldest at top, newest at bottom, slim dividers, all editable inline. "Just start typing where I left off" preserved, but the AI gets clean boundaries for free.

**What it would unlock:**
- Drag to reorder notes
- Multi-select and merge
- Filter the feed by AI-generated tags
- Per-note processing — no diffing needed

**Why it was deferred:**
- The "feels like one doc" requirement demands seamless keyboard navigation across editor instances (arrow from one note into the next). This is doable but non-trivial and fragile.
- Multiple simultaneous BlockNote/ProseMirror instances is performance-heavy. Would need lazy initialization (static HTML until focused, mount real editor on click). Changes the UX promise of "all notes always editable."
- Implicit new-note creation (on idle return) felt presumptuous in practice — the user might want to continue the previous note.
- The full concept is a significant build. Better to live in the simpler system first and let real usage friction guide whether notes-as-atoms is the right evolution.

**This approach may be revisited** after using the multi-doc system in practice. The feed UX ideas (inline editing, filtering, reordering) are strong — the question is whether the implementation complexity is justified by real needs.

## Approach 3: Pragmatic First Build (What We're Actually Doing)

Multi-doc system with workspaces, taxonomies, and simple on-idle LLM processing of whole docs. No diffing, no snapshots, no notes-as-atoms. Build it, use it, let friction guide the next layer.

See `_tasks/_planning/2026-04-04_doc-system-v1/` for the scoped feature description.

## Design Decisions That Hold Across All Approaches

These emerged from the exploration and apply regardless of which approach is used:

### Workspaces are hard boundaries
All docs, folders, tags, fragments, and knowledge belong to a workspace. No implicit cross-workspace data access. A default "Personal" workspace is auto-created. Single-user for now; multi-user is additive later (add users + workspace_members tables, no schema refactor).

### Taxonomy/terms system, not flat tags
A proper system of named taxonomies (Topic, Mood, Type, etc.) with terms. Each taxonomy declares whether it's hierarchical and whether it's AI-managed. Terms are workspace-scoped. This replaces any flat tags approach.

### Folders are separate from taxonomies
Different semantics (single-parent, hierarchical, user-managed) and different cardinality (one folder per doc via FK vs many-to-many for terms). A dedicated `folders` table with parent references for performant reparenting.

### Fragments, not docs, are the classified unit
A single writing session might touch 3 topics. The AI splits the content into separate searchable fragments and classifies each across all taxonomies. A fragment links back to its source (doc, note, or changeset depending on approach).

### Tags emerge organically
The AI creates and maintains terms per workspace. No predefined taxonomy. Periodic LLM-driven consolidation merges near-duplicates. The user never manually manages tags.

### LLM over embeddings for extraction
At personal journal volume, LLM extraction is essentially free and provides judgment that embeddings can't (distinguishing a goal from an observation about the same topic). Embeddings may be useful later for "find similar" search.

### Knowledge base entries are durable extractions
Goals, concerns, beliefs, feelings — extracted from fragments, linked back to source, updated when source changes. Workspace-scoped. The "Type" taxonomy drives which fragments become knowledge entries.

### Agent is workspace-scoped by default
Cross-workspace access requires explicit permission per-conversation or per-query.

### Journal is a pinned doc, not a separate feature
The journal is a doc with a privileged nav entry point. Same editor, same pipeline, same data as any other doc. The "journal vs docs library" distinction is navigation, not architecture.

## Open Questions (Across All Approaches)

- Which knowledge areas to extract initially (goals, concerns, beliefs — others?)
- Should the user be able to see/correct extracted fragments and terms, or fully hands-off?
- Term consolidation frequency and trigger
- Journal as a single forever-doc or periodic fresh starts?
- Workspace switcher UX — nav rail icon? dropdown?
- Should initial taxonomies be seeded per workspace or created organically on first extraction?
- When does the notes-as-atoms approach become worth the complexity?
- At what doc size does whole-doc processing become wasteful and diff-based processing become necessary?
