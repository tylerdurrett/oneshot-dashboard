// Timer API client — fetch wrappers for server timer endpoints.
// Follows the same pattern as chat/api.ts.

// ---------------------------------------------------------------------------
// Types (matching server response shapes from apps/server/src/routes/timers.ts)
// ---------------------------------------------------------------------------

/** A bucket merged with today's progress (from GET /timers/today). */
export interface ServerBucket {
  id: string;
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  sortOrder: number;
  elapsedSeconds: number;
  startedAt: string | null;
  goalReachedAt: string | null;
  dismissedAt: string | null;
}

/** Response from GET /timers/today. */
export interface TodayStateResponse {
  date: string;
  buckets: ServerBucket[];
}

/** Response from POST /timers/buckets/:id/start. */
export interface StartTimerResponse {
  bucketId: string;
  startedAt: string;
  stoppedBucketId: string | null;
}

/** Response from POST /timers/buckets/:id/stop. */
export interface StopTimerResponse {
  elapsedSeconds: number;
  goalReachedAt: string | null;
}

/** A bucket row from CRUD operations (from GET/POST/PATCH /timers/buckets). */
export interface BucketResponse {
  id: string;
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** Input for creating a new bucket. */
export interface CreateBucketInput {
  name: string;
  totalMinutes: number;
  colorIndex: number;
  daysOfWeek: number[];
}

/** Input for updating a bucket (all fields optional). */
export interface UpdateBucketInput {
  name?: string;
  totalMinutes?: number;
  colorIndex?: number;
  daysOfWeek?: number[];
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

import { getServerHttpUrl } from '@/lib/server-url';

// IMPORTANT: Do NOT change this to `export { getServerHttpUrl as getBaseUrl }`.
// A re-export like that does NOT create a local binding, so all the fetch
// functions below would fail with "getBaseUrl is not defined" at runtime.
export const getBaseUrl = getServerHttpUrl;

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch today's state — all buckets with merged progress. */
export async function fetchTodayState(): Promise<TodayStateResponse> {
  const res = await fetch(`${getBaseUrl()}/timers/today`);
  if (!res.ok) throw new Error(`Failed to fetch today state: ${res.status}`);
  return res.json() as Promise<TodayStateResponse>;
}

/** Fetch all buckets (without progress data). */
export async function fetchBuckets(): Promise<BucketResponse[]> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets`);
  if (!res.ok) throw new Error(`Failed to fetch buckets: ${res.status}`);
  const data: { buckets: BucketResponse[] } = await res.json();
  return data.buckets;
}

export async function createBucket(
  input: CreateBucketInput,
): Promise<BucketResponse> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create bucket: ${res.status}`);
  const data: { bucket: BucketResponse } = await res.json();
  return data.bucket;
}

export async function updateBucket(
  id: string,
  updates: UpdateBucketInput,
): Promise<BucketResponse> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update bucket: ${res.status}`);
  const data: { bucket: BucketResponse } = await res.json();
  return data.bucket;
}

export async function deleteBucket(id: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete bucket: ${res.status}`);
}

export async function startTimer(
  bucketId: string,
): Promise<StartTimerResponse> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets/${bucketId}/start`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to start timer: ${res.status}`);
  return res.json() as Promise<StartTimerResponse>;
}

export async function stopTimer(
  bucketId: string,
): Promise<StopTimerResponse> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets/${bucketId}/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop timer: ${res.status}`);
  return res.json() as Promise<StopTimerResponse>;
}

/** Reset a bucket's progress for today. */
export async function resetTimer(bucketId: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/timers/buckets/${bucketId}/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to reset timer: ${res.status}`);
}

export async function setTimerTime(
  bucketId: string,
  remainingSeconds: number,
): Promise<StopTimerResponse> {
  const res = await fetch(
    `${getBaseUrl()}/timers/buckets/${bucketId}/set-time`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remainingSeconds }),
    },
  );
  if (!res.ok) throw new Error(`Failed to set timer time: ${res.status}`);
  return res.json() as Promise<StopTimerResponse>;
}

/** Dismiss a bucket for today — hides it until the next 3 AM reset. */
export async function dismissBucket(bucketId: string): Promise<void> {
  const res = await fetch(
    `${getBaseUrl()}/timers/buckets/${bucketId}/dismiss`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`Failed to dismiss bucket: ${res.status}`);
}
