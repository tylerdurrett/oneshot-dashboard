# Migrate Frontend from Next.js to Vite + React Router

## Problem

The web app (`apps/web`) runs on Next.js but uses none of its server-side features. All pages are client-rendered, data fetching is done via TanStack Query against a separate Fastify server, and there are no API routes, server actions, or server components with real server logic. Next.js adds unnecessary complexity and weight for what is purely a local SPA.

## Goal

Replace Next.js with Vite as the build tool and dev server, and React Router for client-side routing. The app should behave identically to the user — same routes, same UI, same functionality — but with a simpler, faster toolchain.

## Scope

**In scope:**
- Replace Next.js dev server and build with Vite
- Replace Next.js App Router with React Router v7
- Replace `next/link`, `next/navigation` imports with React Router equivalents
- Replace `next/font/google` with direct font loading
- Replace Next.js `Metadata` exports with `document.title` updates
- Update Turbo pipeline config for Vite output
- Update monorepo scripts (`dev`, `build`, `start`)
- Update TypeScript config to remove Next.js plugin
- Remove `'use client'` directives (no longer needed)
- Update Shadcn `components.json` (`rsc: false`)
- Preserve all existing tests and add new ones for routing

**Out of scope:**
- Changing the Fastify backend
- Changing the `@repo/ui`, `@repo/db`, or `@repo/video` packages
- Adding new features or UI changes
- SSR or pre-rendering (this is a local app, we don't need it)

## Routes to migrate

| Current (Next.js App Router) | Vite + React Router |
|------------------------------|---------------------|
| `/` (redirect to `/timers`) | Navigate redirect |
| `/timers` | `/timers` |
| `/chat` | `/chat` |
| `/chat/[threadId]` | `/chat/:threadId` |
| `/prototype` | `/prototype` |
| `/prototype/chat` | `/prototype/chat` |
| `/video` | `/video` |

## Next.js features currently used (exhaustive list)

- `next/font/google` — Geist + Geist Mono fonts (root layout)
- `next/link` — `Link` component (app-shell, prototype page)
- `next/navigation` — `useRouter`, `usePathname`, `useParams`, `redirect` (chat pages, app-shell, root page)
- `Metadata` / `Viewport` types — page titles (root layout, chat layout, timers page)
- `next.config.ts` — transpilePackages, env vars, redirects
- `'use client'` directives — on ~10 files (no-op in Vite, just remove)
- `error.tsx` convention — chat error boundary (convert to React ErrorBoundary)
