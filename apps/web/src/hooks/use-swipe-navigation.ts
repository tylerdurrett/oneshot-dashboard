import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { NAV_ITEMS, isItemActive, type NavItem } from '@/lib/nav-items';

export interface UseSwipeNavigationReturn {
  /** Current page index derived from the URL pathname. */
  activeIndex: number;
  /** Navigate to the page at the given index. Uses replace to avoid history bloat. */
  onIndexChange: (index: number) => void;
  /** The ordered list of swipeable pages. */
  pages: NavItem[];
}

/**
 * Bridges the SwipeView component to React Router.
 * Maps the current URL to a page index and navigates on swipe completion.
 */
export function useSwipeNavigation(): UseSwipeNavigationReturn {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const activeIndex = useMemo(() => {
    const idx = NAV_ITEMS.findIndex((item) => isItemActive(item, pathname));
    // Default to 0 if the current route doesn't match any nav item.
    return idx >= 0 ? idx : 0;
  }, [pathname]);

  const onIndexChange = useCallback(
    (index: number) => {
      const page = NAV_ITEMS[index];
      if (page) {
        // replace: true prevents building a huge history stack from swiping
        // back and forth between pages.
        navigate(page.href, { replace: true });
      }
    },
    [navigate],
  );

  return { activeIndex, onIndexChange, pages: NAV_ITEMS };
}
