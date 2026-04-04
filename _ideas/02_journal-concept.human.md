I want to start planning a new feature for this app.

The goal of this app is to essentially be my hub for managing myself.

What I want to build will be essentially a markdown doc editor with agent-assist. I'll get into more detail about it below.

So far I have timers (which will evolve) and an agent chat.

The UI will be updated to accommodate different areas.
---
## App Areas Navigation

### Mobile: Bottom Sheet Switcher
The bottom nav becomes context-sensitive. Each "app area" (Timers, Journal, Chat) gets its own set of nav items. A persistent switcher icon on the far right of the bottom nav opens a bottom sheet to switch between areas.

Bottom nav shows 3-4 items relevant to the current area, plus the area switcher icon (far right)
Tapping the switcher opens a bottom sheet listing all available areas with icons
Selecting an area swaps the bottom nav items and navigates to that area's default route
Swipe navigation continues to work within each area's pages

### Desktop: Rail + Sidebar
A narrow icon rail on the far left shows areas (Timers, Journal, Chat). Clicking an area reveals that area's pages in a wider sidebar to its right. Main content fills the remaining space.

Rail is always visible — serves as the desktop equivalent of the mobile area switcher
Each area gets its own sidebar content (timer nav items, session history, thread list, etc.)
Scales to future areas (Goals, Calendar) without crowding
Same mental model as mobile, different form factor
DECISION: Rail + Sidebar on desktop, Bottom Sheet Switcher on mobile. Same area concept, responsive implementation.
---
But now I want to talk about the doc editing experience.

I currently use Notion.
After many iterations of different approaches, often with different pages or databases for different things I was working on, I ended up with a particular pattern for my daily journals and note taking.

I found that if I have too many differnt pages and places to add notes, that I spend too much effort trying to figure out where to write something. And sometimes that friction would be enough to make me lose the idea before getting it down or just not feel like putting it down. It also makes me feel disorganized (ironically because everything was carefully organized) and like I couldn't find anything (again ironic because it had intentional organization around it).

I've come to realize I need/want a place that feels like "home base".
I need a place I am one click away from where I can jot an idea.
If the idea is good maybe it gets saved elsewhere later.
But as it is, I have essentially a single database in Notion with my "weekly notes". Each week gets one new doc. I copy a few things from last week's doc like goals and mantras. Then I type a heading for "Monday" and add some todos and thoughts as they come up.
At least I know if I have an idea or something that I'm going to just put it there.

So that kind of works, but I think I'm getting whispers of an AI-assisted version of that.

It might work like this:
I go to my homebase "journal" when I want to add a note. I don't need to manually worry about it being in "this week's doc" or under today's heading because the system can figure that out.
When I go there, I essentially see the last thing I was writing about (or maybe an AI summary of what the last session was about).
I can scroll up to see the previous sessions (either whole or summaries only, perhaps I can toggle between views)
Days get auto-headings
Weeks get auto-headings, but I can infinitely scroll UP.

