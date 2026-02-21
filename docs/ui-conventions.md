# UI Conventions

Decision rules for agents building UI in this project. Keep it pragmatic — these rules exist to prevent drift without slowing you down.

## When to Extract a Component

Use Tailwind classes inline until one of these is true:

1. **Third time building it.** First and second time, inline classes are fine. Third time, extract a component.
2. **It's a semantic concept, not just styling.** A `Message` is a thing. A `ChatInput` is a thing. "A flex container with padding" is not — that's just layout.
3. **It has behavior.** If it manages state, handles events, or has variants, it's a component.

When you do extract:
- **App-generic** → `packages/ui/src/components/`
- **Feature-specific** → colocate with the feature

Don't preemptively extract. Let components emerge from repeated patterns.

## Where Components Live

| Type | Location | Exported from |
|---|---|---|
| Shadcn base components | `packages/ui/src/components/` | `@repo/ui` |
| AI Elements (chat) | `packages/ui/src/components/ai-elements/` | `@repo/ui` |
| App-wide custom components | `packages/ui/src/components/` | `@repo/ui` |
| Feature-specific components | Colocated with feature in `apps/web/src/` | Local imports |

## Design Tokens

**Let tokens emerge from usage.** Don't predefine a full token system.

Use Tailwind's built-in values (e.g. `text-zinc-400`, `bg-zinc-900`) until you notice a semantic meaning repeating. When you find yourself writing `text-zinc-400` in many places and it means "secondary text," that's when you create a CSS custom property:

```css
/* In the app's global CSS */
--color-text-secondary: var(--color-zinc-400);
```

Token layers (when needed):
- **Semantic** → `--color-text-secondary` (what it means)
- **Palette** → `--color-zinc-400` (what it looks like)
- **Literal** → `#a1a1aa` (the actual value — Tailwind handles this)

You only need the semantic layer when a meaning is clearly repeating. Don't create tokens speculatively.

## Scrollbar Styling

All scrollable areas use a custom styled scrollbar — subtle, visible on hover, matching the dark theme. This is applied globally via CSS, not per-component. See the base stylesheet for the implementation.

## Responsive / Container Queries

For components that need to adapt to their container size (not just viewport), use CSS container queries. The chat message area is the primary example — content width should scale with available space rather than using a fixed max-width.

Only use container queries when the component genuinely lives in contexts of varying widths. Don't add them speculatively.

## Performance Rules

- **Optimistic updates** — UI responds instantly, syncs in background. Use TanStack Query.
- **GPU-optimized animations** — only animate `transform` and `opacity`. Never animate properties that trigger layout/reflow (width, height, top, left, margin, padding).
- **No layout thrashing** — batch DOM reads and writes. If you're measuring elements, do all reads first, then all writes.

## Dark Theme

The app is dark-theme-first. All UI should be built and tested in dark mode. Use Tailwind's `dark:` variant if light mode is ever needed, but don't build for it until it's requested.

## Process: When Building UI Features

1. Check if relevant components already exist in `@repo/ui`
2. Use Shadcn components as the base layer
3. Use Tailwind classes for layout and one-off styling
4. Extract components only when the rules above are met
5. When extracting, check if the component should live in `@repo/ui` (reusable) or stay colocated (feature-specific)
6. If you create a new semantic token, document it in the CSS file with a comment explaining the meaning
