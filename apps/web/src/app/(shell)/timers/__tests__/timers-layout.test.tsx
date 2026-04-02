import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import TimersLayout from '../layout';
import TimersPage from '../page';
import TimersAllPage from '../all-page';

const NativeRequest = globalThis.Request;

vi.mock('../_hooks/use-timer-state', () => ({
  useTimerState: () => ({
    isHydrated: true,
    allBuckets: [],
    todaysBuckets: [],
    activeBucketId: null,
    goalReachedBuckets: new Set(),
    toggleBucket: vi.fn(),
    addBucket: vi.fn(),
    removeBucket: vi.fn(),
    updateBucket: vi.fn(),
    resetBucketForToday: vi.fn(),
    setElapsedTime: vi.fn(),
    dismissBucketForToday: vi.fn(),
  }),
}));

vi.mock('../_components/timer-grid', () => ({
  TimerGridWithState: () => (
    <div data-testid="remaining-view">Remaining View</div>
  ),
}));

vi.mock('../_components/all-timer-grid', () => ({
  AllTimerGridWithState: () => <div data-testid="all-view">All View</div>,
}));

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

  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const safeInit = init ? { ...init, signal: undefined } : init;
      super(input, safeInit);
    }
  } as typeof Request;
});

afterAll(() => {
  globalThis.Request = NativeRequest;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTimersRoute(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        element: <TimersLayout />,
        children: [
          { path: 'timers/remaining', element: <TimersPage /> },
          { path: 'timers/all', element: <TimersAllPage /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe('TimersLayout', () => {
  it('renders the Remaining view on the remaining route', () => {
    renderTimersRoute('/timers/remaining');
    expect(screen.getByTestId('remaining-view')).toBeDefined();
  });

  it('renders the All view on the all route', () => {
    renderTimersRoute('/timers/all');
    expect(screen.getByTestId('all-view')).toBeDefined();
  });

  it('keeps a dedicated timers content wrapper for standalone PWA spacing fixes', () => {
    const { container } = renderTimersRoute('/timers/remaining');
    expect(container.querySelector('.timers-content')).toBeTruthy();
  });

  // Secondary nav was removed — navigation between Remaining and All
  // is now handled by the main app-shell nav, not the timers layout.
  it('does not render a secondary sub-nav', () => {
    renderTimersRoute('/timers/remaining');
    expect(screen.queryByLabelText('Timer views')).toBeNull();
  });

  it('does not render a mobile pager', () => {
    renderTimersRoute('/timers/remaining');
    expect(screen.queryByTestId('timers-mobile-pager')).toBeNull();
  });
});
