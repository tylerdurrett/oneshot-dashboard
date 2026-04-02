import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { AppShell } from '../app-shell';

function renderWithRouter(pathname: string, children: React.ReactNode = <div />) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppShell>{children}</AppShell>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
});

function mockStandaloneMode(isStandalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isStandalone && query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    value: isStandalone,
  });
}

describe('AppShell', () => {
  it('renders children in the main content area', () => {
    renderWithRouter('/timers/remaining', <div data-testid="child">Content</div>);
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('renders two navigation landmarks (desktop sidebar + mobile bottom)', () => {
    renderWithRouter('/timers/remaining');
    expect(screen.getByRole('navigation', { name: 'Sidebar navigation' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeDefined();
  });

  it('keeps shell navs non-selectable', () => {
    renderWithRouter('/timers/remaining');

    expect(
      screen.getByRole('navigation', { name: 'Sidebar navigation' }).classList.contains('select-none'),
    ).toBe(true);
    expect(
      screen.getByRole('navigation', { name: 'Bottom navigation' }).classList.contains('select-none'),
    ).toBe(true);

    // To Do has context menu so it uses touch-none select-none
    const remainingLink = screen.getAllByText('To Do')[0]!.closest('a');
    expect(remainingLink?.classList.contains('select-none')).toBe(true);
  });

  it('renders To Do, Done, and Settings nav links', () => {
    renderWithRouter('/timers/remaining');
    // Two of each — one desktop, one mobile
    expect(screen.getAllByText('To Do')).toHaveLength(2);
    expect(screen.getAllByText('Done')).toHaveLength(2);
    expect(screen.getAllByText('Settings')).toHaveLength(2);
  });

  it('does not render a More button (hidden for now)', () => {
    renderWithRouter('/timers/remaining');
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('applies the iPhone safe-area inset to the bottom nav instead of the shell', () => {
    const { container } = renderWithRouter('/timers/remaining');

    expect(container.firstElementChild?.classList.contains('safe-area-pb')).toBe(false);
    expect(
      screen.getByRole('navigation', { name: 'Bottom navigation' }).classList.contains('safe-area-pb'),
    ).toBe(true);
  });

  it('marks the shell for the standalone PWA layout workaround when installed', () => {
    mockStandaloneMode(true);
    const { container } = renderWithRouter('/timers/remaining');

    expect(container.firstElementChild?.classList.contains('app-shell-standalone')).toBe(true);
    expect(screen.getByRole('main').classList.contains('app-shell-main')).toBe(true);
    expect(
      screen.getByRole('navigation', { name: 'Bottom navigation' }).classList.contains('app-shell-mobile-nav'),
    ).toBe(true);
  });

  it('highlights To Do when pathname is /timers/remaining', () => {
    renderWithRouter('/timers/remaining');
    const remainingLinks = screen.getAllByText('To Do');
    const parentLink = remainingLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.getAttribute('data-active')).toBe('true');
  });

  it('does not highlight Done when on remaining page', () => {
    renderWithRouter('/timers/remaining');
    const allLinks = screen.getAllByText('Done');
    const parentLink = allLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.hasAttribute('data-active')).toBe(false);
  });

  it('highlights Settings when on settings page', () => {
    renderWithRouter('/settings');
    const settingsLinks = screen.getAllByText('Settings');
    const parentLink = settingsLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.getAttribute('data-active')).toBe('true');
  });
});
