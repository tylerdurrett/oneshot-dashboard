import { useMemo, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';

import {
  GRID_GAP,
  GRID_PADDING,
  isBucketActiveToday,
  type TimeBucket,
} from '../_lib/timer-types';
import {
  getResponsiveTreemapConstraints,
  squarify,
  type TreemapItem,
} from '../_lib/treemap';
import { useTimerState } from '../_hooks/use-timer-state';
import { useContainerSize } from '../_hooks/use-container-size';
import { BucketSettingsDialog } from './bucket-settings-dialog';
import { getTimerBucketSizeTier, TimerBucket } from './timer-bucket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Treemap sized by elapsed (rounded to nearest minute for layout stability). */
function bucketsToElapsedItems(buckets: TimeBucket[]): TreemapItem[] {
  return buckets.map((b) => ({
    id: b.id,
    value: Math.max(1, Math.ceil(b.elapsedSeconds / 60)),
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllTimerGrid() {
  const {
    isHydrated,
    allBuckets,
    activeBucketId,
    goalReachedBuckets,
    toggleBucket,
    updateBucket,
    removeBucket,
    resetBucketForToday,
    setRemainingTime,
    dismissBucketForToday,
  } = useTimerState();

  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  const handleDeleteBucket = useCallback(
    (id: string) => {
      removeBucket(id);
      setSelectedBucketId(null);
    },
    [removeBucket],
  );

  const usedBuckets = useMemo(
    () => allBuckets.filter((b) => isBucketActiveToday(b) && b.elapsedSeconds > 0),
    [allBuckets],
  );

  const { containerRef, size } = useContainerSize(isHydrated);

  const innerWidth = Math.max(0, size.width - GRID_PADDING * 2);
  const innerHeight = Math.max(0, size.height - GRID_PADDING * 2);
  const treemapConstraints = useMemo(
    () => getResponsiveTreemapConstraints(innerWidth),
    [innerWidth],
  );

  const items = useMemo(() => bucketsToElapsedItems(usedBuckets), [usedBuckets]);
  const rects = useMemo(
    () => squarify(items, innerWidth, innerHeight, treemapConstraints),
    [items, innerWidth, innerHeight, treemapConstraints],
  );
  const bucketMap = useMemo(
    () => new Map(usedBuckets.map((b) => [b.id, b])),
    [usedBuckets],
  );

  const selectedBucket = selectedBucketId
    ? allBuckets.find((b) => b.id === selectedBucketId) ?? null
    : null;

  if (!isHydrated || usedBuckets.length === 0) {
    return (
      <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <Clock className="size-12 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">No time tracked yet</h2>
            <p className="text-sm text-muted-foreground">
              Start a timer on the Remaining tab to see your usage here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {rects.map((rect) => {
        const bucket = bucketMap.get(rect.id);
        if (!bucket) return null;

        const bucketStyle = {
          position: 'absolute' as const,
          left: rect.x + GRID_PADDING + GRID_GAP / 2,
          top: rect.y + GRID_PADDING + GRID_GAP / 2,
          width: rect.width - GRID_GAP,
          height: rect.height - GRID_GAP,
        };
        const sizeTier = getTimerBucketSizeTier(
          bucketStyle.width,
          bucketStyle.height,
        );

        return (
          <TimerBucket
            key={bucket.id}
            bucket={bucket}
            isActive={activeBucketId === bucket.id}
            isGoalReached={goalReachedBuckets.has(bucket.id)}
            sizeTier={sizeTier}
            mode="elapsed"
            style={bucketStyle}
            onToggle={() => toggleBucket(bucket.id)}
            onOpenSettings={() => setSelectedBucketId(bucket.id)}
            onResetForToday={() => resetBucketForToday(bucket.id)}
            onSetRemainingTime={(s) => setRemainingTime(bucket.id, s)}
            onDismissForToday={() => dismissBucketForToday(bucket.id)}
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
