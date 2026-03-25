import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateLocalStorageToServer } from '../_lib/migrate-local-storage';

// ---------------------------------------------------------------------------
// Mock timer-api module
// ---------------------------------------------------------------------------

vi.mock('../_lib/timer-api', () => ({
  getBaseUrl: vi.fn(() => 'http://localhost:4902'),
  fetchBuckets: vi.fn(),
  createBucket: vi.fn(),
  setTimerTime: vi.fn(),
}));

import { fetchBuckets, createBucket, setTimerTime } from '../_lib/timer-api';

const mockFetchBuckets = vi.mocked(fetchBuckets);
const mockCreateBucket = vi.mocked(createBucket);
const mockSetTimerTime = vi.mocked(setTimerTime);

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEGACY_KEY = 'time-buckets-state';

function makeLegacyState(
  buckets: Array<{
    id: string;
    name: string;
    totalMinutes: number;
    elapsedSeconds: number;
    colorIndex: number;
    daysOfWeek: number[];
  }>,
) {
  return JSON.stringify({
    buckets,
    activeBucketId: null,
    lastActiveTime: null,
    lastResetDate: '2026-03-24',
  });
}

const defaultLegacyBuckets = [
  {
    id: 'old-1',
    name: 'School Project',
    totalMinutes: 180,
    elapsedSeconds: 0,
    colorIndex: 0,
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  {
    id: 'old-2',
    name: 'Exercise',
    totalMinutes: 60,
    elapsedSeconds: 1200,
    colorIndex: 3,
    daysOfWeek: [1, 2, 3, 4, 5],
  },
];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

afterEach(() => {
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateLocalStorageToServer', () => {
  it('returns false when no localStorage data exists', async () => {
    const result = await migrateLocalStorageToServer();
    expect(result).toBe(false);
    expect(mockFetchBuckets).not.toHaveBeenCalled();
  });

  it('migrates buckets to the server and removes localStorage', async () => {
    localStorageMock.setItem(LEGACY_KEY, makeLegacyState(defaultLegacyBuckets));
    mockFetchBuckets.mockResolvedValue([]); // No existing server buckets
    mockCreateBucket.mockResolvedValue({
      id: 'server-1',
      name: 'School Project',
      totalMinutes: 180,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await migrateLocalStorageToServer();

    expect(result).toBe(true);
    expect(mockCreateBucket).toHaveBeenCalledTimes(2);
    expect(mockCreateBucket).toHaveBeenCalledWith({
      name: 'School Project',
      totalMinutes: 180,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
    });
    // localStorage should be removed after successful migration
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
  });

  it('skips creation for existing buckets but still sets elapsed progress', async () => {
    // Exercise already exists on server but has elapsed progress in localStorage
    localStorageMock.setItem(LEGACY_KEY, makeLegacyState(defaultLegacyBuckets));
    mockFetchBuckets.mockResolvedValue([
      {
        id: 'existing-1',
        name: 'Exercise',
        totalMinutes: 60,
        colorIndex: 3,
        daysOfWeek: [1, 2, 3, 4, 5],
        sortOrder: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    mockCreateBucket.mockResolvedValue({
      id: 'server-2',
      name: 'School Project',
      totalMinutes: 180,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    mockSetTimerTime.mockResolvedValue({
      elapsedSeconds: 1200,
      completedAt: null,
    });

    await migrateLocalStorageToServer();

    // Only School Project should be created (Exercise already exists)
    expect(mockCreateBucket).toHaveBeenCalledTimes(1);
    expect(mockCreateBucket).toHaveBeenCalledWith({
      name: 'School Project',
      totalMinutes: 180,
      colorIndex: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
    });
    // Exercise has elapsed progress — setTimerTime called with existing server ID
    expect(mockSetTimerTime).toHaveBeenCalledWith('existing-1', 2400);
  });

  it('migrates elapsed progress via setTimerTime', async () => {
    localStorageMock.setItem(LEGACY_KEY, makeLegacyState(defaultLegacyBuckets));
    mockFetchBuckets.mockResolvedValue([]);
    mockCreateBucket
      .mockResolvedValueOnce({
        id: 'server-1',
        name: 'School Project',
        totalMinutes: 180,
        colorIndex: 0,
        daysOfWeek: [1, 2, 3, 4, 5],
        sortOrder: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce({
        id: 'server-2',
        name: 'Exercise',
        totalMinutes: 60,
        colorIndex: 3,
        daysOfWeek: [1, 2, 3, 4, 5],
        sortOrder: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    mockSetTimerTime.mockResolvedValue({
      elapsedSeconds: 1200,
      completedAt: null,
    });

    await migrateLocalStorageToServer();

    // Only Exercise has elapsed > 0 (1200s elapsed out of 3600s total)
    expect(mockSetTimerTime).toHaveBeenCalledTimes(1);
    expect(mockSetTimerTime).toHaveBeenCalledWith(
      'server-2',
      2400, // 60 * 60 - 1200 = remaining
    );
  });

  it('handles corrupt localStorage data by removing it', async () => {
    localStorageMock.setItem(LEGACY_KEY, 'not valid json{{{');

    const result = await migrateLocalStorageToServer();

    expect(result).toBe(false);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
    expect(mockFetchBuckets).not.toHaveBeenCalled();
  });

  it('handles empty buckets array by removing localStorage', async () => {
    localStorageMock.setItem(LEGACY_KEY, makeLegacyState([]));

    const result = await migrateLocalStorageToServer();

    expect(result).toBe(false);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
  });

  it('preserves localStorage on partial failure (createBucket fails mid-loop)', async () => {
    localStorageMock.setItem(LEGACY_KEY, makeLegacyState(defaultLegacyBuckets));
    mockFetchBuckets.mockResolvedValue([]);
    mockCreateBucket
      .mockResolvedValueOnce({
        id: 'server-1',
        name: 'School Project',
        totalMinutes: 180,
        colorIndex: 0,
        daysOfWeek: [1, 2, 3, 4, 5],
        sortOrder: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .mockRejectedValueOnce(new Error('Server error'));

    await expect(migrateLocalStorageToServer()).rejects.toThrow('Server error');

    // First bucket was created, second failed
    expect(mockCreateBucket).toHaveBeenCalledTimes(2);
    // localStorage preserved for retry
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });

  it('preserves localStorage on API failure', async () => {
    localStorageMock.setItem(LEGACY_KEY, makeLegacyState(defaultLegacyBuckets));
    mockFetchBuckets.mockRejectedValue(new Error('Network error'));

    await expect(migrateLocalStorageToServer()).rejects.toThrow(
      'Network error',
    );

    // localStorage should NOT be removed — migration can retry next load
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
