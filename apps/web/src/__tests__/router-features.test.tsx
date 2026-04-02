/**
 * Tests for feature-flag-driven route gating.
 *
 * Because feature flags are evaluated at module load time (router.tsx reads
 * from @/lib/features at the top level), we use vi.resetModules() + dynamic
 * import() to force re-evaluation with different mock values per test group.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable state that the mock reads from — changed per describe block.
const mockState = vi.hoisted(() => ({
  features: { timers: true, chat: true, video: true },
  homePath: '/timers/remaining',
}));

vi.mock('@/lib/features', () => ({
  get features() {
    return mockState.features;
  },
  getHomeRedirectPath: () => mockState.homePath,
}));

// Force desktop layout — jsdom has no real viewport width, so useIsMobile
// would return true. Feature-flag tests exercise the desktop (Outlet) path.
vi.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => false,
}));

// Stub browser APIs missing in jsdom
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

// Stub the ChatRunProvider so it renders a marker we can check for.
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
    ChatRunProvider: ({ children }: { children: React.ReactNode }) => (
      <>
        <div data-testid="chat-run-provider-marker" />
        {children}
      </>
    ),
  };
});

afterEach(cleanup);

function renderRoute(
  routes: Parameters<typeof createMemoryRouter>[0],
  initialPath: string,
) {
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

async function getRedirectTarget(routes: { path?: string; loader?: unknown }[]) {
  const rootRoute = routes.find((r) => r.path === '/');
  const response = (await (rootRoute!.loader as (args: unknown) => Promise<Response>)({
    request: new Request('http://localhost/'),
    params: {},
  })) as Response;
  return response.headers.get('Location');
}

describe('feature flags: chat disabled', () => {
  beforeEach(() => {
    mockState.features = { timers: true, chat: false, video: true };
    mockState.homePath = '/timers/remaining';
    vi.resetModules();
  });

  it('does not mount ChatRunProvider when chat is disabled', async () => {
    const { routes } = await import('../router');
    renderRoute(routes, '/timers/remaining');
    expect(screen.queryByTestId('chat-run-provider-marker')).toBeNull();
  });

  it('home redirect targets /timers/remaining', async () => {
    const { routes } = await import('../router');
    expect(await getRedirectTarget(routes)).toBe('/timers/remaining');
  });
});

describe('feature flags: timers disabled', () => {
  beforeEach(() => {
    mockState.features = { timers: false, chat: true, video: true };
    mockState.homePath = '/chat';
    vi.resetModules();
  });

  it('home redirect targets /chat when timers is off', async () => {
    const { routes } = await import('../router');
    expect(await getRedirectTarget(routes)).toBe('/chat');
  });
});

describe('feature flags: all disabled', () => {
  beforeEach(() => {
    mockState.features = { timers: false, chat: false, video: false };
    mockState.homePath = '/no-features';
    vi.resetModules();
  });

  it('home redirect targets /no-features when everything is off', async () => {
    const { routes } = await import('../router');
    expect(await getRedirectTarget(routes)).toBe('/no-features');
  });

  it('renders the no-features page', async () => {
    const { routes } = await import('../router');
    renderRoute(routes, '/no-features');
    expect(screen.getByText('No features enabled')).toBeDefined();
  });
});
