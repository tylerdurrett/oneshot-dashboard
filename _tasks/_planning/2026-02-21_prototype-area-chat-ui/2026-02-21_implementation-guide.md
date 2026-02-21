# Implementation Guide: Prototype Area + Fullscreen Chat UI

**Date:** 2026-02-21
**Feature:** Prototype Area + Fullscreen Chat UI
**Source:** [Feature Description](./2026-02-21_feature-description.md)

## Overview

This implementation sets up a prototype sandbox within the existing Next.js app and builds the first prototype: a fullscreen chat UI with mock messages. The work splits into three phases: (1) install AI Elements components into `packages/ui`, (2) scaffold the prototype route area, and (3) build the fullscreen chat page with mock data.

We start with the component layer because it needs to be in place before any UI can be built. The prototype area comes next because it provides the blank canvas. The chat page comes last, composing the two together.

No backend, no API routes, no database changes. This is purely a frontend exercise.

## File Structure

```
packages/ui/src/
├── components/
│   ├── ai-elements/         ← AI Elements source (installed via CLI)
│   │   ├── conversation.tsx
│   │   ├── message.tsx
│   │   └── prompt-input.tsx
│   ├── button.tsx            (existing)
│   ├── card.tsx              (existing)
│   └── input.tsx             (existing)
└── index.ts                  ← add AI Elements exports

apps/web/src/app/
├── prototype/
│   ├── layout.tsx            ← blank layout (no app chrome)
│   ├── page.tsx              ← index listing available prototypes
│   └── chat/
│       ├── page.tsx          ← fullscreen chat prototype
│       └── mock-data.ts      ← mock conversation messages
├── layout.tsx                (existing root layout)
└── page.tsx                  (existing home page)
```

## Phase 1: AI Elements in packages/ui

**Purpose:** Install AI Elements components into the shared UI package and export them.

**Rationale:** Components must be available before any prototype page can use them. Installing into `packages/ui` makes them available monorepo-wide and follows the existing pattern for Shadcn components.

### 1.1 Install AI Elements Components

- [ ] Run the AI Elements CLI to install Conversation, Message, and PromptInput components into `packages/ui`. The CLI may need `--cwd` pointed to `packages/ui`, similar to how Shadcn components are added: `pnpm dlx shadcn@latest add <component> --cwd packages/ui`
- [ ] If the AI Elements CLI doesn't support `--cwd`, manually copy the component source files into `packages/ui/src/components/ai-elements/`
- [ ] Verify the installed component files exist and have no import path issues (they should reference local utils via the aliases in `components.json`)
- [ ] Add any missing peer dependencies to `packages/ui/package.json` (AI Elements may require `react-markdown`, `remark-gfm`, or similar — check the component source for imports)

**Acceptance Criteria:**
- AI Elements component source files exist in `packages/ui/src/components/ai-elements/`
- All imports within the component files resolve correctly
- `pnpm build` passes with no TypeScript errors in `packages/ui`

### 1.2 Export AI Elements from @repo/ui

- [ ] Add exports for Conversation, Message, and PromptInput components to `packages/ui/src/index.ts`
- [ ] Add export tests to `packages/ui/src/__tests__/components.test.tsx` following the existing pattern (verify each component is defined)
- [ ] Run `pnpm test --filter @repo/ui` to confirm tests pass

**Acceptance Criteria:**
- AI Elements components are importable via `import { ... } from '@repo/ui'`
- Export tests pass
- `pnpm build` and `pnpm test` pass

## Phase 2: Prototype Route Area

**Purpose:** Create the blank-canvas prototype sandbox in the Next.js app.

**Rationale:** The prototype area must exist before any prototype pages can be built. The layout must be intentionally blank so prototype pages have full control.

### 2.1 Create Prototype Layout and Index

- [ ] Create `apps/web/src/app/prototype/layout.tsx` — a minimal layout that renders only `{children}`. No nav, no shared chrome. Apply the `dark` class to a wrapper div so prototypes render in dark mode by default
- [ ] Create `apps/web/src/app/prototype/page.tsx` — a simple index page with a heading ("Prototypes") and a list of links to available prototypes. Start with one link: `/prototype/chat` → "Fullscreen Chat"
- [ ] Write a basic test for the prototype index page in `apps/web/src/__tests__/prototype-index.test.tsx` — verify it renders and contains the link to the chat prototype

