import { useMemo } from 'react';

import { getTotalTimeStats, type TimeBucket } from '../_lib/timer-types';

/** Format seconds as decimal hours rounded to 2 places (e.g. 4.88) */
function decimalHours(seconds: number): string {
  return parseFloat((seconds / 3600).toFixed(2)).toString();
}

/** Format seconds as H:MM (e.g. "4:34") */
function compactHM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

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
  const remainingSeconds = Math.max(0, totalDaySeconds - elapsedSeconds);

  const summaryLabel = `${decimalHours(elapsedSeconds)} done, ${compactHM(remainingSeconds)} left (${decimalHours(totalDaySeconds)} total)`;

  const finishTime = remainingSeconds > 0
    ? new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <div
      data-testid="total-time-indicator"
      className="relative h-12 shrink-0 mx-2 mt-2 rounded-md overflow-hidden"
    >
      <div className="absolute inset-0 bg-zinc-900" />
      <div
        className="absolute inset-0 origin-left bg-primary/15 transition-transform duration-300 ease-linear"
        style={{ transform: `scaleX(${progress})` }}
      />
      <span className="relative z-10 flex h-full items-center justify-between px-3 text-xs font-medium tabular-nums text-zinc-100">
        <span>{summaryLabel}</span>
        {finishTime && (
          <span className="text-zinc-300">
            Finish at {finishTime}
          </span>
        )}
      </span>
    </div>
  );
}
