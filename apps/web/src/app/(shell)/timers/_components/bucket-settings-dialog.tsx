import { useEffect, useState } from 'react';

import { Button, cn, Input } from '@repo/ui';
import { ConfirmationDialog } from '@repo/ui/components/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';

import { BUCKET_COLORS, type TimeBucket } from '../_lib/timer-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Day-of-week metadata (Sunday = index 0). Short + full names kept together
 *  so they can't drift out of sync. */
const DAYS = [
  { short: 'S', label: 'Sunday' },
  { short: 'M', label: 'Monday' },
  { short: 'T', label: 'Tuesday' },
  { short: 'W', label: 'Wednesday' },
  { short: 'T', label: 'Thursday' },
  { short: 'F', label: 'Friday' },
  { short: 'S', label: 'Saturday' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BucketSettingsDialogProps {
  bucket: TimeBucket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<TimeBucket>) => void;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BucketSettingsDialog({
  bucket,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: BucketSettingsDialogProps) {
  // Local form state
  const [name, setName] = useState('');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Re-initialize form state when the dialog opens with a bucket
  useEffect(() => {
    if (open && bucket) {
      setName(bucket.name);
      setHours(Math.floor(bucket.totalMinutes / 60));
      setMinutes(bucket.totalMinutes % 60);
      setColorIndex(bucket.colorIndex);
      setDaysOfWeek([...bucket.daysOfWeek]);
    }
  }, [open, bucket]);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const totalMinutesValue = hours * 60 + minutes;
  const canSave =
    name.trim().length > 0 && daysOfWeek.length > 0 && totalMinutesValue > 0;

  const handleSave = () => {
    if (!bucket || !canSave) return;

    onSave(bucket.id, {
      name: name.trim(),
      totalMinutes: totalMinutesValue,
      colorIndex,
      daysOfWeek,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!bucket) return;
    onDelete(bucket.id);
    setConfirmDeleteOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bucket Settings</DialogTitle>
            <DialogDescription>
              Edit the name, duration, color, and active days for this bucket.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bucket-name"
                className="text-sm font-medium"
              >
                Name
              </label>
              <Input
                id="bucket-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bucket name"
                autoFocus
              />
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Duration</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={hours}
                    onChange={(e) =>
                      setHours(
                        Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                      )
                    }
                    className="w-18"
                  />
                  <span className="text-muted-foreground text-sm">hrs</span>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(
                        Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                      )
                    }
                    className="w-18"
                  />
                  <span className="text-muted-foreground text-sm">min</span>
                </div>
              </div>
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Color</span>
              <div className="flex flex-wrap gap-2">
                {BUCKET_COLORS.map((color, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Color ${i + 1}`}
                    aria-pressed={colorIndex === i}
                    className="size-8 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      backgroundColor: color.vibrant,
                      boxShadow:
                        colorIndex === i
                          ? '0 0 0 2px var(--background), 0 0 0 4px currentColor'
                          : undefined,
                    }}
                    onClick={() => setColorIndex(i)}
                  />
                ))}
              </div>
            </div>

            {/* Active Days */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Active Days</span>
              <div className="flex gap-1.5">
                {DAYS.map((day, i) => {
                  const isSelected = daysOfWeek.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={day.label}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-md text-sm font-medium transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                      onClick={() => toggleDay(i)}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
              {daysOfWeek.length === 0 && (
                <p className="text-destructive text-xs">
                  At least one day must be selected.
                </p>
              )}
            </div>

            {totalMinutesValue === 0 && (
              <p className="text-destructive text-xs">
                Duration must be at least 1 minute.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              size="sm"
              className="mr-auto"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete Bucket
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete bucket?"
        description={`This will permanently remove "${bucket?.name ?? ''}". This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
