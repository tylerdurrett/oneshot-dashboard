# Implementation Guide: Prototype Area + Fullscreen Chat UI

**Date:** 2026-02-21
**Feature:** Prototype Area + Fullscreen Chat UI
**Source:** [Feature Description](./2026-02-21_feature-description.md)

## Overview

This implementation sets up a prototype sandbox within the existing Next.js app and builds the first prototype: a fullscreen chat UI with mock messages. The work splits into four phases: (1) validate browser automation tooling, (2) install AI Elements components into `packages/ui`, (3) scaffold the prototype route area, and (4) build the fullscreen chat page with mock data.

We start by confirming the chrome-devtools skill works, since we'll use it throughout to visually verify UI output. Then the component layer, the prototype area, and finally the chat page — with visual testing via screenshots at each stage.

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

## Phase 1: Validate Browser Automation

**Purpose:** Confirm the chrome-devtools skill works for taking screenshots and inspecting pages.

**Rationale:** We'll use browser automation throughout this feature to visually verify UI output. Testing it first ensures we can rely on it before building anything.

### 1.1 Test Chrome DevTools Skill

- [ ] Start the dev server (`pnpm dev`)
- [ ] Use the chrome-devtools skill to navigate to the existing home page (http://localhost:3200)
- [ ] Take a screenshot of the home page and verify it renders correctly
- [ ] Confirm the screenshot workflow works end-to-end (navigate, capture, review)

**Acceptance Criteria:**
- Chrome DevTools skill successfully launches a browser and navigates to the dev server
- Screenshot is captured and can be reviewed
- The workflow is reliable enough to use for visual testing in later phases

## Phase 2: AI Elements in packages/ui

**Purpose:** Install AI Elements components into the shared UI package and export them.

**Rationale:** Components must be available before any prototype page can use them. Installing into `packages/ui` makes them available monorepo-wide and follows the existing pattern for Shadcn components.

### 2.1 Install AI Elements Components

- [ ] Run the AI Elements CLI to install Conversation, Message, and PromptInput components into `packages/ui`. The CLI may need `--cwd` pointed to `packages/ui`, similar to how Shadcn components are added: `pnpm dlx shadcn@latest add <component> --cwd packages/ui`
- [ ] If the AI Elements CLI doesn't support `--cwd`, manually copy the component source files into `packages/ui/src/components/ai-elements/`
- [ ] Verify the installed component files exist and have no import path issues (they should reference local utils via the aliases in `components.json`)
- [ ] Add any missing peer dependencies to `packages/ui/package.json` (AI Elements may require `react-markdown`, `remark-gfm`, or similar — check the component source for imports)

**Acceptance Criteria:**
- AI Elements component source files exist in `packages/ui/src/components/ai-elements/`
- All imports within the component files resolve correctly
- `pnpm build` passes with no TypeScript errors in `packages/ui`

### 2.2 Export AI Elements from @repo/ui

- [ ] Add exports for Conversation, Message, and PromptInput components to `packages/ui/src/index.ts`
- [ ] Add export tests to `packages/ui/src/__tests__/components.test.tsx` following the existing pattern (verify each component is defined)
- [ ] Run `pnpm test --filter @repo/ui` to confirm tests pass

**Acceptance Criteria:**
- AI Elements components are importable via `import { ... } from '@repo/ui'`
- Export tests pass
- `pnpm build` and `pnpm test` pass

## Phase 3: Prototype Route Area

**Purpose:** Create the blank-canvas prototype sandbox in the Next.js app.

**Rationale:** The prototype area must exist before any prototype pages can be built. The layout must be intentionally blank so prototype pages have full control.

### 3.1 Create Prototype Layout and Index

- [ ] Create `apps/web/src/app/prototype/layout.tsx` — a minimal layout that renders only `{children}`. No nav, no shared chrome. Apply the `dark` class to a wrapper div so prototypes render in dark mode by default
- [ ] Create `apps/web/src/app/prototype/page.tsx` — a simple index page with a heading ("Prototypes") and a list of links to available prototypes. Start with one link: `/prototype/chat` → "Fullscreen Chat"
- [ ] Write a basic test for the prototype index page in `apps/web/src/__tests__/prototype-index.test.tsx` — verify it renders and contains the link to the chat prototype

**Acceptance Criteria:**
- `/prototype` loads and displays a list with one link to `/prototype/chat`
- The prototype layout provides no app chrome — child pages control their full visual experience
- Dark mode is applied by default within the prototype area
- Test passes

### 3.2 Visual Verification — Prototype Index

- [ ] Use chrome-devtools to navigate to `http://localhost:3200/prototype`
- [ ] Take a screenshot and verify: dark mode applied, heading visible, link to chat prototype present, no unwanted app chrome leaking in
- [ ] Fix any visual issues discovered

**Acceptance Criteria:**
- Screenshot confirms the prototype index renders correctly in dark mode with a clean, minimal appearance

## Phase 4: Fullscreen Chat Prototype

**Purpose:** Build the first prototype — a fullscreen chat with mock messages exercising the AI Elements components.

**Rationale:** This is the core deliverable. It lets you see and feel the chat UI, evaluate the AI Elements components, and inform the production chat spec.

### 4.1 Mock Data

- [ ] Create `apps/web/src/app/prototype/chat/mock-data.ts` with a static array of mock messages
- [ ] Messages should simulate the "birth the bot" onboarding conversation: agent greeting, asking the user's name, user responding, agent asking about goals, etc.
- [ ] Each message has a `role` ("user" or "assistant"), `content` (markdown string), and an `id`
- [ ] Include 6-10 messages that demonstrate: plain text, a longer paragraph, a markdown list, and a question from the agent

**Acceptance Criteria:**
- Mock data file exports a typed array of messages
- Messages cover a range of content types (short, long, markdown formatting)
- Content simulates a realistic onboarding exchange

### 4.2 Fullscreen Chat Page

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

### 4.3 Visual Verification — Chat UI

- [ ] Use chrome-devtools to navigate to `http://localhost:3200/prototype/chat`
- [ ] Take a screenshot and verify: fullscreen dark chat, mock messages visible with correct user/assistant styling, input anchored at bottom
- [ ] Take a screenshot at a narrower viewport width (e.g., 1024px) to check nothing breaks
- [ ] Verify markdown renders correctly in messages (bold, lists, paragraphs)
- [ ] Verify visual distinction between user and assistant messages is clear
- [ ] Fix any visual issues discovered

**Acceptance Criteria:**
- Screenshots confirm the chat looks clean and intentional at default and narrower viewport sizes
- Messages render markdown correctly
- User and assistant messages are visually distinct
- Input is properly anchored, no overlap with message content

### 4.4 Final Build and Lint Check

- [ ] Run `pnpm build` to confirm no build errors across the monorepo
- [ ] Run `pnpm lint` to confirm no lint errors

**Acceptance Criteria:**
- `pnpm build` passes
- `pnpm lint` passes

## Dependency Graph

```
Phase 1 (Browser Automation)
  1.1 Test Chrome DevTools
       |
Phase 2 (AI Elements)
  2.1 Install → 2.2 Export
                   |
Phase 3 (Prototype Area)
  3.1 Layout + Index → 3.2 Visual Verify
                          |
Phase 4 (Chat Prototype)
  4.1 Mock Data → 4.2 Chat Page → 4.3 Visual Verify → 4.4 Build/Lint
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| AI Elements in `packages/ui`, not `apps/web` | Follows existing Shadcn pattern. Components will be used in production later, not just prototypes. |
| Blank prototype layout with `dark` class | Prototypes need full visual control. Dark mode matches the intended app aesthetic. |
| No simulated agent responses | Keeps scope minimal. The goal is evaluating chat UI feel, not interaction patterns. Simulated responses can be added in a follow-up if needed. |
| Mock data in a separate file | Keeps the page component clean. Mock data can be swapped or extended easily. |
| Client component for chat page | Chat requires local state for user input. Server component isn't needed since there's no data fetching. |
