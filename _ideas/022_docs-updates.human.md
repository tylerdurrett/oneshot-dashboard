---

let's add a chat window to the right side of the docs.
The chat window should be all the way to the right, with the docs window to the left.
Allow resizing of the panels with react resizable panels. I've done a similar kind of sizable panel setup in this repo over here: /Users/tdogmini/repos/oneshot-brand/apps/web/package.json
Check that out.
It remembers the user's last setting automatically.

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
