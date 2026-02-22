import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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
    DropdownMenu: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) => (
      <div data-testid="dropdown-menu" data-open={open}>{children}</div>
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
    ConfirmationDialog: ({
      open,
      title,
      description,
      confirmLabel,
      onConfirm,
      onOpenChange,
    }: {
      open: boolean;
      title: string;
      description: string;
      confirmLabel?: string;
      cancelLabel?: string;
      variant?: string;
      onConfirm: () => void;
      onOpenChange: (open: boolean) => void;
    }) =>
      open ? (
        <div data-testid="confirmation-dialog">
          <span data-testid="confirmation-title">{title}</span>
          <span data-testid="confirmation-description">{description}</span>
          <button onClick={onConfirm} data-testid="confirm-delete">
            {confirmLabel}
          </button>
          <button onClick={() => onOpenChange(false)} data-testid="cancel-delete">
            Cancel
          </button>
        </div>
      ) : null,
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
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
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByText('New thread')).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Delete thread tests
  // ---------------------------------------------------------------------------

  it('shows three-dot menu button on each thread item', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByTestId('thread-menu-thread-1')).toBeDefined();
    expect(screen.getByTestId('thread-menu-thread-2')).toBeDefined();
  });

  it('opens confirmation dialog when three-dot menu is clicked', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    // No confirmation dialog initially
    expect(screen.queryByTestId('confirmation-dialog')).toBeNull();

    // Click the three-dot menu for thread-1
    fireEvent.click(screen.getByTestId('thread-menu-thread-1'));

    // Confirmation dialog should appear
    expect(screen.getByTestId('confirmation-dialog')).toBeDefined();
    expect(screen.getByTestId('confirmation-title').textContent).toBe('Delete thread?');
    expect(screen.getByTestId('confirmation-description').textContent).toContain(
      'First conversation',
    );
  });

  it('calls onDeleteThread when delete is confirmed', () => {
    const onDeleteThread = vi.fn();
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={onDeleteThread}
      />,
    );
    // Open confirmation dialog
    fireEvent.click(screen.getByTestId('thread-menu-thread-1'));
    // Confirm
    fireEvent.click(screen.getByTestId('confirm-delete'));
    expect(onDeleteThread).toHaveBeenCalledWith('thread-1');
  });

  it('closes confirmation dialog when cancelled', () => {
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    // Open confirmation dialog
    fireEvent.click(screen.getByTestId('thread-menu-thread-2'));
    expect(screen.getByTestId('confirmation-dialog')).toBeDefined();

    // Cancel
    fireEvent.click(screen.getByTestId('cancel-delete'));
    expect(screen.queryByTestId('confirmation-dialog')).toBeNull();
  });

  it('does not call onSelectThread when three-dot menu is clicked', () => {
    const onSelectThread = vi.fn();
    render(
      <ThreadSelector
        threads={threads}
        activeThreadId="thread-1"
        onSelectThread={onSelectThread}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('thread-menu-thread-1'));
    // onSelectThread should NOT have been called
    expect(onSelectThread).not.toHaveBeenCalled();
  });
});
