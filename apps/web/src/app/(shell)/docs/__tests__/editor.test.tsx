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

import { DocEditor } from '../_components/editor';

describe('DocEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flushes pending save on unmount instead of discarding it', () => {
    const onSave = vi.fn();
    const { getByTestId, unmount } = render(
      <DocEditor initialContent={[]} onSave={onSave} />,
    );

    // Trigger a change to start the debounce timer
    act(() => {
      getByTestId('editor').click();
    });

    // Unmount before debounce fires — should flush immediately
    unmount();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(mockDocument);
  });

  it('does not call onSave on unmount when there are no pending changes', () => {
    const onSave = vi.fn();
    const { unmount } = render(
      <DocEditor initialContent={[]} onSave={onSave} />,
    );

    unmount();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave after debounce delay', () => {
    const onSave = vi.fn();
    const { getByTestId } = render(
      <DocEditor initialContent={[]} onSave={onSave} />,
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
      <DocEditor initialContent={[]} onSave={onSave} />,
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
    render(<DocEditor initialContent={[]} onSave={onSave} />);

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});
