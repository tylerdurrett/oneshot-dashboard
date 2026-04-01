import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { List, ListFilter } from 'lucide-react';
import { cn } from '@repo/ui';

import { ALL_TIMERS_TITLE, TIMERS_TITLE } from '@/app/route-metadata';
import { useDocumentTitle } from '@/hooks/use-document-title';

import { AllTimerGridWithState } from './_components/all-timer-grid';
import { TimerGridWithState } from './_components/timer-grid';
import { TotalTimeIndicator } from './_components/total-time-indicator';
import { useContainerSize } from './_hooks/use-container-size';
import { useTimerState, type UseTimerStateReturn } from './_hooks/use-timer-state';

export type TimerViewId = 'remaining' | 'all';

const SUB_NAV_TABS = [
  { href: '/timers/remaining', label: 'Remaining', icon: ListFilter },
  { href: '/timers/all', label: 'All', icon: List },
] as const;

const TIMER_VIEW_ORDER: TimerViewId[] = ['remaining', 'all'];
const TIMER_VIEW_COUNT = TIMER_VIEW_ORDER.length;

const TIMER_VIEW_TITLE: Record<TimerViewId, string> = {
  remaining: TIMERS_TITLE,
  all: ALL_TIMERS_TITLE,
};

const EDGE_SWIPE_GUARD_PX = 24;
const SWIPE_LOCK_THRESHOLD_PX = 12;
const SWIPE_NAVIGATION_THRESHOLD_PX = 72;
const SWIPE_NAVIGATION_THRESHOLD_RATIO = 0.18;
const EDGE_RESISTANCE = 0.35;
const SWIPE_IGNORE_SELECTOR = '[data-swipe-ignore]';

function getTimerViewFromPath(pathname: string): TimerViewId | null {
  if (pathname === '/timers/remaining') return 'remaining';
  if (pathname === '/timers/all') return 'all';
  return null;
}

function getTimerViewPath(view: TimerViewId): string {
  return `/timers/${view}`;
}

function getMatches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

function getShouldUseMobilePager() {
  if (typeof window === 'undefined') return false;

  const isMobileViewport = getMatches('(max-width: 767px)');
  const hasCoarsePointer =
    getMatches('(pointer: coarse)') ||
    getMatches('(any-pointer: coarse)') ||
    window.navigator.maxTouchPoints > 0;

  return isMobileViewport && hasCoarsePointer;
}

function subscribeToMediaQuery(query: string, onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mediaQuery = window.matchMedia(query);
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }

  mediaQuery.addListener(onChange);
  return () => mediaQuery.removeListener(onChange);
}

function useMobilePagerEligibility() {
  const [isEligible, setIsEligible] = useState(() => getShouldUseMobilePager());

  useEffect(() => {
    const syncEligibility = () => {
      setIsEligible(getShouldUseMobilePager());
    };

    syncEligibility();

    const unsubscribeMobile = subscribeToMediaQuery('(max-width: 767px)', syncEligibility);
    const unsubscribePointer = subscribeToMediaQuery('(pointer: coarse)', syncEligibility);
    const unsubscribeAnyPointer = subscribeToMediaQuery('(any-pointer: coarse)', syncEligibility);

    return () => {
      unsubscribeMobile();
      unsubscribePointer();
      unsubscribeAnyPointer();
    };
  }, []);

  return isEligible;
}

interface DragGestureState {
  pointerId: number | null;
  intent: 'idle' | 'pending' | 'horizontal' | 'vertical';
  startX: number;
  startY: number;
  latestDx: number;
  width: number;
}

interface PendingSnapState {
  fromIndex: number;
  toIndex: number;
  releaseOffset: number;
  width: number;
}

