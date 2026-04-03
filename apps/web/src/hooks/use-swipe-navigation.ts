import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { isItemActive, type NavItem } from '@/lib/nav-items';
import { getAreaForPath, type AppArea } from '@/lib/app-areas';
import { AREA_STORAGE_KEY } from '@/lib/area-storage';

export interface UseSwipeNavigationReturn {
  /** Current page index derived from the URL pathname (scoped to the active area). */
  activeIndex: number;
  /** Navigate to the page at the given index. Uses replace to avoid history bloat. */
  onIndexChange: (index: number) => void;
  /** The ordered list of swipeable pages for the current area. */
  pages: NavItem[];
  /** The area that owns the current route. */
  currentArea: AppArea;
}

/**
 * Bridges the SwipeView component to React Router, scoped to the current
 * app area. Maps the current URL to a page index within the area's navItems
 * and navigates on swipe completion.
 */
export function useSwipeNavigation(): UseSwipeNavigationReturn {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const currentArea = useMemo(() => getAreaForPath(pathname), [pathname]);
  const pages = currentArea.navItems;

  const activeIndex = useMemo(() => {
    const idx = pages.findIndex((item) => isItemActive(item, pathname));
    // Default to 0 if the current route doesn't match any nav item in the area.
    return idx >= 0 ? idx : 0;
  }, [pathname, pages]);

  // Persist last active area to localStorage whenever the area changes.
  useEffect(() => {
    try {
      localStorage.setItem(AREA_STORAGE_KEY, currentArea.id);
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }, [currentArea.id]);

  const onIndexChange = useCallback(
    (index: number) => {
      const page = pages[index];
      if (page) {
        // replace: true prevents building a huge history stack from swiping
        // back and forth between pages.
        navigate(page.href, { replace: true });
      }
    },
    [navigate, pages],
  );

  return { activeIndex, onIndexChange, pages, currentArea };
}
