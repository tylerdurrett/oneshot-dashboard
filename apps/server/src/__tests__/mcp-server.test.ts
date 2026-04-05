/**
 * Tests for the MCP server helpers (bucket resolution, API calls).
 */

import http from 'node:http';
import { EventEmitter, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBucket, resolveDoc, api, extractPlainText, API_BASE } from '../chat/mcp-helpers.js';

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

// ---------------------------------------------------------------------------
// extractPlainText tests
// ---------------------------------------------------------------------------

describe('extractPlainText', () => {
  it('returns empty string for empty blocks', () => {
    expect(extractPlainText([])).toBe('');
  });

  it('extracts text from a paragraph block', () => {
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    ];
    expect(extractPlainText(blocks)).toBe('Hello world');
  });

  it('concatenates multiple inline spans within a block', () => {
    const blocks = [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ]},
    ];
    expect(extractPlainText(blocks)).toBe('Hello world');
  });

  it('joins multiple blocks with newlines', () => {
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Line 2' }] },
    ];
    expect(extractPlainText(blocks)).toBe('Line 1\nLine 2');
  });

  it('recurses into children', () => {
    const blocks = [
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Parent' }], children: [
        { type: 'bulletListItem', content: [{ type: 'text', text: 'Child' }] },
      ]},
    ];
    expect(extractPlainText(blocks)).toBe('Parent\nChild');
  });

  it('skips blocks with no text content', () => {
    const blocks = [
      { type: 'image', props: { url: 'test.png' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'After image' }] },
    ];
    expect(extractPlainText(blocks)).toBe('After image');
  });
});

// ---------------------------------------------------------------------------
// list_docs tool logic
// ---------------------------------------------------------------------------

describe('list_docs logic', () => {
  /** Mirrors the tool handler in mcp-server.ts */
  async function listDocs() {
    const res = await api('GET', '/docs');
    if (!res.ok) return { content: [{ type: 'text' as const, text: `API error (${res.status}): ${JSON.stringify(res.data)}` }], isError: true as const };

    const docs = (res.data as { documents: Array<Record<string, unknown>> }).documents ?? [];
    if (docs.length === 0) {
      return { content: [{ type: 'text' as const, text: JSON.stringify('No docs found.', null, 2) }] };
    }

    const SNIPPET_MAX = 200;
    const sections = docs.map((doc) => {
      const title = (doc.title as string) || 'Untitled';
      const id = doc.id as string;
      const updatedAt = doc.updatedAt as string | undefined;
      const pinned = doc.pinnedAt ? ' | Pinned' : '';

      let snippet = '';
      if (Array.isArray(doc.content) && doc.content.length > 0) {
        const text = extractPlainText(doc.content as unknown[]);
        snippet = text.length > SNIPPET_MAX
          ? text.slice(0, SNIPPET_MAX) + '...'
          : text;
      }

      const updated = updatedAt ? updatedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : 'unknown';
      const preview = snippet ? `\nPreview: ${snippet}` : '';
      return `## ${title}\nID: ${id} | Updated: ${updated}${pinned}${preview}`;
    });

    return { content: [{ type: 'text' as const, text: sections.join('\n\n') }] };
  }

  it('returns formatted doc list with snippets', async () => {
    mockHttpResponse(200, {
      documents: [
        {
          id: 'doc-aaa',
          title: 'Meeting Notes',
          updatedAt: '2026-04-04T12:00:00Z',
          pinnedAt: '2026-04-04T10:00:00Z',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Discussed roadmap for Q3.' }] }],
        },
        {
          id: 'doc-bbb',
          title: 'Daily Journal',
          updatedAt: '2026-04-03T08:00:00Z',
          pinnedAt: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Today was productive.' }] }],
        },
      ],
    });

    const result = await listDocs();
    const text = result.content[0]!.text;

    expect(text).toContain('## Meeting Notes');
    expect(text).toContain('doc-aaa');
    expect(text).toContain('Pinned');
    expect(text).toContain('Preview: Discussed roadmap for Q3.');
    expect(text).toContain('## Daily Journal');
    expect(text).toContain('doc-bbb');
    expect(text).toContain('Preview: Today was productive.');
    // Daily Journal should NOT have Pinned
    const journalSection = text.split('## Daily Journal')[1]!;
    expect(journalSection).not.toContain('Pinned');
  });

  it('returns "No docs found." for empty list', async () => {
    mockHttpResponse(200, { documents: [] });
    const result = await listDocs();
    expect(result.content[0]!.text).toContain('No docs found.');
  });

  it('truncates long content snippets to ~200 chars', async () => {
    const longText = 'A'.repeat(300);
    mockHttpResponse(200, {
      documents: [{
        id: 'doc-long',
        title: 'Long Doc',
        updatedAt: '2026-04-04T12:00:00Z',
        pinnedAt: null,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }],
      }],
    });

    const result = await listDocs();
    const text = result.content[0]!.text;
    // Snippet should be 200 chars + "..."
    expect(text).toContain('A'.repeat(200) + '...');
    expect(text).not.toContain('A'.repeat(201));
  });

  it('handles docs with no content gracefully', async () => {
    mockHttpResponse(200, {
      documents: [{
        id: 'doc-empty',
        title: 'Empty Doc',
        updatedAt: '2026-04-04T12:00:00Z',
        pinnedAt: null,
        content: [],
      }],
    });

    const result = await listDocs();
    const text = result.content[0]!.text;
    expect(text).toContain('## Empty Doc');
    expect(text).not.toContain('Preview:');
  });
});

// ---------------------------------------------------------------------------
// read_doc tool logic
// ---------------------------------------------------------------------------

describe('read_doc logic', () => {
  /** Mirrors the tool handler in mcp-server.ts */
  async function readDoc(doc: string) {
    const resolved = await resolveDoc(doc);
    if ('error' in resolved) {
      return { content: [{ type: 'text' as const, text: resolved.error }], isError: true as const };
    }
    const res = await api('GET', `/docs/${resolved.id}?format=markdown`);
    if (!res.ok) {
      return { content: [{ type: 'text' as const, text: `API error (${res.status}): ${JSON.stringify(res.data)}` }], isError: true as const };
    }
    const data = res.data as { document: { title: string }; markdown: string };
    const title = data.document?.title ?? 'Untitled';
    return { content: [{ type: 'text' as const, text: `# ${title}\n\n${data.markdown}` }] };
  }

  it('returns title and markdown content for a resolved doc', async () => {
    // First call: resolveDoc fetches doc list
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    // Second call: GET /docs/:id?format=markdown
    mockHttpResponse(200, {
      document: { id: 'doc-aaa', title: 'Meeting Notes' },
      markdown: '## Agenda\n\n- Discuss roadmap\n- Review PRs',
    });

    const result = await readDoc('Meeting Notes');
    expect(result.content[0]!.text).toBe('# Meeting Notes\n\n## Agenda\n\n- Discuss roadmap\n- Review PRs');
    expect(result).not.toHaveProperty('isError');
  });

  it('returns error when doc cannot be resolved', async () => {
    mockHttpResponse(200, { documents: SAMPLE_DOCS });
    const result = await readDoc('Nonexistent Doc');
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('No doc matches');
  });

  it('returns error when markdown endpoint returns 404', async () => {
    mockHttpResponse(404, { error: 'Document not found' });
    const result = await readDoc('12345678-1234-1234-1234-123456789abc');
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('404');
  });
});

