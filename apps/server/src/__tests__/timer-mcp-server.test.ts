/**
 * Tests for the MCP timer server helpers (bucket resolution, API calls)
 * and a smoke test of the bundled MCP server binary.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBucket, api, API_BASE } from '../chat/timer-mcp-helpers.js';

// ---------------------------------------------------------------------------
// Mock fetch globally so the helpers use our fake
// ---------------------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const SAMPLE_BUCKETS = [
  { id: 'aaa-111', name: 'School' },
  { id: 'bbb-222', name: 'Exercise' },
  { id: 'ccc-333', name: 'Business' },
  { id: 'ddd-444', name: 'Life Maintenance' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveBucket', () => {
  it('returns UUID directly without fetching', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const result = await resolveBucket(id);
    expect(result).toEqual({ id });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('matches exact name (case-insensitive)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { buckets: SAMPLE_BUCKETS }));
    const result = await resolveBucket('school');
    expect(result).toEqual({ id: 'aaa-111' });
  });

  it('matches exact name with different casing', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { buckets: SAMPLE_BUCKETS }));
    const result = await resolveBucket('EXERCISE');
    expect(result).toEqual({ id: 'bbb-222' });
  });

  it('matches substring when no exact match', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { buckets: SAMPLE_BUCKETS }));
    const result = await resolveBucket('Maintenance');
    expect(result).toEqual({ id: 'ddd-444' });
  });

  it('returns error when multiple partial matches', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { buckets: SAMPLE_BUCKETS }));
    const result = await resolveBucket('in');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Multiple buckets match');
    expect((result as { error: string }).error).toContain('Business');
    expect((result as { error: string }).error).toContain('Life Maintenance');
  });

  it('returns error when no match found', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { buckets: SAMPLE_BUCKETS }));
    const result = await resolveBucket('Cooking');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('No bucket matches');
    expect((result as { error: string }).error).toContain('School');
  });

  it('returns error when bucket list fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(500, { error: 'Internal error' }));
    const result = await resolveBucket('School');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Failed to fetch buckets');
  });
});

describe('api helper', () => {
  it('makes GET requests without body or Content-Type', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { date: '2026-04-02', buckets: [] }));
    const result = await api('GET', '/timers/today');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    const call = mockFetch.mock.calls[0]!;
    expect(call[0]).toBe(`${API_BASE}/timers/today`);
    expect(call[1].method).toBe('GET');
    expect(call[1].body).toBeUndefined();
    // GET should not send Content-Type
    expect(call[1].headers).toBeUndefined();
  });

  it('makes POST requests with JSON body and Content-Type', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { bucketId: 'aaa-111', startedAt: '2026-04-02T12:00:00Z' }));
    await api('POST', '/timers/buckets/aaa-111/start', {});

    const call = mockFetch.mock.calls[0]!;
    expect(call[1].method).toBe('POST');
    expect(call[1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('handles non-JSON responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });
    const result = await api('GET', '/timers/today');
    expect(result.ok).toBe(false);
    expect(result.data).toBe('Bad Gateway');
  });
});

describe('MCP server bundle', () => {
  it('responds to MCP initialize request', () => {
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        capabilities: {},
        protocolVersion: '2025-03-26',
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });

    // Use spawnSync with stdin input instead of shell echo for safety
    const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
    const result = spawnSync(
      'node',
      [path.join(projectRoot, 'apps/server/dist/timer-mcp-server.mjs')],
      { input: initRequest + '\n', timeout: 10_000, cwd: projectRoot },
    );

    expect(result.status).toBe(0);
    const output = result.stdout.toString().trim();
    const response = JSON.parse(output);
    expect(response.result.serverInfo.name).toBe('oneshot-timers');
    expect(response.result.capabilities.tools).toBeDefined();
  });
});
