import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { useVisualViewportOffset } from '../use-visual-viewport-offset';

describe('useVisualViewportOffset', () => {
  let resizeHandler: (() => void) | null = null;
  let scrollHandler: (() => void) | null = null;
  let mqChangeHandler: ((e: { matches: boolean }) => void) | null = null;
  let removeVvSpy: ReturnType<typeof vi.fn>;
  let currentMobile = false;

  const mockSetup = (opts: {
    mobile: boolean;
    vvHeight?: number;
    vvOffsetTop?: number;
    innerHeight?: number;
  }) => {
    currentMobile = opts.mobile;
    removeVvSpy = vi.fn();
    resizeHandler = null;
    scrollHandler = null;
    mqChangeHandler = null;

    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: opts.innerHeight ?? 800,
    });

    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: {
        height: opts.vvHeight ?? opts.innerHeight ?? 800,
        offsetTop: opts.vvOffsetTop ?? 0,
        addEventListener: (event: string, handler: () => void) => {
          if (event === 'resize') resizeHandler = handler;
          if (event === 'scroll') scrollHandler = handler;
        },
        removeEventListener: removeVvSpy,
      },
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        get matches() {
          return currentMobile;
        },
        addEventListener: (_: string, handler: (e: { matches: boolean }) => void) => {
          mqChangeHandler = handler;
        },
        removeEventListener: vi.fn(),
      })),
    });
  };

  beforeEach(() => {
    resizeHandler = null;
    scrollHandler = null;
    mqChangeHandler = null;
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  it('returns undefined on desktop', () => {
    mockSetup({ mobile: false });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toBeUndefined();
  });

  it('returns top-anchored style on mobile (keyboard closed)', () => {
    mockSetup({ mobile: true, vvHeight: 800, innerHeight: 800 });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toEqual({
      top: 'calc(16px + env(safe-area-inset-top, 0px))',
      translate: '-50% 0',
      maxHeight: 'calc(768px - env(safe-area-inset-top, 0px))',
      overflowY: 'auto',
    });
  });

  it('constrains maxHeight when keyboard is open on mobile', () => {
    mockSetup({ mobile: true, vvHeight: 400, innerHeight: 800 });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toEqual({
      top: 'calc(16px + env(safe-area-inset-top, 0px))',
      translate: '-50% 0',
      maxHeight: 'calc(368px - env(safe-area-inset-top, 0px))',
      overflowY: 'auto',
    });
  });

  it('accounts for offsetTop when keyboard scrolls viewport', () => {
    mockSetup({ mobile: true, vvHeight: 400, vvOffsetTop: 50, innerHeight: 800 });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toEqual({
      top: 'calc(66px + env(safe-area-inset-top, 0px))', // 50 + 16
      translate: '-50% 0',
      maxHeight: 'calc(368px - env(safe-area-inset-top, 0px))',
      overflowY: 'auto',
    });
  });

  it('updates reactively on visualViewport resize', () => {
    mockSetup({ mobile: true, vvHeight: 800, innerHeight: 800 });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current?.maxHeight).toBe('calc(768px - env(safe-area-inset-top, 0px))');

    // Simulate keyboard opening
    act(() => {
      (window.visualViewport as any).height = 400;
      resizeHandler?.();
    });
    expect(result.current?.maxHeight).toBe('calc(368px - env(safe-area-inset-top, 0px))');
  });

  it('updates reactively on visualViewport scroll', () => {
    mockSetup({ mobile: true, vvHeight: 400, innerHeight: 800 });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current?.top).toBe('calc(16px + env(safe-area-inset-top, 0px))');

    act(() => {
      (window.visualViewport as any).offsetTop = 100;
      scrollHandler?.();
    });
    expect(result.current?.top).toBe('calc(116px + env(safe-area-inset-top, 0px))');
  });

  it('switches from undefined to style when viewport narrows to mobile', () => {
    mockSetup({ mobile: false, innerHeight: 800 });
    const { result } = renderHook(() => useVisualViewportOffset());
    expect(result.current).toBeUndefined();

    act(() => {
      currentMobile = true;
      mqChangeHandler?.({ matches: true });
    });
    expect(result.current).toBeDefined();
    expect(result.current?.top).toBe('calc(16px + env(safe-area-inset-top, 0px))');
  });

  it('cleans up all listeners on unmount', () => {
    mockSetup({ mobile: true, vvHeight: 800, innerHeight: 800 });
    const { unmount } = renderHook(() => useVisualViewportOffset());
    unmount();
    expect(removeVvSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeVvSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
