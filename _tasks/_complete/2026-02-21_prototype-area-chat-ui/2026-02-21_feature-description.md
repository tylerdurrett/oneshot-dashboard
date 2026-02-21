# Feature: Prototype Area + Fullscreen Chat UI

**Date:** 2026-02-21
**Status:** Scoped

## Overview

Create a dedicated prototype area in the Next.js app for throwaway UI exploration, and build the first prototype within it: a fullscreen chat interface using Vercel AI Elements components. The prototype uses fake/mock messages — no real AI backend. This area exists to validate UI feel and inform specs before building production features.

## End-User Capabilities

1. Navigate to `/prototype/chat` and see a fullscreen chat interface
2. See pre-populated mock messages demonstrating a conversation between a user and an agent (simulating the "birth the bot" first-run experience)
3. Type messages into the input and see them appear in the message list
4. Experience the visual feel of the chat — message rendering, markdown support, input behavior, scrolling, spacing

## Architecture / Scope

### Prototype Area

- Route group at `apps/web/src/app/prototype/` with its own layout
- The layout is fully blank — no app chrome, no nav, no shared layout elements. Each prototype page provides its own complete experience
- A simple index page at `/prototype` listing available prototypes
- Convention: everything under `/prototype` is disposable and excluded from production

### AI Elements Integration

- Install AI Elements components (Conversation, Message, PromptInput) into `packages/ui` using the AI Elements CLI
- These components are shadcn-style — source is copied into the project, giving full ownership and customization control
- Export them from `@repo/ui` so they're available to any app in the monorepo
- Components will be usable in both prototypes and eventually production

### Fullscreen Chat Prototype

- Single page at `/prototype/chat`
- Fullscreen layout — chat fills the viewport, centered, no sidebar
- Uses AI Elements: Conversation (message list with auto-scroll), Message (individual messages with markdown rendering), PromptInput (text input with submit)
- Pre-populated with mock messages simulating the onboarding conversation (agent greeting, asking the user's name, some back-and-forth)
- User can type new messages and they appear in the list (local state only, no backend)
- Dark theme to match the eventual app aesthetic

## Technical Details

### Dependencies

- `ai-elements` CLI — installs component source into `packages/ui`. Uses shadcn CLI under the hood
- No `@ai-sdk/react` or `ai` package needed yet — we're not connecting to any backend
- No new API routes

### Mock Data

- A static array of mock messages representing a sample onboarding conversation
- Messages have roles (user/assistant) and markdown content
- Local React state for any new messages typed by the user

### What This Is NOT

- Not a real chat system — no streaming, no AI, no persistence
- Not production UI — the prototype area and its contents are throwaway
- Not a component library test — though it does exercise the AI Elements components in context

## Risks and Considerations

- **AI Elements compatibility**: These components expect Tailwind CSS and shadcn foundations, which we already have. Need to verify they work correctly when installed in `packages/ui` rather than the default app-level location
- **Prototype discipline**: The prototype area must stay throwaway. Its value is in informing specs, not becoming the production codebase through incremental upgrades

## Non-Goals / Future Iterations

- Real AI/Claude integration (separate feature with its own architectural decisions)
- Chat + context view split layout (next prototype)
- Chat persistence or history
- Agent selection UI
- Mobile responsiveness (worth exploring in a future prototype)

## Success Criteria

- `/prototype` page loads and lists available prototypes
- `/prototype/chat` renders a fullscreen chat with mock messages
- Messages render markdown correctly
- User can type and submit new messages that appear in the list
- AI Elements components are installed in `packages/ui` and exported from `@repo/ui`
- The chat feels clean — good spacing, readable typography, smooth scrolling
