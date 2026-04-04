# Feature: Doc System v1 — Multi-Doc, Auto-Tagging, Folders

**Date:** 2026-04-04
**Status:** Scoped

## Overview

Evolve the existing single-doc BlockNote editor into a multi-doc system with a taxonomy/terms classification system, on-idle AI processing that automatically tags documents, and folder organization. A `workspaceId` column exists on all tables for future partitioning, but workspace management is not in scope — everything lives in a single auto-seeded default workspace.

## End-User Capabilities

1. Create multiple docs with titles. Switch between them.
2. Tap "Journal" to open a pinned doc instantly — no file picker.
3. Browse docs in a library view. Organize them into folders.
4. After going idle or leaving a doc, the system automatically assigns tags across multiple taxonomies (topic, mood, type).
5. Filter and search docs by AI-assigned tags.

## Architecture

### Multi-Doc

The existing `documents` table evolves to support multiple docs with titles. Each doc is a BlockNote editor with JSONB content, same as today. The journal is a pinned doc (`isJournal: true`) with a fast-path nav entry point. Additional docs are accessed through a library view.

### Workspace Column (Schema Only)

All new tables include a `workspaceId` FK pointing to a `workspaces` table. A single default workspace is auto-seeded on first run. There is no workspace CRUD, no switcher UI, no multi-workspace features — just the column so the schema doesn't need a retrofit when workspaces become a real feature later.

### Folders

A `folders` table with proper hierarchical structure (parent references). A doc belongs to at most one folder via direct FK. Performant reparenting — moving a folder updates one `parentId`. Folders are user-managed.

Folders are separate from the taxonomy system. Different semantics (single-parent, hierarchical, always user-managed) and different cardinality (one folder per doc) vs taxonomies (many-to-many, AI-managed).

### Taxonomy & Terms

A general-purpose classification system. A **taxonomy** is a named classification axis. A **term** is a value within that taxonomy.

Each taxonomy declares:
- `isHierarchical` — whether terms can have parent/child relationships.
- `isAIManaged` — whether the AI creates and maintains terms (vs user-managed).

**Initial taxonomies (seeded with default workspace):**
- **Topic** — AI-managed, optionally hierarchical. Terms emerge from content: health, career, product-ideas...
- **Mood** — AI-managed, flat. Terms: reflective, anxious, excited...
- **Type** — AI-managed, flat. Terms: goal, concern, belief, idea, question, observation, decision...

Docs and fragments can both have terms applied via join tables.

### On-Idle Processing

**Trigger:** Idle detection (configurable, likely 30-60 min) or navigating away from the doc. Frontend detects and pings the server. Server-side fallback polls `updatedAt` for cases where frontend can't fire (tab killed, phone sleep).

**Process (start simple):**
1. Read the full doc content.
2. Send to LLM with the taxonomy list and existing terms.
3. LLM returns: tag assignments for the doc, and optionally extracted fragments with per-fragment tags.
4. Store results.

Start with whole-doc processing. If docs grow large enough that this is wasteful, add diff-based processing later (the vision doc preserves that design).

**Re-processing:** If a doc is edited after processing, mark it dirty. Next idle trigger re-processes. Old fragment/term associations are replaced.

**Model choice:** Claude Code (same model the chat agent uses). Low volume, background processing, cost is negligible.

### Fragments

Fragments are the sub-doc classified unit. A single doc might cover 3 topics — the AI splits them into separate searchable fragments, each with its own term assignments.

For v1, fragments are extracted during the same on-idle processing call. The LLM decides how to split the content. Short single-topic docs may produce one fragment identical to the doc. Longer docs produce multiple.

### Agent Access

The chat agent already exists. In this phase, it gains read access to doc content and taxonomy terms. This is additive API surface on the existing chat system.

## Data Model

**Existing (evolve):**
- `documents` — add: `title` (text), `workspaceId` (FK), `folderId` (FK, nullable), `isJournal` (boolean, default false), `pipelineEnabled` (boolean, default true), `processedAt` (timestamp, nullable)

**New tables:**

**Core:**
- `workspaces` — id, name, isDefault (boolean), createdAt, updatedAt *(minimal — just enough to be an FK target; icon/color added when workspace management is built)*
- `folders` — id, workspaceId (FK), name, parentId (FK self-ref, nullable), sortOrder (float), createdAt, updatedAt

**Taxonomy:**
- `taxonomies` — id, workspaceId (FK), name, description (nullable), isHierarchical (boolean), isAIManaged (boolean), createdAt
- `terms` — id, taxonomyId (FK), name, parentId (FK self-ref, nullable), sortOrder (float), createdAt
- `document_terms` — documentId (FK), termId (FK)
- `fragment_terms` — fragmentId (FK), termId (FK)

