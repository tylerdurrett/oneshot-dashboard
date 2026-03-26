import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import TimersLayout from '../layout';
import TimersPage from '../page';
import TimersAllPage from '../all-page';

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

afterEach(cleanup);

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
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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
    // The sub-nav tabs are present alongside the timer content
    expect(screen.getByText('Remaining')).toBeDefined();
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
});
