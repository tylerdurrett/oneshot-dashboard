import { createBrowserRouter, Outlet, redirect } from 'react-router';

import { AppShell } from '@/components/app-shell';
import { RouteErrorBoundary } from '@/components/error-boundary';
import TimersLayout from '@/app/(shell)/timers/layout';
import TimersPage from '@/app/(shell)/timers/page';
import TimersAllPage from '@/app/(shell)/timers/all-page';
import ChatIndexPage from '@/app/(shell)/chat/page';
import ThreadPage from '@/app/(shell)/chat/[threadId]/page';
import ChatLayout from '@/app/(shell)/chat/layout';
import { ChatRunProvider } from '@/app/(shell)/chat/chat-run-context';
import PrototypeIndex from '@/app/prototype/page';
import ChatPrototype from '@/app/prototype/chat/page';
import VideoPage from '@/app/video/page';

// ---------------------------------------------------------------------------
// Shell layout — wraps routes in the AppShell (sidebar + bottom nav).
// ---------------------------------------------------------------------------

function ShellLayout() {
  return (
    <ChatRunProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ChatRunProvider>
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
// Route definitions — exported separately for testing.
// ---------------------------------------------------------------------------

export const routes = [
  {
    path: '/',
    loader: () => redirect('/timers/remaining'),
  },
  {
    element: <ShellLayout />,
    children: [
      {
        element: <TimersLayout />,
        children: [
          { path: 'timers', loader: () => redirect('/timers/remaining') },
          { path: 'timers/remaining', element: <TimersPage /> },
          { path: 'timers/all', element: <TimersAllPage /> },
        ],
      },
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
      { path: 'prototype', element: <PrototypeIndex /> },
      { path: 'prototype/chat', element: <ChatPrototype /> },
    ],
  },
  {
    // Standalone route — video page has no shell or layout wrapper
    path: 'video',
    element: <VideoPage />,
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
