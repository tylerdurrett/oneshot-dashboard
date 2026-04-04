import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentResponse } from '../_lib/docs-api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();
let mockParams: Record<string, string> = {};

vi.mock('react-router', () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

let mockDocs: DocumentResponse[] = [];
let mockIsLoading = false;

vi.mock('../_hooks/use-doc-query', () => ({
  useDocuments: () => ({ data: mockDocs, isLoading: mockIsLoading }),
}));

vi.mock('@/lib/format-time-ago', () => ({
  formatTimeAgo: (ts: string) => `time:${ts}`,
}));

import { DocList } from '../_components/doc-list';
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

// ---------------------------------------------------------------------------
// DocListItem
// ---------------------------------------------------------------------------

describe('DocListItem', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders title and timestamp', () => {
    const doc = makeDoc({ title: 'My Notes' });
    render(<DocListItem doc={doc} isActive={false} onClick={vi.fn()} />);

    expect(screen.getByText('My Notes')).toBeDefined();
    expect(screen.getByText(`time:${doc.updatedAt}`)).toBeDefined();
  });

  it('shows "Untitled" when title is empty', () => {
    const doc = makeDoc({ title: '' });
    render(<DocListItem doc={doc} isActive={false} onClick={vi.fn()} />);

    expect(screen.getByText('Untitled')).toBeDefined();
  });

  it('applies active class when isActive is true', () => {
    const doc = makeDoc();
    const { container } = render(
      <DocListItem doc={doc} isActive={true} onClick={vi.fn()} />,
    );

    const button = container.querySelector('button')!;
    expect(button.className).toContain('bg-accent/50');
  });

  it('does not apply active class when isActive is false', () => {
    const doc = makeDoc();
    const { container } = render(
      <DocListItem doc={doc} isActive={false} onClick={vi.fn()} />,
    );

    const button = container.querySelector('button')!;
    expect(button.className).not.toContain('bg-accent/50');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    const doc = makeDoc();
    render(<DocListItem doc={doc} isActive={false} onClick={onClick} />);

    fireEvent.click(screen.getByTestId(`doc-item-${doc.id}`));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// DocList
// ---------------------------------------------------------------------------

describe('DocList', () => {
  afterEach(() => {
    cleanup();
    mockDocs = [];
    mockIsLoading = false;
    mockParams = {};
    mockNavigate.mockReset();
    vi.restoreAllMocks();
  });

  it('shows loading spinner while fetching', () => {
    mockIsLoading = true;
    render(<DocList />);

    expect(screen.getByTestId('doc-list-loading')).toBeDefined();
  });

  it('shows empty state when no docs exist', () => {
    mockDocs = [];
    render(<DocList />);

    expect(screen.getByTestId('doc-list-empty')).toBeDefined();
    expect(screen.getByText('No documents yet')).toBeDefined();
  });

  it('renders recent docs when none are pinned', () => {
    mockDocs = [
      makeDoc({ id: 'a', title: 'Doc A' }),
      makeDoc({ id: 'b', title: 'Doc B' }),
    ];

    render(<DocList />);

    expect(screen.getByTestId('doc-list')).toBeDefined();
    expect(screen.getByTestId('doc-list-recent')).toBeDefined();
    expect(screen.queryByTestId('doc-list-pinned')).toBeNull();
    expect(screen.getByText('Doc A')).toBeDefined();
    expect(screen.getByText('Doc B')).toBeDefined();
  });

  it('renders pinned section when pinned docs exist', () => {
    mockDocs = [
      makeDoc({ id: 'pinned-1', title: 'Pinned Doc', pinnedAt: '2026-01-01T00:00:00Z' }),
      makeDoc({ id: 'recent-1', title: 'Recent Doc' }),
    ];

    render(<DocList />);

    expect(screen.getByTestId('doc-list-pinned')).toBeDefined();
    expect(screen.getByTestId('doc-list-recent')).toBeDefined();
    expect(screen.getByText('Pinned')).toBeDefined();
    expect(screen.getByText('Recent')).toBeDefined();
    expect(screen.getByText('Pinned Doc')).toBeDefined();
    expect(screen.getByText('Recent Doc')).toBeDefined();
  });

  it('highlights the active doc based on URL param', () => {
    mockParams = { docId: 'active-doc' };
    mockDocs = [
      makeDoc({ id: 'active-doc', title: 'Active' }),
      makeDoc({ id: 'other-doc', title: 'Other' }),
    ];

    const { container } = render(<DocList />);

    const activeBtn = container.querySelector('[data-testid="doc-item-active-doc"]')!;
    const otherBtn = container.querySelector('[data-testid="doc-item-other-doc"]')!;

    expect(activeBtn.className).toContain('bg-accent/50');
    expect(otherBtn.className).not.toContain('bg-accent/50');
  });

  it('navigates to doc on click', () => {
    mockDocs = [makeDoc({ id: 'nav-doc', title: 'Navigate Me' })];

    render(<DocList />);

    fireEvent.click(screen.getByTestId('doc-item-nav-doc'));
    expect(mockNavigate).toHaveBeenCalledWith('/docs/nav-doc');
  });

  it('hides pinned section header when no docs are pinned', () => {
    mockDocs = [makeDoc({ id: 'a', title: 'Only Recent' })];

    render(<DocList />);

    expect(screen.queryByText('Pinned')).toBeNull();
    expect(screen.getByText('Recent')).toBeDefined();
  });
});
