import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { routes } from '../router';

// Stub the ChatSocketProvider's context — real chat pages consume it.
vi.mock('../app/(shell)/chat/chat-socket-context', () => ({
  useChatSocketContext: () => ({
    sendMessage: vi.fn(),
    messages: [],
    setMessages: vi.fn(),
    isStreaming: false,
    error: null,
    clearError: vi.fn(),
    connectionStatus: 'connected',
  }),
  ChatSocketProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Stub browser APIs missing in jsdom — real page components use SSE and ResizeObserver.
beforeAll(() => {
  if (!globalThis.EventSource) {
    globalThis.EventSource = class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    } as unknown as typeof EventSource;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
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

  it('renders /chat page', () => {
    renderRoute('/chat');
    // Real ChatIndexPage renders with prompt input and empty state
    expect(screen.getByText('What can I help you with?')).toBeDefined();
  });

  it('renders /chat/:threadId page', () => {
    renderRoute('/chat/test-thread');
    // Real ThreadPage renders with prompt input
    expect(screen.getByPlaceholderText('Type a message...')).toBeDefined();
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
