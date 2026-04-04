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

// Minimal localStorage stub for jsdom environments that lack it.
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Import after mocks are set up
import { useSwipeNavigation } from '../use-swipe-navigation';

// ---------------------------------------------------------------------------
// Tests — area-scoped swipe navigation
// ---------------------------------------------------------------------------

describe('useSwipeNavigation', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    currentPathname = '/timers/remaining';
    localStorageMock.clear();
  });

  // --- Timers area (default) ---

  it('maps /timers/remaining to index 0 within Timers area', () => {
    currentPathname = '/timers/remaining';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.currentArea.id).toBe('timers');
  });

  it('maps /timers/all to index 1 within Timers area', () => {
    currentPathname = '/timers/all';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(1);
    expect(result.current.currentArea.id).toBe('timers');
  });

  it('maps /chat to index 2 within Timers area', () => {
    currentPathname = '/chat';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(2);
    expect(result.current.currentArea.id).toBe('timers');
  });

  it('maps /settings to index 3 within Timers area', () => {
    currentPathname = '/settings';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(3);
    expect(result.current.currentArea.id).toBe('timers');
  });

  it('defaults unknown paths to index 0 in default (Timers) area', () => {
    currentPathname = '/unknown';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.currentArea.id).toBe('timers');
  });

  it('navigates with replace: true on index change', () => {
    const { result } = renderHook(() => useSwipeNavigation());
    act(() => {
      result.current.onIndexChange(3);
    });
    expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true });
  });

  it('navigates to correct page for each Timers area index', () => {
    const { result } = renderHook(() => useSwipeNavigation());

    act(() => result.current.onIndexChange(0));
    expect(navigateMock).toHaveBeenCalledWith('/timers/remaining', { replace: true });

    act(() => result.current.onIndexChange(1));
    expect(navigateMock).toHaveBeenCalledWith('/timers/all', { replace: true });

    act(() => result.current.onIndexChange(2));
    expect(navigateMock).toHaveBeenCalledWith('/chat', { replace: true });

    act(() => result.current.onIndexChange(3));
    expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true });
  });

  it('returns the area-scoped nav items as pages for Timers area', () => {
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.pages).toHaveLength(4);
    expect(result.current.pages[0]!.href).toBe('/timers/remaining');
    expect(result.current.pages[1]!.href).toBe('/timers/all');
    expect(result.current.pages[2]!.href).toBe('/chat');
    expect(result.current.pages[3]!.href).toBe('/settings');
  });

  // --- Docs area ---

  it('maps /docs to index 0 within Docs area', () => {
    currentPathname = '/docs';
    const { result } = renderHook(() => useSwipeNavigation());
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.currentArea.id).toBe('docs');
    // Docs area has 2 pages: /docs and /docs/chat (when chat is enabled)
    expect(result.current.pages).toHaveLength(2);
  });

  // --- Area persistence ---

  it('persists area ID to localStorage', () => {
    currentPathname = '/docs';
    renderHook(() => useSwipeNavigation());
    expect(localStorageMock.getItem('app-area')).toBe('docs');
  });
});
