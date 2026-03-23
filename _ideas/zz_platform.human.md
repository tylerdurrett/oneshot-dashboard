
The long-running agent code is going to get scheduled and be processed by servers (not serverless) because this shit is long-running AF. And since Claude Code takes quite a bit of RAM, I'm inclined to run this on phyical hardware because it will end up being cheaper. So a fleet of Mac Minis perhaps. I might need to figure out if I can run multiple separate Claude Code accounts on one machine. Ahh I can in sandboxes, I'll just have to auth each one. All good.

Okay, so the front end will either be hosted on a server (e.g. Vercel) or running locally and accessed via something like tailscale.

The workers/agents will be running on local hardware.

I need to think about the rest of the architecture here.

Do we have a backend server that queues chats and somehow streams them back to the frontend?
Do we run the backend locally in the monorepo to keep it close to where the action is happening?
Long term as a project grows there may be multiple agent processes on different hardware, so we'll need to account for that.
We also need to account for the fact that we're streaming, often over long periods.

I think for v0 we can consider the server running locally with one sandboxed agent process.

How could we architect this?