**Pipeline:**
- `fragments` — id, documentId (FK), workspaceId (FK), title, content (text), createdAt

## Implementation Sequence

### Phase 1: Multi-Doc
- Create `workspaces` table (minimal), seed default workspace on first run.
- Add `title`, `workspaceId`, `isJournal`, `pipelineEnabled`, `processedAt` to `documents`.
- Migrate existing default doc: give it a title, assign to default workspace, mark as journal.
- Build doc CRUD APIs (create, list, read, update, delete).
- Build doc list UI in the docs area. Journal remains the pinned fast-path entry.

**Testable:** Create multiple docs, give them titles, switch between them. Journal still works as before.

### Phase 2: Taxonomy/Terms + On-Idle Processing
- Create `taxonomies`, `terms`, `fragments`, `document_terms`, `fragment_terms` tables.
- Seed initial taxonomies (Topic, Mood, Type) in the default workspace.
- Build the on-idle processing trigger (frontend idle detection + server endpoint).
- Build the LLM extraction call: send doc content + taxonomy/term list, receive fragment + term assignments.
- Store fragments and term associations.

**Testable:** Write in a doc, go idle, check the database. Fragments and terms should appear. Verify the AI produced reasonable classifications.

### Phase 3: Tag Filtering + Search
- Build UI to display assigned terms on docs (tag chips, sidebar, etc.).
- Build doc list filtering by terms — click a topic to see matching docs.
- Build text search across docs.
- Consider a taxonomy/term browser view.

**Testable:** Filter docs by "career" topic, see the right docs. Search for a phrase, find the doc containing it.

### Phase 4: Folders
- Create `folders` table. Add `folderId` to documents.
- Build folder CRUD APIs.
- Build folder tree UI in doc library — create, rename, reparent, drag-and-drop.

**Testable:** Create folders, move docs into them, rearrange the hierarchy.

## Key Decisions

1. **Start with whole-doc processing, not diffs.** At personal journal scale, sending the full doc to the LLM is simple and cheap. Add diff-based processing only if docs grow large enough to need it.
2. **workspaceId on everything, but no workspace features.** The column is there. A default workspace is seeded. That's it. Workspace management comes later.
3. **Taxonomy/terms, not flat tags.** Proper system with named taxonomies, hierarchy support, AI-managed flag. Worth the small upfront cost to avoid retrofitting.
4. **Folders separate from taxonomies.** Different cardinality, different management model. Keep them separate.
5. **Journal is a pinned doc.** Same table, same editor, same pipeline. Navigation gives it special treatment.
6. **Fragments extracted during processing.** The AI decides how to split doc content. One call per doc, not a separate pipeline.

## Risks and Considerations

- **Extraction quality** — bad tags erode trust. Start simple (just topic assignment), iterate on the prompt. Store raw LLM responses for debugging.
- **Re-processing churn** — editing a doc triggers re-processing, which replaces all fragments/terms. If the AI is inconsistent across runs, tags may flicker. Consider only re-processing if content changed significantly.
- **Whole-doc processing limits** — works fine for typical journal entries (hundreds to low thousands of tokens). Will become wasteful if docs grow to tens of thousands of tokens. The diff-based approach is the escape hatch (preserved in the vision doc).
- **Folder + tag interaction** — users may expect folders and tags to work together in filtering (show me docs in "Work" folder tagged "urgent"). Make sure the query layer supports this.

## Non-Goals (This Iteration)

- Workspace management UI / multi-workspace features — column exists, features deferred.
- Snapshot/diff pipeline — preserved in vision doc, add when needed.
- Notes-as-atoms / feed UX — significant complexity, deferred until real usage shows it's needed.
- Knowledge base extraction (goals, beliefs, concerns) — build after basic tagging proves useful.
- Agent write access to docs — read access only for now.
- Cross-workspace agent tools.
- Multi-user / shared workspaces.
- Embedding-based search.
- Auto-headings — dropped. Let usage show if temporal landmarks are needed.

## Open Questions

- Idle timeout duration (30 min? 60 min?)
- How to display tags in the doc editor UI — inline chips? sidebar panel? both?
- Should processing run on every save or truly only on idle?
- How to handle the journal doc's special status in the doc list — always pinned at top? separate section?
- Term consolidation — when and how to merge near-duplicate terms?

## Related

- Vision doc with full design history and future approaches: `_ideas/04_journal-intelligence-vision.md`
- Original journal concept notes: `_ideas/02_journal-concept.human.md`
- Rejected notes-as-atoms approach: `_ideas/03_journal-intelligence-pipeline.md`
