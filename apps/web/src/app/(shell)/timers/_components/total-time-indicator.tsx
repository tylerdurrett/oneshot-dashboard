import { useMemo } from 'react';

import { formatDurationLabel, getTotalTimeStats, type TimeBucket } from '../_lib/timer-types';

export function TotalTimeIndicator({
  allBuckets,
}: {
  allBuckets: TimeBucket[];
}) {
  const { trackedSeconds, goalSeconds } = useMemo(
    () => getTotalTimeStats(allBuckets),
    [allBuckets],
  );

  if (goalSeconds === 0) return null;

  const progress = Math.min(1, trackedSeconds / goalSeconds);
  const label = `${formatDurationLabel(trackedSeconds)} / ${formatDurationLabel(goalSeconds)}`;

  return (
    <div
      data-testid="total-time-indicator"
      className="relative h-8 shrink-0 mx-2 mb-2 rounded-md overflow-hidden"
    >
      <div className="absolute inset-0 bg-muted" />
      <div
        className="absolute inset-0 origin-left bg-primary/30 transition-transform duration-300 ease-linear"
        style={{ transform: `scaleX(${progress})` }}
      />
      <span className="relative z-10 flex h-full items-center justify-center text-xs font-medium tabular-nums text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
