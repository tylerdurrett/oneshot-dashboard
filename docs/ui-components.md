# UI Components

The `packages/ui/` package is your shared component library, powered by [Shadcn](https://ui.shadcn.com/) and [Tailwind CSS v4](https://tailwindcss.com/). It comes with a few starter components and makes it easy to add more.

## What's Included

Out of the box, you get:

- **Button** — with size and style variants (default, destructive, outline, ghost, link)
- **Card** — with Header, Title, Description, Content, and Footer sub-components
- **Input** — styled text input

These are real, production-quality components from Shadcn — not toy examples.

## Using Components

Import them in your app like any other package:

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@repo/ui';

export default function MyPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign Up</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Email" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  );
}
```

## Adding New Components

Shadcn has a [huge library of components](https://ui.shadcn.com/docs/components) — dialogs, dropdowns, tables, forms, date pickers, and more. Add any of them with one command:

```bash
pnpm dlx shadcn@latest add <component-name> --cwd packages/ui
```

For example, to add a dialog:

```bash
pnpm dlx shadcn@latest add dialog --cwd packages/ui
```

The component gets installed into `packages/ui/src/components/` and you'll need to export it from `packages/ui/src/index.ts` to use it in your app.

> **Tip:** Just ask Claude Code — "Add a dialog component to the UI package" — and it'll handle all of this for you, including the export.

## Styling

Components use Tailwind CSS v4 with a theme defined in `packages/ui/src/styles/globals.css`. The theme includes:

- **Semantic color tokens** — `--background`, `--foreground`, `--primary`, `--muted`, etc.
- **Dark mode support** — colors automatically switch in dark mode
- **Border radius** — configurable via `--radius`

To customize the look and feel, edit the CSS variables in that file. All components will pick up the changes.

## The `cn()` Utility

A small but important helper that merges Tailwind classes without conflicts:

```tsx
import { cn } from '@repo/ui';

<div className={cn('px-4 py-2', isActive && 'bg-primary text-white')} />
```

This is exported from `@repo/ui` and is used throughout the component library.

## Testing

The UI package includes tests to verify components export correctly and that the `cn()` utility works as expected. Run them with:

```bash
pnpm --filter @repo/ui test
```
