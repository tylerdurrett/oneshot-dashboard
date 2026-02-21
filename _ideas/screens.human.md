
The first thing that happens is you birth your prime agent.

This will be your homeslice agent. Every other agent is a version of this.

At this phase it's just chat.

Fullscreen chat.

We might not even have tabs yet.

You have to do certain things to unlock tabs.

The agent has built-in goals to get to know you.
The agent wants to know your name first. Some small talk maybe.
What are you wanting to do.

We can let the human decide how this goes, or we may want to have a few preset paths.
A preset path might be that the agent really wants to know your life goals and take it from there.
Or maybe it's a get down to business track where it immediately asks what project goals I have.
I'm not sure.
That kind of thing is largely controlled by what prompts we use.
The most important thing is having the flexible system to enable such things.

Once the core primitives are in place, most of the "programming" will come in the form of prompts and specs. And agents can write those too so it can really start to build on itself.

For me personally, my user story, I want this homeslice prime agent to try to get a feel for my values, what I want out of life. How old am I, where do I live, do I have a partner, do I have kids, do I have a job. I really want it to know me and I don't want to have to volunteer that. It would be nice for it to really want to get that out of me.

In fact, it would be nice to have a progress system.
This birthed agent has an in-built set of goals. Pieces of data it wants to collect. Tasks it wants to check off. As it does so, our conversation's progress advances for each completed "need" for the given chat.

The agent will have a series of deliverables essentially, some with dependencies on previous deliverables. The first "deliverable" is a bio about me, its prime human. The bio deliverable has a set of required and optional fields, and it's considered complete when the bot has chatted with me enough to have answers for all the required fields, with bonus points for other fields.

Then once the agent has gotten the basic info and we've done the small talk, maybe we ask about how the human wants the agent to be. For this "deliverable" which is a self id doc (appended to the immutable soul doc) the agent will again have required and optional fields and an indication of progress.

Some deliverables, if not dependent on previous deliverables, could be filled in whenever they pop up - the agent doesn't have to wait until a particular part of the conversation to fill in future required fields.

Behind the scenes, we have some built-in deliverable sequences like this to birth the agent. But, this is a key dynamic in the system. The agent has some tasks or required fields that it wants to fill. For a given field, that could be a large, abstract thing. The important thing is that the field has success criteria that we can judge.

Agents can also create their own workflows or deliverable sequences or whatever it is we're going to call this. Furthermore, a given deliverable might be nested in a larger one that is itself a collection of more deliverable sequences. These sequences represent larger goals. So "birth the bot" aka "get to know each other" is the broader goal that consists of several sub goals, each with specific success criteria and outputs aka "deliverables". We'll probably model these as markdown docs in a kind of light DB that captures basic metadata and tags/taxonomies as needed.

So the larger goal aka sequence also has progress as each sub goal is fulfilled. When the whole thing is complete, *do do do* we get a little burst of dopamine and level up to the next thing. In the course of daily work, it might just be that we created a great spec and we're ready to kick it to implementation.

So, after the "get to know you" objective is complete, we'll seamlessly transition to the next objective or give the user a choice of what to do next among a few options. They don't have to do this again because it's stored persistently. There may be a trophy/badge kind of system to reward people as they progress.

What comes next? What's the next task? I don't know yet.