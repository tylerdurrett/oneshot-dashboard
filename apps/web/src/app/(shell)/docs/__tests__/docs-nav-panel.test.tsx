import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useParams: () => ({}),
  useNavigate: () => mockNavigate,
}));

const mockMutate = vi.fn();

vi.mock('../_hooks/use-doc-query', () => ({
  useCreateDocument: () => ({ mutate: mockMutate }),
  useDocuments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/format-time-ago', () => ({
  formatTimeAgo: () => 'just now',
}));

import { DocsNavPanel } from '../_components/docs-nav-panel';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocsNavPanel', () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockReset();
    mockMutate.mockReset();
    vi.restoreAllMocks();
  });

  it('renders the "Documents" header', () => {
    render(<DocsNavPanel />);
    expect(screen.getByText('Documents')).toBeDefined();
  });

  it('renders the new document button with aria-label', () => {
    render(<DocsNavPanel />);
    const btn = screen.getByTestId('docs-nav-new-btn');
    expect(btn).toBeDefined();
    expect(btn.getAttribute('aria-label')).toBe('New document');
  });

  it('renders the DocList component', () => {
    render(<DocsNavPanel />);
    // DocList renders empty state when no docs
    expect(screen.getByTestId('doc-list-empty')).toBeDefined();
  });

  it('calls createDocument and navigates on "+" click', async () => {
    // Simulate successful mutation by invoking the onSuccess callback
    mockMutate.mockImplementation((_arg: unknown, opts: { onSuccess: (doc: { id: string }) => void }) => {
      opts.onSuccess({ id: 'new-doc-123' });
    });

    render(<DocsNavPanel />);

    fireEvent.click(screen.getByTestId('docs-nav-new-btn'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/docs/new-doc-123');
    });
  });
});
