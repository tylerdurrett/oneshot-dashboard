import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDocument = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }];

vi.mock('@blocknote/core/fonts/inter.css', () => ({}));
vi.mock('@blocknote/mantine/style.css', () => ({}));
vi.mock('../_components/editor.css', () => ({}));

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => ({ document: mockDocument }),
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ onChange }: { onChange: () => void }) => (
    <button data-testid="editor" onClick={onChange}>
      editor
    </button>
  ),
}));

const mockSaveDocument = vi.fn().mockResolvedValue({});
vi.mock('../_lib/docs-api', () => ({
  saveDocument: (...args: unknown[]) => mockSaveDocument(...args),
}));

const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

import { DocEditor } from '../_components/editor';

describe('DocEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSaveDocument.mockClear().mockResolvedValue({});
    mockInvalidateQueries.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flushes pending save on unmount via direct API call with correct docId', async () => {
    const onSave = vi.fn();
    const { getByTestId, unmount } = render(
      <DocEditor docId="doc-123" initialContent={[]} onSave={onSave} />,
    );

    // Trigger a change to start the debounce timer
    act(() => {
      getByTestId('editor').click();
    });

    // Unmount before debounce fires — should flush via direct API, not onSave
    unmount();

    // Must use saveDocument directly to avoid saving to wrong doc on quick switch
    expect(onSave).not.toHaveBeenCalled();
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    expect(mockSaveDocument).toHaveBeenCalledWith('doc-123', {
      content: mockDocument,
    });

    // Flush the microtask from saveDocument's .then() so the cache invalidation runs
    await Promise.resolve();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['docs', 'detail', 'doc-123'],
    });
  });

  it('does not save on unmount when there are no pending changes', () => {
    const onSave = vi.fn();
    const { unmount } = render(
      <DocEditor docId="doc-123" initialContent={[]} onSave={onSave} />,
    );

    unmount();

    expect(onSave).not.toHaveBeenCalled();
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });

  it('calls onSave after debounce delay', () => {
    const onSave = vi.fn();
    const { getByTestId } = render(
      <DocEditor docId="doc-123" initialContent={[]} onSave={onSave} />,
    );

    act(() => {
      getByTestId('editor').click();
    });

    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(mockDocument);
  });

  it('prevents beforeunload when there are pending changes', () => {
    const onSave = vi.fn();
    const { getByTestId } = render(
      <DocEditor docId="doc-123" initialContent={[]} onSave={onSave} />,
    );

    act(() => {
      getByTestId('editor').click();
    });

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does not prevent beforeunload when there are no pending changes', () => {
    const onSave = vi.fn();
    render(<DocEditor docId="doc-123" initialContent={[]} onSave={onSave} />);

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('calls onContentChange on every change event', () => {
    const onSave = vi.fn();
    const onContentChange = vi.fn();
    const { getByTestId } = render(
      <DocEditor
        docId="doc-123"
        initialContent={[]}
        onSave={onSave}
        onContentChange={onContentChange}
      />,
    );

    act(() => {
      getByTestId('editor').click();
    });

    // onContentChange fires immediately (not debounced)
    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange).toHaveBeenCalledWith(mockDocument);

    // onSave has not fired yet (still debouncing)
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      getByTestId('editor').click();
    });

    // Fires again on second change
    expect(onContentChange).toHaveBeenCalledTimes(2);
  });
});
