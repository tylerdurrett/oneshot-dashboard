import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  type PanInfo,
} from 'motion/react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Snap logic — extracted as a pure function for testability
// ---------------------------------------------------------------------------

const VELOCITY_THRESHOLD = 300; // px/s — above this, a flick advances one page

/**
 * Decide which page index to snap to after a drag ends.
 *
 * @param currentFractional - fractional index from drag offset (e.g. 1.4)
 * @param velocityX - horizontal velocity in px/s (negative = swiping left)
 * @param currentIndex - the page index before the drag started
 * @param pageCount - total number of pages
 */
export function computeSnapIndex(
  currentFractional: number,
  velocityX: number,
  currentIndex: number,
  pageCount: number,
): number {
  let newIndex: number;

  if (Math.abs(velocityX) > VELOCITY_THRESHOLD) {
    // Fast flick: advance one page in the flick direction.
    // Negative velocity = swiping left = next page.
    newIndex = velocityX < 0 ? currentIndex + 1 : currentIndex - 1;
  } else {
    // Slow drag: snap to nearest page based on current offset.
    newIndex = Math.round(currentFractional);
  }

  return Math.max(0, Math.min(pageCount - 1, newIndex));
}

// ---------------------------------------------------------------------------
// SwipeView
// ---------------------------------------------------------------------------

export interface SwipeViewProps {
  /** Currently visible page index. Controlled externally. */
  activeIndex: number;
  /** Called when a swipe gesture completes and a new index should be active. */
  onIndexChange: (index: number) => void;
  /** Total number of pages. */
  pageCount: number;
  /** Disable swiping (e.g. during a modal). */
  disabled?: boolean;
  /** Optional className for the outer container. */
  className?: string;
  /** One React node per page. */
  children: ReactNode;
  /**
   * Called during drag with the fractional index (e.g. 1.4 = 40% between
   * page 1 and 2). Useful for animating a nav indicator in sync with drag.
   */
  onDragProgress?: (fractionalIndex: number) => void;
}

export function SwipeView({
  activeIndex,
  onIndexChange,
  pageCount,
  disabled = false,
  className,
  children,
  onDragProgress,
}: SwipeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track whether we've received the first real width measurement.
  // Until then, we use duration:0 so the strip snaps into position instantly
  // instead of spring-animating in from x=0. Without this, every initial load
  // (and phone lock/unlock) triggers a visible slide-in because the animate
  // target jumps from -(idx*0)=0 to -(idx*realWidth) once ResizeObserver fires.
  const hasInitialWidth = useRef(false);

  // Measure container width with ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        const w = entry.contentRect.width;
        // Skip setState when width hasn't changed. On mobile, the
        // ResizeObserver re-fires on visibility resume (phone lock/unlock)
        // with the same width. Without this guard, the setState triggers a
        // re-render, the animate target "changes" from 0→realWidth (because
        // containerWidth was briefly 0 during the render cycle), and Framer
        // Motion plays a spring animation — making it look like the user
        // just swiped to the page.
        setContainerWidth((prev) => (w === prev ? prev : w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Flip the flag after the first real measurement so subsequent renders
  // use the spring transition for actual navigation.
  if (!hasInitialWidth.current && containerWidth > 0) {
    hasInitialWidth.current = true;
  }

  // Motion value for the strip's x offset — avoids re-renders during drag.
  const x = useMotionValue(0);

  // Report fractional index during drag.
  useMotionValueEvent(x, 'change', (latest) => {
    if (!onDragProgress || containerWidth === 0) return;
    const fractional = -latest / containerWidth;
    onDragProgress(Math.max(0, Math.min(pageCount - 1, fractional)));
  });

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (containerWidth === 0) return;

      const currentOffset = x.get();
      const currentFractional = -currentOffset / containerWidth;
      const newIndex = computeSnapIndex(
        currentFractional,
        info.velocity.x,
        activeIndex,
        pageCount,
      );

      if (newIndex !== activeIndex) {
        onIndexChange(newIndex);
      }
      // When newIndex === activeIndex, the animate prop snaps back.
    },
    [activeIndex, containerWidth, onIndexChange, pageCount, x],
  );

  const childArray = Children.toArray(children);

  return (
    <div
      ref={containerRef}
      data-slot="swipe-view"
      className={cn('relative flex-1 overflow-hidden min-h-0', className)}
    >
      <motion.div
        data-slot="swipe-view-strip"
        drag={disabled ? false : 'x'}
        dragDirectionLock
        dragElastic={0.15}
        dragConstraints={{
          left: -(pageCount - 1) * containerWidth,
          right: 0,
        }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={{ x: -activeIndex * containerWidth }}
        // Snap instantly on the first render (before we have a real width),
        // then use a spring for actual user-initiated navigation.
        transition={
          hasInitialWidth.current
            ? { type: 'spring', stiffness: 300, damping: 30 }
            : { duration: 0 }
        }
        style={{
          x,
          // Let the browser handle vertical scroll and pinch zoom natively.
          // Without this, Framer Motion sets touch-action: none, which blocks
          // all browser-level touch gestures.
          touchAction: 'pan-y pinch-zoom',
        }}
        className="flex h-full"
      >
        {childArray.map((child, i) => (
          <div
            key={i}
            data-slot="swipe-view-page"
            className="flex flex-col min-h-0"
            style={{
              width: containerWidth > 0 ? containerWidth : '100%',
              flexShrink: 0,
            }}
          >
            {child}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