export function MobileTimersPager({ activeView, timerState }: { activeView: TimerViewId; timerState: UseTimerStateReturn }) {
  const navigate = useNavigate();
  const { containerRef, size } = useContainerSize(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const gestureRef = useRef<DragGestureState>({
    pointerId: null,
    intent: 'idle',
    startX: 0,
    startY: 0,
    latestDx: 0,
    width: 0,
  });
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const [pendingSnap, setPendingSnap] = useState<PendingSnapState | null>(null);

  const activeIndex = TIMER_VIEW_ORDER.indexOf(activeView);

  const clearSuppressedClick = useCallback(() => {
    if (suppressClickTimeoutRef.current) {
      clearTimeout(suppressClickTimeoutRef.current);
      suppressClickTimeoutRef.current = null;
    }
    suppressClickRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
      if (suppressClickTimeoutRef.current) clearTimeout(suppressClickTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingSnap) return;
    if (activeIndex !== pendingSnap.toIndex) return;

    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
    }

    settleFrameRef.current = requestAnimationFrame(() => {
      settleFrameRef.current = null;
      setPendingSnap(null);
      setDragOffset(0);
    });
  }, [activeIndex, pendingSnap]);

  const clearGesture = useCallback(() => {
    gestureRef.current = {
      pointerId: null,
      intent: 'idle',
      startX: 0,
      startY: 0,
      latestDx: 0,
      width: 0,
    };
  }, []);

  const getDraggedOffset = useCallback(
    (dx: number) => {
      const atFirstView = activeIndex === 0;
      const atLastView = activeIndex === TIMER_VIEW_ORDER.length - 1;

      if ((atFirstView && dx > 0) || (atLastView && dx < 0)) {
        return dx * EDGE_RESISTANCE;
      }

      return dx;
    },
    [activeIndex],
  );

  const queueSuppressedClick = useCallback(() => {
    if (suppressClickTimeoutRef.current) {
      clearTimeout(suppressClickTimeoutRef.current);
    }

    suppressClickRef.current = true;
    suppressClickTimeoutRef.current = setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimeoutRef.current = null;
    }, 0);
  }, []);

  const releasePointerCapture = useCallback((target: HTMLDivElement | null, pointerId: number | null) => {
    if (!target || pointerId === null || typeof target.releasePointerCapture !== 'function') return;

    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Capture can already be released if the browser hands control back to native navigation.
    }
  }, []);

  const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest(SWIPE_IGNORE_SELECTOR)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    if (offsetX <= EDGE_SWIPE_GUARD_PX || rect.width - offsetX <= EDGE_SWIPE_GUARD_PX) {
      return;
    }

    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }

    clearSuppressedClick();
    gestureRef.current = {
      pointerId: e.pointerId,
      intent: 'pending',
      startX: e.clientX,
      startY: e.clientY,
      latestDx: 0,
      width: rect.width,
    };

    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // iOS can refuse capture when system navigation takes ownership of the edge gesture.
      }
    }
  }, [clearSuppressedClick]);

  const handlePointerMoveCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== e.pointerId) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    gesture.latestDx = dx;

    if (gesture.intent === 'pending') {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Claim the gesture only after clear horizontal intent so timer taps and
      // long-press menus keep their normal behavior.
      if (absDx >= SWIPE_LOCK_THRESHOLD_PX && absDx > absDy * 1.25) {
        gesture.intent = 'horizontal';
        setIsDragging(true);
      } else if (absDy >= SWIPE_LOCK_THRESHOLD_PX) {
        gesture.intent = 'vertical';
        setDragOffset(0);
        setIsDragging(false);
        releasePointerCapture(e.currentTarget, e.pointerId);
        return;
      } else {
        return;
      }
    }

    if (gesture.intent !== 'horizontal') return;

    e.preventDefault();
    setDragOffset(getDraggedOffset(dx));
  }, [getDraggedOffset, releasePointerCapture]);

  const finishDrag = useCallback((target: HTMLDivElement | null, pointerId: number) => {
    const gesture = gestureRef.current;
    releasePointerCapture(target, pointerId);

    if (gesture.intent === 'horizontal') {
      queueSuppressedClick();

      const threshold = Math.max(
        SWIPE_NAVIGATION_THRESHOLD_PX,
        gesture.width * SWIPE_NAVIGATION_THRESHOLD_RATIO,
      );
      const dx = gesture.latestDx;
      const nextIndex =
        dx <= -threshold && activeIndex < TIMER_VIEW_ORDER.length - 1
          ? activeIndex + 1
          : dx >= threshold && activeIndex > 0
            ? activeIndex - 1
            : activeIndex;

      if (nextIndex !== activeIndex) {
        const releaseOffset = getDraggedOffset(dx);
        const nextView = TIMER_VIEW_ORDER[nextIndex]!;

        setIsDragging(false);
        setDragOffset(releaseOffset);
        setPendingSnap({
          fromIndex: activeIndex,
          toIndex: nextIndex,
          releaseOffset,
          width: gesture.width,
        });
        navigate(getTimerViewPath(nextView));
      } else {
        setPendingSnap(null);
        setIsDragging(false);
        setDragOffset(0);
      }
    } else {
      setPendingSnap(null);
      setIsDragging(false);
      setDragOffset(0);
    }

    clearGesture();
  }, [activeIndex, clearGesture, getDraggedOffset, navigate, queueSuppressedClick, releasePointerCapture]);

  const handlePointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current.pointerId !== e.pointerId) return;
    finishDrag(e.currentTarget, e.pointerId);
  }, [finishDrag]);

  const handlePointerCancelCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current.pointerId !== e.pointerId) return;
    finishDrag(e.currentTarget, e.pointerId);
  }, [finishDrag]);

  const handleClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    clearSuppressedClick();
  }, [clearSuppressedClick]);

  const translateX = (() => {
    if (!pendingSnap) {
      return -activeIndex * size.width + dragOffset;
    }

    if (activeIndex !== pendingSnap.toIndex) {
      return -pendingSnap.fromIndex * pendingSnap.width + pendingSnap.releaseOffset;
    }

    const carryOffset =
      pendingSnap.releaseOffset +
      (pendingSnap.toIndex - pendingSnap.fromIndex) * pendingSnap.width;
    return -activeIndex * pendingSnap.width + carryOffset;
  })();

  return (
    <div
      ref={containerRef}
      data-testid="timers-mobile-pager"
      className="relative h-full w-full overflow-hidden touch-pan-y"
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerCancelCapture}
      onClickCapture={handleClickCapture}
    >
      <div
        className={cn(
          'flex h-full will-change-transform',
          !isDragging && 'transition-transform duration-300 ease-out',
        )}
        style={{
          width: `${TIMER_VIEW_COUNT * 100}%`,
          transform: `translate3d(${translateX}px, 0, 0)`,
        }}
      >
        <section
          data-testid="timers-page-remaining"
          aria-hidden={activeView !== 'remaining'}
          className="h-full shrink-0"
          style={{ width: `${100 / TIMER_VIEW_COUNT}%` }}
        >
          <TimerGridWithState timerState={timerState} />
        </section>
        <section
          data-testid="timers-page-all"
          aria-hidden={activeView !== 'all'}
          className="h-full shrink-0"
          style={{ width: `${100 / TIMER_VIEW_COUNT}%` }}
        >
          <AllTimerGridWithState timerState={timerState} />
        </section>
      </div>
    </div>
  );
}

