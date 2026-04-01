import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import TimersLayout from '../layout';
import TimersPage from '../page';
import TimersAllPage from '../all-page';

const viewSpies = vi.hoisted(() => ({
  remainingClick: vi.fn(),
}));

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
    setRemainingTime: vi.fn(),
    dismissBucketForToday: vi.fn(),
  }),
}));

vi.mock('../_components/timer-grid', () => ({
  TimerGridWithState: () => (
    <button
      data-testid="remaining-view-button"
      role="button"
      onClick={viewSpies.remainingClick}
      className="h-full w-full"
    >
      Remaining View
    </button>
  ),
}));

vi.mock('../_components/all-timer-grid', () => ({
  AllTimerGridWithState: () => <div>No time tracked yet</div>,
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
  viewSpies.remainingClick.mockReset();
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: 0,
  });
});

beforeEach(() => {
  mockTouchEnvironment({ isMobile: false, isCoarsePointer: false });
});

function mockTouchEnvironment({
  isMobile,
  isCoarsePointer,
}: {
  isMobile: boolean;
  isCoarsePointer: boolean;
}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        (query === '(max-width: 767px)' && isMobile) ||
        ((query === '(pointer: coarse)' || query === '(any-pointer: coarse)') && isCoarsePointer),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: isCoarsePointer ? 1 : 0,
  });
}

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

function setPagerBounds(pager: HTMLElement, width = 300, height = 640) {
  Object.defineProperty(pager, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }),
  });
}

function swipe(target: HTMLElement, pager: HTMLElement, {
  startX,
  startY,
  endX,
  endY,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: startX,
    clientY: startY,
  });
  fireEvent.pointerMove(pager, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: endX,
    clientY: endY,
  });
  fireEvent.pointerUp(pager, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: endX,
    clientY: endY,
  });
}

describe('TimersLayout', () => {
  it('renders both sub-nav tabs', () => {
    renderTimersRoute('/timers/remaining');
    expect(screen.getByText('Remaining')).toBeDefined();
    expect(screen.getByText('All')).toBeDefined();
  });

  it('keeps the timer view nav non-selectable', () => {
    renderTimersRoute('/timers/remaining');

    const nav = screen.getByLabelText('Timer views');
    expect(nav.classList.contains('select-none')).toBe(true);

    const remainingLink = screen.getByText('Remaining').closest('a');
    const allLink = screen.getByText('All').closest('a');
    expect(remainingLink?.classList.contains('select-none')).toBe(true);
    expect(allLink?.classList.contains('select-none')).toBe(true);
  });

  it('renders the TimerGrid on the remaining route', () => {
    renderTimersRoute('/timers/remaining');
    expect(screen.getByText('Remaining View')).toBeDefined();
    expect(screen.getByLabelText('Timer views')).toBeDefined();
  });

  it('renders the All page on the all route', () => {
    renderTimersRoute('/timers/all');
    expect(screen.getByText('No time tracked yet')).toBeDefined();
  });

  it('highlights the active tab', () => {
    renderTimersRoute('/timers/remaining');
    const remainingLink = screen.getByText('Remaining').closest('a');
    const allLink = screen.getByText('All').closest('a');

    // Active tab has text-sidebar-foreground (no /50 opacity suffix)
    expect(remainingLink?.className).toContain('text-sidebar-foreground');
    expect(remainingLink?.className).not.toContain('text-sidebar-foreground/50');

    // Inactive tab has /50 opacity
    expect(allLink?.className).toContain('text-sidebar-foreground/50');
  });

  it('keeps a dedicated timers content wrapper for standalone PWA spacing fixes', () => {
    const { container } = renderTimersRoute('/timers/remaining');
    expect(container.querySelector('.timers-content')).toBeTruthy();
  });

  it('keeps the desktop route rendering path when swipe mode is unavailable', () => {
    renderTimersRoute('/timers/remaining');
    expect(screen.queryByTestId('timers-mobile-pager')).toBeNull();
    expect(screen.getByText('Remaining View')).toBeDefined();
  });

  it('swipes left from Remaining to All on touch mobile', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/remaining');

    const pager = await screen.findByTestId('timers-mobile-pager');
    const target = screen.getByTestId('remaining-view-button');
    setPagerBounds(pager);

    swipe(target, pager, { startX: 220, startY: 120, endX: 90, endY: 128 });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/all');
    });
  });

  it('swipes right from All to Remaining on touch mobile', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/all');

    const pager = await screen.findByTestId('timers-mobile-pager');
    setPagerBounds(pager);

    swipe(pager, pager, { startX: 90, startY: 140, endX: 220, endY: 148 });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/remaining');
    });
  });

  it('snaps back when the swipe is too short', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/remaining');

    const pager = await screen.findByTestId('timers-mobile-pager');
    setPagerBounds(pager);

    swipe(pager, pager, { startX: 180, startY: 120, endX: 130, endY: 124 });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/remaining');
    });
  });

  it('ignores edge-start swipes so native navigation keeps priority', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/remaining');

    const pager = await screen.findByTestId('timers-mobile-pager');
    setPagerBounds(pager);

    swipe(pager, pager, { startX: 12, startY: 120, endX: 180, endY: 125 });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/remaining');
    });
  });

  it('does not navigate on vertical drags', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/remaining');

    const pager = await screen.findByTestId('timers-mobile-pager');
    setPagerBounds(pager);

    swipe(pager, pager, { startX: 180, startY: 100, endX: 188, endY: 220 });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/remaining');
    });
  });

  it('still lets the sub-nav tabs navigate when swipe mode is enabled', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/remaining');

    fireEvent.click(screen.getByText('All'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/all');
    });
  });

  it('sizes each mobile pager panel to one viewport width', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    renderTimersRoute('/timers/remaining');

    const remainingPage = await screen.findByTestId('timers-page-remaining');
    const allPage = screen.getByTestId('timers-page-all');

    expect(remainingPage.getAttribute('style')).toContain('width: 50%');
    expect(allPage.getAttribute('style')).toContain('width: 50%');
  });

  it('suppresses bucket clicks after a claimed page swipe', async () => {
    mockTouchEnvironment({ isMobile: true, isCoarsePointer: true });
    const { router } = renderTimersRoute('/timers/remaining');

    const pager = await screen.findByTestId('timers-mobile-pager');
    const target = screen.getByTestId('remaining-view-button');
    setPagerBounds(pager);

    swipe(target, pager, { startX: 220, startY: 120, endX: 90, endY: 126 });
    fireEvent.click(target);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/timers/all');
    });
    expect(viewSpies.remainingClick).not.toHaveBeenCalled();
  });
});
