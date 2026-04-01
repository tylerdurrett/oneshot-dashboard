import { useMemo } from 'react';

import { formatDurationLabel, getTotalTimeStats, type TimeBucket } from '../_lib/timer-types';

export function TotalTimeIndicator({
  allBuckets,
}: {
  allBuckets: TimeBucket[];
}) {
  const { elapsedSeconds, totalDaySeconds } = useMemo(
    () => getTotalTimeStats(allBuckets),
    [allBuckets],
  );

  if (totalDaySeconds === 0) return null;

  const progress = Math.min(1, elapsedSeconds / totalDaySeconds);
  const label = `${formatDurationLabel(elapsedSeconds)} / ${formatDurationLabel(totalDaySeconds)}`;

  const remainingSeconds = Math.max(0, totalDaySeconds - elapsedSeconds);
  const finishTime = remainingSeconds > 0
    ? new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  // Format remaining time as compact H:MM (e.g. "3:00", "0:45")
  const remainingH = Math.floor(remainingSeconds / 3600);
  const remainingM = Math.floor((remainingSeconds % 3600) / 60);
  const remainingCompact = `${remainingH}:${String(remainingM).padStart(2, '0')}`;

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
      <span className="relative z-10 flex h-full items-center justify-between px-3 text-xs font-medium tabular-nums text-muted-foreground">
        <span>{label}</span>
        {finishTime && (
          <span className="text-muted-foreground/70">
            {remainingCompact}=&gt;{finishTime}
          </span>
        )}
      </span>
    </div>
  );
}
