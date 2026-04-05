import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentResponse } from '../_lib/docs-api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useParams: () => ({}),
  useNavigate: () => mockNavigate,
}));

let mockDocs: DocumentResponse[] = [];
let mockIsLoading = false;
const mockCreateMutate = vi.fn();

vi.mock('../_hooks/use-doc-query', () => ({
  useDocuments: () => ({ data: mockDocs, isLoading: mockIsLoading }),
  useCreateDocument: () => ({ mutate: mockCreateMutate, isPending: false }),
  // Stubs for DocItemContextMenu (imported by MobileDocSelector)
  usePinDocument: () => ({ mutate: vi.fn() }),
  useUnpinDocument: () => ({ mutate: vi.fn() }),
  useDeleteDocument: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/format-time-ago', () => ({
  formatTimeAgo: (ts: string) => `time:${ts}`,
}));

import { MobileDocSelector } from '../_components/mobile-doc-selector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: 'doc-1',
    title: 'Test Doc',
    content: [],
    workspaceId: 'ws-1',
    folderId: null,
    pinnedAt: null,
    pipelineEnabled: true,
    processedAt: null,
    isTitleManual: false,
    titleGeneratedFromBlockIds: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileDocSelector', () => {
  afterEach(() => {
    cleanup();
    mockDocs = [];
    mockIsLoading = false;
    mockNavigate.mockReset();
    mockCreateMutate.mockReset();
    vi.restoreAllMocks();
  });

  it('renders trigger with current doc title and chevron', () => {
    mockDocs = [makeDoc({ id: 'active', title: 'My Notes' })];

    render(
      <MobileDocSelector activeDocId="active" activeDocTitle="My Notes" />,
    );

    const trigger = screen.getByTestId('mobile-doc-selector-trigger');
    expect(trigger).toBeDefined();
    expect(trigger.textContent).toContain('My Notes');
  });

  it('shows "Untitled" when activeDocTitle is empty', () => {
    render(<MobileDocSelector activeDocId="x" activeDocTitle="" />);

    const trigger = screen.getByTestId('mobile-doc-selector-trigger');
    expect(trigger.textContent).toContain('Untitled');
  });

  it('opens popover on trigger click showing doc list', async () => {
    mockDocs = [
      makeDoc({ id: 'a', title: 'Doc A' }),
      makeDoc({ id: 'b', title: 'Doc B' }),
    ];

    render(<MobileDocSelector activeDocId="a" activeDocTitle="Doc A" />);

    fireEvent.click(screen.getByTestId('mobile-doc-selector-trigger'));

    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeDefined();
      expect(screen.getByTestId('doc-item-a')).toBeDefined();
      expect(screen.getByTestId('doc-item-b')).toBeDefined();
    });
  });

  it('shows pinned and recent sections when pinned docs exist', async () => {
    mockDocs = [
      makeDoc({ id: 'pinned-1', title: 'Pinned Doc', pinnedAt: '2026-01-01T00:00:00Z' }),
      makeDoc({ id: 'recent-1', title: 'Recent Doc' }),
    ];

    render(
      <MobileDocSelector activeDocId="pinned-1" activeDocTitle="Pinned Doc" />,
    );

    fireEvent.click(screen.getByTestId('mobile-doc-selector-trigger'));

    await waitFor(() => {
      expect(screen.getByText('Pinned')).toBeDefined();
      expect(screen.getByText('Recent')).toBeDefined();
      expect(screen.getByTestId('mobile-doc-selector-pinned')).toBeDefined();
      expect(screen.getByTestId('mobile-doc-selector-recent')).toBeDefined();
    });
  });

  it('highlights active doc with bg-accent/50', async () => {
    mockDocs = [
      makeDoc({ id: 'active', title: 'Active Doc' }),
      makeDoc({ id: 'other', title: 'Other Doc' }),
    ];

    render(
      <MobileDocSelector activeDocId="active" activeDocTitle="Active Doc" />,
    );

    fireEvent.click(screen.getByTestId('mobile-doc-selector-trigger'));

    await waitFor(() => {
      const activeItem = screen.getByTestId('doc-item-active');
      const otherItem = screen.getByTestId('doc-item-other');
      expect(activeItem.className).toContain('bg-accent/50');
      expect(otherItem.className).not.toContain('bg-accent/50');
    });
  });

  it('navigates to doc on item click and closes popover', async () => {
    mockDocs = [
      makeDoc({ id: 'a', title: 'Doc A' }),
      makeDoc({ id: 'b', title: 'Doc B' }),
    ];

    render(<MobileDocSelector activeDocId="a" activeDocTitle="Doc A" />);

    fireEvent.click(screen.getByTestId('mobile-doc-selector-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('doc-item-b')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('doc-item-b'));

    expect(mockNavigate).toHaveBeenCalledWith('/docs/b');
  });

  it('"New document" button in popover calls createDocument and navigates', async () => {
    mockDocs = [makeDoc({ id: 'a', title: 'Doc A' })];

    mockCreateMutate.mockImplementation(
      (_arg: unknown, opts: { onSuccess: (doc: { id: string }) => void }) => {
        opts.onSuccess({ id: 'new-doc-123' });
      },
    );

    render(<MobileDocSelector activeDocId="a" activeDocTitle="Doc A" />);

    fireEvent.click(screen.getByTestId('mobile-doc-selector-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('mobile-doc-selector-new')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('mobile-doc-selector-new'));

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/docs/new-doc-123');
  });

  it('"+" icon button creates new doc and navigates', async () => {
    mockDocs = [makeDoc({ id: 'a', title: 'Doc A' })];

    mockCreateMutate.mockImplementation(
      (_arg: unknown, opts: { onSuccess: (doc: { id: string }) => void }) => {
        opts.onSuccess({ id: 'new-doc-456' });
      },
    );

    render(<MobileDocSelector activeDocId="a" activeDocTitle="Doc A" />);

    fireEvent.click(screen.getByTestId('mobile-doc-selector-new-btn'));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/docs/new-doc-456');
    });
  });

  it('trigger has minimum 44px touch target', () => {
    mockDocs = [];

    render(<MobileDocSelector activeDocId="x" activeDocTitle="Test" />);

    const trigger = screen.getByTestId('mobile-doc-selector-trigger');
    expect(trigger.className).toContain('min-h-[44px]');
  });

  it('"+" icon button has minimum 44px touch target', () => {
    render(<MobileDocSelector activeDocId="x" activeDocTitle="Test" />);

    const btn = screen.getByTestId('mobile-doc-selector-new-btn');
    // size-11 = 44px (11 * 4px = 44px)
    expect(btn.className).toContain('size-11');
  });
});
