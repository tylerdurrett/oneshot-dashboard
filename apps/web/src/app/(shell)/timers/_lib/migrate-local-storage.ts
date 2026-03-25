// One-time migration: moves timer data from localStorage to the server.
// If migration fails, localStorage is left intact so it can retry on next load.

import {
  createBucket,
  fetchBuckets,
  setTimerTime,
  type BucketResponse,
  type CreateBucketInput,
} from './timer-api';

const LEGACY_STORAGE_KEY = 'time-buckets-state';

/** Frozen shape of a bucket from the old localStorage system. */
interface LegacyBucket {
  id: string;
  name: string;
  totalMinutes: number;
  elapsedSeconds: number;
  colorIndex: number;
  daysOfWeek: number[];
}

/** Frozen shape of the old localStorage timer state. */
interface LegacyTimerState {
  buckets: LegacyBucket[];
  activeBucketId: string | null;
  lastActiveTime: string | null;
  lastResetDate: string;
}

/**
 * Migrate timer data from localStorage to the server.
 *
 * Handles partial migrations: if a previous attempt created some buckets
 * but failed midway, this will skip already-created buckets by name and
 * still attempt to set elapsed progress for them (in case the prior
 * setTimerTime call was the one that failed).
 *
 * Returns true if migration was performed, false if skipped (no data).
 */
export async function migrateLocalStorageToServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return false;

  let legacyState: LegacyTimerState;
  try {
    legacyState = JSON.parse(raw) as LegacyTimerState;
  } catch {
    // Corrupt data — remove it and move on
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return false;
  }

  if (!legacyState.buckets || legacyState.buckets.length === 0) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return false;
  }

  const existingBuckets = await fetchBuckets();
  const existingByName = new Map<string, BucketResponse>(
    existingBuckets.map((b) => [b.name, b]),
  );

  for (const bucket of legacyState.buckets) {
    let serverId: string;
    const existing = existingByName.get(bucket.name);

    if (existing) {
      // Bucket already exists — use its server ID for elapsed progress below
      serverId = existing.id;
    } else {
      const input: CreateBucketInput = {
        name: bucket.name,
        totalMinutes: bucket.totalMinutes,
        colorIndex: bucket.colorIndex,
        daysOfWeek: bucket.daysOfWeek,
      };
      const created = await createBucket(input);
      serverId = created.id;
    }

    // Migrate elapsed progress (also retries for buckets created in a
    // prior partial migration where setTimerTime may have failed)
    if (bucket.elapsedSeconds > 0) {
      const remainingSeconds = Math.max(
        0,
        bucket.totalMinutes * 60 - bucket.elapsedSeconds,
      );
      await setTimerTime(serverId, remainingSeconds);
    }
  }

  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return true;
}
