'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, RotateCcw, Settings } from 'lucide-react';

import type { TimeBucket } from '../_lib/timer-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BucketContextMenuProps {
  bucket: TimeBucket;
  position: { x: number; y: number };
  onOpenSettings: () => void;
  onSetRemainingTime: (remainingSeconds: number) => void;
  onResetForToday: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEWPORT_MARGIN = 8;
const OFFSET_BELOW = 10;
const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BucketContextMenu({
  bucket,
  position,
  onOpenSettings,
  onSetRemainingTime,
  onResetForToday,
  onClose,
}: BucketContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Ref to hold latest onClose — avoids re-registering the document listener
  // every time the parent re-renders with a new callback reference.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [view, setView] = useState<'menu' | 'setTime'>('menu');
  const [adjusted, setAdjusted] = useState({ x: position.x, y: position.y + OFFSET_BELOW });

  // Pre-populate time inputs from bucket's remaining time
  const remainingTotal = Math.max(0, bucket.totalMinutes * 60 - bucket.elapsedSeconds);
  const [hours, setHours] = useState(Math.floor(remainingTotal / 3600));
  const [minutes, setMinutes] = useState(Math.floor((remainingTotal % 3600) / 60));

  // Viewport-edge clamping — useLayoutEffect prevents a flash of un-clamped position
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = position.x;
    let y = position.y + OFFSET_BELOW;

    if (x + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    }
    if (x < VIEWPORT_MARGIN) x = VIEWPORT_MARGIN;
    if (y + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = position.y - rect.height - OFFSET_BELOW;
    }
    if (y < VIEWPORT_MARGIN) y = VIEWPORT_MARGIN;

    setAdjusted((prev) =>
      prev.x === x && prev.y === y ? prev : { x, y },
    );
  }, [position, view]);

  // Click-outside and Escape-key dismissal
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    // Delay listener registration so the opening pointer event doesn't
    // immediately close the menu.
    const id = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSetTime = useCallback(() => {
    const h = Math.max(0, Math.min(23, hours));
    const m = Math.max(0, Math.min(59, minutes));
    onSetRemainingTime(h * 3600 + m * 60);
    onClose();
  }, [hours, minutes, onSetRemainingTime, onClose]);

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-xl"
      style={{ left: adjusted.x, top: adjusted.y }}
    >
      {view === 'menu' && (
        <>
          <button
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
          >
            <Settings className="size-4" />
            Bucket Settings
          </button>
          <button
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => setView('setTime')}
          >
            <Clock className="size-4" />
            Set Remaining Time
          </button>
          <button
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => {
              onResetForToday();
              onClose();
            }}
          >
            <RotateCcw className="size-4" />
            Reset for Today
          </button>
        </>
      )}

      {view === 'setTime' && (
        <div className="flex flex-col gap-2 p-2">
          <span className="text-xs font-medium text-muted-foreground">Set Remaining Time</span>
          <div className="flex items-center gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Hours</span>
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-16 rounded border border-border bg-input/30 px-2 py-1 text-sm text-popover-foreground"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Minutes</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-16 rounded border border-border bg-input/30 px-2 py-1 text-sm text-popover-foreground"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-md bg-accent px-3 py-1.5 text-xs text-accent-foreground hover:bg-accent/80"
              onClick={() => setView('menu')}
            >
              Back
            </button>
            <button
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              onClick={handleSetTime}
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
