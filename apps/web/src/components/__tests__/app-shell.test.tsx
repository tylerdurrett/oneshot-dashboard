import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
});

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
