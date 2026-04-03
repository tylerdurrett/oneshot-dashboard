import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { BucketResponse } from '@/app/(shell)/timers/_lib/timer-api';

// ---------------------------------------------------------------------------
// Mock the hooks that the settings page uses
// ---------------------------------------------------------------------------

const mockUseBuckets = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@/app/(shell)/timers/_hooks/use-timer-queries', () => ({
  useBuckets: () => mockUseBuckets(),
  useCreateBucket: () => ({ mutateAsync: mockCreateMutateAsync }),
  useUpdateBucket: () => ({ mutate: mockUpdateMutate }),
  useDeleteBucket: () => ({ mutate: mockDeleteMutate }),
}));

// Mock the BucketSettingsDialog to a simple stub so we can test it opens
vi.mock('@/app/(shell)/timers/_components/bucket-settings-dialog', () => ({
  BucketSettingsDialog: ({
    bucket,
    open,
  }: {
    bucket: { name: string } | null;
    open: boolean;
  }) =>
    open
      ? React.createElement('div', { 'data-testid': 'settings-dialog' }, bucket?.name)
      : null,
}));

import SettingsPage from '../page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBucket(overrides: Partial<BucketResponse> = {}): BucketResponse {
  return {
    id: 'b1',
    name: 'Test',
    totalMinutes: 60,
    colorIndex: 0,
    daysOfWeek: [1, 2, 3, 4, 5],
    weeklySchedule: null,
    sortOrder: 0,
    deactivatedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(SettingsPage),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('renders loading state', () => {
    mockUseBuckets.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders empty state when no buckets', () => {
    mockUseBuckets.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByText('No buckets yet')).toBeDefined();
  });

  it('renders bucket list with names', () => {
    mockUseBuckets.mockReturnValue({
      data: [
        makeBucket({ id: 'b1', name: 'Work' }),
        makeBucket({ id: 'b2', name: 'Exercise' }),
      ],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('Work')).toBeDefined();
    expect(screen.getByText('Exercise')).toBeDefined();
  });

  it('sorts buckets by weekly commitment descending', () => {
    mockUseBuckets.mockReturnValue({
      data: [
        // 60 min * 2 days = 120 weekly minutes (lower)
        makeBucket({ id: 'b1', name: 'Small', totalMinutes: 60, daysOfWeek: [1, 2] }),
        // 120 min * 5 days = 600 weekly minutes (higher)
        makeBucket({ id: 'b2', name: 'Big', totalMinutes: 120, daysOfWeek: [1, 2, 3, 4, 5] }),
      ],
      isLoading: false,
    });
    renderPage();

    const buttons = screen.getAllByRole('button');
    const names = buttons.map((el) => {
      const nameEl = el.querySelector('p');
      return nameEl?.textContent;
    }).filter(Boolean);

    expect(names[0]).toBe('Big');
    expect(names[1]).toBe('Small');
  });

  it('sorts deactivated buckets last', () => {
    mockUseBuckets.mockReturnValue({
      data: [
        makeBucket({ id: 'b1', name: 'Deactivated', totalMinutes: 180, daysOfWeek: [1, 2, 3, 4, 5], deactivatedAt: 1000 }),
        makeBucket({ id: 'b2', name: 'Active', totalMinutes: 60, daysOfWeek: [1] }),
      ],
      isLoading: false,
    });
    renderPage();

    const buttons = screen.getAllByRole('button');
    const names = buttons.map((el) => {
      const nameEl = el.querySelector('p');
      return nameEl?.textContent;
    }).filter(Boolean);

    // Despite higher weekly commitment, deactivated comes last
    expect(names[0]).toBe('Active');
    expect(names[1]).toBe('Deactivated');
  });

  it('opens settings dialog when clicking a bucket row', () => {
    mockUseBuckets.mockReturnValue({
      data: [makeBucket({ id: 'b1', name: 'Work' })],
      isLoading: false,
    });
    renderPage();

    // Dialog should not be open initially
    expect(screen.queryByTestId('settings-dialog')).toBeNull();

    // Click the bucket row
    fireEvent.click(screen.getByText('Work'));

    // Dialog should open with the bucket name
    expect(screen.getByTestId('settings-dialog').textContent).toBe('Work');
  });

  it('calls updateBucket with deactivatedAt when toggling switch off', () => {
    mockUseBuckets.mockReturnValue({
      data: [makeBucket({ id: 'b1', name: 'Work' })],
      isLoading: false,
    });
    renderPage();

    const toggle = screen.getByRole('switch', { name: /deactivate work/i });
    expect(toggle.getAttribute('data-state')).toBe('checked');

    fireEvent.click(toggle);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'b1',
      updates: { deactivatedAt: expect.any(Number) },
    });
  });

  it('calls updateBucket with null deactivatedAt when toggling switch on', () => {
    mockUseBuckets.mockReturnValue({
      data: [makeBucket({ id: 'b1', name: 'Work', deactivatedAt: 1000 })],
      isLoading: false,
    });
    renderPage();

    const toggle = screen.getByRole('switch', { name: /reactivate work/i });
    expect(toggle.getAttribute('data-state')).toBe('unchecked');

    fireEvent.click(toggle);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'b1',
      updates: { deactivatedAt: null },
    });
  });

  it('shows schedule summary in subtitle', () => {
    mockUseBuckets.mockReturnValue({
      data: [
        makeBucket({ id: 'b1', name: 'Work', totalMinutes: 180, daysOfWeek: [1, 2, 3, 4, 5] }),
      ],
      isLoading: false,
    });
    renderPage();
    // 180 min * 5 days = 900 min = 15h/week
    expect(screen.getByText('15h/week · Weekdays')).toBeDefined();
  });

  it('shows "Every day" for all-week buckets', () => {
    mockUseBuckets.mockReturnValue({
      data: [
        makeBucket({ id: 'b1', name: 'Meditate', totalMinutes: 30, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      ],
      isLoading: false,
    });
    renderPage();
    // 30 min * 7 days = 210 min = 3h 30m/week
    expect(screen.getByText('3h 30m/week · Every day')).toBeDefined();
  });

  it('renders add bucket button', () => {
    mockUseBuckets.mockReturnValue({
      data: [makeBucket({ id: 'b1', name: 'Work' })],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByRole('button', { name: 'Add bucket' })).toBeDefined();
  });

  it('renders add bucket button in empty state', () => {
    mockUseBuckets.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByRole('button', { name: 'Add bucket' })).toBeDefined();
  });

  it('creates a bucket and opens dialog when clicking add button', async () => {
    const newBucket = makeBucket({ id: 'new-1', name: 'New Bucket' });
    mockCreateMutateAsync.mockResolvedValue(newBucket);
    mockUseBuckets.mockReturnValue({
      data: [makeBucket({ id: 'b1', name: 'Work' })],
      isLoading: false,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add bucket' }));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith({
      name: 'New Bucket',
      totalMinutes: 60,
      colorIndex: 1, // colorIndex 0 is used by 'Work'
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });

    // Wait for the async mutation to resolve and dialog to open
    await screen.findByTestId('settings-dialog');
    expect(screen.getByTestId('settings-dialog').textContent).toBe('New Bucket');
  });

  it('bucket rows have pointer cursor class', () => {
    mockUseBuckets.mockReturnValue({
      data: [makeBucket({ id: 'b1', name: 'Work' })],
      isLoading: false,
    });
    renderPage();

    const bucketRow = screen.getByText('Work').closest('button');
    expect(bucketRow?.classList.contains('cursor-pointer')).toBe(true);
  });
});
