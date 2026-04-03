import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, EyeOff, RotateCcw, Settings, Target, Trash2 } from 'lucide-react';

import type { TimeBucket } from '../_lib/timer-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BucketContextMenuProps {
  bucket: TimeBucket;
  position: { x: number; y: number };
  onOpenSettings: () => void;
  onSetElapsedTime: (elapsedSeconds: number) => void;
  onSetDailyGoal: (targetMinutes: number) => void;
  onResetForToday: () => void;
  onDismissForToday: () => void;
  onDelete: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

type ContextMenuView = 'menu' | 'setTime' | 'setGoal';

const VIEWPORT_MARGIN = 8;
const OFFSET_BELOW = 10;
const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent';
const TIME_INPUT_CLASS =
  'w-16 rounded border border-border bg-input/30 px-2 py-1 text-base text-popover-foreground md:text-sm';

// ---------------------------------------------------------------------------
// Shared hours/minutes input panel
// ---------------------------------------------------------------------------

function TimeInputPanel({
  title,
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
  onBack,
  onSubmit,
  submitDisabled,
}: {
  title: string;
  hours: number;
  minutes: number;
  onHoursChange: (v: number) => void;
  onMinutesChange: (v: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 p-2">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <div className="flex items-center gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Hours</span>
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => onHoursChange(Number(e.target.value))}
            // Keep mobile inputs at 16px so iOS Safari does not auto-zoom
            // and strand this fixed-position menu off-screen after focus.
            className={TIME_INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Minutes</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => onMinutesChange(Number(e.target.value))}
            className={TIME_INPUT_CLASS}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-md bg-accent px-3 py-1.5 text-xs text-accent-foreground hover:bg-accent/80"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          disabled={submitDisabled}
          onClick={onSubmit}
        >
          Set
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BucketContextMenu({
  bucket,
  position,
  onOpenSettings,
  onSetElapsedTime,
  onSetDailyGoal,
  onResetForToday,
  onDismissForToday,
  onDelete,
  onClose,
}: BucketContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Ref to hold latest onClose — avoids re-registering the document listener
  // every time the parent re-renders with a new callback reference.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const viewRef = useRef<ContextMenuView>('menu');

  const [view, setView] = useState<ContextMenuView>('menu');
  viewRef.current = view;
  const [adjusted, setAdjusted] = useState({ x: position.x, y: position.y + OFFSET_BELOW });

  // Pre-populate time inputs from bucket's elapsed time
  const [hours, setHours] = useState(Math.floor(bucket.elapsedSeconds / 3600));
  const [minutes, setMinutes] = useState(Math.floor((bucket.elapsedSeconds % 3600) / 60));

  // Pre-populate goal inputs from bucket's current totalMinutes (may already be overridden for today)
  const [goalHours, setGoalHours] = useState(Math.floor(bucket.totalMinutes / 60));
  const [goalMinutes, setGoalMinutes] = useState(bucket.totalMinutes % 60);

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
    // Close on page scroll while browsing the anchored action list. Mobile
    // keyboards can trigger a scroll when focusing the time inputs, so keep
    // the editor open once the user is in the "set time" view.
    const handleScroll = () => {
      if (viewRef.current === 'setTime' || viewRef.current === 'setGoal') return;
      onCloseRef.current();
    };

    // Delay listener registration so the opening pointer event doesn't
    // immediately close the menu.
    const id = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('scroll', handleScroll, true);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const handleSetTime = useCallback(() => {
    const h = Math.max(0, Math.min(23, hours));
    const m = Math.max(0, Math.min(59, minutes));
    onSetElapsedTime(h * 3600 + m * 60);
    onClose();
  }, [hours, minutes, onSetElapsedTime, onClose]);

  const handleSetGoal = useCallback(() => {
    const h = Math.max(0, Math.min(23, goalHours));
    const m = Math.max(0, Math.min(59, goalMinutes));
    const total = h * 60 + m;
    if (total > 0) {
      onSetDailyGoal(total);
    }
    onClose();
  }, [goalHours, goalMinutes, onSetDailyGoal, onClose]);

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
            Set Elapsed Time
          </button>
          <button
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => setView('setGoal')}
          >
            <Target className="size-4" />
            Set Today&#39;s Goal
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
          <button
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => {
              onDismissForToday();
              onClose();
            }}
          >
            <EyeOff className="size-4" />
            Dismiss for Today
          </button>
          <div className="my-1 border-t border-border" />
          <button
            role="menuitem"
            className={`${MENU_ITEM_CLASS} text-destructive`}
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 className="size-4" />
            Delete Bucket
          </button>
        </>
      )}

      {view === 'setTime' && (
        <TimeInputPanel
          title="Set Elapsed Time"
          hours={hours}
          minutes={minutes}
          onHoursChange={setHours}
          onMinutesChange={setMinutes}
          onBack={() => setView('menu')}
          onSubmit={handleSetTime}
        />
      )}

      {view === 'setGoal' && (
        <TimeInputPanel
          title="Set Today&#39;s Goal"
          hours={goalHours}
          minutes={goalMinutes}
          onHoursChange={setGoalHours}
          onMinutesChange={setGoalMinutes}
          onBack={() => setView('menu')}
          onSubmit={handleSetGoal}
          submitDisabled={goalHours <= 0 && goalMinutes <= 0}
        />
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
