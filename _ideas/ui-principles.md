# UI Principles

## Core Layout

**Chat + Context View.** That's the UI.

- Chat on one side, context view on the other (left/right, user preference).
- Chat is persistent — always present, always context-aware.
- Panels are resizable (react-resizable-panels).
- Chat/agent knows what the user is looking at. Chat/agent can navigate the user anywhere.
- Chat/agent creates artifacts. UI also provides direct affordances for manual artifact creation and editing.
- The context view isn't always an "artifact" — it might be a collection (docs, assets, agents, projects, tasks), a settings form, or any other view. Whatever is shown is available to the chat agent's context.

## Chat Panel

The chat panel is a central piece of the UI and needs to be well crafted.

- Select which agent you're chatting with.
- Access previous chats / chat history.
- Persistent across navigation — the chat stays put as the context view changes.

## Navigation

- Icon-level sidebar navbar. Always collapsed — icons with titles underneath, no expand/collapse.
- No top nav. Use tabs and frames within the content area.
- Maximize vertical space.
- Optional panels (folders, assets, etc.) that can be toggled on/off.

## Component Philosophy

- Start with Shadcn as the foundation.
- Prefer components over ad-hoc Tailwind classes, but be pragmatic — no overengineering.
- Build reusable components for things that genuinely repeat.

## Design Tokens

- Use semantic tokens. Example: `warning` (semantic) → `amber-500` (palette) → `#f59e0b` (literal).
- This creates a layer of meaning between intent and color, making theming and consistency manageable.

## Performance

Sluggish UI is not acceptable. Buttery smooth at all times.

- **Instant, optimistic updates** with background actions. TanStack Query for good performance characteristics.
- **GPU-optimized animations** — dragging, transitions, and animations must use performant properties (transforms, opacity) that don't trigger reflow.

## Feature Design Workflow

When designing features that have UI:

1. **Initial feature request and user stories** (along with other early spec docs)
2. **Validate with a throwaway UI prototype** (mock data and interaction)
3. **From there, create the formal spec** that goes into the full-fledged feature

Validate UI early — it's easier to see blind spots and get clear about needs. Then design the data model and components from a more grounded place.