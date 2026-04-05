/**
 * Tests for the MCP server helpers (bucket resolution, API calls)
 * and a smoke test of the bundled MCP server binary.
 */

import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { EventEmitter, Readable } from 'node:stream';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBucket, resolveDoc, api, API_BASE } from '../chat/mcp-helpers.js';

// ---------------------------------------------------------------------------
// Mock node:http so the helpers use our fake instead of real HTTP
// ---------------------------------------------------------------------------

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, default: { ...actual, request: mockRequest }, request: mockRequest };
});

afterEach(() => {
  mockRequest.mockReset();
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Set up mockRequest to call the callback with a fake response. */
function mockHttpResponse(status: number, body: unknown) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  mockRequest.mockImplementationOnce((_options: unknown, callback?: (res: unknown) => void) => {
    const req = new EventEmitter() as http.ClientRequest;
    req.write = vi.fn().mockReturnValue(true);
    req.end = vi.fn().mockImplementation(() => {
      const res = Readable.from([bodyStr]) as Readable & { statusCode: number };
      res.statusCode = status;
      callback?.(res);
      return req;
    });
    return req;
  });
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
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('matches exact name (case-insensitive)', async () => {
    mockHttpResponse(200, { buckets: SAMPLE_BUCKETS });
    const result = await resolveBucket('school');
    expect(result).toEqual({ id: 'aaa-111' });
  });

  it('matches exact name with different casing', async () => {
    mockHttpResponse(200, { buckets: SAMPLE_BUCKETS });
    const result = await resolveBucket('EXERCISE');
    expect(result).toEqual({ id: 'bbb-222' });
  });

  it('matches substring when no exact match', async () => {
    mockHttpResponse(200, { buckets: SAMPLE_BUCKETS });
    const result = await resolveBucket('Maintenance');
    expect(result).toEqual({ id: 'ddd-444' });
  });

  it('returns error when multiple partial matches', async () => {
    mockHttpResponse(200, { buckets: SAMPLE_BUCKETS });
    const result = await resolveBucket('in');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Multiple buckets match');
    expect((result as { error: string }).error).toContain('Business');
    expect((result as { error: string }).error).toContain('Life Maintenance');
  });

  it('returns error when no match found', async () => {
    mockHttpResponse(200, { buckets: SAMPLE_BUCKETS });
    const result = await resolveBucket('Cooking');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('No bucket matches');
    expect((result as { error: string }).error).toContain('School');
  });

  it('returns error when bucket list fetch fails', async () => {
    mockHttpResponse(500, { error: 'Internal error' });
    const result = await resolveBucket('School');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Failed to fetch buckets');
  });
});

// ---------------------------------------------------------------------------
// resolveDoc tests
// ---------------------------------------------------------------------------

const SAMPLE_DOCS = [
  { id: 'doc-aaa', title: 'Meeting Notes' },
  { id: 'doc-bbb', title: 'Project Plan' },
  { id: 'doc-ccc', title: 'Daily Journal' },
  { id: 'doc-ddd', title: 'Project Retrospective' },
];

describe('resolveDoc', () => {
  it('returns UUID directly without fetching', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const result = await resolveDoc(id);
    expect(result).toEqual({ id });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('matches exact title (case-insensitive)', async () => {
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    const result = await resolveDoc('meeting notes');
    expect(result).toEqual({ id: 'doc-aaa' });
  });

  it('matches exact title with different casing', async () => {
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    const result = await resolveDoc('DAILY JOURNAL');
    expect(result).toEqual({ id: 'doc-ccc' });
  });

  it('matches substring when no exact match', async () => {
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    const result = await resolveDoc('Journal');
    expect(result).toEqual({ id: 'doc-ccc' });
  });

  it('returns error when multiple partial matches', async () => {
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    const result = await resolveDoc('Project');
    expect(result).toHaveProperty('error');
    const err = (result as { error: string }).error;
    expect(err).toContain('Multiple docs match');
    expect(err).toContain('Project Plan');
    expect(err).toContain('Project Retrospective');
  });

  it('returns error when no match found', async () => {
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    const result = await resolveDoc('Recipes');
    expect(result).toHaveProperty('error');
    const err = (result as { error: string }).error;
    expect(err).toContain('No doc matches');
    expect(err).toContain('Meeting Notes');
  });

  it('returns error when doc list fetch fails', async () => {
    mockHttpResponse(500, { error: 'Internal error' });
    const result = await resolveDoc('Meeting Notes');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Failed to fetch docs');
  });
});

describe('api helper', () => {
  it('makes GET requests without body or Content-Type', async () => {
    mockHttpResponse(200, { date: '2026-04-02', buckets: [] });
    const result = await api('GET', '/timers/today');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    const call = mockRequest.mock.calls[0]!;
    const options = call[0] as http.RequestOptions;
    expect(options.method).toBe('GET');
    // GET should not send Content-Type
    expect((options.headers as Record<string, string>)?.['Content-Type']).toBeUndefined();
  });

  it('makes POST requests with JSON body and Content-Type', async () => {
    mockHttpResponse(200, { bucketId: 'aaa-111', startedAt: '2026-04-02T12:00:00Z' });
    await api('POST', '/timers/buckets/aaa-111/start', {});

    const call = mockRequest.mock.calls[0]!;
    const options = call[0] as http.RequestOptions;
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
  });

  it('handles non-JSON responses', async () => {
    mockHttpResponse(502, 'Bad Gateway');
    const result = await api('GET', '/timers/today');
    expect(result.ok).toBe(false);
    expect(result.data).toBe('Bad Gateway');
  });
});

// ---------------------------------------------------------------------------
// get_current_doc tool logic
// ---------------------------------------------------------------------------

// The tool handler is registered on McpServer and not directly importable.
// We extract and test the same logic inline: api call → format response.

describe('get_current_doc logic', () => {
  /** Mirrors the tool handler in mcp-server.ts */
  async function getCurrentDoc() {
    const res = await api('GET', '/docs/active');
    if (!res.ok) {
      return { content: [{ type: 'text' as const, text: 'No doc is currently open. Use list_docs to see available docs.' }] };
    }
    const { title, markdown } = res.data as { title: string; markdown: string };
    return { content: [{ type: 'text' as const, text: `# ${title}\n\n${markdown}` }] };
  }

  it('returns formatted markdown with title when active doc exists', async () => {
    mockHttpResponse(200, { id: 'doc-aaa', title: 'Meeting Notes', markdown: '## Agenda\n\n- Item 1' });
    const result = await getCurrentDoc();
    expect(result.content[0]!.text).toBe('# Meeting Notes\n\n## Agenda\n\n- Item 1');
  });

  it('returns helpful message when no active doc is set', async () => {
    mockHttpResponse(404, { error: 'No active document' });
    const result = await getCurrentDoc();
    expect(result.content[0]!.text).toContain('No doc is currently open');
    expect(result.content[0]!.text).toContain('list_docs');
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
      [path.join(projectRoot, 'apps/server/dist/oneshot-mcp-server.mjs')],
      { input: initRequest + '\n', timeout: 10_000, cwd: projectRoot },
    );

    expect(result.status).toBe(0);
    const output = result.stdout.toString().trim();
    const response = JSON.parse(output);
    expect(response.result.serverInfo.name).toBe('oneshot');
    expect(response.result.capabilities.tools).toBeDefined();
  });
});
