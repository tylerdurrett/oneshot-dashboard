I want to develop the concept of agents into this app.

An agent should be something the user creates. There's a default agent too.

An agent is essentially a named collection of a few things:
- custom instruction/prompt
- specific allowed tools and file/docs access

Our current chat is one "agent". It has the default soul.md injected in, and it has access to every file in the workspace, every doc via MCP, timers.
Every chat.

I'd like to be able to create a new agent, for example "Fitness Assistant" that has a specific instruction.
When I have that agent selected (dropdown to the left of threads dropdown) it shows threads with that agent only and any chats use that agent's instructions.

I want a new "agents" page (new nav item, top level) where I can add/edit agents.
Each agent should also have a profile pic and one gets auto-created if the user doesn't add one.