After I stop typing or leave, eventually a background process kicks in and summarizes a given session.
A knowledgebase is updated.
Key areas are updated: what are my current goals? concerns? feelings? beliefs? (I'll want to figure out which areas to cover)
So my ongoing notebook builds a searchable knowledgebase automatically.
There will probably be other views of this info
But importantly there's always the home base "start writing" view that always feels like I'm adding to whatever I did before.

The chat agent will need to be able to see all this. on desktop I see this being perhaps some organizational left nav stuff to the left, document center, chat right. The agent can read whatever I've written. Recently, in this sessions, but it also has access to the entirety of the knowledge base. I can chat with it about what I am writing, freely going back and forth between chat and writing, and it always gets the correct context. How that actually works will need to be figured out and refined.

Eventually I'll be adding in a goal, project, task, etc management portion with calendars etc, and the agent will be able to assist in taking my notes and translating them into tasks etc.

I presumably do still want the ability to save files in a hierarchical kind of folder system, but that needs to be in addition to the "just go here to start writing" part. I might want some amount of agent-managed organization too so it's not on me to do the hierarchy. And while hierarchies are nice, tags of different taxonomies are maybe even better since hierarchies are more limited and often things belong in multiple places. A hierarchy is basically choosing one implicit taxonomy - am I wrong? But maybe I still want folders in addition to tags. This part is fuzzy.

Initially I thought I might use .md files in the filesystem because it's quick and because some existing memory systems like QMD work with native .md files to build their memories. I don't know if that makes the most sense, though. I'm open to ideas.

This is a lot, but I'm looking for direction about what to consider next. How will I store this stuff - filesystem or db. What will that look like. Let's discuss.
---
Storage: DB vs Filesystem
Strong recommendation: SQLite (your existing Drizzle setup), not .md files. Here's why this fits your specific design:

What your journal needs that a DB handles well
Infinite scroll with sessions — You want to open the journal and see your last session, then scroll up through history. That's a paginated query (ORDER BY createdAt DESC LIMIT 20 OFFSET ...). With files you'd be reading/parsing an ever-growing markdown file or managing hundreds of small files.

Auto-headings for days/weeks — These are just grouping queries on timestamps. The DB has this for free. With files you'd need to either split by week (back to your Notion problem of "which file?") or parse one big file.

Background summarization — You want sessions to get summarized after you leave. A sessions table with a summary column and a summarizedAt timestamp is clean. A background job queries for unsummarized sessions. With files you'd need some index to track what's been processed.

Knowledgebase extraction — Goals, concerns, beliefs — these are structured data derived from unstructured writing. They belong in their own tables, linked back to the source sessions.

Tags over hierarchy — You said it yourself: tags > folders because things belong in multiple places. A DB with a join table (entry_tags) is the natural model. Filesystem hierarchy forces you into one taxonomy.

Agent access — Your chat agent already reads from SQLite. Giving it access to journal content is just another query, no file I/O parsing needed.

Where .md files have an edge (and how to get it anyway)
The QMD/memory-system argument is real — some tools expect .md files. But you can always export from DB to .md when needed. Store in DB as the source of truth, generate files for any tool that needs them. That's a one-way sync that's easy to build.

Proposed Data Model (sketch)

journal_sessions
  id, content (markdown text), startedAt, endedAt,
  summary, summarizedAt

journal_tags
  id, name, taxonomy (e.g. "topic", "area", "mood")

journal_session_tags
  sessionId, tagId

journal_knowledge
  id, area (e.g. "goals", "concerns", "beliefs"),
  content, extractedFromSessionId, createdAt, updatedAt
The key insight: a "session" is your atomic unit, not a day or a week. You sit down, write, leave — that's one session. Days and weeks are just views grouped by timestamp. This matches your "I see what I was last writing" mental model exactly.

What to think about next
The editor itself — You don't have a markdown editor yet (only rendering via Streamdown for chat). You'll need something like Tiptap, Milkdown, or BlockNote. This is a big choice that affects the whole feel. I'd suggest we evaluate those before anything else since the editor dictates a lot of the UX.

App Areas / Bottom Sheet Switcher — This is a prerequisite infrastructure change. The current nav is a flat list. You need the area-switching concept before adding Docs as a new area. Should this come first?

Session boundaries — How does the system know a "session" ended? Timer-based (5 min idle)? Explicit "done" action? App backgrounded on mobile? This affects the summarization pipeline.

Agent integration depth — The chat agent can read journal content, but can it write to the journal? Could you dictate to the agent and have it add an entry? That changes the data flow.
---
DECISION:
We're using BlockNote for the journal editor. It's built on Tiptap/ProseMirror and gives us a Notion-style block editor out of the box — slash commands, drag-and-drop blocks, formatting toolbar, dark theme support. The free tier (MPL-2.0) covers everything we need. Content is stored as JSON blocks in SQLite, which is lossless and easy to query. Markdown export is available (lossy, but fine for feeding the agent/knowledgebase since we never need to import it back). Bundle size is ~357KB gzipped — heavier than alternatives but acceptable for a personal PWA. Other candidates considered: Tiptap (too much UI to build yourself), MDXEditor (single maintainer, no slash commands, mobile bugs), Lexical (a framework, not an editor — way too much custom work).
---
OKAY - we implemented a very simple BlockNotes editor, just one doc filling the page to test it out.
---
Let's talk about how we can separate out sessions automatically.
Maybe it's as simple as me needing to manually do something to indicate new session.
Like if we detect "=======" then what follows is a new session
I'm not sure.
Originally I imagined it would be automatic based on time, and that could still be the way.
But I have to be careful, too, because I actually want it to FEEL like a big doc, not like a string of separate sessions.
I'm okay with session divisions, but what happens if I tap up a few times on the keyboard (into a previous session) and edit - does that become part of today's session?
Not sure yet.
But the goal of sessions comes back to the way I use Notion.
I create a big doc and add a Day heading and go to town. New doc each week.
I want to automate some of that, but I also want the AI to be able to look at my changes for a session and:
- Add tags in various taxonomies
- Chunk and vectorize (doesn't require individual sessions)
- Update knowledge/beliefs in knowledgebase
Help me think through this.
Maybe it gets dynamically "sessionified" as needed.
For example, let's say I go idle for an hour and that kicks in a processing workflow behind the scenes. Instead of trying to treat a particular segment of text as a session, what if it looks at a diff of what changed - total. Then that diff is what we consider the session changes.
Let's discuss.
---
Your instinct about the diff-based approach is the right one. Here's why, and how I'd think about it:

The "One Big Doc" model is correct
You keep coming back to wanting it to feel like one continuous document — and that's exactly what you should build. Right now you already have a single documents table with one default doc and a JSONB content column. That's actually close to the right foundation.

Don't try to make sessions a first-class editing concept. The moment you split the editor into visible session boundaries, you've recreated the Notion problem — "where does this thought go?" Instead:

Sessions are a background processing concept, not a UI concept
Here's the model I'd suggest:

What you see: One infinite doc. You open it, your cursor is at the bottom, you type. You can scroll up. Day headings and week headings are injected automatically based on timestamps (more on this below). It feels like one long document.

What happens behind the scenes:

Every save already captures a snapshot (your current debounced auto-save at 1500ms does this).
When you go idle (say 30-60 min, configurable), a background job wakes up.
It diffs the current doc content against the last-processed snapshot.
That diff — "here's what changed since we last looked" — is the "session." It's not a segment of the doc, it's a changeset.
The changeset gets processed: summarized, tagged, knowledge extracted.
The snapshot is marked as processed.
This means:

If you edit old text 3 paragraphs up, that's captured in the diff. No confusion about "which session owns that paragraph."
If you write for 5 minutes, leave for 2 hours, come back and write more — that's two sessions (two processing runs), but you never saw a boundary.
The doc itself has no session markers. Sessions exist only in a journal_snapshots or journal_changesets table.
Auto-headings: simpler than you think
Day/week headings don't need to be "sessions." They're just blocks the system inserts into the doc content.

When you open the journal and start typing:

Check if the first block from today already exists. If not, insert an H2 with today's date before your cursor position.
Same logic for week headings (H1 on Monday or first entry of the week).
These are real blocks in the BlockNote content array — you can edit or delete them if you want.
This keeps the "one doc" feel while giving you temporal landmarks to scroll through.

Proposed data model evolution
Your current documents table stays as-is for the doc content. Add:


journal_snapshots
  id, documentId, content (JSONB), capturedAt, processedAt

journal_changesets  
  id, documentId, snapshotBeforeId, snapshotAfterId,
  diff (JSONB), summary, createdAt, processedAt

journal_tags
  id, name, taxonomy

journal_changeset_tags
  changesetId, tagId

journal_knowledge
  id, area, content, sourceChangesetId, createdAt, updatedAt
The key shift from the earlier sketch: sessions → changesets. The atomic unit isn't "a stretch of text" — it's "what you changed between two processing runs."

What to figure out next
Idle detection — Frontend detects no edits for N minutes, pings the server to trigger processing. Or the server polls updatedAt on the document. The frontend approach is simpler and more accurate.

Day/week heading injection — Small feature, high impact. Could be the first thing to build since it transforms the "one doc" experience immediately.

Snapshot + diff pipeline — The background processing system. This is the core infrastructure for everything else (tags, summaries, knowledge).

What "knowledge areas" to extract — You mentioned goals, concerns, feelings, beliefs. This is a product design question more than a technical one. Start with 2-3 areas and expand.
---

For your case: BlockNote JSON blocks
Your doc content is stored as a JSONB array of blocks, not raw text. So you have two layers to think about:

1. Structural diff (JSON/tree level)
json-diff-ts or microdiff — these compare two JSON objects/arrays and produce a changeset of additions, removals, and modifications. Microdiff is tiny (~1KB) and fast.

This tells you: "block 14 was added, block 7's text content changed, block 3 was deleted." That's probably what you want for the processing pipeline — you care about which blocks changed, not character-level edits within a paragraph.


import diff from "microdiff"

const changes = diff(snapshotBefore, snapshotAfter)
// [{ type: "CHANGE", path: [7, "content", 0, "text"], oldValue: "...", value: "..." },
//  { type: "CREATE", path: [14], value: { type: "paragraph", ... } }]
2. Text diff (within a block's content)
If you also want to know what changed inside a paragraph (for summarization — "user added a sentence about X"), the classic algorithm is Myers diff — the same one git diff uses. It finds the minimum edit distance between two strings.

Libraries:

diff (aka jsdiff) — the standard. diffWords() or diffSentences() are more useful than diffChars() for your use case. Battle-tested, ~15KB.
fast-diff — character-level only but very fast. Used internally by Quill/ProseMirror for operational transforms.
What I'd recommend for your pipeline
Two-pass approach:

Microdiff on the full block array — identifies which blocks were added/removed/changed. This is your "what happened" overview. Cheap, fast.
jsdiff's diffWords() on changed blocks' text content only — gives you the actual text changes for feeding to the AI summarizer. Only run this on blocks that microdiff flagged as changed.
This is performant because you're never diffing the entire document text — you're diffing a JSON array (fast), then selectively diffing only the individual paragraphs that changed (small strings).

The algorithms under the hood
Myers (1986) — O(ND) where N is input length and D is edit distance. Fast when changes are small relative to document size (your typical case — you wrote a few paragraphs, not rewrote everything). This is what diff and git use.
Patience diff — a variant that produces more human-readable diffs by anchoring on unique lines. git diff --patience uses this. Less relevant for your block-level approach.
JSON-specific — tree diffing is technically O(n^3) for arbitrary trees, but BlockNote's flat block array makes it O(n) with a simple linear scan (which is what microdiff does).
Storage consideration
Store the diff as JSONB in your journal_changesets table, not the full snapshot. A microdiff output is tiny compared to the full doc. You only need to store full snapshots at processing boundaries — not every auto-save.
---
Originally I had conceived of a system that could, for example, automatically tag a section of text because that would have been considered an "entry" aka "session". However, now we're talking about changesets really being what constitute a session.
Now I want to think about - what am I tagging, if anything? 
I want structured/searchable journaling to ermerge from a mostly sequential and/or unstructured journing process through the AI layer. 
People build huge obsidian databases with hierarchies of pages with tags. I don't want to manually create the hierarchies or tags, but I do want some amount of structure to emerge. 
Let's discuss.
---
This is a really interesting design tension. Let me think through it with you.

What you're actually producing
You write in a single continuous doc. The system periodically snapshots and diffs. So the raw material for the AI layer is changesets — "here's what Tyler added/changed between 2pm and 5pm on Tuesday."

A changeset isn't a topical unit though. In one sitting you might jot down a grocery reminder, reflect on a career goal, and brainstorm a feature idea. Tagging the changeset as a whole would be like tagging a page of a physical notebook — too coarse.

The unit that matters: extracted fragments
What if the AI processing step doesn't just summarize the changeset, but breaks it into semantic fragments?

A changeset comes in: "Tyler wrote 4 new paragraphs and edited 1 existing one." The AI reads the changed content and produces:

Fragment 1: "Considering switching to a standing desk" → tagged health, workspace
Fragment 2: "Feature idea: timer buckets should support recurring schedules" → tagged product-ideas, timers
Fragment 3: "Feeling stuck on the journal design" → tagged reflection, journal
Each fragment is a row in a table, linked back to the changeset (and therefore to a time range and the actual blocks in the doc). You never created these fragments or chose these tags — the AI extracted them.

Tags emerge from content, not from you
The tag taxonomy doesn't need to be predefined. The AI can:

Look at existing tags in the system
Reuse them when they fit
Create new ones when nothing fits
Periodically consolidate (merge "product-idea" and "product-ideas", notice "health" and "fitness" overlap)
You'd start with zero tags. After a month of journaling, you'd have an organically grown taxonomy that reflects what you actually think about — not what you planned to think about.

What this gives you
Search: "What have I written about career goals?" → query fragments tagged career + goals
Patterns over time: "You've mentioned sleep quality 12 times in the last 3 weeks, mostly negatively"
Knowledge base updates: Fragments tagged belief or goal feed into the knowledge areas you mentioned
Agent context: The chat agent can pull relevant fragments when you're discussing a topic, not just raw doc text
The question back to you
Does this match your intuition? The key idea is:

You interact with one big doc. Zero structure required.
The system extracts fragments, tags them, and builds structure behind the scenes.
Views (search, knowledge areas, tag clouds, timelines) are windows into the emergent structure — you consume it, you don't maintain it.
Or do you feel like you'd want some manual control — like pinning a tag, correcting a bad extraction, starring an important fragment?

I think this is exactly what I'm looking for.
My next question is - how do we extract semantic fragments?
Two options, and they're not mutually exclusive:

Option 1: LLM extraction (the obvious one)
Feed the changeset diff to Claude with a prompt like:

Here's what the user wrote/changed. Extract distinct semantic fragments. For each, provide: a brief title, the relevant text, and suggested tags. Here are the existing tags in the system: [list]. Reuse when appropriate, create new ones sparingly.

This is flexible, handles nuance well ("feeling stuck on journal design" is both a reflection and about the journal feature), and can match existing tags intelligently. It's also the only option that can extract meaning — like detecting that something is a goal vs an observation vs a complaint.

Cost/latency: A changeset from a typical writing session is maybe 500-2000 tokens of input. Claude Haiku could handle this for fractions of a cent per run. Since it's background processing (you've already left or gone idle), latency doesn't matter. You could batch multiple changesets too.

Option 2: Embedding-based clustering (cheaper, dumber)
Split changed text into chunks (by paragraph or block), embed each one, and cluster against existing fragments by vector similarity. If a new paragraph is close to existing "health" fragments, tag it "health."

This is cheaper at scale but can't do the nuanced work — it won't identify that something is a goal vs a concern about the same topic. It also can't create meaningful new tags, only match existing ones.

My recommendation
LLM extraction is the right choice here. The reasons:

Volume is low. You're writing a personal journal, not processing a firehose. Maybe 2-5 changesets per day. At Haiku prices that's essentially free.
Quality matters more than cost. Bad tags are worse than no tags — if the structure that emerges doesn't feel right, you'll stop trusting it.
You need judgment, not just similarity. "I should really start running again" and "I ran 3 miles today" are both about running but one is a goal and the other is a log entry. Only an LLM catches that distinction.
Tag consolidation also needs an LLM. Periodically reviewing the tag taxonomy and merging/cleaning — that's a judgment call.
Embeddings could be useful later for search ("find things similar to this fragment") but not for the extraction step itself.

The practical shape
The processing pipeline for a changeset would be:

Diff → identify changed/added blocks
Extract → LLM call: "here are the changes, here are existing tags, produce fragments"
Store → fragments table with text, tags, source changeset ID, timestamp
Optionally update knowledge areas → if a fragment looks like a goal/belief/concern, upsert the knowledge table
One LLM call per changeset. Simple, auditable, and you can always re-run extraction if you improve the prompt later.

---

I'm with you on the LLM usage. When we give the LLM something to work with (e.g. the changeset) we would probably need to feed it a bit more context, too, so it's not just seeing a small segment (like a couple of words changing) - it needs the context of those word changes. So do we have to worry about segment and/or changeset boundaries? Knowing of course one or two words changing could alter and potentially reverse the entire meaning/intent of a block of text.

---

Exactly right — a diff that says "changed 'should' to 'shouldn't'" is meaningless without context. And it could flip the entire meaning.

The key insight: the diff identifies what changed, but the LLM reads the full blocks
Think of it as two stages:

Microdiff tells you which blocks were touched (added, modified, deleted)
You send the LLM the full content of those blocks, not the raw diff
So if you edited one word in a paragraph, the LLM doesn't see "should" → "shouldn't". It sees the entire paragraph as it now reads. That's the context it needs.

But a single block isn't always enough context either
"I'm going to do that differently this time" — do what differently? The paragraph above probably explains it. So you need surrounding blocks too.

A simple rule: for each touched block, include N blocks before and after as context (maybe 2-3). Like how git diff shows context lines around changes. The LLM prompt would look something like:

Here are the sections of the user's journal that changed during this session. Each section shows the changed block with surrounding context.

Section 1 (block 47 modified):
[block 45 - context]
[block 46 - context]

[block 47 - changed]
[block 48 - context]
[block 49 - context]

Section 2 (blocks 82-84 added):
[block 80 - context]
[block 81 - context]
[blocks 82-84 - new]
[block 85 - context]

This way the LLM has enough to understand meaning, but you're not sending the entire 6-month journal every time.

Adjacent changes should merge
If blocks 47, 48, and 50 all changed, don't send three separate sections with overlapping context. Merge them into one section covering blocks 45-52. Simple logic: if two changed blocks are within N positions of each other, combine them into one context window.

What about deletions?
If a block was deleted, the LLM needs to know what was there. So for deletions, you'd include the block content from the previous snapshot. The prompt could flag it: "The user deleted this block: [content]. Surrounding blocks that remain: [context]."

This matters for knowledge base accuracy — if you wrote "My goal is to run a marathon" last week and today you deleted it, the system should update the knowledge base to reflect that it's no longer a goal.

Cost check
Worst case: you changed 10 blocks scattered across the doc, each with 3 blocks of context on each side = ~70 blocks. At maybe 50-100 tokens per block, that's 3,500-7,000 tokens of input. Still well within Haiku's sweet spot and basically free.

Typical case: you added a few paragraphs at the bottom = one contiguous section, maybe 10-15 blocks including context. Trivial.

So to answer your question directly
You don't need to worry about changeset boundaries being too granular. The diff is just an index — "look here, here, and here." The LLM always gets full blocks with surrounding context. Even a one-word change gets the full paragraph plus neighbors, which is enough to understand intent.
---
Feature: Journal Intelligence Pipeline
Date: 2026-04-04
Status: Scoped

Overview
Build an AI-powered intelligence layer on top of the app's document system. The user writes freely in BlockNote docs — one continuous journal doc with a fast-path "home base" entry point, plus additional standalone docs as needed. Behind the scenes, the system detects idle periods, diffs what changed, and uses an LLM to extract semantic fragments and classify them across multiple taxonomies — building a searchable, structured knowledge base without any manual organization. All data is partitioned by workspace, with a default "Personal" workspace out of the box.

End-User Capabilities
Tap "Journal" and immediately start writing — no file picker, no decisions.
Create, browse, and organize additional docs in a library view with a folder hierarchy.
See auto-inserted day and week headings in journal docs as temporal landmarks.
After going idle or leaving, the system automatically processes what you wrote.
Search and browse by topics, moods, types, or any other taxonomy the AI has populated — without ever manually tagging or organizing.
Access a knowledge base of extracted goals, concerns, beliefs, and other durable areas that the AI maintains from your writing.
Work across multiple workspaces (Personal, Client A, Client B) with hard boundaries — taxonomies, fragments, and knowledge never bleed across workspaces.
Optionally search across workspace boundaries when needed, with explicit intent.
The chat agent operates within the current workspace by default. Cross-workspace agent tools require explicit permission.
Architecture
Workspaces
All docs, folders, taxonomies, terms, fragments, and knowledge entries belong to a workspace. Workspaces are hard-partitioned — every query is workspace-scoped by default. There is no implicit cross-workspace data access.

A default "Personal" workspace is created automatically and cannot be deleted. Additional workspaces can be created for clients, projects, or any other domain the user wants to keep isolated.

The initial implementation is single-user. The data model uses workspaceId as the partition key on all relevant tables. When multi-user is needed later, adding a users table and workspace_members join table is additive — no existing schema changes required.

Multi-Doc System
The foundation is a general-purpose document system. Every doc lives in the same table and goes through the same editor, save pipeline, and (optionally) intelligence pipeline. The journal is not a separate feature — it's a pinned doc with a privileged nav entry point and "just start writing" UX. The distinction between "journal" and "docs library" is in the navigation layer, not the data layer.

The intelligence pipeline (snapshots, diffs, fragment extraction) is per-document and runs on any doc where it's enabled. Default: on. Quick scratch docs can opt out.

Folders
Docs are organized via a dedicated folders table with a proper hierarchical structure (parent references). A doc belongs to at most one folder via a direct foreign key. This supports performant subtree operations — moving a folder reparents it and all descendants in a single update. Folders are workspace-scoped.

Folders are intentionally separate from the taxonomy system. They have different semantics (single-parent, hierarchical, user-managed) and different cardinality (one folder per doc via FK). The taxonomy system is many-to-many. No reason to force them together.

Auto-Headings
When the user opens a journal doc and begins typing:

If no blocks exist for today, insert an H2 block with the current date.
If the previous entry was from a different week, also insert an H1 week heading.
These are real BlockNote blocks in the content array — editable, deletable, not overlays.
Snapshot & Diff Pipeline
Trigger: Idle detection (configurable, likely 30-60 min) or navigating away from the doc. Detected on the frontend, which pings the server to start processing. Server-side fallback polls updatedAt as a safety net for cases where the frontend can't fire (tab killed, phone sleep).

Process:

Capture a snapshot of the current doc content.
Diff against the last-processed snapshot using a structural JSON diff (microdiff or similar) to identify which blocks were added, modified, or deleted.
Store the changeset — the set of changed block references and the snapshot reference.
A "session" is not a segment of text. It's a changeset — the delta between two processing runs.

Fragment Extraction (LLM)
For each changeset, an LLM call extracts semantic fragments — distinct ideas, thoughts, or topics contained in the changes.

Input to the LLM:

The full content of each changed block, plus 2-3 surrounding blocks for context (not raw diff tokens).
Adjacent changed blocks merge into a single context window to avoid redundancy.
For deleted blocks, the previous snapshot's content is included so the LLM understands what was removed.
The list of all taxonomies and their existing terms for the current workspace, with instructions to reuse existing terms when appropriate and create new ones sparingly.
Output from the LLM:

A list of fragments, each with: a brief title, the relevant text, and suggested terms across all applicable taxonomies.
Model choice: Claude Code (same model the chat agent uses). Volume is low (a few changesets per day), latency is irrelevant (background processing), and cost is negligible at personal journal scale.

Taxonomy & Terms System
Classification is handled by a general-purpose taxonomy/terms system rather than a flat tags table. A taxonomy is a named classification axis. A term is a value within that taxonomy. Both docs and fragments can have terms applied to them via join tables.

Each taxonomy declares:

isHierarchical — whether terms can have parent/child relationships (e.g., subtopics).
isAIManaged — whether the AI creates and maintains terms (vs user-managed).
Expected initial taxonomies:

Topic — AI-managed, optionally hierarchical. Terms: health, career, product-ideas, relationships...
Mood — AI-managed, flat. Terms: reflective, anxious, excited, frustrated...
Type — AI-managed, flat. Terms: goal, concern, belief, idea, question, observation, decision...
Additional taxonomies can be added at any time — just another row in the table.
Terms are workspace-scoped (inherited through their taxonomy). The AI receives the full taxonomy + term list during extraction and assigns terms across all applicable taxonomies per fragment. Periodic LLM-driven consolidation merges near-duplicate terms within each taxonomy.

Terms can apply at two levels:

Document-level — broad classification of what a doc is about.
Fragment-level — granular classification of individual extracted ideas.
Knowledge Base
Certain fragments map to durable knowledge areas — goals, concerns, beliefs, feelings. When the LLM identifies a fragment as one of these (via the "Type" taxonomy), it upserts a knowledge base entry. If a previously stated goal is deleted from a doc, the knowledge base reflects that removal. Knowledge is workspace-scoped.

Agent Workspace Scoping
The chat agent operates within the current workspace by default. All agent search and retrieval tools (doc content, fragments, terms, knowledge) are workspace-scoped. Cross-workspace tools are a separate capability that requires explicit user permission per-conversation or per-query.

Data Model
Existing (evolve):

documents — add: title, workspaceId (FK), folderId (FK, nullable), pipelineEnabled (boolean, default true)
New tables:

Core:

workspaces — id, name, icon, color, isDefault (boolean), createdAt, updatedAt
folders — id, workspaceId (FK), name, parentId (FK self-referencing, nullable), sortOrder, createdAt, updatedAt
Taxonomy:

taxonomies — id, workspaceId (FK), name, description, isHierarchical (boolean), isAIManaged (boolean), createdAt
terms — id, taxonomyId (FK), name, parentId (FK self-referencing, nullable), sortOrder, createdAt
document_terms — documentId (FK), termId (FK)
fragment_terms — fragmentId (FK), termId (FK)
Pipeline:

journal_snapshots — id, documentId (FK), content (JSONB), capturedAt, processedAt
journal_changesets — id, documentId (FK), snapshotBeforeId (FK), snapshotAfterId (FK), diff (JSONB), summary, createdAt, processedAt
journal_fragments — id, changesetId (FK), workspaceId (FK), title, content, sourceBlockIds, createdAt
Knowledge:

journal_knowledge — id, workspaceId (FK), area, content, sourceFragmentId (FK), createdAt, updatedAt
Workspace scoping: workspaceId is a direct FK on documents, folders, taxonomies, fragments, and knowledge. Terms inherit workspace scope through their taxonomy. Changesets and snapshots inherit workspace scope through their document. All queries filter by workspace.

Key Decisions
Workspaces are hard boundaries. Taxonomies, terms, fragments, knowledge never cross workspace walls. Data isolation guarantee, not just a UI filter.
Single-user for now, multi-user ready. workspaceId on everything. Users and membership are additive when needed — no refactor.
Default "Personal" workspace. Always exists, can't be deleted.
Taxonomy/terms system, not flat tags. A proper system of named taxonomies with typed terms. Supports multiple classification axes (topic, mood, type, etc.), hierarchy within a taxonomy, and AI-managed vs user-managed taxonomies. Replaces the need for a one-dimensional tags table.
Folders stay separate from taxonomies. Different cardinality (single-parent FK vs many-to-many join), different management model (always user-managed, always hierarchical). Unifying them adds abstraction without payoff.
One doc system, two entry points. Journal is a pinned doc with fast-path UX. The library is the full-power view. Same editor, same pipeline, same data.
Diff identifies, LLM reads. Structural diff finds which blocks changed. The LLM receives full block content with surrounding context.
Fragments are the classified unit. A single writing session might contain 3 distinct topics. The AI splits them into separate searchable fragments and classifies each across all taxonomies.
Taxonomies and terms emerge, not predefined. The AI builds and maintains terms per workspace. New taxonomies can be added at any time.
LLM over embeddings for extraction. Embeddings can't distinguish a goal from an observation about the same topic. LLM extraction costs almost nothing at personal journal volume.
Agent is workspace-scoped by default. Cross-workspace access is explicit and permission-gated.
Agent Access (Planned)
The doc system will expose full CRUD APIs — list, read, create, write — all workspace-scoped. The chat agent will be able to read any doc's content, query fragments and terms, and access the knowledge base within the current workspace. Cross-workspace tools are a separate, permission-gated capability. Agent writing to docs is a natural extension of the same API surface. Out of scope for initial build but the API design should not preclude it.

Risks and Considerations
Extraction quality — bad fragments/terms erode trust. Prompt engineering is critical. Store raw LLM responses for debugging.
Snapshot storage growth — full JSONB snapshots add up. May need retention policy (keep last N full snapshots per doc).
Block ID stability — fragments reference source blocks by BlockNote block IDs, not array indices, since positions shift.
Idle detection edge cases — phone sleep, tab killed, laptop closed. Server-side updatedAt polling is the safety net.
Workspace switching UX — needs to feel lightweight, not like logging into a different app.
Taxonomy proliferation — the AI could create too many taxonomies or terms. May need guardrails (max taxonomies per workspace, term count thresholds before consolidation runs).
Non-Goals (This Iteration)
Multi-user / shared workspaces — schema ready, not building yet.
Views (taxonomy browser, knowledge dashboard, timeline) — consume the pipeline's output, scoped separately.
Embedding-based search — useful later for "find similar" queries.
Agent write access — accounted for in API design, built separately.
Cross-workspace agent tools — permission model defined, implementation deferred.
User-created taxonomies — initially only AI-managed taxonomies. User-managed taxonomies (beyond folders) can come later.
Open Questions
Exact idle timeout duration (30 min? 60 min? configurable?)
Which knowledge areas to extract initially (goals, concerns, beliefs — others?)
Should the user be able to see/correct extracted fragments and terms, or fully hands-off?
Term consolidation frequency and trigger
Journal as a single forever-doc or periodic fresh starts?
Workspace switcher UX — nav rail icon? dropdown? separate screen on mobile?
Should initial taxonomies (Topic, Mood, Type) be seeded per workspace, or should the AI create them organically on first extraction?
---
The dependency graph

Auto-headings ─────────────────────────── (no deps, works today)

Multi-doc + doc CRUD ──┬── Folders
                       │
Workspaces ────────────┘   (workspace FK goes on docs, folders, etc.)

Snapshot/diff pipeline ─── Fragment extraction ─── Knowledge base
                                    │
                           Taxonomy/terms system
                           
Agent integration ─── (reads from all of the above)
Two independent tracks
The interesting thing is there are two tracks that can run in parallel:

Track A: Doc system — multi-doc, folders, workspaces. This is about where things live and how you organize them. Testable via UI — you can see and use it.

Track B: Intelligence pipeline — snapshots, diffs, taxonomy, fragment extraction, knowledge base. This is about what the system learns from your writing. Testable via inspecting the database and eventually through search/browse views.

Auto-headings stands alone and is useful immediately.

Possible sequence
1. Auto-headings
Works on the existing single doc today. Zero schema changes. You open the journal, start typing, a date heading appears. Immediately tangible. Good confidence builder.

2. Multi-doc + workspaces (schema layer)
Evolve the documents table — add title, workspaceId, folderId. Create the workspaces table, seed a default "Personal" workspace. Build doc CRUD APIs and a basic doc list UI. You don't need the workspace switcher yet — everything lives in the default workspace — but the column is there from day one so you never retrofit.

Testable: you can create multiple docs, give them titles, switch between them. The journal is still a pinned entry point to one specific doc.

3. Snapshot/diff pipeline
Add journal_snapshots and journal_changesets tables. Build the idle detection on the frontend. When triggered, capture a snapshot, diff against previous, store the changeset. No LLM yet — just the plumbing.

Testable: write in the journal, go idle, check the database — snapshots and changesets should appear with correct diffs. You can verify the diff captures exactly what you changed, including surrounding context assembly.

4. Taxonomy/terms + fragment extraction
Add taxonomies, terms, and the join tables. Seed initial taxonomies (Topic, Mood, Type). Build the LLM extraction call — feed it a changeset with context blocks, get back fragments with term assignments. Store everything.

Testable: write something, wait for processing, query the fragments table. "Did the AI correctly split my three topics into three fragments? Did it assign reasonable terms?" This is where you iterate on the prompt.

5. Folders
Add the folders table. Build folder CRUD and the tree UI in the doc library. Reparenting, drag-and-drop, the works.

Testable: create folders, move docs around, verify the hierarchy. This is somewhat independent — could swap with step 4 if you want the organizational UI before the intelligence layer.

6. Knowledge base
Add journal_knowledge. Extend the extraction prompt to identify durable knowledge (goals, beliefs, concerns) and upsert entries. Build a view for browsing knowledge.

Testable: write "My goal is to ship the journal feature by end of April." Wait for processing. Check that a knowledge entry appears under "goals."

7. Agent integration
Give the chat agent query access to docs, fragments, terms, and knowledge within the current workspace. This is mostly API surface — the data is already there from previous steps.

The question for you
Does this sequence feel right? The main choice points:

Folders (step 5) can slide earlier if you want the doc organization UX sooner, or later if intelligence is more exciting.
Workspace switcher UI is deferred throughout — the data model is ready from step 2, but you only build the switching experience when you actually need a second workspace.
Steps 3 and 4 are where you'll spend the most iteration time (diff correctness, prompt tuning). Worth getting to those relatively early.