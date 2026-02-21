For UI....

Chat + Artifact is the UI.
Chat left or right, artifact opposite.
Icon-level navbar, no expand/collapse, just collapsed. Nav titles under icons.
No top nav. Tabs and frames. Maximize vertical space.

Maybe folders, assets, etc left (optional, turn on/off)

But that's the standard.

Persistent chat + artifact.

Chat always knows the context the user sees. Chat can take the user wherever they need to go.
Chat creates artifacts. UI affordances allow manual artifact creation and editing.

Prefer components over constantly using ad-hoc tailwind classes, but be pragmatic. No overengineering.
Seek reusable components for things that really do get repeated.
We're starting with Shadcn, that forms a strong starting point.

Create semantic tokens.
For example, warning colors map to palette colors map to literal colors.

For designing features that have UI, consider this workflow:
1. Initial feature request and user stories (along with other early spec docs)
2. Validate with a throwaway UI prototype (mock data and interaction)
3. From there, create the formal spec that goes into the full-fledged feature.

When we validate UI early, it's easier to see blind spots and get extremely clear about our needs. Then, we can design the data model and components from a more grounded place.

---
Sometimes the center view does not contain what we would think of as an "artifact" though it's always something that is available to the context of the chat agent. Sometimes it might be a collection (e.g. collection of docs, collection of assets, collection of agents, project list, task list). Sometimes it might be a settings form for some object. In any case, the chat panel stays put. It's resizeable (react-resizable-panels).

The chat panel itself, being a key central part of the UI, will need to be well crafted.
We will need a way to choose previous chats.
We will need a way to choose which agent we're chatting with.
---
A note on UI performance.
Slugish UI is not acceptable.
We need to use methods that ensure buttery smooth UI in a couple of ways:
1. Instant, optimistic updates with background actions. Tanstack Query tends to have good performance characteristics.
2. For things involving dragging elements or animation, we need to be sure the animation is built in a performant way, using GPU-optimized properties that don't reflow content.
---
Mobile chat will be absolutely crucial to get right as well. That's going to have to be fleshed out with some hands on practice.