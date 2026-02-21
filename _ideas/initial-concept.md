My goal for this is...

I want to track my core highest level self goals. That's life goal shit.

And I want to track my career goals and career-related ideas.
There's a lot of these.
There's a lot coming in, and they change a bit over time although there are a lot of through lines.

And I want to spin up scheduled agents that do things.
Agents to research ideas based on my career goals and ideas.
The agents will run from an LLM, starting with claude code directly. Codex and Gemini may come into the picture.
We can maybe use Vercel AI SDK for general LLM use, but it's crucial that we begin with Claude Code cli, logged in from the CLI, to avoid API pricing.

I will be able to spin up research agents as follows:
- choose "new agent"
- give it a goal that it is supposed to hit
- give it detailed instructions (i.e. a custom skill)
- assign other skills/tools to it
- perhaps give it inputs/outputs of some sort (fuzzy)
- give it a schedule, a priority
- there can also be agents without schedules that I can just chat with
- it may get a name and avatar
- agents can be allowed to talk to other agents
- agents have a description about what they are/do/know
- agents have their own memories

So I'll use this agent system. I'll chat with an overview agent that acts as a mentor.
That agent can choose to create other agents if needed and set them to a task.

The goal is to spin up agents that keep me informed about what's going on in my space.
Find financial opportunities.
Through discussions, curate knowledge:
- A collection of beliefs (that I hold)
- A collection of ideas (raw)
- A collection of candidate projects (refined from initial ideas)
- A collection of actual projects we choose to build out.

I want to be able to manually edit any collection or individual document.
I want to be able to upload assets and documents.
Assets will be deferred to v2. Document uploads will be deferred to v2.
Light in-db docs will serve as a global note / knowledge store.
We could do this with .md files, but maybe it would be better to start with our drizzle/sqlite so it's easier to create a robust system from it later.

So these agents and I are talking, and they are presenting me with blog posts and blog post summaries.
They present me with ideas, products people are building. Posts from social networks.
They know my goals. They know my ideas.
We're working together to get the clearest possible picture of what's going on in my space(s).

We use this clarity to keep curating a list of possible ideas. These ideas become stale, some expire. Some evolve. Some turn into fleshed out project ideas on a roadmap.

When we choose to execute a project, we can track it.
Projects I create will all consist of files, usually in repos. Sometimes parts will live on services like Google Docs. The agents will need tools to access all parts of the project, even if they're in disparate places.
But this thing, this dashboard, this system we are building, is the hub.

So we flesh out project ideas and we start projects.
We flesh out weekly/monthly/quarterly/yearly (and beyond?) roadmaps.
We have dashboards and gantt charts to see what's planned, what's in progress, what depends on what.
We have estimates for each about how long and how many tokens they will take.

We have agents that project manage. We have agents that reassess goals, compare projects against goals, compare goals against market reality, compare projects against competition. This all comes together as reports, recommendations. It's available to chat with my mentor agents.

As projects run, we have marketing agents that use our market research to craft marketing copy
The projects get brand guides to influence all outputs.
Agents can create web pages, social posts, generate videos, and more as needed.

Agents manage the finance.

Although I use the word "agents" plural like there are many of them, there's some nuance to that.
All agents have some degree of shared memory.

At a high level (we'll refine this) all agents share:
soul.md

All agents have access to memory. This is written to daily and searchable (vector and otherwise).
There's persistent dated/daily memory logs, and core memories that seem important from a week. And month. And so on.
And there are forever memories.
So there's a time hierarchical search process to deal with memory.

There are user files.
These are memories about a person. Kind of a detailed ID card with who they are, what they do, etc.
Agents also get these.

Agents also have personal memories, mostly about what they've done lately. These get fed into the core daily memories too, kind of a meeting of the minds after each day, so the next day each agent knows what each other agent knows. But there's cross communication too.

So an agent is: goal, role, name, detailed instructions and personality, avatar, memory, skills and tools.
They all get the core soul though - there are some things uniting the soul of every agent. But they each have their own soul doc too.

So when projects are running, they have plans, roadmaps, goals, schedules, priorities.

There's some unit of work, not sure what to call it, that is that thing: plans, roadmaps, goals, schedules, priorities.
They are somewhat fractal/self similar. A "project" can consist of smaller projects. The whole thing can be thought of as a project with smaller projects.

If we start with this idea of some core primitives: agents, projects which are nestable, then we could take on arbitrarily large tasks without needing to retool for ever larger initiatives.

So this system allows me to spend a lot of time in core value space at the top. Thinking about what's going on in the world and our high level objectives. The agents bring me data, ideas, and project work for me to curate and approve or reject.

The essence of this is the idea that the work will essentially do itself (with agents).
In that world, the most important levers are understanding the landscape (research) and choosing the right things to build, with the full terrain in mind, strategically moving toward where we want to be with full visibility of cost and timeline to get there.

In some sense this is being the CEO of an agent company. There may be multiple humans, but still the humans are at the C-suite level. It's also on the humans to have taste. Taste in design, products, writing, plans, values. And those different taste areas might be one of the reasons why it's critical to have multiple people involved. Agents can do work, but they ain't go no taste.

So, I need to think through:
- How do I want the work/UI to look? What pages in this dashboard?
- What are the objects in the system?
- What are my user stories. For me, what am I going to do with it.

Then, what is needed for v0, v1, v2?
I want to quickly be able to...

Birth an agent.
Agent has the basic memory system.
Agent can chat.
I can review individual chats.
Agent can be managed via chat (self manage) or via UI

That's v0.

V1 we get
I can give the agent basic skills.
I can give the agent schedules.
Agent can do research and save it somewhere it can reference it, i.e. docs
So we're building a knowledgebase.
We get multiple agents.
...
v2 we get 
I can define an entity like a "brand" that has certain requirements and assign agents to regularly create/nourish it.
We get projects
We get tasks, schedules, timelines, gantt charts
