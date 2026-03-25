import { createBrowserRouter, Outlet, redirect } from 'react-router';

// ---------------------------------------------------------------------------
// Temporary layout — passes through child routes via <Outlet />.
// The real AppShell / ChatProviders integration happens in Phase 2.1 once
// next/link and next/navigation imports are replaced with React Router.
// ---------------------------------------------------------------------------

function PassthroughLayout() {
  return <Outlet />;
}

function PrototypeLayout() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder page components — replaced with real pages in Phase 3.
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
    element: <PassthroughLayout />,
    children: [
      { path: 'timers', element: placeholder('Timers')() },
      {
        element: <PassthroughLayout />,
        children: [
          { path: 'chat', element: placeholder('Chat')() },
          { path: 'chat/:threadId', element: placeholder('Chat Thread')() },
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
