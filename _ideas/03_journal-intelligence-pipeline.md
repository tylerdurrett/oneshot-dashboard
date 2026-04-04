# Feature IDEA (REJECTED, IGNORE THIS DOC): Journal Intelligence Pipeline

**Date:** 2026-04-04
**Status:** Scoped

## How We Got Here

The starting point was a simple need: a "home base" for writing — one place to jot ideas without thinking about where they go. The pattern that worked in Notion was a single doc per week with daily headings, just typing stream-of-consciousness under today's date. It worked because the friction was near zero. It failed because over time the doc became an unreadable wall of text with useful nuggets buried in noise.

The first design tried to preserve that one-big-doc feeling while adding intelligence underneath. The idea was a single continuous BlockNote document with auto-inserted day and week headings as temporal landmarks. Behind the scenes, a snapshot/diff pipeline would detect idle periods, compute what changed since the last processing run (a "changeset"), and feed those changes to an LLM for semantic extraction. The changeset — not a section of text — was the "session." This avoided the problem of defining where one session ends and another begins within a single document.

That design was technically sound but had a fundamental tension: the monolithic doc was the *worst* shape for the AI to work with. It required a structural JSON diff engine (microdiff) to figure out which blocks changed, context-window assembly to give the LLM enough surrounding text to understand each change, snapshot storage that grew over time, and re-processing logic for edits to previously-processed regions. All of that machinery existed solely to reconstruct boundaries that didn't exist in the document itself.

The breakthrough was realizing the atomic unit should be a **note**, not a doc. If the content is already broken into discrete pieces, the entire diff/snapshot pipeline disappears. Each note is its own natural unit for AI processing — no diffing, no context assembly, no snapshot storage.

But notes alone risk recreating the old Notion problem of "too many places, too much friction figuring out where to write." The solution is the **feed**. Notes are displayed in a continuous stream — oldest at top, newest at bottom — with slim dividers so it *feels* like one document. Every note is always editable in place, no activation step. You click anywhere and your cursor is there. The experience of "just start typing where I left off" is preserved, but the underlying structure gives the AI clean boundaries to work with.

This also unlocked interactions that weren't possible with a monolithic doc: drag to reorder notes, multi-select and merge, filter the feed by AI-generated tags. The doc becomes a living, manipulable collection rather than a static stream of text.

The key decisions that fell out of this shift:
- **No auto-headings.** They were a band-aid for navigating a monolithic doc. With discrete notes and timestamps, temporal context comes naturally.
- **No snapshot/diff pipeline.** The biggest simplification. Three database tables and a diffing engine replaced by: read the note, send it to the LLM.
- **Docs are note collections.** The journal is a pinned doc (collection) with a fast-path entry point. Additional docs work identically. The "journal vs docs library" distinction is just navigation.
- **The feed UX is the make-or-break.** If the feed doesn't feel fluid — if notes feel like separate cards instead of a continuous document — the whole concept falls apart. Inline editing, minimal dividers, and smooth interactions are not nice-to-haves.

## Overview

Build an AI-powered intelligence layer on top of a note-feed document system. The user writes freely in a stream of discrete notes — each one its own BlockNote editor, displayed in a continuous feed that feels like a single document. Behind the scenes, the system processes individual notes through an LLM to extract semantic fragments and classify them across multiple taxonomies — building a searchable, structured knowledge base without any manual organization. All data is partitioned by workspace, with a default "Personal" workspace out of the box.

## Core Concept: Notes, Not Docs

The original design centered on a single monolithic document with auto-headings and a snapshot/diff pipeline to detect what changed. That approach has been replaced.

A **doc** is now a **collection of notes** displayed as a feed. The journal is the default doc — a fast-path entry point where you tap "Journal" and start typing. Additional docs can be created for other purposes. Each doc is a note feed with the same editing and intelligence capabilities.

A **note** is the atomic unit. It's a discrete piece of content with its own BlockNote editor instance, timestamps, and sort position. Notes are:

- **Individually editable** — click anywhere in any note, your cursor is there. No "open" action. All notes in the feed are live editors.
- **Individually processable** — each note is a natural unit for AI extraction. No diffing or snapshotting needed.
- **Reorderable** — drag to manually reposition. Default sort is chronological (oldest top, newest bottom).
- **Selectable** — cmd/ctrl+click or drag-box to multi-select. Selected notes can be merged into one.
- **Filterable** — filter the feed by tags, date, type, or any taxonomy term.

