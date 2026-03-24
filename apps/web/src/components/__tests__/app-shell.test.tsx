import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/timers';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { AppShell } from '../app-shell';

afterEach(() => {
  cleanup();
  mockPathname = '/timers';
});

describe('AppShell', () => {
  it('renders children in the main content area', () => {
    render(<AppShell><div data-testid="child">Content</div></AppShell>);
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('renders two navigation landmarks (desktop sidebar + mobile bottom)', () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByRole('navigation', { name: 'Sidebar navigation' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeDefined();
  });

  it('renders Timers and Chat nav links', () => {
    render(<AppShell><div /></AppShell>);
    const timerLinks = screen.getAllByText('Timers');
    const chatLinks = screen.getAllByText('Chat');
    // Two of each — one desktop, one mobile
    expect(timerLinks).toHaveLength(2);
    expect(chatLinks).toHaveLength(2);
  });

  it('renders More as a button (not a link)', () => {
    render(<AppShell><div /></AppShell>);
    const moreButtons = screen.getAllByRole('button', { name: 'More options' });
    expect(moreButtons).toHaveLength(2);
  });

  it('highlights Timers when pathname is /timers', () => {
    mockPathname = '/timers';
    render(<AppShell><div /></AppShell>);
    const timerLinks = screen.getAllByText('Timers');
    const parentLink = timerLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.getAttribute('data-active')).toBe('true');
  });

  it('highlights Chat for nested chat routes (prefix match)', () => {
    mockPathname = '/chat/thread-123';
    render(<AppShell><div /></AppShell>);
    const chatLinks = screen.getAllByText('Chat');
    const parentLink = chatLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.getAttribute('data-active')).toBe('true');
  });

  it('does not highlight Timers when on chat page', () => {
    mockPathname = '/chat';
    render(<AppShell><div /></AppShell>);
    const timerLinks = screen.getAllByText('Timers');
    const parentLink = timerLinks[0]!.closest('a');
    expect(parentLink).toBeDefined();
    expect(parentLink!.hasAttribute('data-active')).toBe(false);
  });
});
