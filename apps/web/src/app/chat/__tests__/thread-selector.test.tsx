import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Thread } from '../api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../format-time-ago', () => ({
  formatTimeAgo: (ts: number) => `${ts}s ago`,
}));

// Mock @repo/ui dropdown components with testable structure
vi.mock('@repo/ui', () => {
  return {
    Button: ({
      children,
      className,
      variant,
      size,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      variant?: string;
      size?: string;
      [key: string]: unknown;
    }) => (
      <button className={className} data-variant={variant} data-size={size} {...props}>
        {children}
      </button>
    ),
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dropdown-menu">{children}</div>
    ),
    DropdownMenuTrigger: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <div data-testid="dropdown-trigger">{children}</div>,
    DropdownMenuContent: ({
      children,
      align,
      className,
    }: {
      children: React.ReactNode;
      align?: string;
      className?: string;
    }) => (
      <div data-testid="dropdown-content" data-align={align} className={className}>
        {children}
      </div>
    ),
    DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dropdown-group">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      className,
      onSelect,
      disabled,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      onSelect?: () => void;
      disabled?: boolean;
      [key: string]: unknown;
    }) => (
      <div
        role="menuitem"
        className={className}
        data-disabled={disabled || undefined}
        onClick={onSelect}
        {...props}
      >
        {children}
      </div>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dropdown-label">{children}</div>
    ),
    DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ThreadSelector } from '../thread-selector';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const threads: Thread[] = [
  {
    id: 'thread-1',
    title: 'First conversation',
    claudeSessionId: null,
    createdAt: 1000,
    updatedAt: 3000,
  },
  {
    id: 'thread-2',
    title: 'Second conversation',
    claudeSessionId: 'sess-1',
    createdAt: 2000,
    updatedAt: 2000,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreadSelector', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('displays active thread title in trigger', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    expect(screen.getByTestId('thread-selector-trigger').textContent).toContain(
      'First conversation',
    );
  });

  it('shows "New conversation" when no active thread', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId={null}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    expect(screen.getByTestId('thread-selector-trigger').textContent).toContain(
      'New conversation',
    );
  });

  it('lists all threads in dropdown', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    // "First conversation" appears in both trigger and list
    expect(screen.getAllByText('First conversation')).toHaveLength(2);
    expect(screen.getByText('Second conversation')).toBeDefined();
  });

  it('shows timestamps for each thread', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    expect(screen.getByText('3000s ago')).toBeDefined();
    expect(screen.getByText('2000s ago')).toBeDefined();
  });

  it('highlights active thread with bg-accent/50 class', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    const activeItem = screen.getByTestId('thread-item-thread-1');
    expect(activeItem.className).toContain('bg-accent/50');

    const inactiveItem = screen.getByTestId('thread-item-thread-2');
    expect(inactiveItem.className).not.toContain('bg-accent/50');
  });

  it('calls onSelectThread when a thread is clicked', () => {
    const onSelectThread = vi.fn();
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={onSelectThread}
        onNewThread={vi.fn()}
      />,
    );
    screen.getByTestId('thread-item-thread-2').click();
    expect(onSelectThread).toHaveBeenCalledWith('thread-2');
  });

  it('calls onNewThread when new thread button is clicked', () => {
    const onNewThread = vi.fn();
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={onNewThread}
      />,
    );
    screen.getByTestId('new-thread-button').click();
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no threads', () => {
    render(
      <ThreadSelector
        threads={[]}
        activeThreadId={null}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    expect(screen.getByText('No threads yet')).toBeDefined();
  });

  it('renders "Threads" label in dropdown', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    expect(screen.getByText('Threads')).toBeDefined();
  });

  it('renders "New thread" option with plus icon', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
      />,
    );
    expect(screen.getByText('New thread')).toBeDefined();
  });
});