The slim visual divider between notes is almost invisible — the feed should feel like one continuous document, not a list of cards.

## End-User Capabilities

- Tap "Journal" and immediately start writing in a new note — no file picker, no decisions.
- See recent notes in the feed above, scroll up through history.
- Click into any note to edit it instantly — no activation step.
- Drag notes to reorder them manually.
- Multi-select notes and merge them into one.
- Filter the feed by topics, moods, types, or any taxonomy the AI has populated.
- Create additional docs (note collections) beyond the journal.
- Organize docs in a folder hierarchy.
- Access a knowledge base of extracted goals, concerns, beliefs, and other durable areas the AI maintains from your writing.
- Work across multiple workspaces with hard boundaries.
- The chat agent sees your notes, fragments, and knowledge within the current workspace.

## Architecture

### Note Feed

The feed displays notes oldest-at-top, newest-at-bottom — natural document order. A "new note" button (and potentially keyboard shortcut) appends a fresh empty note at the bottom. The user can also arrive after an idle period and find a fresh note waiting.

Each note renders its own BlockNote editor. All are editable simultaneously — clicking into any note places the cursor there immediately. The visual separation between notes is minimal: a thin divider line, not a card boundary.

**New note triggers:**
- Explicit: "New Note" button or keyboard shortcut.
- Implicit: return after idle timeout — a fresh note appears at the bottom.

**Sort order:**
- Default: chronological by `createdAt` (oldest top, newest bottom).
- Manual: drag a note to reposition it. The note gets a `sortOrder` value that overrides chronological position.
- Manual ordering details (persistence across filters, "playlist" concept) are TBD — to be refined during implementation.

**Multi-select + merge:**
- Cmd/ctrl+click or drag-box to select multiple notes.
- Merge combines selected notes into one, concatenating content in feed order.
- Detailed merge behavior (which timestamps survive, tag handling) is TBD.

### Workspaces

All docs, folders, notes, taxonomies, terms, fragments, and knowledge entries belong to a workspace. Workspaces are hard-partitioned — every query is workspace-scoped by default.

A default "Personal" workspace is created automatically and cannot be deleted. Additional workspaces can be created for clients, projects, or any other domain.

Single-user for now. `workspaceId` on all relevant tables. Multi-user is additive later — no schema changes required.

### Docs (Note Collections)

A doc is a container for notes. The journal is a pinned doc with a privileged nav entry point. The distinction between "journal" and "docs library" is navigation, not data.

The intelligence pipeline runs per-note within any doc where it's enabled (default: on).

### Folders

Docs are organized via a folders table with hierarchical structure (parent references). A doc belongs to at most one folder. Folders are workspace-scoped and always user-managed.

Folders are separate from the taxonomy system — different semantics (single-parent, hierarchical) and different cardinality (one folder per doc via FK vs many-to-many for terms).

### Intelligence Pipeline

**Trigger:** A note is considered ready for processing when:
- The user has been idle on that note for N minutes (configurable, likely 15-30 min).
- The user navigates away from the doc.
- The user creates a new note (implies the previous one is settled).
- Server-side fallback: polls `updatedAt` on notes for cases where the frontend can't fire (tab killed, phone sleep).

**Process:**
1. Read the full note content.
2. Send to LLM for fragment extraction.
3. Store fragments with taxonomy term assignments.
4. Update knowledge base if fragments contain durable knowledge (goals, beliefs, concerns).

**Re-processing:** If a previously-processed note is edited, mark it for re-processing. Old fragments from that note are replaced with new extractions on the next processing run.

No snapshot/diff pipeline needed. Each note IS the atomic unit. The simplification over the original design is significant — no `journal_snapshots` table, no `journal_changesets` table, no structural diffing, no context-window assembly from surrounding blocks.

### Fragment Extraction (LLM)

For each note, an LLM call extracts semantic fragments — distinct ideas, thoughts, or topics.

**Input:**
- The full content of the note (BlockNote blocks converted to readable text).
- The list of all taxonomies and their existing terms for the current workspace.
- Instructions to reuse existing terms when appropriate and create new ones sparingly.

**Output:**
- A list of fragments, each with: a brief title, the relevant text, and suggested terms across all applicable taxonomies.

