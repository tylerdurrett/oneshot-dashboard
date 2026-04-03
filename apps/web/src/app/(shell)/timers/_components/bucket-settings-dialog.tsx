import { useEffect, useRef, useState } from 'react';

import { Button, cn, Input } from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';

import { useIsMobile } from '../../../../hooks/use-is-mobile';
import { useVisualViewportOffset } from '../../../../hooks/use-visual-viewport-offset';
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
// Helpers
// ---------------------------------------------------------------------------

type ScheduleMode = 'uniform' | 'custom';

interface PerDayEntry {
  active: boolean;
  hours: number;
  minutes: number;
}

/** Check if all active days in a schedule have the same value. */
function isUniformSchedule(schedule: Record<string, number>): boolean {
  const values = Object.values(schedule);
  if (values.length === 0) return true;
  return values.every((v) => v === values[0]);
}

/** Build a weeklySchedule from per-day form state. Only includes active days. */
function buildSchedule(perDay: Record<string, PerDayEntry>): Record<string, number> {
  const schedule: Record<string, number> = {};
  for (const [day, entry] of Object.entries(perDay)) {
    if (entry.active) {
      schedule[day] = entry.hours * 60 + entry.minutes;
    }
  }
  return schedule;
}

/** Initialize per-day form state from a bucket's data. */
function initPerDay(bucket: TimeBucket): Record<string, PerDayEntry> {
  const result: Record<string, PerDayEntry> = {};
  for (let i = 0; i < 7; i++) {
    const key = String(i);
    const isActive = bucket.daysOfWeek.includes(i);
    const dayMinutes = bucket.weeklySchedule?.[key] ?? bucket.totalMinutes;
    result[key] = {
      active: isActive,
      hours: Math.floor(dayMinutes / 60),
      minutes: dayMinutes % 60,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BucketSettingsDialogProps {
  bucket: TimeBucket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<TimeBucket>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BucketSettingsDialog({
  bucket,
  open,
  onOpenChange,
  onSave,
}: BucketSettingsDialogProps) {
  // Keep dialog visible when the iOS on-screen keyboard is open.
  const keyboardStyle = useVisualViewportOffset();
  const isMobile = useIsMobile();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Local form state
  const [name, setName] = useState('');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('uniform');
  const [perDay, setPerDay] = useState<Record<string, PerDayEntry>>({});

  // Re-initialize form state when the dialog opens with a bucket
  useEffect(() => {
    if (open && bucket) {
      setName(bucket.name);
      setHours(Math.floor(bucket.totalMinutes / 60));
      setMinutes(bucket.totalMinutes % 60);
      setColorIndex(bucket.colorIndex);
      setDaysOfWeek([...bucket.daysOfWeek]);

      const pd = initPerDay(bucket);
      setPerDay(pd);

      // Detect mode: if schedule exists and has different values, use custom mode
      if (bucket.weeklySchedule && !isUniformSchedule(bucket.weeklySchedule)) {
        setScheduleMode('custom');
      } else {
        setScheduleMode('uniform');
      }
    }
  }, [open, bucket]);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleDayCustom = (day: number) => {
    setPerDay((prev) => ({
      ...prev,
      [String(day)]: {
        ...prev[String(day)]!,
        active: !prev[String(day)]!.active,
      },
    }));
  };

  const updateDayHours = (day: number, value: number) => {
    setPerDay((prev) => ({
      ...prev,
      [String(day)]: { ...prev[String(day)]!, hours: Math.max(0, Math.min(23, value)) },
    }));
  };

  const updateDayMinutes = (day: number, value: number) => {
    setPerDay((prev) => ({
      ...prev,
      [String(day)]: { ...prev[String(day)]!, minutes: Math.max(0, Math.min(59, value)) },
    }));
  };

  const applyToAllDays = (sourceDay: number) => {
    const source = perDay[String(sourceDay)];
    if (!source) return;
    setPerDay((prev) => {
      const next = { ...prev };
      for (const [key, entry] of Object.entries(next)) {
        if (entry.active) {
          next[key] = { ...entry, hours: source.hours, minutes: source.minutes };
        }
      }
      return next;
    });
  };

  const handleModeSwitch = (newMode: ScheduleMode) => {
    if (newMode === scheduleMode) return;

    if (newMode === 'custom') {
      // Uniform → Custom: populate all active days with the uniform value
      const uniformH = hours;
      const uniformM = minutes;
      setPerDay((prev) => {
        const next: Record<string, PerDayEntry> = {};
        for (let i = 0; i < 7; i++) {
          const key = String(i);
          const isActive = daysOfWeek.includes(i);
          next[key] = {
            active: isActive,
            hours: isActive ? uniformH : (prev[key]?.hours ?? uniformH),
            minutes: isActive ? uniformM : (prev[key]?.minutes ?? uniformM),
          };
        }
        return next;
      });
    } else {
      // Custom → Uniform: take the max value across active days, keep active days
      const schedule = buildSchedule(perDay);
      const activeDays = Object.keys(schedule).map(Number).sort((a, b) => a - b);
      const maxMinutes = Math.max(...Object.values(schedule), 0);
      setDaysOfWeek(activeDays);
      setHours(Math.floor(maxMinutes / 60));
      setMinutes(maxMinutes % 60);
    }

    setScheduleMode(newMode);
  };

  // Compute canSave based on mode
  const uniformTotalMinutes = hours * 60 + minutes;
  const customSchedule = buildSchedule(perDay);
  const customActiveDays = Object.keys(customSchedule).map(Number);
  const customHasValidDuration = Object.values(customSchedule).some((v) => v > 0);

  const canSave =
    name.trim().length > 0 &&
    (scheduleMode === 'uniform'
      ? daysOfWeek.length > 0 && uniformTotalMinutes > 0
      : customActiveDays.length > 0 && customHasValidDuration);

  const handleSave = () => {
    if (!bucket || !canSave) return;

    if (scheduleMode === 'uniform') {
      // Build uniform schedule from the single duration + active days
      const schedule: Record<string, number> = {};
      for (const d of daysOfWeek) schedule[String(d)] = uniformTotalMinutes;

      onSave(bucket.id, {
        name: name.trim(),
        totalMinutes: uniformTotalMinutes,
        colorIndex,
        daysOfWeek,
        weeklySchedule: schedule,
      });
    } else {
      // Custom mode: schedule is already built
      onSave(bucket.id, {
        name: name.trim(),
        colorIndex,
        weeklySchedule: customSchedule,
      });
    }
    onOpenChange(false);
  };

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby={undefined}
          style={keyboardStyle}
          onOpenAutoFocus={(e) => {
            // Delay focus so the dialog renders before the keyboard triggers a
            // viewport resize — avoids the first-open positioning race on iOS.
            e.preventDefault();
            setTimeout(() => nameInputRef.current?.focus(), 80);
          }}
        >
          <DialogHeader>
            <DialogTitle>Bucket Settings</DialogTitle>
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
                ref={nameInputRef}
                id="bucket-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bucket name"
              />
            </div>

            {/* Color — hidden on mobile to save space */}
            {!isMobile && (
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
            )}

            {/* Schedule Mode Toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Schedule</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    scheduleMode === 'uniform'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                  onClick={() => handleModeSwitch('uniform')}
                >
                  Same every day
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    scheduleMode === 'custom'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                  onClick={() => handleModeSwitch('custom')}
                >
                  Custom per day
                </button>
              </div>
            </div>

            {scheduleMode === 'uniform' ? (
              <>
                {/* Duration (uniform mode) */}
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

                {/* Active Days (uniform mode) */}
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

                {uniformTotalMinutes === 0 && (
                  <p className="text-destructive text-xs">
                    Duration must be at least 1 minute.
                  </p>
                )}
              </>
            ) : (
              /* Custom per-day mode */
              <div className="flex flex-col gap-2">
                {DAYS.map((day, i) => {
                  const entry = perDay[String(i)];
                  if (!entry) return null;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={day.label}
                        aria-pressed={entry.active}
                        className={cn(
                          'flex w-10 shrink-0 items-center justify-center rounded-md py-1 text-xs font-medium transition-colors',
                          entry.active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        )}
                        onClick={() => toggleDayCustom(i)}
                      >
                        {day.short}
                      </button>
                      {entry.active ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={23}
                            value={entry.hours}
                            onChange={(e) =>
                              updateDayHours(i, Number(e.target.value) || 0)
                            }
                            className="w-14"
                          />
                          <span className="text-muted-foreground text-xs">h</span>
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            value={entry.minutes}
                            onChange={(e) =>
                              updateDayMinutes(i, Number(e.target.value) || 0)
                            }
                            className="w-14"
                          />
                          <span className="text-muted-foreground text-xs">m</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground ml-1 text-xs underline"
                            onClick={() => applyToAllDays(i)}
                          >
                            Apply to all
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Off</span>
                      )}
                    </div>
                  );
                })}
                {customActiveDays.length === 0 && (
                  <p className="text-destructive text-xs">
                    At least one day must be active.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
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
  );
}
