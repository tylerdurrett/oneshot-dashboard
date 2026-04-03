import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { useMotionValue } from 'motion/react';

import { SwipeView } from '@repo/ui';

import { features } from '@/lib/features';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';
import { useTimerState } from '@/app/(shell)/timers/_hooks/use-timer-state';
import type { UseTimerStateReturn } from '@/app/(shell)/timers/_hooks/use-timer-state';
import { TimerGridWithState } from '@/app/(shell)/timers/_components/timer-grid';
import { AllTimerGridWithState } from '@/app/(shell)/timers/_components/all-timer-grid';
import { TotalTimeIndicator } from '@/app/(shell)/timers/_components/total-time-indicator';
import SettingsPage from '@/app/(shell)/settings/page';
import { MobileChatView, extractThreadId } from '@/app/(shell)/chat/mobile-chat-view';
import { TIMERS_TITLE, ALL_TIMERS_TITLE, CHAT_TITLE } from '@/app/route-metadata';

import { AppShell } from './app-shell';

// ---------------------------------------------------------------------------
// Page title by nav item href
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  '/timers/remaining': TIMERS_TITLE,
  '/timers/all': ALL_TIMERS_TITLE,
  '/chat': CHAT_TITLE,
  '/settings': 'Settings',
};

// ---------------------------------------------------------------------------
// Timer page wrapper — shared layout for both "To Do" and "Done" grids,
// matching the desktop TimersLayout structure.
// ---------------------------------------------------------------------------

function TimerPageWrapper({
  timerState,
  Grid,
}: {
  timerState: UseTimerStateReturn;
  Grid: typeof TimerGridWithState | typeof AllTimerGridWithState;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TotalTimeIndicator allBuckets={timerState.allBuckets} />
      <div className="timers-content flex-1 min-h-0 min-w-0 overflow-hidden">
        <Grid timerState={timerState} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileShellLayout — renders all nav pages in a horizontal SwipeView strip
// instead of using React Router's Outlet. This enables smooth drag-to-swipe
// transitions where adjacent pages are visible during the gesture.
//
// Timer state is fetched once and shared across both timer grids. When timers
// is disabled, the hook still runs (returns empty data) but no timer pages
// are rendered.
// ---------------------------------------------------------------------------

export function MobileShellLayout() {
  const { activeIndex, onIndexChange, pages } = useSwipeNavigation();
  const { pathname } = useLocation();
  const timerState = useTimerState();

  // Disable SwipeView swiping while a thread detail overlay is open so
  // horizontal gestures go to the thread panel's swipe-to-dismiss instead.
  const isThreadOpen = extractThreadId(pathname) !== null;

  // MotionValue instead of useState — avoids 60 re-renders/sec during drag.
  // AppShell consumes this directly via useTransform, bypassing React reconciliation.
  const fractionalIndex = useMotionValue(activeIndex);

  // Sync the motion value when activeIndex changes from non-swipe navigation
  // (e.g. tapping a nav item, browser back/forward).
  const prevActiveIndex = useMemo(() => ({ current: activeIndex }), []);
  if (prevActiveIndex.current !== activeIndex) {
    prevActiveIndex.current = activeIndex;
    fractionalIndex.set(activeIndex);
  }

  // Set document title based on the active swipe page.
  const activeHref = pages[activeIndex]?.href ?? '';
  useDocumentTitle(PAGE_TITLES[activeHref] ?? 'Dashboard');

  // Memoize page elements so they are stable across renders. Only changes
  // when the page list or timer state changes — not on every drag frame.
  const pageElements = useMemo(
    () =>
      pages.map((page) => {
        switch (page.href) {
          case '/timers/remaining':
            return (
              <TimerPageWrapper
                key={page.href}
                timerState={timerState}
                Grid={TimerGridWithState}
              />
            );
          case '/timers/all':
            return (
              <TimerPageWrapper
                key={page.href}
                timerState={timerState}
                Grid={AllTimerGridWithState}
              />
            );
          case '/chat':
            return <MobileChatView key={page.href} />;
          case '/settings':
            return <SettingsPage key={page.href} />;
          default:
            return <div key={page.href} />;
        }
      }),
    [pages, timerState],
  );

  // Callback for SwipeView — writes directly to the motion value, no setState.
  const handleDragProgress = useMemo(
    () => (value: number) => fractionalIndex.set(value),
    [fractionalIndex],
  );

  return (
    <AppShell fractionalIndex={fractionalIndex}>
      <SwipeView
        activeIndex={activeIndex}
        onIndexChange={onIndexChange}
        pageCount={pages.length}
        onDragProgress={handleDragProgress}
        disabled={isThreadOpen}
      >
        {pageElements}
      </SwipeView>
    </AppShell>
  );
}
