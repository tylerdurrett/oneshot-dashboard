import { render, screen, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockCreateThread = vi.fn();

vi.mock('../api', () => ({
  createThread: (...args: unknown[]) => mockCreateThread(...args),
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
    mockCreateThread.mockReset();
    mockReplace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not show spinner immediately (avoids flash for fast operations)', () => {
    vi.useFakeTimers();
    mockCreateThread.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ChatIndexPage />);
    expect(screen.queryByTestId('spinner')).toBeNull();
    vi.useRealTimers();
  });

  it('shows a spinner after a delay while creating the thread', () => {
    vi.useFakeTimers();
    mockCreateThread.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ChatIndexPage />);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId('spinner')).toBeDefined();
    vi.useRealTimers();
  });

  it('creates a thread on mount', async () => {
    mockCreateThread.mockReturnValue(new Promise(() => {}));
    render(<ChatIndexPage />);
    expect(mockCreateThread).toHaveBeenCalledTimes(1);
  });

  it('redirects to /chat/:id after thread creation', async () => {
    mockCreateThread.mockResolvedValue({ id: 'new-thread-123' });

    await act(async () => {
      render(<ChatIndexPage />);
    });

    expect(mockReplace).toHaveBeenCalledWith('/chat/new-thread-123');
  });

  it('does not double-create if component re-renders', () => {
    mockCreateThread.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<ChatIndexPage />);
    rerender(<ChatIndexPage />);
    // The creatingRef guard prevents a second call
    expect(mockCreateThread).toHaveBeenCalledTimes(1);
  });

  it('renders fullscreen centered layout', () => {
    mockCreateThread.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ChatIndexPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
    expect(root.className).toContain('items-center');
    expect(root.className).toContain('justify-center');
  });
});
