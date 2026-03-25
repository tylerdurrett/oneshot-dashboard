import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDocumentTitle } from '../use-document-title';

describe('useDocumentTitle', () => {
  it('sets document.title with the app name suffix', () => {
    renderHook(() => useDocumentTitle('Timers'));
    expect(document.title).toBe('Timers — Tdog Dashboard');
  });

  it('updates when the title changes', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: 'Timers' },
    });
    expect(document.title).toBe('Timers — Tdog Dashboard');

    rerender({ title: 'Chat' });
    expect(document.title).toBe('Chat — Tdog Dashboard');
  });

  it('restores the base app title on unmount', () => {
    const { unmount } = renderHook(() => useDocumentTitle('Timers'));
    expect(document.title).toBe('Timers — Tdog Dashboard');

    unmount();
    expect(document.title).toBe('Tdog Dashboard');
  });
});
