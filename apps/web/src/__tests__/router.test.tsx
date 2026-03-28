import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../router';

// Ensure all features are enabled for the default router test suite.
vi.mock('@/lib/features', () => ({
  features: { timers: true, chat: true, video: true },
  getHomeRedirectPath: () => '/timers/remaining',
}));

const providerLifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
}));

// Stub the ChatRunProvider's context — real chat pages consume it.
vi.mock('../app/(shell)/chat/chat-run-context', async () => {
  const React = await import('react');

  return {
    useChatRunContext: () => ({
      sendMessage: vi.fn(async () => ({ threadId: 'thread-1' })),
      messages: [],
      setMessages: vi.fn(),
      isStreaming: false,
      streamState: 'idle',
      error: null,
      setError: vi.fn(),
      clearError: vi.fn(),
      setVisibleThreadId: vi.fn(),
    }),
    ChatRunProvider: ({ children }: { children: React.ReactNode }) => {
      React.useEffect(() => {
        providerLifecycle.mounts += 1;
        return () => {
          providerLifecycle.unmounts += 1;
        };
      }, []);

      return (
        <>
          <div data-testid="chat-run-provider-marker" />
          {children}
        </>
      );
    },
  };
});

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

beforeEach(() => {
  providerLifecycle.mounts = 0;
  providerLifecycle.unmounts = 0;
});

describe('router', () => {
  it('has a root redirect from / to /timers/remaining', async () => {
    // Exercise the loader directly to verify the redirect target.
    // (Cannot render via createMemoryRouter due to jsdom AbortSignal issue.)
    const rootRoute = routes.find((r) => r.path === '/');
    expect(rootRoute).toBeDefined();
    expect(rootRoute!.loader).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loader args unused by redirect
    const response = (await (rootRoute!.loader as any)({ request: new Request('http://localhost/'), params: {} })) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/timers/remaining');
  });

  it('renders /timers/remaining page', () => {
    renderRoute('/timers/remaining');
    // "Timers" appears in the AppShell nav; sub-nav tabs also render
    const matches = screen.getAllByText('Timers');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Remaining')).toBeDefined();
  });

  it('renders /timers/all page', () => {
    renderRoute('/timers/all');
    expect(screen.getByText('No time tracked yet')).toBeDefined();
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

  it('provides the chat socket at the shell level so timers and chat share it', () => {
    renderRoute('/timers/remaining');

    expect(screen.getByTestId('chat-run-provider-marker')).toBeDefined();
    expect(providerLifecycle.mounts).toBe(1);
    expect(providerLifecycle.unmounts).toBe(0);
  });

  it('renders /prototype page', () => {
    renderRoute('/prototype');
    expect(screen.getByText('Prototypes')).toBeDefined();
    expect(screen.getByText('Fullscreen Chat')).toBeDefined();
  });

  it('renders /prototype/chat page', () => {
    renderRoute('/prototype/chat');
    expect(screen.getByPlaceholderText('Type a message...')).toBeDefined();
  });

  it('renders /video page', () => {
    renderRoute('/video');
    expect(screen.getByText('Video Demo')).toBeDefined();
  });
});