**Acceptance Criteria:**
- `/prototype` loads and displays a list with one link to `/prototype/chat`
- The prototype layout provides no app chrome — child pages control their full visual experience
- Dark mode is applied by default within the prototype area
- Test passes

## Phase 3: Fullscreen Chat Prototype

**Purpose:** Build the first prototype — a fullscreen chat with mock messages exercising the AI Elements components.

**Rationale:** This is the core deliverable. It lets you see and feel the chat UI, evaluate the AI Elements components, and inform the production chat spec.

### 3.1 Mock Data

- [ ] Create `apps/web/src/app/prototype/chat/mock-data.ts` with a static array of mock messages
- [ ] Messages should simulate the "birth the bot" onboarding conversation: agent greeting, asking the user's name, user responding, agent asking about goals, etc.
- [ ] Each message has a `role` ("user" or "assistant"), `content` (markdown string), and an `id`
- [ ] Include 6-10 messages that demonstrate: plain text, a longer paragraph, a markdown list, and a question from the agent

**Acceptance Criteria:**
- Mock data file exports a typed array of messages
- Messages cover a range of content types (short, long, markdown formatting)
- Content simulates a realistic onboarding exchange

### 3.2 Fullscreen Chat Page

- [ ] Create `apps/web/src/app/prototype/chat/page.tsx` as a client component
- [ ] Layout: full viewport height (`h-dvh`), flex column, centered horizontally with a max-width for readability (e.g., `max-w-3xl`)
- [ ] Message area: use the Conversation component (or a scrollable container) displaying mock messages using the Message component. Auto-scroll to bottom
- [ ] Input area: use the PromptInput component fixed at the bottom of the chat. On submit, append the new message to local state and clear the input
- [ ] No simulated agent responses — user messages simply appear in the list. This is about the UI feel, not interaction logic
- [ ] Ensure smooth scrolling behavior when new messages are added

**Acceptance Criteria:**
- `/prototype/chat` renders a fullscreen chat filling the viewport
- Mock messages display with correct role styling (user vs assistant)
- Markdown content renders properly (bold, lists, paragraphs)
- User can type a message, submit it, and see it appear in the message list
- Input clears after submission
- Chat scrolls smoothly, latest messages visible

### 3.3 Polish and Visual Check

- [ ] Verify typography and spacing feel right — readable font size, comfortable message padding, clear visual distinction between user and assistant messages
- [ ] Verify the input area is anchored to the bottom and doesn't overlap message content
- [ ] Verify the chat works well at different viewport sizes (not full responsive design, just make sure nothing breaks at common desktop sizes)
- [ ] Run `pnpm dev` and visually inspect the prototype in a browser
- [ ] Run `pnpm build` to confirm no build errors across the monorepo

**Acceptance Criteria:**
- Chat looks clean and feels intentional, not broken or rough
- No layout overflow or scrolling issues
- `pnpm build` passes
- `pnpm lint` passes

## Dependency Graph

```
Phase 1 (AI Elements)
  1.1 Install → 1.2 Export
                   |
              Phase 2 (Prototype Area)
                2.1 Layout + Index
                   |
              Phase 3 (Chat Prototype)
                3.1 Mock Data → 3.2 Chat Page → 3.3 Polish
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| AI Elements in `packages/ui`, not `apps/web` | Follows existing Shadcn pattern. Components will be used in production later, not just prototypes. |
| Blank prototype layout with `dark` class | Prototypes need full visual control. Dark mode matches the intended app aesthetic. |
| No simulated agent responses | Keeps scope minimal. The goal is evaluating chat UI feel, not interaction patterns. Simulated responses can be added in a follow-up if needed. |
| Mock data in a separate file | Keeps the page component clean. Mock data can be swapped or extended easily. |
| Client component for chat page | Chat requires local state for user input. Server component isn't needed since there's no data fetching. |
