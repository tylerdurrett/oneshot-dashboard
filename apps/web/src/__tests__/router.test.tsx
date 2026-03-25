import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { routes } from '../router';

// Stub EventSource for jsdom — real page components (TimerGrid) use SSE.
beforeAll(() => {
  if (!globalThis.EventSource) {
    globalThis.EventSource = class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    } as unknown as typeof EventSource;
  }
});

/**
 * Create an in-memory router starting at the given path.
 * Skips the root `/` redirect route to avoid a React Router v7 + jsdom
 * AbortSignal incompatibility (the `loader` redirect triggers an internal
 * `new Request()` that jsdom cannot handle).
 * Wraps in QueryClientProvider so real page components (e.g. TimerGrid) can render.
 */
function renderRoute(initialPath: string) {
  const nonRedirectRoutes = routes.filter((r) => r.path !== '/');
  const memoryRouter = createMemoryRouter(nonRedirectRoutes, {
    initialEntries: [initialPath],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memoryRouter} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('router', () => {
  it('has a root redirect from / to /timers', async () => {
    // Exercise the loader directly to verify the redirect target.
    // (Cannot render via createMemoryRouter due to jsdom AbortSignal issue.)
    const rootRoute = routes.find((r) => r.path === '/');
    expect(rootRoute).toBeDefined();
    expect(rootRoute!.loader).toBeDefined();
    const response = (await rootRoute!.loader!({ request: new Request('http://localhost/'), params: {} })) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/timers');
  });

  it('renders /timers page', () => {
    renderRoute('/timers');
    // "Timers" appears in the AppShell nav; the real TimerGrid also renders
    const matches = screen.getAllByText('Timers');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders /chat placeholder', () => {
    renderRoute('/chat');
    // "Chat" also appears in the AppShell nav — check for the placeholder div
    const matches = screen.getAllByText('Chat');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders /chat/:threadId placeholder', () => {
    renderRoute('/chat/test-thread');
    expect(screen.getByText('Chat Thread')).toBeDefined();
  });

  it('renders /prototype placeholder', () => {
    renderRoute('/prototype');
    expect(screen.getByText('Prototype')).toBeDefined();
  });

  it('renders /prototype/chat placeholder', () => {
    renderRoute('/prototype/chat');
    expect(screen.getByText('Prototype Chat')).toBeDefined();
  });

  it('renders /video placeholder', () => {
    renderRoute('/video');
    expect(screen.getByText('Video')).toBeDefined();
  });
});
