# Feature: Doc System v1 — Multi-Doc, Auto-Tagging, Folders

**Date:** 2026-04-04
**Status:** Scoped

## Overview

Evolve the existing single-doc BlockNote editor into a multi-doc system with a taxonomy/terms classification system, on-idle AI processing that incrementally tags documents via block-level diffing, and folder organization. A `workspaceId` column exists on all tables for future partitioning, but workspace management is not in scope — everything lives in a single auto-seeded default workspace.

## End-User Capabilities

1. Create multiple docs with titles. Switch between them.
2. Tap "Journal" to open a pinned doc instantly — no file picker.
3. Browse docs in a library view. Organize them into folders.
4. After going idle or leaving a doc, the system automatically assigns tags across multiple taxonomies (topic, mood, type) — only processing what changed.
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

**Block-level incremental processing:**

Rather than reprocessing the entire doc on every change, the system uses block-level content hashing to process only what changed. BlockNote gives every block a stable ID. On each processing run:

1. Hash each block's content.
2. Compare against stored hashes from the last processing run (`document_block_states` table).
3. **New blocks** (no stored hash) → send to the agent for extraction.
4. **Changed blocks** (hash mismatch) → delete old fragments for those blocks, re-extract.
5. **Unchanged blocks** → skip entirely. Existing fragments and terms stay untouched.
6. **Deleted blocks** (stored hash but block gone from doc) → delete associated fragments and terms.

This solves two problems at once:
- **No waste:** only the delta goes to the AI. A one-sentence edit doesn't reprocess a 5,000-token doc.
- **No tag flicker:** unchanged content keeps its tags permanently. The AI never gets a chance to reclassify stable content differently across runs.

**Agent-based processing, not a single LLM call:**

Processing is handled by a Claude Code agent invocation, not a raw API call. The agent receives the changed blocks and the doc's metadata (taxonomy list, existing terms), but also has tools to read additional context from the doc if needed. This means we don't have to perfectly engineer the context window upfront — the agent can pull surrounding blocks, read the full doc, or check other docs in the workspace if it judges that's necessary for accurate classification.

**Re-processing:** Only changed blocks are reprocessed. Fragments are linked to source block IDs. When a block changes, only its fragments are replaced. Everything else is stable.

**Model choice:** Claude Code (same model the chat agent uses). Low volume, background processing, cost is negligible.

**Future: full changeset diffs.** Block-level hashing solves "what needs reprocessing" but doesn't capture "what happened in this session as a narrative." Full snapshot/changeset diffs (preserved in the vision doc) serve a different purpose — session summarization, activity timelines. They can be layered on top of block hashing later without changing how tagging works. The two approaches are complementary, not competing.

### Fragments

Fragments are the sub-doc classified unit. A single doc might cover 3 topics — the AI splits them into separate searchable fragments, each with its own term assignments.

Fragments are linked to their source block IDs. This is what enables incremental processing — when a block changes, the system knows exactly which fragments to delete and re-extract.

For short single-topic content, the fragment may be 1:1 with the block. For longer blocks touching multiple topics, the AI splits them. The AI decides.

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
- `document_block_states` — documentId (FK), blockId (text), contentHash (text), processedAt (timestamp)
- `fragments` — id, documentId (FK), workspaceId (FK), title, content (text), sourceBlockIds (text[]), createdAt

## Implementation Sequence

### Phase 1: Multi-Doc
- Create `workspaces` table (minimal), seed default workspace on first run.
- Add `title`, `workspaceId`, `isJournal`, `pipelineEnabled`, `processedAt` to `documents`.
- Migrate existing default doc: give it a title, assign to default workspace, mark as journal.
- Build doc CRUD APIs (create, list, read, update, delete).
- Build doc list UI in the docs area. Journal remains the pinned fast-path entry.

**Testable:** Create multiple docs, give them titles, switch between them. Journal still works as before.

### Phase 2: Taxonomy/Terms + On-Idle Processing
- Create `taxonomies`, `terms`, `fragments`, `document_block_states`, `document_terms`, `fragment_terms` tables.
- Seed initial taxonomies (Topic, Mood, Type) in the default workspace.
- Build the on-idle processing trigger (frontend idle detection + server endpoint).
- Build block-level hashing and diff logic.
- Build the Claude Code agent invocation for extraction: pass changed blocks + taxonomy/term list, agent has tools to read more context if needed.
- Store fragments with source block IDs and term associations.
- Update `document_block_states` with new hashes after processing.

**Testable:** Write in a doc, go idle, check the database. Fragments and terms should appear for the new/changed blocks. Edit one block, go idle again — only that block's fragments should change. Everything else stays stable.

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

1. **Block-level incremental processing.** Content hashing per block, not whole-doc reprocessing. Only changed blocks go to the AI. Unchanged content keeps its tags permanently — no flicker.
2. **Agent-based extraction, not a raw LLM call.** Claude Code agent with tools to read additional context as needed. We don't have to perfectly engineer the context window — the agent has judgment and can pull more information.
3. **Full changeset diffs remain additive.** Block hashing and full changesets serve different purposes (incremental tagging vs session narrative). They can be layered together later without conflict.
4. **workspaceId on everything, but no workspace features.** The column is there. A default workspace is seeded. That's it. Workspace management comes later.
5. **Taxonomy/terms, not flat tags.** Proper system with named taxonomies, hierarchy support, AI-managed flag. Worth the small upfront cost to avoid retrofitting.
6. **Folders separate from taxonomies.** Different cardinality, different management model. Keep them separate.
7. **Journal is a pinned doc.** Same table, same editor, same pipeline. Navigation gives it special treatment.
8. **Fragments linked to source blocks.** Enables incremental processing — when a block changes, the system knows exactly which fragments to replace.

## Risks and Considerations

- **Extraction quality** — bad tags erode trust. Start simple (just topic assignment), iterate on the prompt. Store raw agent responses for debugging.
- **Block ID stability** — the system depends on BlockNote block IDs being stable across saves. If BlockNote regenerates IDs (e.g., on paste or certain operations), the hash comparison breaks and triggers unnecessary reprocessing. Needs validation during Phase 2.
- **Agent cost at scale** — a Claude Code agent invocation is heavier than a Haiku API call. At personal journal volume this is fine, but worth monitoring if usage patterns change.
- **Folder + tag interaction** — users may expect folders and tags to work together in filtering (show me docs in "Work" folder tagged "urgent"). Make sure the query layer supports this.

## Non-Goals (This Iteration)

- Workspace management UI / multi-workspace features — column exists, features deferred.
- Full snapshot/changeset pipeline — block hashing handles incremental tagging; session-level summarization deferred.
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
- Should processing trigger on every idle or only when `document_block_states` shows changes?
- How to handle the journal doc's special status in the doc list — always pinned at top? separate section?
- Term consolidation — when and how to merge near-duplicate terms?
- How much context should the agent receive by default vs pull on-demand via tools?

## Related

- Vision doc with full design history and future approaches: `_ideas/04_journal-intelligence-vision.md`
- Original journal concept notes: `_ideas/02_journal-concept.human.md`
- Rejected notes-as-atoms approach: `_ideas/03_journal-intelligence-pipeline.md`
