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
// Component
// ---------------------------------------------------------------------------

export function TimerBucket({
  bucket,
  isActive,
  isCompleted,
  style,
  onToggle,
}: TimerBucketProps) {
  const totalSeconds = bucket.totalMinutes * 60;
  const remainingSeconds = totalSeconds - bucket.elapsedSeconds;
  const progress = totalSeconds > 0 ? bucket.elapsedSeconds / totalSeconds : 0;
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
        'relative select-none cursor-pointer rounded-lg overflow-hidden transition-shadow',
        isActive && 'ring-2 ring-white/40',
        isCompleted && 'opacity-60',
      )}
      style={style}
    >
      {/* Muted background — shows "depleted" time */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: color.muted }}
      />

      {/* Vibrant overlay — shrinks as time elapses */}
      <div
        className="absolute inset-0 origin-left transition-transform duration-300 ease-linear"
        style={{
          backgroundColor: color.vibrant,
          transform: `scaleX(${1 - progress})`,
        }}
      />

      {/* Active pulse overlay */}
      {isActive && (
        <>
          <div className="absolute inset-0 animate-pulse bg-white opacity-20" />
          <div className="absolute inset-0 animate-pulse rounded-lg border-2 border-white/30" />
        </>
      )}
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
