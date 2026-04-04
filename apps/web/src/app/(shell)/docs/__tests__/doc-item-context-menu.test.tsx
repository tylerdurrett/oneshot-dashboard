import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentResponse } from '../_lib/docs-api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const mockPinMutate = vi.fn();
const mockUnpinMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('../_hooks/use-doc-query', () => ({
  usePinDocument: () => ({ mutate: mockPinMutate }),
  useUnpinDocument: () => ({ mutate: mockUnpinMutate }),
  useDeleteDocument: () => ({ mutate: mockDeleteMutate }),
}));

vi.mock('@/lib/format-time-ago', () => ({
  formatTimeAgo: (ts: string) => `time:${ts}`,
}));

import { DocItemContextMenu } from '../_components/doc-item-context-menu';
import { DocListItem } from '../_components/doc-list-item';

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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

/**
 * Open the context menu by simulating a right-click. Radix ContextMenu
 * requires a pointerDown with button 2 before the native contextmenu event.
 */
async function openContextMenu(docId: string) {
  const item = screen.getByTestId(`doc-item-${docId}`);
  fireEvent.pointerDown(item, { button: 2, pointerType: 'mouse' });
  fireEvent.contextMenu(item);
  // Wait for the portal-rendered menu to appear
  await waitFor(() => {
    expect(screen.getByRole('menu')).toBeDefined();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocItemContextMenu', () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockReset();
    mockPinMutate.mockReset();
    mockUnpinMutate.mockReset();
    mockDeleteMutate.mockReset();
    vi.restoreAllMocks();
  });

  it('shows "Pin" option for unpinned doc on right-click', async () => {
    const doc = makeDoc({ pinnedAt: null });

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);

    expect(screen.getByText('Pin')).toBeDefined();
    expect(screen.queryByText('Unpin')).toBeNull();
  });

  it('shows "Unpin" option for pinned doc on right-click', async () => {
    const doc = makeDoc({ pinnedAt: '2026-01-01T00:00:00Z' });

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);

    expect(screen.getByText('Unpin')).toBeDefined();
    expect(screen.queryByText('Pin')).toBeNull();
  });

  it('calls pinDocument mutation when Pin is clicked', async () => {
    const doc = makeDoc({ id: 'pin-me', pinnedAt: null });

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);
    fireEvent.click(screen.getByText('Pin'));

    expect(mockPinMutate).toHaveBeenCalledWith('pin-me');
  });

  it('calls unpinDocument mutation when Unpin is clicked', async () => {
    const doc = makeDoc({ id: 'unpin-me', pinnedAt: '2026-01-01T00:00:00Z' });

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);
    fireEvent.click(screen.getByText('Unpin'));

    expect(mockUnpinMutate).toHaveBeenCalledWith('unpin-me');
  });

  it('shows delete confirmation dialog when Delete is clicked', async () => {
    const doc = makeDoc({ title: 'My Notes' });

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete document?')).toBeDefined();
      expect(
        screen.getByText(
          '"My Notes" will be permanently deleted. This action cannot be undone.',
        ),
      ).toBeDefined();
    });
  });

  it('calls deleteDocument mutation when deletion is confirmed', async () => {
    const doc = makeDoc({ id: 'delete-me' });

    mockDeleteMutate.mockImplementation(
      (id: string, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);
    fireEvent.click(screen.getByText('Delete'));

    // Click the confirm button in the dialog
    await waitFor(() => {
      expect(screen.getByText('Delete document?')).toBeDefined();
    });

    // The confirm button in the ConfirmationDialog has the confirmLabel text
    const confirmButtons = screen.getAllByRole('button');
    const confirmBtn = confirmButtons.find(
      (btn) => btn.textContent === 'Delete' && btn.closest('[role="alertdialog"]'),
    )!;
    fireEvent.click(confirmBtn);

    expect(mockDeleteMutate).toHaveBeenCalledWith('delete-me', expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it('navigates to /docs when active doc is deleted', async () => {
    const doc = makeDoc({ id: 'active-doc' });

    mockDeleteMutate.mockImplementation(
      (id: string, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={true}>
        <DocListItem doc={doc} isActive={true} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete document?')).toBeDefined();
    });

    const confirmButtons = screen.getAllByRole('button');
    const confirmBtn = confirmButtons.find(
      (btn) => btn.textContent === 'Delete' && btn.closest('[role="alertdialog"]'),
    )!;
    fireEvent.click(confirmBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/docs', { replace: true });
  });

  it('does not navigate when non-active doc is deleted', async () => {
    const doc = makeDoc({ id: 'other-doc' });

    mockDeleteMutate.mockImplementation(
      (id: string, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete document?')).toBeDefined();
    });

    const confirmButtons = screen.getAllByRole('button');
    const confirmBtn = confirmButtons.find(
      (btn) => btn.textContent === 'Delete' && btn.closest('[role="alertdialog"]'),
    )!;
    fireEvent.click(confirmBtn);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('disables Delete option when isLastDoc is true', async () => {
    const doc = makeDoc();

    render(
      <DocItemContextMenu doc={doc} isLastDoc={true} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);

    const deleteItem = screen.getByText('Delete').closest('[data-slot="context-menu-item"]')!;
    expect(deleteItem.getAttribute('data-disabled')).toBe('');
  });

  it('does not disable Delete option when isLastDoc is false', async () => {
    const doc = makeDoc();

    render(
      <DocItemContextMenu doc={doc} isLastDoc={false} isActiveDoc={false}>
        <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />
      </DocItemContextMenu>,
    );

    await openContextMenu(doc.id);

    const deleteItem = screen.getByText('Delete').closest('[data-slot="context-menu-item"]')!;
    expect(deleteItem.getAttribute('data-disabled')).toBeNull();
  });
});