export default function TimersLayout() {
  const { pathname } = useLocation();
  const activeView = getTimerViewFromPath(pathname);
  const useMobilePager = useMobilePagerEligibility() && activeView !== null;
  const timerState = useTimerState();

  useDocumentTitle(activeView ? TIMER_VIEW_TITLE[activeView] : TIMERS_TITLE);

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0">
      {/* Sub-nav: horizontal bar at top on mobile, vertical sidebar on desktop */}
      <nav
        aria-label="Timer views"
        className="timers-sub-nav shrink-0 flex md:flex-col bg-sidebar border-b md:border-b-0 md:border-r border-sidebar-border md:w-16 select-none"
      >
        {SUB_NAV_TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'timers-sub-nav-item flex flex-col items-center justify-center gap-1 transition-colors select-none',
                'flex-1 py-2 md:flex-none md:w-full md:px-3 md:py-3',
                isActive
                  ? 'text-sidebar-foreground'
                  : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
              )}
              // Keep tab presses from falling into text selection on touch devices.
              style={{ WebkitTouchCallout: 'none' }}
            >
              <div
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isActive && 'bg-sidebar-accent',
                )}
              >
                <tab.icon className="size-5" />
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Content area + total time indicator */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="timers-content flex-1 min-h-0 min-w-0 overflow-hidden">
          {useMobilePager && activeView ? (
            <MobileTimersPager activeView={activeView} timerState={timerState} />
          ) : (
            <Outlet context={timerState} />
          )}
        </div>
        <TotalTimeIndicator allBuckets={timerState.allBuckets} />
      </div>
    </div>
  );
}
