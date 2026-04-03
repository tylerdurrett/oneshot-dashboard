import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';

import { cn } from '@repo/ui';
import { ConfirmationDialog } from '@repo/ui/components/confirmation-dialog';
import { Switch } from '@repo/ui/components/switch';

import { BucketSettingsDialog } from '@/app/(shell)/timers/_components/bucket-settings-dialog';
import { BUCKET_COLORS, type TimeBucket } from '@/app/(shell)/timers/_lib/timer-types';
import type { BucketResponse, CreateBucketInput, UpdateBucketInput } from '@/app/(shell)/timers/_lib/timer-api';
import {
  useBuckets,
  useCreateBucket,
  useUpdateBucket,
  useDeleteBucket,
} from '@/app/(shell)/timers/_hooks/use-timer-queries';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Format a daysOfWeek array into a readable string. */
function formatDaysOfWeek(days: number[]): string {
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';

  const sorted = [...days].sort((a, b) => a - b);

  // Check for common patterns
  const isWeekdays =
    sorted.length === 5 &&
    sorted[0] === 1 &&
    sorted[4] === 5 &&
    sorted.every((d, i) => d === i + 1);
  if (isWeekdays) return 'Weekdays';

  const isWeekends =
    sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6;
  if (isWeekends) return 'Weekends';

  return sorted.map((d) => SHORT_DAYS[d]).join(', ');
}

/** Format minutes into a compact duration label. */
function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const LONG_PRESS_MS = 800;
const LONG_PRESS_MOVE_THRESHOLD = 10;
const VIEWPORT_MARGIN = 8;

