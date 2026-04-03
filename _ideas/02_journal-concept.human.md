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