# Prototype Learnings — Chat UI

**Source:** `/prototype/chat` (throwaway prototype, Feb 2026)

## What Worked

- AI Elements components (Conversation, Message, PromptInput) are a solid foundation
- Dark theme feels right
- Mock data approach was useful for quickly seeing the feel

## What Needs to Change

### 1. Scrollbar styling (app-wide)
The default browser scrollbar is ugly and bright. Need a custom scrollbar that:
- Is visible on hover, hidden (or very subtle) otherwise
- Matches the dark theme
- Is implemented once and applied automatically across the app (not per-component)

**This is a foundation-level concern, not chat-specific.**

### 2. Chat should be full width
The chat area fills the height but not the width. For the fullscreen chat experience (v0), the chat should take the full viewport width.

### 3. Container-query based scaling
If the chat is full width, lines get very wide on large screens. The internals (message content, input area) should scale responsively using container queries — not a fixed max-width, but intelligent scaling of padding, font size, or content width based on the available space.

### 4. Semantic components and tokens from the start
As the app grows, ad-hoc styling will lead to inconsistency. We need:
- Semantic design tokens established early (colors, spacing, typography)
- Reusable components with semantic props for things that repeat
- This discipline needs to start with the very first real feature

## Implications for Build Order

These learnings suggest building in this order:

1. **App foundations** — scrollbar utility, semantic tokens, base component patterns
2. **Real fullscreen chat** — built on those foundations, with full-width layout and container-query scaling
3. **Agent server + WebSocket** — connect the chat to the real backend
4. **Sessions** — persist and browse conversations
