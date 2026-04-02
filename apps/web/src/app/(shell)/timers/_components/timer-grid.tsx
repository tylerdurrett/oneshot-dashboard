import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Clock, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@repo/ui';

import { BucketSettingsDialog } from './bucket-settings-dialog';
import { getTimerBucketSizeTier, TimerBucket } from './timer-bucket';

import {
  ADD_BUCKET_EVENT,
  BUCKET_COLORS,
  GRID_GAP,
  GRID_PADDING,
  generateBucketId,
  type TimeBucket,
} from '../_lib/timer-types';
import {
  getResponsiveTreemapConstraints,
  squarify,
  type TreemapItem,
} from '../_lib/treemap';
import { BUBBLE_POP_EXIT, TILE_INNER_STYLE, TILE_TRANSITION, TILE_WRAPPER_STYLE } from '../_lib/animation';
import { useTimerState, type UseTimerStateReturn } from '../_hooks/use-timer-state';
import { useContainerSize } from '../_hooks/use-container-size';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All 7 days of the week (Sunday through Saturday). */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Using totalMinutes (not remaining time) keeps the layout stable — buckets
 *  won't swap positions as their timers tick down. */
function bucketsToItems(buckets: TimeBucket[]): TreemapItem[] {
  return buckets.map((b) => ({
    id: b.id,
    value: Math.max(1, b.totalMinutes),
  }));
}

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

function TimerGridContent({ timerState }: { timerState: UseTimerStateReturn }) {
  const {
    isHydrated,
    allBuckets,
    todaysBuckets,
    activeBucketId,
    goalReachedBuckets,
    toggleBucket,
    addBucket,
    updateBucket,
    removeBucket,
    resetBucketForToday,
    setElapsedTime,
    setDailyGoal,
    dismissBucketForToday,
  } = timerState;

  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  const handleDeleteBucket = useCallback(
    (id: string) => {
      removeBucket(id);
      setSelectedBucketId(null);
    },
    [removeBucket],
  );

  const allBucketsRef = useRef(allBuckets);
  allBucketsRef.current = allBuckets;

  const handleAddBucket = useCallback(() => {
    const newBucket: TimeBucket = {
      id: generateBucketId(),
      name: 'New Bucket',
      totalMinutes: 60,
      elapsedSeconds: 0,
      colorIndex: nextAvailableColorIndex(allBucketsRef.current),
      daysOfWeek: ALL_DAYS,
      weeklySchedule: null,
      startedAt: null,
      goalReachedAt: null,
      dismissedAt: null,
      deactivatedAt: null,
    };
    addBucket(newBucket);
    setSelectedBucketId(newBucket.id);
  }, [addBucket]);

  useEffect(() => {
    const handler = () => handleAddBucket();
    window.addEventListener(ADD_BUCKET_EVENT, handler);
    return () => window.removeEventListener(ADD_BUCKET_EVENT, handler);
  }, [handleAddBucket]);

  const { containerRef, size } = useContainerSize(isHydrated);

  const innerWidth = Math.max(0, size.width - GRID_PADDING * 2);
  const innerHeight = Math.max(0, size.height - GRID_PADDING * 2);
  const treemapConstraints = useMemo(
    () => getResponsiveTreemapConstraints(innerWidth),
    [innerWidth],
  );

  const items = useMemo(() => bucketsToItems(todaysBuckets), [todaysBuckets]);
  const rects = useMemo(
    () => squarify(items, innerWidth, innerHeight, treemapConstraints),
    [items, innerWidth, innerHeight, treemapConstraints],
  );
  const bucketMap = useMemo(
    () => new Map(todaysBuckets.map((b) => [b.id, b])),
    [todaysBuckets],
  );

  if (!isHydrated) return null;

  const selectedBucket = selectedBucketId
    ? allBuckets.find((b) => b.id === selectedBucketId) ?? null
    : null;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Empty state — rendered underneath exiting tiles so the last pop
          finishes visually before the user notices the empty view. */}
      {todaysBuckets.length === 0 && (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <Clock className="size-12 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">No buckets yet</h2>
              <p className="text-sm text-muted-foreground">
                Create a bucket to start tracking your time.
              </p>
            </div>
            <Button data-swipe-ignore onClick={handleAddBucket}>
              <Plus className="size-4" />
              Create your first bucket
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false} mode="popLayout">
        {rects.map((rect) => {
          const bucket = bucketMap.get(rect.id);
          if (!bucket) return null;

          const left = rect.x + GRID_PADDING + GRID_GAP / 2;
          const top = rect.y + GRID_PADDING + GRID_GAP / 2;
          const width = rect.width - GRID_GAP;
          const height = rect.height - GRID_GAP;
          const sizeTier = getTimerBucketSizeTier(width, height);

          return (
            <motion.div
              key={bucket.id}
              initial={false}
              animate={{ left, top, width, height, scale: 1, opacity: 1 }}
              exit={BUBBLE_POP_EXIT}
              transition={TILE_TRANSITION}
              style={TILE_WRAPPER_STYLE}
            >
              <TimerBucket
                bucket={bucket}
                isActive={activeBucketId === bucket.id}
                isGoalReached={goalReachedBuckets.has(bucket.id)}
                sizeTier={sizeTier}
                mode="remaining"
                style={TILE_INNER_STYLE}
                onToggle={() => toggleBucket(bucket.id)}
                onOpenSettings={() => setSelectedBucketId(bucket.id)}
                onResetForToday={() => resetBucketForToday(bucket.id)}
                onSetElapsedTime={(s) => setElapsedTime(bucket.id, s)}
                onSetDailyGoal={(m) => setDailyGoal(bucket.id, m)}
                onDismissForToday={() => dismissBucketForToday(bucket.id)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

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

export function TimerGrid() {
  const timerState = useTimerState();
  return <TimerGridContent timerState={timerState} />;
}

export function TimerGridWithState({ timerState }: { timerState: UseTimerStateReturn }) {
  return <TimerGridContent timerState={timerState} />;
}
