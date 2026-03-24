'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { TimeBucket } from '../_lib/timer-types';
import { squarify, type TreemapItem } from '../_lib/treemap';
import { useTimerState } from '../_hooks/use-timer-state';
import { TimerBucket } from './timer-bucket';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Padding around the outer edge of the grid (px). */
const CONTAINER_PADDING = 8;

/** Gap between adjacent buckets (px). */
const BUCKET_GAP = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map buckets to treemap input items using remaining seconds as the value. */
function bucketsToItems(buckets: TimeBucket[]): TreemapItem[] {
  return buckets.map((b) => ({
    id: b.id,
    value: Math.max(1, b.totalMinutes * 60 - b.elapsedSeconds),
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimerGrid() {
  const {
    isHydrated,
    todaysBuckets,
    activeBucketId,
    completedBuckets,
    toggleBucket,
  } = useTimerState();

  // Container measurement via ResizeObserver
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Compute treemap layout (recomputes when buckets tick or container resizes)
  const innerWidth = Math.max(0, size.width - CONTAINER_PADDING * 2);
  const innerHeight = Math.max(0, size.height - CONTAINER_PADDING * 2);

  const items = useMemo(() => bucketsToItems(todaysBuckets), [todaysBuckets]);
  const rects = useMemo(
    () => squarify(items, innerWidth, innerHeight),
    [items, innerWidth, innerHeight],
  );
  const bucketMap = useMemo(
    () => new Map(todaysBuckets.map((b) => [b.id, b])),
    [todaysBuckets],
  );

  if (!isHydrated) return null;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {rects.map((rect) => {
        const bucket = bucketMap.get(rect.id);
        if (!bucket) return null;

        const style = {
          position: 'absolute' as const,
          left: rect.x + CONTAINER_PADDING + BUCKET_GAP / 2,
          top: rect.y + CONTAINER_PADDING + BUCKET_GAP / 2,
          width: rect.width - BUCKET_GAP,
          height: rect.height - BUCKET_GAP,
        };

        return (
          <TimerBucket
            key={bucket.id}
            bucket={bucket}
            isActive={activeBucketId === bucket.id}
            isCompleted={completedBuckets.has(bucket.id)}
            style={style}
            onToggle={() => toggleBucket(bucket.id)}
          />
        );
      })}
    </div>
  );
}
