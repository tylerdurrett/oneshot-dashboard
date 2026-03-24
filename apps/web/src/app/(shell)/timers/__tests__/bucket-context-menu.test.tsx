import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TimeBucket } from '../_lib/timer-types';
import { BucketContextMenu } from '../_components/bucket-context-menu';
import { TimerBucket } from '../_components/timer-bucket';

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
    ...overrides,
  };
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
  it('renders three menu items', () => {
    render(
      <BucketContextMenu
        bucket={makeBucket()}
        position={{ x: 100, y: 100 }}
        onOpenSettings={vi.fn()}
        onSetRemainingTime={vi.fn()}
        onResetForToday={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Bucket Settings')).toBeTruthy();
    expect(screen.getByText('Set Remaining Time')).toBeTruthy();
    expect(screen.getByText('Reset for Today')).toBeTruthy();
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
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Reset for Today'));
    expect(onResetForToday).toHaveBeenCalledOnce();
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
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));

    const [hoursInput, minutesInput] = screen.getAllByRole('spinbutton');
    expect((hoursInput as HTMLInputElement).value).toBe('0');
    expect((minutesInput as HTMLInputElement).value).toBe('45');
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
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Set Remaining Time'));
    expect(screen.queryByText('Bucket Settings')).toBeNull();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Bucket Settings')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TimerBucket — context menu integration
// ---------------------------------------------------------------------------

describe('TimerBucket context menu integration', () => {
  it('opens context menu on right-click', () => {
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isCompleted={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));

    expect(screen.getByText('Bucket Settings')).toBeTruthy();
    expect(screen.getByText('Set Remaining Time')).toBeTruthy();
    expect(screen.getByText('Reset for Today')).toBeTruthy();
  });

  it('does not toggle timer on right-click', () => {
    const onToggle = vi.fn();
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isCompleted={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={onToggle}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
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
        isCompleted={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
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
        isCompleted={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={vi.fn()}
        onOpenSettings={vi.fn()}
        onResetForToday={onResetForToday}
        onSetRemainingTime={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Reset for Today'));
    fireEvent.click(screen.getByText('Reset'));

    expect(onResetForToday).toHaveBeenCalledOnce();
  });

  it('toggles timer on keyboard Enter', () => {
    const onToggle = vi.fn();
    render(
      <TimerBucket
        bucket={makeBucket()}
        isActive={false}
        isCompleted={false}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 150 }}
        onToggle={onToggle}
        onOpenSettings={vi.fn()}
        onResetForToday={vi.fn()}
        onSetRemainingTime={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
