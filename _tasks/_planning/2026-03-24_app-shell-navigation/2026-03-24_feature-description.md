# Feature: App Shell with Responsive Navigation

**Date:** 2026-03-24
**Status:** Scoped

## Overview

Add a responsive app shell that wraps all pages. On desktop (>=768px), it renders a narrow icon-and-label sidebar on the left. On mobile (<768px), it renders a bottom navigation bar. This gives the app a consistent navigation structure as we add more pages.

## End-User Capabilities

1. On desktop, see a narrow left sidebar with icons for Timers, Chat, and a hamburger menu — each with a small label underneath.
2. On mobile, see a bottom navigation bar with the same three items distributed horizontally.
3. Tap Timers or Chat to navigate to that section. The active page's icon is visually highlighted.
4. The hamburger icon is visible but non-functional for now (placeholder for future overflow menu).
5. Visiting `/` redirects to `/timers`.
6. Navigating within `/chat/[threadId]` still highlights the Chat nav item.

## Architecture / Scope

### Components

- **AppShell** (`apps/web/src/components/app-shell.tsx`) — Root layout shell. Renders both the desktop sidebar and mobile bottom nav using CSS media queries (both always in the DOM, toggled via `hidden md:flex` / `flex md:hidden`). Wraps `{children}` in a `<main>` element.
- **NavLink** (internal to app-shell) — Individual nav item. Renders icon + label vertically. Handles active state styling based on current pathname.

### Navigation Items

| Label | Icon | Route | Active Match |
|-------|------|-------|--------------|
| Timers | Clock (Lucide `Clock`) | `/timers` | Exact |
| Chat | Message (Lucide `MessageSquare`) | `/chat` | Prefix (`/chat` and `/chat/*`) |
| More | Hamburger (Lucide `Menu`) | N/A (no-op) | Never active |

The hamburger is a `<button>` (not a `<Link>`) since it doesn't navigate anywhere yet.

### Layout Integration

- The root layout (`apps/web/src/app/layout.tsx`) wraps its children with `<AppShell>`.
- The existing `/chat` layout and pages continue to work inside the shell — their content renders in the `<main>` area.
- A new `/timers` route is created with a placeholder page.
- The current `/` page is replaced with a redirect to `/timers`.

### Responsive Strategy

CSS-only responsive approach — no JavaScript for nav visibility:

- **Desktop**: `flex-col` sidebar, `w-16` (64px), right border, items stacked vertically.
- **Mobile**: `flex` bottom bar, top border, items distributed with `flex-1`, safe area padding for devices with home indicators.
- Breakpoint: 768px (`md` in Tailwind).

### Active State Detection

- Exact match for routes without nesting (e.g., `/timers`).
- Prefix match for routes with nesting: `/chat` highlights when pathname is `/chat` or starts with `/chat/`.
- The hamburger button is never in an active state.

### Styling Approach

Use the existing sidebar CSS custom properties already defined in `globals.css` (`--sidebar`, `--sidebar-border`, etc.). These are standard shadcn/ui sidebar tokens and provide a clean separation between sidebar and content area theming. If the sidebar tokens are not yet present, add the standard set for both light and dark themes so the project follows the established shadcn convention.

Reuse existing design tokens for text states:
- Active: `text-sidebar-foreground`
- Inactive: `text-muted-foreground`
- Active icon background: `bg-sidebar-accent` at reduced opacity

### Safe Area Handling

Add a `.safe-area-pb` utility class in `globals.css` that applies `padding-bottom: env(safe-area-inset-bottom, 0)` to the mobile bottom nav. Ensure the viewport meta tag includes `viewport-fit=cover`.

## Technical Details

- **Icons**: Lucide React (`lucide-react` is already a dependency). Use `Clock`, `MessageSquare`, and `Menu` icons at `w-5 h-5`.
- **Routing**: Next.js App Router. Active state via `usePathname()` from `next/navigation`.
- **Redirect**: Use `redirect()` from `next/navigation` in the `/` page (or `next.config` redirects) to send `/` → `/timers`.
- **No `useIsMobile` hook needed** for the shell itself — CSS handles it. A hook can be added later if JS-level detection is needed elsewhere.
- **Accessibility**: Both `<nav>` elements get `aria-label="Main navigation"`.

## Risks and Considerations

- **Existing pages**: The chat page currently occupies the full viewport. Wrapping it in the shell reduces available width by 64px on desktop and available height on mobile. The chat layout already uses flex/container queries so it should adapt, but verify visually.
- **Prototype routes**: `/prototype` and `/video` routes exist. They should also render inside the shell since it's applied at the root layout level. If any page needs to opt out of the shell, a route group `(shell)` vs `(standalone)` pattern can be used — but that's out of scope unless needed.

## Non-Goals / Future Iterations

- Expand/collapse sidebar — permanently narrow (icon + label) is the design.
- Hamburger menu functionality — placeholder icon only for now.
- Timers page functionality — just a placeholder page with the route.
- Light theme — dark-theme-first per project conventions.
- Animation/transitions on nav state changes beyond `transition-colors`.

## Success Criteria

- Desktop: narrow left sidebar visible with Timers, Chat, More icons and labels.
- Mobile: bottom nav bar visible with the same three items.
- Tapping Timers navigates to `/timers`; tapping Chat navigates to `/chat`.
- Active page is visually distinguished (highlighted icon background + foreground text color).
- `/chat/[threadId]` routes highlight the Chat nav item.
- Visiting `/` redirects to `/timers`.
- Hamburger icon renders but does nothing when tapped.
- Safe area inset respected on mobile devices.
- No hydration mismatches — both nav variants always in DOM, CSS-toggled.
- Existing chat functionality is unaffected.
