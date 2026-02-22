import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockMutate = vi.fn();

vi.mock('../use-threads', () => ({
  useCreateThread: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('@repo/ui', () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import ChatIndexPage from '../page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatIndexPage (redirect)', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockReplace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a spinner while creating the thread', () => {
    render(<ChatIndexPage />);
    expect(screen.getByTestId('spinner')).toBeDefined();
  });

  it('creates a thread on mount', () => {
    render(<ChatIndexPage />);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(undefined, expect.objectContaining({
      onSuccess: expect.any(Function),
      onSettled: expect.any(Function),
    }));
  });

  it('redirects to /chat/:id after thread creation', () => {
    mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
      opts.onSuccess({ id: 'new-thread-123' });
    });

    render(<ChatIndexPage />);
    expect(mockReplace).toHaveBeenCalledWith('/chat/new-thread-123');
  });

  it('does not double-create if component re-renders', () => {
    const { rerender } = render(<ChatIndexPage />);
    rerender(<ChatIndexPage />);
    // The creatingRef guard prevents a second call
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('renders fullscreen centered layout', () => {
    const { container } = render(<ChatIndexPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
    expect(root.className).toContain('items-center');
    expect(root.className).toContain('justify-center');
  });
});