For short single-topic notes, the fragment may be 1:1 with the note. For longer notes touching multiple topics, the AI splits them into separate fragments. The AI decides.

**Model choice:** Claude Haiku or equivalent. Volume is low (a handful of notes per day), latency is irrelevant (background processing), cost is negligible.

### Taxonomy & Terms System

Classification uses a general-purpose taxonomy/terms system. A taxonomy is a named classification axis. A term is a value within that taxonomy. Notes and fragments can both have terms applied via join tables.

Each taxonomy declares:
- `isHierarchical` — whether terms can have parent/child relationships.
- `isAIManaged` — whether the AI creates and maintains terms (vs user-managed).

**Expected initial taxonomies:**
- **Topic** — AI-managed, optionally hierarchical. Terms: health, career, product-ideas, relationships...
- **Mood** — AI-managed, flat. Terms: reflective, anxious, excited, frustrated...
- **Type** — AI-managed, flat. Terms: goal, concern, belief, idea, question, observation, decision...

Terms are workspace-scoped (inherited through their taxonomy). Periodic LLM-driven consolidation merges near-duplicate terms.

Terms apply at two levels:
- **Note-level** — broad classification of what a note is about.
- **Fragment-level** — granular classification of individual extracted ideas.

### Knowledge Base

Certain fragments map to durable knowledge areas — goals, concerns, beliefs, feelings. When the LLM identifies a fragment as one of these (via the "Type" taxonomy), it upserts a knowledge base entry. If a note containing a goal is deleted or edited to remove it, re-processing updates the knowledge base accordingly.

### Agent Workspace Scoping

The chat agent operates within the current workspace by default. All agent tools (note content, fragments, terms, knowledge) are workspace-scoped. Cross-workspace tools require explicit permission.

## Data Model

**Existing (evolve):**
- `documents` — becomes a container for notes. Add: `title`, `workspaceId` (FK), `folderId` (FK, nullable), `isJournal` (boolean), `pipelineEnabled` (boolean, default true). Remove: `content` (moves to notes).

**New tables:**

**Core:**
- `workspaces` — id, name, icon, color, isDefault (boolean), createdAt, updatedAt
- `notes` — id, documentId (FK), workspaceId (FK), content (JSONB), sortOrder (float), processedAt (nullable), createdAt, updatedAt
- `folders` — id, workspaceId (FK), name, parentId (FK self-ref, nullable), sortOrder, createdAt, updatedAt

**Taxonomy:**
- `taxonomies` — id, workspaceId (FK), name, description, isHierarchical (boolean), isAIManaged (boolean), createdAt
- `terms` — id, taxonomyId (FK), name, parentId (FK self-ref, nullable), sortOrder, createdAt
- `note_terms` — noteId (FK), termId (FK)
- `fragment_terms` — fragmentId (FK), termId (FK)

**Pipeline:**
- `fragments` — id, noteId (FK), workspaceId (FK), title, content, sourceBlockIds, createdAt

**Knowledge:**
- `knowledge` — id, workspaceId (FK), area, content, sourceFragmentId (FK), createdAt, updatedAt

**Workspace scoping:** `workspaceId` is a direct FK on documents, notes, folders, taxonomies, fragments, and knowledge. Terms inherit scope through their taxonomy. All queries filter by workspace.

## Key Decisions

1. **Notes, not a monolithic doc.** The atomic unit is a note — discrete, individually editable, individually processable. The feed feels like one doc but each note is its own entity.
2. **No snapshot/diff pipeline.** Each note is already a natural processing unit. No diffing, no snapshots, no changeset computation. Massive simplification.
3. **Feed UX is the core.** The journal experience is defined by how fluid the feed feels — inline editing, slim dividers, drag to reorder, multi-select. This is the make-or-break UX.
4. **Docs are note collections.** A doc is a container. The journal is a pinned doc. Additional docs work identically.
5. **Workspaces are hard boundaries.** Same as before — data isolation guarantee.
6. **Single-user for now, multi-user ready.** `workspaceId` everywhere.
7. **Taxonomy/terms system, not flat tags.** Multiple classification axes, hierarchy support, AI-managed.
8. **Fragments are the classified unit.** A note may contain multiple topics. The AI splits them into fragments and classifies each.
9. **Taxonomies and terms emerge organically.** The AI builds and maintains terms per workspace.
10. **LLM over embeddings for extraction.** Judgment > similarity at this volume.
11. **Agent is workspace-scoped by default.** Cross-workspace access is explicit.
12. **Feed order: oldest top, newest bottom.** Natural document order.
13. **All notes always editable.** No activation step, no modal switching.

