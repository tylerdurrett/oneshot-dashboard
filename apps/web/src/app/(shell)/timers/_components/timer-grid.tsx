'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Clock, Plus } from 'lucide-react';

import { Button } from '@repo/ui';

import {
  ADD_BUCKET_EVENT,
  BUCKET_COLORS,
  generateBucketId,
  type TimeBucket,
} from '../_lib/timer-types';
import { squarify, type TreemapItem } from '../_lib/treemap';
import { useTimerState } from '../_hooks/use-timer-state';
import { BucketSettingsDialog } from './bucket-settings-dialog';
import { TimerBucket } from './timer-bucket';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Padding around the outer edge of the grid (px). */
const CONTAINER_PADDING = 8;

/** Gap between adjacent buckets (px). */
const BUCKET_GAP = 4;

/** All 7 days of the week (Sunday through Saturday). */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

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

/** Find the first color index (0-9) not used by any existing bucket. Falls
 *  back to 0 if all are taken. */
function nextAvailableColorIndex(buckets: TimeBucket[]): number {
  const used = new Set(buckets.map((b) => b.colorIndex));
  for (let i = 0; i < BUCKET_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimerGrid() {
  const {
    isHydrated,
    allBuckets,
    todaysBuckets,
    activeBucketId,
    completedBuckets,
    toggleBucket,
    addBucket,
    updateBucket,
    removeBucket,
    resetBucketForToday,
    setRemainingTime,
  } = useTimerState();

  // Selected bucket for settings dialog
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  // Tracks buckets whose completion exit animation has finished, so
  // they can be excluded from the treemap layout and let others reflow.
  const [hiddenBuckets, setHiddenBuckets] = useState<Set<string>>(
    () => new Set(),
  );

  const handleDeleteBucket = useCallback(
    (id: string) => {
      removeBucket(id);
      setSelectedBucketId(null);
    },
    [removeBucket],
  );

  const handleAnimationComplete = useCallback((id: string) => {
    setHiddenBuckets((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // When a bucket is reset, remove it from hiddenBuckets so it reappears
  const handleResetForToday = useCallback(
    (id: string) => {
      resetBucketForToday(id);
      setHiddenBuckets((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [resetBucketForToday],
  );

  // Ref to track latest allBuckets so handleAddBucket stays stable and
  // doesn't cause the event listener to re-register every second.
  const allBucketsRef = useRef(allBuckets);
  allBucketsRef.current = allBuckets;

  // Create a new bucket with sensible defaults and open its settings dialog
  const handleAddBucket = useCallback(() => {
    const newBucket: TimeBucket = {
      id: generateBucketId(),
      name: 'New Bucket',
      totalMinutes: 60,
      elapsedSeconds: 0,
      colorIndex: nextAvailableColorIndex(allBucketsRef.current),
      daysOfWeek: ALL_DAYS,
    };
    addBucket(newBucket);
    setSelectedBucketId(newBucket.id);
  }, [addBucket]);

  // Listen for the "add-bucket" custom event dispatched from the app shell
  useEffect(() => {
    const handler = () => handleAddBucket();
    window.addEventListener(ADD_BUCKET_EVENT, handler);
    return () => window.removeEventListener(ADD_BUCKET_EVENT, handler);
  }, [handleAddBucket]);

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

  // Exclude buckets whose exit animation finished from the treemap so
  // remaining buckets reflow to fill the freed space.
  const visibleBuckets = useMemo(
    () => todaysBuckets.filter((b) => !hiddenBuckets.has(b.id)),
    [todaysBuckets, hiddenBuckets],
  );
  const items = useMemo(() => bucketsToItems(visibleBuckets), [visibleBuckets]);
  const rects = useMemo(
    () => squarify(items, innerWidth, innerHeight),
    [items, innerWidth, innerHeight],
  );
  const bucketMap = useMemo(
    () => new Map(todaysBuckets.map((b) => [b.id, b])),
    [todaysBuckets],
  );

  if (!isHydrated) return null;

  // Look up the selected bucket for the settings dialog. Uses allBuckets
  // because newly-added buckets may not be in todaysBuckets yet.
  const selectedBucket = selectedBucketId
    ? allBuckets.find((b) => b.id === selectedBucketId) ?? null
    : null;

  // Empty state: no buckets scheduled for today
  if (todaysBuckets.length === 0) {
    return (
      <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <Clock className="size-12 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">No buckets yet</h2>
            <p className="text-sm text-muted-foreground">
              Create a bucket to start tracking your time.
            </p>
          </div>
          <Button onClick={handleAddBucket}>
            <Plus className="size-4" />
            Create your first bucket
          </Button>
        </div>

        {selectedBucketId && (
          <BucketSettingsDialog
            bucket={selectedBucket}
            open
            onOpenChange={(open) => {
              if (!open) setSelectedBucketId(null);
            }}
            onSave={updateBucket}
            onDelete={handleDeleteBucket}
          />
        )}
      </div>
    );
  }

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
            onOpenSettings={() => setSelectedBucketId(bucket.id)}
            onResetForToday={() => handleResetForToday(bucket.id)}
            onSetRemainingTime={(s) => setRemainingTime(bucket.id, s)}
            onAnimationComplete={() => handleAnimationComplete(bucket.id)}
          />
        );
      })}

      {selectedBucketId && (
        <BucketSettingsDialog
          bucket={selectedBucket}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedBucketId(null);
          }}
          onSave={updateBucket}
          onDelete={handleDeleteBucket}
        />
      )}
    </div>
  );
}
