'use client';

import type { CSSProperties } from 'react';

import { cn } from '@repo/ui';

import { BUCKET_COLORS, formatTime, type TimeBucket } from '../_lib/timer-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimerBucketProps {
  bucket: TimeBucket;
  isActive: boolean;
  isCompleted: boolean;
  style: CSSProperties;
  onToggle: () => void;
}

// ---------------------------------------------------------------------------
// Component — minimal rendering for Phase 2.2; full visual layer stack
// (muted/vibrant layers, pulse overlay, etc.) is added in Phase 2.3.
// ---------------------------------------------------------------------------

export function TimerBucket({
  bucket,
  isActive,
  isCompleted,
  style,
  onToggle,
}: TimerBucketProps) {
  const remainingSeconds = bucket.totalMinutes * 60 - bucket.elapsedSeconds;
  const color = BUCKET_COLORS[bucket.colorIndex] ?? BUCKET_COLORS[0]!;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        'select-none cursor-pointer rounded-lg overflow-hidden transition-shadow',
        isActive && 'ring-2 ring-white/40',
        isCompleted && 'opacity-60',
      )}
      style={{
        ...style,
        backgroundColor: color.vibrant,
      }}
    >
      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <span className="text-lg font-bold text-white md:text-xl">
          {bucket.name}
        </span>
        <span
          className="text-2xl font-bold text-white md:text-4xl"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {formatTime(remainingSeconds)}
        </span>
      </div>
    </div>
  );
}
