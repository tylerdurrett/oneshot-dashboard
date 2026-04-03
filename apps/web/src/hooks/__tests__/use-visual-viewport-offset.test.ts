import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { useVisualViewportOffset } from '../use-visual-viewport-offset';

describe('useVisualViewportOffset', () => {
  let resizeHandler: (() => void) | null = null;
  let scrollHandler: (() => void) | null = null;
  let removeSpy: ReturnType<typeof vi.fn>;

  const mockViewport = (height: number, offsetTop = 0) => {
    removeSpy = vi.fn();
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: {
        height,
        offsetTop,
        addEventListener: (_event: string, handler: () => void) => {
          if (_event === 'resize') resizeHandler = handler;
          if (_event === 'scroll') scrollHandler = handler;
        },
        removeEventListener: removeSpy,
      },
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
  };

  beforeEach(() => {
    resizeHandler = null;
    scrollHandler = null;
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  it('returns undefined when visualViewport is unavailable', () => {
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when keyboard is closed (ratio ~1.0)', () => {
    mockViewport(800);
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toBeUndefined();
  });

  it('returns a style object when keyboard is open', () => {
    mockViewport(400); // 400/800 = 0.5, well below 0.85 threshold
    const { result } = renderHook(() => useVisualViewportOffset());
    // top = offsetTop(0) + padding(16) = 16
    // maxHeight = 400 - 16*2 = 368
    expect(result.current).toEqual({
      top: '16px',
      translate: '-50% 0',
      maxHeight: '368px',
      overflowY: 'auto',
    });
  });

  it('accounts for offsetTop', () => {
    mockViewport(400, 50);
    const { result } = renderHook(() => useVisualViewportOffset());
    // top = 50 + 16 = 66
    // maxHeight = 400 - 32 = 368
    expect(result.current).toEqual({
      top: '66px',
      translate: '-50% 0',
      maxHeight: '368px',
      overflowY: 'auto',
    });
  });

  it('returns undefined at the threshold boundary (ratio = 0.85)', () => {
    mockViewport(680); // 680/800 = 0.85, NOT less than 0.85
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toBeUndefined();
  });

  it('updates reactively on resize event', () => {
    mockViewport(800);
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toBeUndefined();

    act(() => {
      (window.visualViewport as any).height = 400;
      resizeHandler?.();
    });
    expect(result.current).toEqual({
      top: '16px',
      translate: '-50% 0',
      maxHeight: '368px',
      overflowY: 'auto',
    });
  });

  it('updates reactively on scroll event', () => {
    mockViewport(400, 0);
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current?.top).toBe('16px');

    act(() => {
      (window.visualViewport as any).offsetTop = 100;
      scrollHandler?.();
    });
    // top = 100 + 16 = 116
    expect(result.current?.top).toBe('116px');
  });

  it('cleans up listeners on unmount', () => {
    mockViewport(800);
    const { unmount } = renderHook(() => useVisualViewportOffset());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
