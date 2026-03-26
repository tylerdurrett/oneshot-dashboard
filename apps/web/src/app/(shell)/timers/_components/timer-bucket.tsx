import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@repo/ui';
import { ConfirmationDialog } from '@repo/ui/components/confirmation-dialog';

import { BUCKET_COLORS, formatTime, type TimeBucket } from '../_lib/timer-types';
import { playCompletionChime } from '../_lib/sounds';
import { BucketContextMenu } from './bucket-context-menu';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) a touch must be held to trigger the context menu. */
const LONG_PRESS_MS = 800;

/** Maximum movement (px) before a long-press is cancelled. */
const LONG_PRESS_MOVE_THRESHOLD = 10;

/** Duration (ms) for the success checkmark overlay when goal is reached. */
const SUCCESS_OVERLAY_MS = 1200;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimerBucketProps {
  bucket: TimeBucket;
  isActive: boolean;
  isGoalReached: boolean;
  /** Display mode: 'remaining' counts down, 'elapsed' counts up. */
  mode?: 'remaining' | 'elapsed';
  style: CSSProperties;
  onToggle: () => void;
  onOpenSettings: () => void;
  onResetForToday: () => void;
  onSetRemainingTime: (remainingSeconds: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimerBucket({
  bucket,
  isActive,
  isGoalReached,
  mode = 'remaining',
  style,
  onToggle,
  onOpenSettings,
  onResetForToday,
  onSetRemainingTime,
}: TimerBucketProps) {
  const totalSeconds = bucket.totalMinutes * 60;
  const remainingSeconds = totalSeconds - bucket.elapsedSeconds;
  const progress = totalSeconds > 0 ? bucket.elapsedSeconds / totalSeconds : 0;
  const color = BUCKET_COLORS[bucket.colorIndex] ?? BUCKET_COLORS[0]!;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // -- Goal-reached animation state --
  // Shows a brief success overlay when the goal is first reached.
  // No exit/shrink animation — the bucket stays visible.
  const [showSuccess, setShowSuccess] = useState(false);
  const prevGoalReachedRef = useRef(isGoalReached);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef({ x: 0, y: 0 });
  const isLongPressRef = useRef(false);

  // Clean up long-press timer on unmount to prevent stale state updates
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Goal-reached animation: detect false→true transition on isGoalReached
  useEffect(() => {
    if (isGoalReached && !prevGoalReachedRef.current) {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);

      setShowSuccess(true);
      playCompletionChime();

      // After overlay duration, return to normal display (bucket stays visible)
      successTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
        successTimerRef.current = null;
      }, SUCCESS_OVERLAY_MS);
    }
    prevGoalReachedRef.current = isGoalReached;

    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [isGoalReached]);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openMenu = (x: number, y: number) => {
    setMenuPosition({ x, y });
    setMenuOpen(true);
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY);
    },
    [],
  );

  // Long-press for touch — mouse uses right-click via onContextMenu
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;

      isLongPressRef.current = false;
      pressStartRef.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        longPressTimerRef.current = null;
        openMenu(e.clientX, e.clientY);
      }, LONG_PRESS_MS);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || !longPressTimerRef.current) return;

      const dx = e.clientX - pressStartRef.current.x;
      const dy = e.clientY - pressStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
        clearLongPress();
      }
    },
    [],
  );

  // Handles both mouse click (via pointerup) and touch tap.
  // Mouse: handlePointerDown is a no-op, so isLongPressRef stays false → onToggle fires.
  // Touch: if long-press fired, isLongPressRef is true → skip toggle.
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearLongPress();
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Already released or not captured
      }

      if (isLongPressRef.current) {
        isLongPressRef.current = false;
        return;
      }

      // Only toggle on primary button (left-click / touch tap).
      // Right-click (button 2) opens context menu and should not toggle.
      if (e.button !== 0) return;

      onToggle();
    },
    [onToggle],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      clearLongPress();
      isLongPressRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Already released
      }
    },
    [],
  );

  // BucketContextMenu owns closing after actions. This component only needs
  // to handle the reset confirmation flow separately since it requires a
  // two-step interaction (menu dismiss → confirmation dialog).
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Display time based on mode
  const displayTime =
    mode === 'elapsed'
      ? formatTime(bucket.elapsedSeconds)
      : formatTime(remainingSeconds);

  // Progress bar: in remaining mode, vibrant fills from right and shrinks left.
  // In elapsed mode, vibrant fills from left. Clamped to [0, 1].
  const barScale =
    mode === 'elapsed'
      ? Math.min(1, progress)
      : Math.max(0, 1 - progress);

  // Show persistent check icon when goal has been reached (not just during animation)
  const showGoalCheck = bucket.goalReachedAt != null && !showSuccess;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          'touch-none relative select-none cursor-pointer rounded-lg overflow-hidden',
          'transition-[opacity,transform] duration-400',
          isActive && 'ring-2 ring-white/40',
        )}
        // Prevent iOS long-press from selecting bucket text instead of
        // respecting the bucket tap / context-menu gestures.
        style={{ ...style, WebkitTouchCallout: 'none' }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: color.muted }}
        />
        <div
          className="absolute inset-0 origin-left transition-transform duration-300 ease-linear"
          style={{
            backgroundColor: color.vibrant,
            transform: `scaleX(${barScale})`,
          }}
        />
        {isActive && (
          <>
            <div className="absolute inset-0 animate-pulse bg-white opacity-20" />
            <div className="absolute inset-0 animate-pulse rounded-lg border-2 border-white/30" />
          </>
        )}
        {showSuccess && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/20 animate-in fade-in zoom-in duration-300">
            <Check className="size-16 text-white drop-shadow-lg animate-bounce md:size-24" strokeWidth={3} />
          </div>
        )}
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          <span className="text-lg font-bold text-white md:text-xl">
            {bucket.name}
          </span>
          <div className="flex items-center gap-1.5">
            {showGoalCheck && (
              <Check className="size-5 text-white/80 md:size-6" strokeWidth={3} />
            )}
            <span
              className="text-2xl font-bold text-white md:text-4xl"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {displayTime}
            </span>
          </div>
        </div>
      </div>

      {menuOpen && (
        <BucketContextMenu
          bucket={bucket}
          position={menuPosition}
          onOpenSettings={onOpenSettings}
          onSetRemainingTime={onSetRemainingTime}
          onResetForToday={() => {
            setConfirmResetOpen(true);
          }}
          onClose={closeMenu}
        />
      )}

      <ConfirmationDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="Reset bucket?"
        description={`This will reset "${bucket.name}" to its full duration for today. Any progress will be lost.`}
        confirmLabel="Reset"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          onResetForToday();
          setConfirmResetOpen(false);
        }}
      />
    </>
  );
}
