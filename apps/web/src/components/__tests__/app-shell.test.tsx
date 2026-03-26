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
    renderWithRouter('/timers', <div data-testid="child">Content</div>);
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('renders two navigation landmarks (desktop sidebar + mobile bottom)', () => {
    renderWithRouter('/timers');
    expect(screen.getByRole('navigation', { name: 'Sidebar navigation' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeDefined();
  });

  it('keeps shell navs non-selectable', () => {
    renderWithRouter('/timers');

    expect(
      screen.getByRole('navigation', { name: 'Sidebar navigation' }).classList.contains('select-none'),
    ).toBe(true);
    expect(
      screen.getByRole('navigation', { name: 'Bottom navigation' }).classList.contains('select-none'),
    ).toBe(true);

    const timerLink = screen.getAllByText('Timers')[0]!.closest('a');
    expect(timerLink?.classList.contains('select-none')).toBe(true);

    const moreButton = screen.getAllByRole('button', { name: 'More options' })[0]!;
    expect(moreButton.classList.contains('select-none')).toBe(true);
  });

  it('renders Timers and Chat nav links', () => {
    renderWithRouter('/timers');
    const timerLinks = screen.getAllByText('Timers');
    const chatLinks = screen.getAllByText('Chat');
    // Two of each — one desktop, one mobile
    expect(timerLinks).toHaveLength(2);
    expect(chatLinks).toHaveLength(2);
  });

  it('renders More as a button (not a link)', () => {
    renderWithRouter('/timers');
    const moreButtons = screen.getAllByRole('button', { name: 'More options' });
    expect(moreButtons).toHaveLength(2);
  });

  it('applies the iPhone safe-area inset to the bottom nav instead of the shell', () => {
    const { container } = renderWithRouter('/timers');

    expect(container.firstElementChild?.classList.contains('safe-area-pb')).toBe(false);
    expect(
      screen.getByRole('navigation', { name: 'Bottom navigation' }).classList.contains('safe-area-pb'),
    ).toBe(true);
  });

  it('marks the shell for the standalone PWA layout workaround when installed', () => {
    mockStandaloneMode(true);
    const { container } = renderWithRouter('/timers');

    expect(container.firstElementChild?.classList.contains('app-shell-standalone')).toBe(true);
    expect(screen.getByRole('main').classList.contains('app-shell-main')).toBe(true);
    expect(
      screen.getByRole('navigation', { name: 'Bottom navigation' }).classList.contains('app-shell-mobile-nav'),
    ).toBe(true);
  });

  it('highlights Timers when pathname is /timers', () => {
    renderWithRouter('/timers');
    const timerLinks = screen.getAllByText('Timers');
    const parentLink = timerLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.getAttribute('data-active')).toBe('true');
  });

  it('highlights Chat for nested chat routes (prefix match)', () => {
    renderWithRouter('/chat/thread-123');
    const chatLinks = screen.getAllByText('Chat');
    const parentLink = chatLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.getAttribute('data-active')).toBe('true');
  });

  it('does not highlight Timers when on chat page', () => {
    renderWithRouter('/chat');
    const timerLinks = screen.getAllByText('Timers');
    const parentLink = timerLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.hasAttribute('data-active')).toBe(false);
  });
});