function nextAvailableColorIndex(buckets: BucketResponse[]): number {
  const used = new Set(buckets.map((b) => b.colorIndex));
  for (let i = 0; i < BUCKET_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

/** Compute weekly commitment for sorting: sum of all per-day targets. */
function weeklyCommitment(bucket: BucketResponse): number {
  if (bucket.weeklySchedule) {
    return Object.values(bucket.weeklySchedule).reduce((sum, m) => sum + m, 0);
  }
  return bucket.totalMinutes * bucket.daysOfWeek.length;
}

/** Adapt a BucketResponse to a TimeBucket for the settings dialog. */
function bucketResponseToTimeBucket(b: BucketResponse): TimeBucket {
  return {
    id: b.id,
    name: b.name,
    totalMinutes: b.totalMinutes,
    elapsedSeconds: 0,
    colorIndex: b.colorIndex,
    daysOfWeek: b.daysOfWeek,
    weeklySchedule: b.weeklySchedule,
    startedAt: null,
    goalReachedAt: null,
    dismissedAt: null,
    deactivatedAt: b.deactivatedAt,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: buckets, isLoading } = useBuckets();
  const createMutation = useCreateBucket();
  const updateMutation = useUpdateBucket();
  const deleteMutation = useDeleteBucket();

  const [editingBucket, setEditingBucket] = useState<TimeBucket | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Context menu state for delete action (right-click / long-press)
  const [contextMenu, setContextMenu] = useState<{
    bucketId: string;
    bucketName: string;
    x: number;
    y: number;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  // Long-press refs for mobile context menu
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef({ x: 0, y: 0 });
  const isLongPressRef = useRef(false);

  // Viewport-edge clamping for context menu
  useLayoutEffect(() => {
    if (!contextMenu) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = contextMenu.x;
    let y = contextMenu.y + 10;
    if (x + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    }
    if (x < VIEWPORT_MARGIN) x = VIEWPORT_MARGIN;
    if (y + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = contextMenu.y - rect.height - 10;
    }
    if (y < VIEWPORT_MARGIN) y = VIEWPORT_MARGIN;
    setMenuPos((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
  }, [contextMenu]);

  // Click-outside and Escape dismissal for context menu
  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const handleScroll = () => setContextMenu(null);
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
  }, [contextMenu]);

  const openContextMenu = useCallback((bucketId: string, bucketName: string, x: number, y: number) => {
    setContextMenu({ bucketId, bucketName, x, y });
    setMenuPos({ x, y: y + 10 });
  }, []);

  const handleRowContextMenu = useCallback((e: React.MouseEvent, bucket: BucketResponse) => {
    e.preventDefault();
    openContextMenu(bucket.id, bucket.name, e.clientX, e.clientY);
  }, [openContextMenu]);

  const handleRowPointerDown = useCallback((e: React.PointerEvent, bucket: BucketResponse) => {
    if (e.pointerType === 'mouse') return;
    isLongPressRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      longPressTimerRef.current = null;
      openContextMenu(bucket.id, bucket.name, e.clientX, e.clientY);
    }, LONG_PRESS_MS);
  }, [openContextMenu]);

  const handleRowPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !longPressTimerRef.current) return;
    const dx = e.clientX - pressStartRef.current.x;
    const dy = e.clientY - pressStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleRowPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Sort: active first (by weekly commitment desc), then deactivated (by weekly commitment desc).
  // Tie-breaker: alphabetical by name.
  const sortedBuckets = useMemo(() => {
    if (!buckets) return [];
    return [...buckets].sort((a, b) => {
      const aDeactivated = a.deactivatedAt !== null;
      const bDeactivated = b.deactivatedAt !== null;
      if (aDeactivated !== bDeactivated) return aDeactivated ? 1 : -1;
      const commitDiff = weeklyCommitment(b) - weeklyCommitment(a);
      if (commitDiff !== 0) return commitDiff;
      return a.name.localeCompare(b.name);
    });
  }, [buckets]);

  const handleRowClick = (bucket: BucketResponse) => {
    setEditingBucket(bucketResponseToTimeBucket(bucket));
    setDialogOpen(true);
  };

  const handleToggleActive = (bucket: BucketResponse) => {
    const updates: UpdateBucketInput = {
      deactivatedAt: bucket.deactivatedAt !== null ? null : Date.now(),
    };
    updateMutation.mutate({ id: bucket.id, updates });
  };

  const handleSave = (id: string, updates: Partial<TimeBucket>) => {
    const { name, totalMinutes, colorIndex, daysOfWeek, weeklySchedule } = updates;
    const serverUpdates: UpdateBucketInput = {
      ...(name !== undefined && { name }),
      ...(totalMinutes !== undefined && { totalMinutes }),
      ...(colorIndex !== undefined && { colorIndex }),
      ...(daysOfWeek !== undefined && { daysOfWeek }),
      ...(weeklySchedule != null && { weeklySchedule }),
    };
    updateMutation.mutate({ id, updates: serverUpdates });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleAddBucket = async () => {
    const input: CreateBucketInput = {
      name: 'New Bucket',
      totalMinutes: 60,
      colorIndex: nextAvailableColorIndex(buckets ?? []),
      daysOfWeek: ALL_DAYS,
    };
    const newBucket = await createMutation.mutateAsync(input);
    setEditingBucket(bucketResponseToTimeBucket(newBucket));
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (!buckets || buckets.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Buckets</h1>
            <button
              type="button"
              aria-label="Add bucket"
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={handleAddBucket}
            >
              <Plus className="size-5" />
            </button>
          </div>
          <p className="text-muted-foreground text-center text-lg">No buckets yet</p>
        </div>
        <BucketSettingsDialog
          bucket={editingBucket}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSave={handleSave}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Buckets</h1>
          <button
            type="button"
            aria-label="Add bucket"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={handleAddBucket}
          >
            <Plus className="size-5" />
          </button>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {sortedBuckets.map((bucket) => {
            const isDeactivated = bucket.deactivatedAt !== null;
            const color = BUCKET_COLORS[bucket.colorIndex] ?? BUCKET_COLORS[0]!;
            const weeklyTotal = weeklyCommitment(bucket);
            const subtitle = `${formatDuration(weeklyTotal)}/week · ${formatDaysOfWeek(bucket.daysOfWeek)}`;

            return (
              <button
                key={bucket.id}
                type="button"
                className={cn(
                  'flex cursor-pointer touch-none select-none items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/50',
                  isDeactivated && 'opacity-50',
                )}
                style={{ WebkitTouchCallout: 'none' }}
                onContextMenu={(e) => handleRowContextMenu(e, bucket)}
                onPointerDown={(e) => handleRowPointerDown(e, bucket)}
                onPointerMove={handleRowPointerMove}
                onPointerUp={handleRowPointerUp}
                onPointerCancel={handleRowPointerUp}
                onClick={() => {
                  // Skip click if this was a long-press gesture
                  if (isLongPressRef.current) {
                    isLongPressRef.current = false;
                    return;
                  }
                  handleRowClick(bucket);
                }}
              >
                <span
                  className="size-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color.vibrant }}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{bucket.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {subtitle}
                  </p>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Switch
                    checked={!isDeactivated}
                    onCheckedChange={() => handleToggleActive(bucket)}
                    aria-label={
                      isDeactivated
                        ? `Reactivate ${bucket.name}`
                        : `Deactivate ${bucket.name}`
                    }
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <BucketSettingsDialog
        bucket={editingBucket}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />

      {contextMenu && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-xl"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
            onClick={() => {
              setBucketToDelete({ id: contextMenu.bucketId, name: contextMenu.bucketName });
              setConfirmDeleteOpen(true);
              setContextMenu(null);
            }}
          >
            <Trash2 className="size-4" />
            Delete Bucket
          </button>
        </div>,
        document.body,
      )}

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete bucket?"
        description={`This will permanently remove "${bucketToDelete?.name ?? ''}". This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (bucketToDelete) handleDelete(bucketToDelete.id);
          setConfirmDeleteOpen(false);
          setBucketToDelete(null);
        }}
      />
    </div>
  );
}
