/**
 * Tests for the MCP server helpers (bucket resolution, doc resolution,
 * plain-text extraction).
 *
 * Phase 3.4 removed the api() HTTP helper and its tests. Resolve functions
 * now query the database directly via service mocks. Full tool-level
 * integration tests are added in Phase 3.5.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBucket, resolveDoc, extractPlainText } from '../chat/mcp-helpers.js';

// ---------------------------------------------------------------------------
// Mock service modules so resolve helpers use our fake data
// ---------------------------------------------------------------------------

const mockListBuckets = vi.fn();
vi.mock('../services/timer-bucket.js', () => ({
  listBuckets: (...args: unknown[]) => mockListBuckets(...args),
}));

const mockListDocuments = vi.fn();
vi.mock('../services/document.js', () => ({
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
}));

const mockGetDefaultWorkspaceId = vi.fn();
vi.mock('../services/workspace.js', () => ({
  getDefaultWorkspaceId: (...args: unknown[]) => mockGetDefaultWorkspaceId(...args),
}));

// Fake database token — resolve helpers pass it through to service functions
const fakeDb = {} as Parameters<typeof resolveBucket>[1];

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_BUCKETS = [
  { id: 'aaa-111', name: 'School' },
  { id: 'bbb-222', name: 'Exercise' },
  { id: 'ccc-333', name: 'Business' },
  { id: 'ddd-444', name: 'Life Maintenance' },
];

const SAMPLE_DOCS = [
  { id: 'doc-aaa', title: 'Meeting Notes' },
  { id: 'doc-bbb', title: 'Project Plan' },
  { id: 'doc-ccc', title: 'Daily Journal' },
  { id: 'doc-ddd', title: 'Project Retrospective' },
];

// ---------------------------------------------------------------------------
// resolveBucket tests
// ---------------------------------------------------------------------------

describe('resolveBucket', () => {
  it('returns UUID directly without fetching', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const result = await resolveBucket(id, fakeDb);
    expect(result).toEqual({ id });
    expect(mockListBuckets).not.toHaveBeenCalled();
  });

  it('matches exact name (case-insensitive)', async () => {
    mockListBuckets.mockResolvedValueOnce(SAMPLE_BUCKETS);
    const result = await resolveBucket('school', fakeDb);
    expect(result).toEqual({ id: 'aaa-111' });
  });

  it('matches exact name with different casing', async () => {
    mockListBuckets.mockResolvedValueOnce(SAMPLE_BUCKETS);
    const result = await resolveBucket('EXERCISE', fakeDb);
    expect(result).toEqual({ id: 'bbb-222' });
  });

  it('matches substring when no exact match', async () => {
    mockListBuckets.mockResolvedValueOnce(SAMPLE_BUCKETS);
    const result = await resolveBucket('Maintenance', fakeDb);
    expect(result).toEqual({ id: 'ddd-444' });
  });

  it('returns error when multiple partial matches', async () => {
    mockListBuckets.mockResolvedValueOnce(SAMPLE_BUCKETS);
    const result = await resolveBucket('in', fakeDb);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Multiple buckets match');
    expect((result as { error: string }).error).toContain('Business');
    expect((result as { error: string }).error).toContain('Life Maintenance');
  });

  it('returns error when no match found', async () => {
    mockListBuckets.mockResolvedValueOnce(SAMPLE_BUCKETS);
    const result = await resolveBucket('Cooking', fakeDb);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('No bucket matches');
    expect((result as { error: string }).error).toContain('School');
  });

  it('returns error when bucket list fetch fails', async () => {
    mockListBuckets.mockRejectedValueOnce(new Error('DB connection failed'));
    const result = await resolveBucket('School', fakeDb);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Failed to fetch buckets');
  });
});

// ---------------------------------------------------------------------------
// resolveDoc tests
// ---------------------------------------------------------------------------

describe('resolveDoc', () => {
  beforeEach(() => {
    mockGetDefaultWorkspaceId.mockResolvedValue('ws-default');
  });

  it('returns UUID directly without fetching', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const result = await resolveDoc(id, fakeDb);
    expect(result).toEqual({ id });
    expect(mockListDocuments).not.toHaveBeenCalled();
  });

  it('matches exact title (case-insensitive)', async () => {
    mockListDocuments.mockResolvedValueOnce(SAMPLE_DOCS);
    const result = await resolveDoc('meeting notes', fakeDb);
    expect(result).toEqual({ id: 'doc-aaa' });
  });

  it('matches exact title with different casing', async () => {
    mockListDocuments.mockResolvedValueOnce(SAMPLE_DOCS);
    const result = await resolveDoc('DAILY JOURNAL', fakeDb);
    expect(result).toEqual({ id: 'doc-ccc' });
  });

  it('matches substring when no exact match', async () => {
    mockListDocuments.mockResolvedValueOnce(SAMPLE_DOCS);
    const result = await resolveDoc('Journal', fakeDb);
    expect(result).toEqual({ id: 'doc-ccc' });
  });

  it('returns error when multiple partial matches', async () => {
    mockListDocuments.mockResolvedValueOnce(SAMPLE_DOCS);
    const result = await resolveDoc('Project', fakeDb);
    expect(result).toHaveProperty('error');
    const err = (result as { error: string }).error;
    expect(err).toContain('Multiple docs match');
    expect(err).toContain('Project Plan');
    expect(err).toContain('Project Retrospective');
  });

  it('returns error when no match found', async () => {
    mockListDocuments.mockResolvedValueOnce(SAMPLE_DOCS);
    const result = await resolveDoc('Recipes', fakeDb);
    expect(result).toHaveProperty('error');
    const err = (result as { error: string }).error;
    expect(err).toContain('No doc matches');
    expect(err).toContain('Meeting Notes');
  });

  it('returns error when doc list fetch fails', async () => {
    mockListDocuments.mockRejectedValueOnce(new Error('DB connection failed'));
    const result = await resolveDoc('Meeting Notes', fakeDb);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Failed to fetch docs');
  });

  it('returns error when no default workspace found', async () => {
    mockGetDefaultWorkspaceId.mockResolvedValueOnce(null);
    const result = await resolveDoc('Meeting Notes', fakeDb);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('No default workspace found');
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
