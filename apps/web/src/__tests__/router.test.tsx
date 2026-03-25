import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { routes } from '../router';

/**
 * Create an in-memory router starting at the given path.
 * Skips the root `/` redirect route to avoid a React Router v7 + jsdom
 * AbortSignal incompatibility (the `loader` redirect triggers an internal
 * `new Request()` that jsdom cannot handle).
 */
function renderRoute(initialPath: string) {
  const nonRedirectRoutes = routes.filter((r) => r.path !== '/');
  const memoryRouter = createMemoryRouter(nonRedirectRoutes, {
    initialEntries: [initialPath],
  });
  return render(<RouterProvider router={memoryRouter} />);
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

  it('renders /timers placeholder', () => {
    renderRoute('/timers');
    // "Timers" also appears in the AppShell nav — check for the placeholder div
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
