import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@blocknote/core';
import type { DocumentResponse } from '../../_lib/docs-api';

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

const mutateMock = vi.fn();

vi.mock('../../_hooks/use-doc-query', () => ({
  useGenerateTitle: () => ({ mutate: mutateMock }),
}));

import { useAutoTitle, extractTextFromBlocks } from '../use-auto-title';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: 'doc-1',
    title: 'Notes 2026-04-04',
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

/** Build a minimal Block with text content. Cast to Block to satisfy the type. */
function makeBlock(id: string, text: string): Block {
  return {
    id,
    type: 'paragraph',
    props: {},
    content: [{ type: 'text', text, styles: {} }],
    children: [],
  } as unknown as Block;
}

/** Build enough blocks to exceed the 50-word threshold. */
function makeSufficientBlocks(count = 3, wordsPerBlock = 20): Block[] {
  const word = 'lorem ';
  return Array.from({ length: count }, (_, i) =>
    makeBlock(`block-${i}`, word.repeat(wordsPerBlock).trim()),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractTextFromBlocks', () => {
  it('extracts text from paragraph blocks', () => {
    const blocks = [makeBlock('1', 'Hello'), makeBlock('2', 'World')];
    expect(extractTextFromBlocks(blocks)).toBe('Hello World');
  });

  it('extracts text from link inline content', () => {
    const block = {
      id: '1',
      type: 'paragraph',
      props: {},
      content: [
        { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'click here', styles: {} }] },
      ],
      children: [],
    } as unknown as Block;
    expect(extractTextFromBlocks([block])).toBe('click here');
  });

  it('recurses into children', () => {
    const block = {
      id: '1',
      type: 'paragraph',
      props: {},
      content: [{ type: 'text', text: 'parent', styles: {} }],
      children: [makeBlock('child-1', 'child text')],
    } as unknown as Block;
    expect(extractTextFromBlocks([block])).toBe('parent child text');
  });

  it('returns empty string for empty blocks', () => {
    expect(extractTextFromBlocks([])).toBe('');
  });
});

describe('useAutoTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires mutate after 12s debounce when conditions are met', () => {
    const doc = makeDoc();
    const blocks = makeSufficientBlocks();

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));

    // Not yet — only 11s
    act(() => vi.advanceTimersByTime(11_000));
    expect(mutateMock).not.toHaveBeenCalled();

    // Now at 12s
    act(() => vi.advanceTimersByTime(1_000));
    expect(mutateMock).toHaveBeenCalledOnce();
  });

  it('resets timer on each notifyContentChange call', () => {
    const doc = makeDoc();
    const blocks = makeSufficientBlocks();

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    // First call
    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(10_000));

    // Second call resets the timer
    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(10_000));

    // Still hasn't fired — only 10s since last call
    expect(mutateMock).not.toHaveBeenCalled();

    // 2 more seconds → 12s since last call
    act(() => vi.advanceTimersByTime(2_000));
    expect(mutateMock).toHaveBeenCalledOnce();
  });

  it('does not fire when isTitleManual is true', () => {
    const doc = makeDoc({ isTitleManual: true });
    const blocks = makeSufficientBlocks();

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(12_000));

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not fire when content is below threshold', () => {
    const doc = makeDoc();
    // 2 blocks with only a few words each — below both thresholds
    const blocks = [makeBlock('1', 'short'), makeBlock('2', 'text')];

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(12_000));

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not fire when enabled is false', () => {
    const doc = makeDoc();
    const blocks = makeSufficientBlocks();

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: false }),
    );

    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(12_000));

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('cleans up timer on unmount', () => {
    const doc = makeDoc();
    const blocks = makeSufficientBlocks();

    const { result, unmount } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));
    unmount();

    act(() => vi.advanceTimersByTime(12_000));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('re-title fires when >50% of original blocks are gone', () => {
    const doc = makeDoc({
      titleGeneratedFromBlockIds: ['a', 'b', 'c', 'd'],
    });
    // Only 1 of 4 original IDs remains (25% overlap < 50%) → should fire
    const blocks = makeSufficientBlocks();
    blocks[0] = makeBlock('a', blocks[0]!.id); // keep one original
    // block-1, block-2 are new IDs — overlap = 1/4 = 0.25

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(12_000));

    expect(mutateMock).toHaveBeenCalledOnce();
  });

  it('re-title fires when block count doubled', () => {
    const doc = makeDoc({
      titleGeneratedFromBlockIds: ['block-0', 'block-1', 'block-2'],
    });
    // 6 blocks, 3 original → sizeRatio = 2.0 (not < 2) → should fire
    // All 3 original IDs present → overlapRatio = 1.0 (>= 0.5)
    // But sizeRatio >= 2 breaks the skip condition → fires
    const blocks = makeSufficientBlocks(6, 10);

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(12_000));

    expect(mutateMock).toHaveBeenCalledOnce();
  });

  it('re-title skips when block IDs are mostly unchanged', () => {
    const doc = makeDoc({
      titleGeneratedFromBlockIds: ['block-0', 'block-1', 'block-2'],
    });
    // Same 3 blocks → overlap = 3/3 = 1.0 (>= 0.5), sizeRatio = 1.0 (< 2) → skip
    const blocks = makeSufficientBlocks(3, 20);

    const { result } = renderHook(() =>
      useAutoTitle({ docId: 'doc-1', doc, enabled: true }),
    );

    act(() => result.current.notifyContentChange(blocks));
    act(() => vi.advanceTimersByTime(12_000));

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
