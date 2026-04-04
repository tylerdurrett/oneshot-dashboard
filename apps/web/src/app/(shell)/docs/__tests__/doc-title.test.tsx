import { cleanup, fireEvent, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocTitle } from '../_components/doc-title';

describe('DocTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the title value', () => {
    const { getByDisplayValue } = render(
      <DocTitle title="My Doc" onSave={vi.fn()} />,
    );
    expect(getByDisplayValue('My Doc')).toBeTruthy();
  });

  it('calls onSave after debounce delay', () => {
    const onSave = vi.fn();
    const { getByDisplayValue } = render(
      <DocTitle title="Original" onSave={onSave} />,
    );

    const input = getByDisplayValue('Original');
    fireEvent.change(input, { target: { value: 'Updated' } });

    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Updated');
  });

  it('flushes pending save on unmount', () => {
    const onSave = vi.fn();
    const { getByDisplayValue, unmount } = render(
      <DocTitle title="Original" onSave={onSave} />,
    );

    const input = getByDisplayValue('Original');
    fireEvent.change(input, { target: { value: 'Changed' } });

    // Unmount before debounce fires — should flush immediately
    unmount();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Changed');
  });

  it('does not call onSave on unmount when there are no pending changes', () => {
    const onSave = vi.fn();
    const { unmount } = render(
      <DocTitle title="Stable" onSave={onSave} />,
    );

    unmount();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('blurs input on Enter key', () => {
    const onSave = vi.fn();
    const { getByDisplayValue } = render(
      <DocTitle title="Test" onSave={onSave} />,
    );

    const input = getByDisplayValue('Test') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.activeElement).not.toBe(input);
  });

  it('resets debounce timer on rapid changes', () => {
    const onSave = vi.fn();
    const { getByDisplayValue } = render(
      <DocTitle title="Start" onSave={onSave} />,
    );

    const input = getByDisplayValue('Start');

    fireEvent.change(input, { target: { value: 'A' } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.change(input, { target: { value: 'AB' } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Only 2000ms total since first change, but 1000ms since last — no save yet
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // 1500ms since last change — fires now
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('AB');
  });

  it('syncs value when title prop changes (e.g. switching docs)', () => {
    const onSave = vi.fn();
    const { getByDisplayValue, rerender } = render(
      <DocTitle title="Doc A" onSave={onSave} />,
    );

    expect(getByDisplayValue('Doc A')).toBeTruthy();

    rerender(<DocTitle title="Doc B" onSave={onSave} />);

    expect(getByDisplayValue('Doc B')).toBeTruthy();
  });
});
