import { createBrowserRouter, Outlet, redirect } from 'react-router';

import { AppShell } from '@/components/app-shell';
import { RouteErrorBoundary } from '@/components/error-boundary';
import TimersPage from '@/app/(shell)/timers/page';
import ChatIndexPage from '@/app/(shell)/chat/page';
import ThreadPage from '@/app/(shell)/chat/[threadId]/page';
import ChatLayout from '@/app/(shell)/chat/layout';

// ---------------------------------------------------------------------------
// Shell layout — wraps routes in the AppShell (sidebar + bottom nav).
// ---------------------------------------------------------------------------

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function PrototypeLayout() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder for routes not yet migrated (Phase 3.3).
// ---------------------------------------------------------------------------

const placeholder = (name: string) => () => <div>{name}</div>;

// ---------------------------------------------------------------------------
// Route definitions — exported separately for testing.
// ---------------------------------------------------------------------------

export const routes = [
  {
    path: '/',
    loader: () => redirect('/timers'),
  },
  {
    element: <ShellLayout />,
    children: [
      { path: 'timers', element: <TimersPage /> },
      {
        element: <ChatLayout />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: 'chat', element: <ChatIndexPage /> },
          { path: 'chat/:threadId', element: <ThreadPage /> },
        ],
      },
    ],
  },
  {
    element: <PrototypeLayout />,
    children: [
      { path: 'prototype', element: placeholder('Prototype')() },
      { path: 'prototype/chat', element: placeholder('Prototype Chat')() },
    ],
  },
  {
    // Standalone route — video page has no shell or layout wrapper
    path: 'video',
    element: placeholder('Video')(),
  },
];

// ---------------------------------------------------------------------------
// Router — lazy-initialized to avoid triggering browser APIs at import time
// (createBrowserRouter calls `new Request()` immediately, which breaks in
// jsdom test environments).
// ---------------------------------------------------------------------------

let _router: ReturnType<typeof createBrowserRouter> | null = null;

export function getRouter() {
  if (!_router) {
    _router = createBrowserRouter(routes);
  }
  return _router;
}
