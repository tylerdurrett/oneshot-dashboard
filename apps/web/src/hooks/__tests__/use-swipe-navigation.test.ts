import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the hook
// ---------------------------------------------------------------------------

const navigateMock = vi.fn();
let currentPathname = '/timers/remaining';

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: currentPathname }),
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/features', () => ({
  features: { timers: true, chat: true, video: true },
}));

// Import after mocks are set up
import { useSwipeNavigation } from '../use-swipe-navigation';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSwipeNavigation', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    currentPathname = '/timers/remaining';
  });

  it('maps /timers/remaining to index 0', () => {
    currentPathname = '/timers/remaining';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(0);
  });

  it('maps /timers/all to index 1', () => {
    currentPathname = '/timers/all';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(1);
  });

  it('maps /settings to index 2', () => {
    currentPathname = '/settings';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(2);
  });

  it('defaults unknown paths to index 0', () => {
    currentPathname = '/unknown';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(0);
  });

  it('navigates with replace: true on index change', () => {
    const { result } = renderHook(() => useSwipeNavigation());
    act(() => {
      result.current.onIndexChange(2);
    });
    expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true });
  });

  it('navigates to correct page for each index', () => {
    const { result } = renderHook(() => useSwipeNavigation());

    act(() => result.current.onIndexChange(0));
    expect(navigateMock).toHaveBeenCalledWith('/timers/remaining', { replace: true });

    act(() => result.current.onIndexChange(1));
    expect(navigateMock).toHaveBeenCalledWith('/timers/all', { replace: true });

    act(() => result.current.onIndexChange(2));
    expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true });
  });

  it('returns the filtered nav items as pages', () => {
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.pages).toHaveLength(3);
    expect(result.current.pages[0]!.href).toBe('/timers/remaining');
    expect(result.current.pages[1]!.href).toBe('/timers/all');
    expect(result.current.pages[2]!.href).toBe('/settings');
  });
});
