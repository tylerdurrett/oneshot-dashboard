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
import SettingsPage from '@/app/(shell)/settings/page';
import NoFeaturesPage from '@/app/no-features/page';
import { features, getHomeRedirectPath } from '@/lib/features';

// ---------------------------------------------------------------------------
// Shell layout — wraps routes in the AppShell (sidebar + bottom nav).
// ChatRunProvider is only mounted when the chat feature is enabled to avoid
// unnecessary hooks/subscriptions.
// ---------------------------------------------------------------------------

function ShellLayout() {
  const content = (
    <AppShell>
      <Outlet />
    </AppShell>
  );
  return features.chat ? <ChatRunProvider>{content}</ChatRunProvider> : content;
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
// Shell children and standalone routes are gated by feature flags.
// ---------------------------------------------------------------------------

const shellChildren = [
  ...(features.timers
    ? [
        {
          element: <TimersLayout />,
          children: [
            { path: 'timers', loader: () => redirect('/timers/remaining') },
            { path: 'timers/remaining', element: <TimersPage /> },
            { path: 'timers/all', element: <TimersAllPage /> },
          ],
        },
      ]
    : []),
  ...(features.chat
    ? [
        {
          element: <ChatLayout />,
          errorElement: <RouteErrorBoundary />,
          children: [
            { path: 'chat', element: <ChatIndexPage /> },
            { path: 'chat/:threadId', element: <ThreadPage /> },
          ],
        },
      ]
    : []),
  { path: 'settings', element: <SettingsPage /> },
];

const prototypeChildren = [
  { path: 'prototype', element: <PrototypeIndex /> },
  ...(features.chat
    ? [{ path: 'prototype/chat', element: <ChatPrototype /> }]
    : []),
];

export const routes = [
  {
    path: '/',
    loader: () => redirect(getHomeRedirectPath()),
  },
  {
    element: <ShellLayout />,
    children: shellChildren,
  },
  {
    element: <PrototypeLayout />,
    children: prototypeChildren,
  },
  ...(features.video
    ? [
        {
          // Standalone route — video page has no shell or layout wrapper
          path: 'video',
          element: <VideoPage />,
        },
      ]
    : []),
  {
    path: 'no-features',
    element: <NoFeaturesPage />,
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
