import { useMemo, useState } from 'react';

import { cn } from '@repo/ui';
import { Switch } from '@repo/ui/components/switch';

import { BucketSettingsDialog } from '@/app/(shell)/timers/_components/bucket-settings-dialog';
import { BUCKET_COLORS, type TimeBucket } from '@/app/(shell)/timers/_lib/timer-types';
import type { BucketResponse, UpdateBucketInput } from '@/app/(shell)/timers/_lib/timer-api';
import {
  useBuckets,
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
  const updateMutation = useUpdateBucket();
  const deleteMutation = useDeleteBucket();

  const [editingBucket, setEditingBucket] = useState<TimeBucket | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (!buckets || buckets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
        <p className="text-lg">No buckets yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <h1 className="mb-4 text-lg font-semibold">Buckets</h1>

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
                  'flex items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/50',
                  isDeactivated && 'opacity-50',
                )}
                onClick={() => handleRowClick(bucket)}
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
        onDelete={handleDelete}
      />
    </div>
  );
}
