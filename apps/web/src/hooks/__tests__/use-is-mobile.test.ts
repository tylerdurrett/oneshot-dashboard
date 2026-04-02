import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useIsMobile } from '../use-is-mobile';

describe('useIsMobile', () => {
  let changeHandler: ((e: { matches: boolean }) => void) | null = null;
  let currentMatches = false;

  beforeEach(() => {
    changeHandler = null;
    currentMatches = false;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        get matches() {
          return currentMatches;
        },
        addEventListener: (_: string, handler: (e: { matches: boolean }) => void) => {
          changeHandler = handler;
        },
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('returns true when viewport is narrow', () => {
    currentMatches = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when viewport is wide', () => {
    currentMatches = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when media query changes', () => {
    currentMatches = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      currentMatches = true;
      changeHandler?.({ matches: true });
    });
    expect(result.current).toBe(true);
  });
});