## Implementation Sequence

```
Note feed + note CRUD ─────────────────── (foundation, works today)
         │
Multi-doc + workspaces ──┬── Folders
                         │
Intelligence pipeline ───┤
         │               │
Taxonomy/terms system ───┘
         │
Knowledge base
         │
Agent integration
```

### Phase 1: Note Feed
Evolve the existing single-doc system into a note feed. Create the `notes` table, migrate existing doc content into the first note. Build the feed UI with inline editors, new-note button, and auto-save per note. Build note CRUD APIs.

**Testable:** Open journal, create notes, edit any note inline, see the feed grow. Auto-save works per note.

### Phase 2: Feed Interactions
Add drag-to-reorder, multi-select, and merge. This is the UX polish that makes the feed feel fluid.

**Testable:** Drag notes around, select multiple, merge them. Manual order persists.

### Phase 3: Multi-doc + Workspaces
Add `workspaces` table, seed default "Personal" workspace. Add `title` and `workspaceId` to documents. Build doc CRUD APIs and basic doc list UI. The journal is a pinned doc.

**Testable:** Create multiple docs, switch between them. Each is its own note feed.

### Phase 4: Intelligence Pipeline + Taxonomy
Add `taxonomies`, `terms`, `fragments`, and join tables. Seed initial taxonomies. Build the LLM extraction — feed it a note's content, get back fragments with term assignments. Trigger on idle/navigation.

**Testable:** Write a note, wait for processing, query fragments table. Verify correct extraction and term assignment.

### Phase 5: Folders
Add folders table, build tree UI in doc library. Reparenting, drag-and-drop.

**Testable:** Create folders, move docs around, verify hierarchy.

### Phase 6: Knowledge Base
Add `knowledge` table. Extend extraction to identify durable knowledge and upsert entries.

**Testable:** Write "My goal is to ship the journal feature by end of April." Wait. Check knowledge entry appears under "goals."

### Phase 7: Filtering + Search
Build feed filtering by taxonomy terms, date ranges, text search. Notes remain inline-editable in filtered views.

**Testable:** Filter by topic, see subset of notes, edit one inline.

### Phase 8: Agent Integration
Give the chat agent query access to notes, fragments, terms, and knowledge within the current workspace.

## Risks and Considerations

- **Multiple editor instances** — rendering many BlockNote editors in a feed could be heavy. May need virtualization (only mount editors for visible notes) or lazy initialization (mount editor on click/focus, render static content otherwise).
- **Extraction quality** — bad fragments/terms erode trust. Prompt engineering is critical. Store raw LLM responses for debugging.
- **Re-processing on edit** — if a processed note is edited, old fragments must be replaced. Need to handle this cleanly.
- **Sort order conflicts** — manual reorder + chronological default + filtering creates complexity. Keep it simple initially.
- **Feed performance at scale** — hundreds/thousands of notes need pagination or virtual scrolling.
- **Merge is destructive** — merging notes should probably be undoable (or at least confirmable).
- **Workspace switching UX** — needs to feel lightweight.
- **Taxonomy proliferation** — guardrails on term/taxonomy count.

## Non-Goals (This Iteration)

- Multi-user / shared workspaces — schema ready, not building yet.
- Embedding-based search — useful later for "find similar" queries.
- Agent write access to notes — API design accommodates it, built separately.
- Cross-workspace agent tools — deferred.
- User-created taxonomies — initially AI-managed only.
- Detailed merge UX — basic merge first, refinements later.
- Drag-reorder persistence across filters ("playlists") — TBD.

## Open Questions

- Exact idle timeout duration for note processing (15 min? 30 min? configurable?)
- Which knowledge areas to extract initially (goals, concerns, beliefs — others?)
- Should the user be able to see/correct extracted fragments and terms, or fully hands-off?
- Term consolidation frequency and trigger
- Editor virtualization strategy — when does it become necessary?
- Workspace switcher UX
- Should initial taxonomies be seeded per workspace or created organically on first extraction?
- How does the "new note on return from idle" feel in practice? Does it need a visual transition?
