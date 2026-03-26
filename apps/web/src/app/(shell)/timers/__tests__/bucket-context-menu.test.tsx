import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TimeBucket } from '../_lib/timer-types';
import { BucketContextMenu } from '../_components/bucket-context-menu';
import {
  getTimerBucketSizeTier,
  TimerBucket,
} from '../_components/timer-bucket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBucket(overrides: Partial<TimeBucket> = {}): TimeBucket {
  return {
    id: 'test-bucket',
    name: 'Test Bucket',
    totalMinutes: 60,
    elapsedSeconds: 900, // 15 minutes elapsed → 45 minutes remaining
    colorIndex: 0,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startedAt: null,
    goalReachedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

async function waitForMenuListeners() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// BucketContextMenu — menu view
// ---------------------------------------------------------------------------

describe('BucketContextMenu', () => {
  it('renders four menu items', () => {
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Bucket Settings')).toBeTruthy();
    expect(screen.getByText('Set Remaining Time')).toBeTruthy();
    expect(screen.getByText('Reset for Today')).toBeTruthy();
    expect(screen.getByText('Dismiss for Today')).toBeTruthy();
  });

  it('calls onOpenSettings and onClose when "Bucket Settings" is clicked', () => {
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={onOpenSettings}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Bucket Settings'));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onResetForToday and onClose when "Reset for Today" is clicked', () => {
    const onResetForToday = vi.fn();
    const onClose = vi.fn();
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={onResetForToday}
        onDismissForToday={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Reset for Today'));
    expect(onResetForToday).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onDismissForToday and onClose when "Dismiss for Today" is clicked', () => {
    const onDismissForToday = vi.fn();
    const onClose = vi.fn();
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={onDismissForToday}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Dismiss for Today'));
    expect(onDismissForToday).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('switches to setTime view when "Set Remaining Time" is clicked', () => {
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));

    expect(screen.queryByText('Bucket Settings')).toBeNull();
    expect(screen.getByText('Hours')).toBeTruthy();
    expect(screen.getByText('Minutes')).toBeTruthy();
  });

  it('pre-populates time inputs from bucket remaining time', () => {
    // 60 min total, 900s elapsed → 45 min remaining → 0 hours, 45 minutes
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));

    const [hoursInput, minutesInput] = screen.getAllByRole('spinbutton');
    expect((hoursInput as HTMLInputElement).value).toBe('0');
    expect((minutesInput as HTMLInputElement).value).toBe('45');
  });

  it('keeps remaining-time inputs at iPhone-safe font size on mobile', () => {
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    const hoursInput = inputs[0]!;
    const minutesInput = inputs[1]!;
    expect(hoursInput.className).toContain('text-base');
    expect(minutesInput.className).toContain('text-base');
  });

  it('calls onSetRemainingTime with correct seconds and onClose when "Set" is clicked', () => {
    const onSetRemainingTime = vi.fn();
    const onClose = vi.fn();
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={onSetRemainingTime}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));

    const [hoursInput, minutesInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(hoursInput!, { target: { value: '1' } });
    fireEvent.change(minutesInput!, { target: { value: '30' } });
    fireEvent.click(screen.getByText('Set'));

    // 1h 30m = 5400 seconds
    expect(onSetRemainingTime).toHaveBeenCalledWith(5400);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Back" button returns to menu view', () => {
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));
    expect(screen.queryByText('Bucket Settings')).toBeNull();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Bucket Settings')).toBeTruthy();
  });

  it('keeps the set-time editor open when mobile focus scrolling fires', async () => {
    const onClose = vi.fn();
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));
    await waitForMenuListeners();
    fireEvent.scroll(document);

    expect(screen.getByText('Hours')).toBeTruthy();
    expect(screen.getByText('Minutes')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes the anchored menu on page scroll before editing time', async () => {
    const onClose = vi.fn();
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onDismissForToday={vi.fn()}
        onClose={onClose}
      />,
    );

    await waitForMenuListeners();
    fireEvent.scroll(document);

    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TimerBucket — context menu integration
// ---------------------------------------------------------------------------

describe('TimerBucket context menu integration', () => {
  it('classifies cramped rectangles as tiny buckets', () => {
    expect(getTimerBucketSizeTier(160, 150)).toBe('tiny');
    expect(getTimerBucketSizeTier(220, 96)).toBe('tiny');
  });

  it('classifies medium rectangles as small buckets', () => {
    expect(getTimerBucketSizeTier(220, 130)).toBe('small');
  });

  it('classifies roomy rectangles as large buckets', () => {
    expect(getTimerBucketSizeTier(280, 180)).toBe('large');
  });

  it('opens context menu on right-click', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));

    expect(screen.getByText('Bucket Settings')).toBeTruthy();
    expect(screen.getByText('Set Remaining Time')).toBeTruthy();
    expect(screen.getByText('Reset for Today')).toBeTruthy();
    expect(screen.getByText('Dismiss for Today')).toBeTruthy();
  });

  it('does not toggle timer on right-click', () => {
    const onToggle = vi.fn();
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={onToggle}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows confirmation dialog when "Reset for Today" is selected from context menu', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Reset for Today'));

    expect(screen.getByText('Reset bucket?')).toBeTruthy();
  });

  it('calls onResetForToday when reset is confirmed', () => {
    const onResetForToday = vi.fn();
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={onResetForToday}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Reset for Today'));
    fireEvent.click(screen.getByText('Reset'));

    expect(onResetForToday).toHaveBeenCalledOnce();
  });

  it('shows confirmation dialog when "Dismiss for Today" is selected from context menu', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Dismiss for Today'));

    expect(screen.getByText('Dismiss bucket?')).toBeTruthy();
  });

  it('calls onDismissForToday when dismiss is confirmed', () => {
    const onDismissForToday = vi.fn();
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={onDismissForToday}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Dismiss for Today'));
    fireEvent.click(screen.getByText('Dismiss'));

    expect(onDismissForToday).toHaveBeenCalledOnce();
  });

  it('toggles timer on keyboard Enter', () => {
    const onToggle = vi.fn();
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={onToggle}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('keeps timer bucket text non-selectable', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    expect(screen.getByRole('button').classList.contains('select-none')).toBe(true);
  });

  it('uses an inset glow for the active state instead of an outer ring', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive
        isGoalReached={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    const bucketButton = screen.getByRole('button');
    const activeOverlays = Array.from(
      bucketButton.querySelectorAll('.pointer-events-none'),
    ) as HTMLElement[];
    const activeGlow = activeOverlays[0] ?? null;

    expect(bucketButton.className).not.toContain('ring-2');
    expect(activeOverlays).toHaveLength(1);
    expect(activeGlow).not.toBeNull();
    expect(activeGlow?.style.boxShadow).toContain('inset');
    expect(activeGlow?.style.background).toContain('radial-gradient');
  });

  it('uses compact typography for tiny buckets', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        sizeTier="tiny"
        style={{ position: 'absolute', left: 0, top: 0, width: 160, height: 96 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    expect(screen.getByText('Test Bucket').className).toContain('truncate');
    expect(screen.getByText('Test Bucket').className).toContain('text-xs');
    expect(screen.getByText('45:00').className).toContain('text-base');
  });

  it('keeps large typography for roomy buckets', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isGoalReached={false}
        sizeTier="large"
        style={{ position: 'absolute', left: 0, top: 0, width: 280, height: 180 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onDismissForToday={vi.fn()}
      />,
    );

    expect(screen.getByText('Test Bucket').className).toContain('text-lg');
    expect(screen.getByText('45:00').className).toContain('text-2xl');
  });
});
