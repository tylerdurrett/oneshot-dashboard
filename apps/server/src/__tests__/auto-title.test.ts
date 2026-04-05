import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractTextFromBlocks,
  countWords,
  extractBlockIds,
  generateDocumentTitle,
  createDocument,
  updateDocumentTitle,
  resetApiKeyWarning,
} from '../services/document.js';
import { ensureDefaultWorkspace } from '../services/workspace.js';
import { buildServer } from '../index.js';
import { createCleanTestDb } from './test-db.js';
import type { Database } from '../services/thread.js';
import { documents } from '@repo/db';
import { eq } from 'drizzle-orm';

// Mock the AI SDK — we don't call Gemini in tests
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => 'mocked-model')),
}));

// Mock config so we can toggle the API key per test
vi.mock('../config.js', () => ({
  config: {
    googleGeminiApiKey: 'test-key',
  },
}));

import { generateText } from 'ai';
import { config } from '../config.js';

const mockedGenerateText = vi.mocked(generateText);
const mockedConfig = config as { googleGeminiApiKey: string };

describe('auto-title utilities', () => {
  describe('extractTextFromBlocks', () => {
    it('extracts text from paragraph blocks', () => {
      const blocks = [
        {
          id: '1',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
          children: [],
        },
        {
          id: '2',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }],
          children: [],
        },
      ];

      expect(extractTextFromBlocks(blocks)).toBe('Hello world\nSecond paragraph');
    });

    it('extracts text from heading blocks', () => {
      const blocks = [
        {
          id: '1',
          type: 'heading',
          content: [{ type: 'text', text: 'My Heading' }],
          children: [],
        },
      ];

      expect(extractTextFromBlocks(blocks)).toBe('My Heading');
    });

    it('handles nested children', () => {
      const blocks = [
        {
          id: '1',
          type: 'bulletListItem',
          content: [{ type: 'text', text: 'Parent item' }],
          children: [
            {
              id: '1a',
              type: 'bulletListItem',
              content: [{ type: 'text', text: 'Child item' }],
              children: [],
            },
          ],
        },
      ];

      expect(extractTextFromBlocks(blocks)).toBe('Parent item\nChild item');
    });

    it('returns empty string for empty content', () => {
      expect(extractTextFromBlocks([])).toBe('');
    });

    it('returns empty string for malformed content', () => {
      const blocks = [
        null,
        { type: 'paragraph' },
        { type: 'paragraph', content: 'not-an-array' },
        { type: 'paragraph', content: [{ type: 'image', url: 'foo.png' }] },
      ];

      expect(extractTextFromBlocks(blocks as unknown[])).toBe('');
    });

    it('concatenates multiple inline content items within a block', () => {
      const blocks = [
        {
          id: '1',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold and ' },
            { type: 'text', text: 'italic text' },
          ],
          children: [],
        },
      ];

      expect(extractTextFromBlocks(blocks)).toBe('Bold and italic text');
    });
  });

  describe('countWords', () => {
    it('counts words correctly', () => {
      expect(countWords('hello world')).toBe(2);
      expect(countWords('one two three four five')).toBe(5);
    });

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
      expect(countWords('   \n\t  ')).toBe(0);
    });

    it('handles extra whitespace between words', () => {
      expect(countWords('  hello   world  ')).toBe(2);
    });

    it('handles newlines and tabs as word separators', () => {
      expect(countWords('hello\nworld\tthere')).toBe(3);
    });
  });

  describe('extractBlockIds', () => {
    it('returns top-level block IDs', () => {
      const blocks = [
        { id: 'block-1', type: 'paragraph', content: [], children: [] },
        { id: 'block-2', type: 'heading', content: [], children: [] },
        { id: 'block-3', type: 'paragraph', content: [], children: [] },
      ];

      expect(extractBlockIds(blocks)).toEqual(['block-1', 'block-2', 'block-3']);
    });

    it('does not include child block IDs', () => {
      const blocks = [
        {
          id: 'parent',
          type: 'paragraph',
          content: [],
          children: [{ id: 'child', type: 'paragraph', content: [], children: [] }],
        },
      ];

      expect(extractBlockIds(blocks)).toEqual(['parent']);
    });

    it('skips blocks without an id field', () => {
      const blocks = [
        { type: 'paragraph', content: [] },
        { id: 'has-id', type: 'paragraph', content: [] },
      ];

      expect(extractBlockIds(blocks)).toEqual(['has-id']);
    });

    it('returns empty array for empty input', () => {
      expect(extractBlockIds([])).toEqual([]);
    });
  });
});

/** Helper: build blocks with enough content to exceed the 50-word threshold. */
function buildContentBlocks(wordCount: number, blockCount: number = 3): unknown[] {
  const words = Array.from({ length: wordCount }, (_, i) => `word${i}`).join(' ');
  return Array.from({ length: blockCount }, (_, i) => ({
    id: `block-${i}`,
    type: 'paragraph',
    content: [{ type: 'text', text: i === 0 ? words : `block ${i} text` }],
    children: [],
  }));
}

describe('generateDocumentTitle', () => {
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createCleanTestDb('documents, workspaces');
    await ensureDefaultWorkspace(testDb);
    mockedGenerateText.mockReset();
    mockedConfig.googleGeminiApiKey = 'test-key';
    resetApiKeyWarning();
  });

  /** Helper: create a doc with content above threshold. */
  async function createDocWithContent(title?: string): Promise<string> {
    const { workspaceId } = await ensureDefaultWorkspace(testDb);
    const doc = await createDocument(workspaceId!, title, testDb);
    const content = buildContentBlocks(55);
    await testDb
      .update(documents)
      .set({ content })
      .where(eq(documents.id, doc.id));
    return doc.id;
  }

  it('skips docs where isTitleManual is true', async () => {
    const docId = await createDocWithContent('Manual Title');
    // Mark as manually titled
    await testDb
      .update(documents)
      .set({ isTitleManual: true })
      .where(eq(documents.id, docId));

    const result = await generateDocumentTitle(docId, testDb);

    expect(result?.title).toBe('Manual Title');
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('skips docs below content threshold', async () => {
    const { workspaceId } = await ensureDefaultWorkspace(testDb);
    const doc = await createDocument(workspaceId!, undefined, testDb);
    // Set content with < 50 words AND < 3 blocks
    const sparseContent = [
      {
        id: 'b1',
        type: 'paragraph',
        content: [{ type: 'text', text: 'Just a few words' }],
        children: [],
      },
    ];
    await testDb
      .update(documents)
      .set({ content: sparseContent })
      .where(eq(documents.id, doc.id));

    const result = await generateDocumentTitle(doc.id, testDb);

    expect(result?.title).toBe(doc.title); // unchanged
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('skips when API key is empty', async () => {
    mockedConfig.googleGeminiApiKey = '';
    const docId = await createDocWithContent();

    const result = await generateDocumentTitle(docId, testDb);

    expect(result?.isTitleManual).toBe(false);
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('returns undefined for non-existent doc', async () => {
    const result = await generateDocumentTitle(
      '00000000-0000-0000-0000-000000000000',
      testDb,
    );
    expect(result).toBeUndefined();
  });

  it('updates title and stores block IDs on success', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '  Generated Title  ',
    } as never);

    const docId = await createDocWithContent();
    const result = await generateDocumentTitle(docId, testDb);

    expect(result).toBeDefined();
    expect(result!.title).toBe('Generated Title'); // trimmed
    expect(result!.isTitleManual).toBe(false);
    expect(result!.titleGeneratedFromBlockIds).toEqual(['block-0', 'block-1', 'block-2']);
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });

  it('passes content to generateText prompt', async () => {
    mockedGenerateText.mockResolvedValue({ text: 'Test Title' } as never);

    const docId = await createDocWithContent();
    await generateDocumentTitle(docId, testDb);

    const call = mockedGenerateText.mock.calls[0]![0];
    expect(call.prompt).toContain('word0');
    expect(call.prompt).toContain('Generate a short, descriptive title');
  });

  it('qualifies when word count is below 50 but block count is >= 3', async () => {
    // 3 blocks but fewer than 50 words — should still qualify (threshold is AND)
    mockedGenerateText.mockResolvedValue({ text: 'Short Doc Title' } as never);

    const { workspaceId } = await ensureDefaultWorkspace(testDb);
    const doc = await createDocument(workspaceId!, undefined, testDb);
    const content = [
      { id: 'b1', type: 'paragraph', content: [{ type: 'text', text: 'Hello' }], children: [] },
      { id: 'b2', type: 'paragraph', content: [{ type: 'text', text: 'World' }], children: [] },
      { id: 'b3', type: 'paragraph', content: [{ type: 'text', text: 'Test' }], children: [] },
    ];
    await testDb
      .update(documents)
      .set({ content })
      .where(eq(documents.id, doc.id));

    const result = await generateDocumentTitle(doc.id, testDb);

    expect(result!.title).toBe('Short Doc Title');
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });

  it('returns doc unchanged when generateText throws', async () => {
    mockedGenerateText.mockRejectedValue(new Error('API error'));

    const docId = await createDocWithContent('Original Title');
    const result = await generateDocumentTitle(docId, testDb);

    expect(result).toBeDefined();
    expect(result!.title).toBe('Original Title');
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });
});

describe('auto-title routes', () => {
  let testDb: Database;
  let server: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    testDb = await createCleanTestDb('documents, workspaces');
    await ensureDefaultWorkspace(testDb);
    mockedGenerateText.mockReset();
    mockedConfig.googleGeminiApiKey = 'test-key';
    resetApiKeyWarning();
    server = buildServer({
      logger: false,
      database: testDb,
      features: { timers: false, chat: false, video: false },
    });
  });

  afterEach(async () => {
    await server.close();
  });

  /** Helper: create a doc with content above threshold via the API. */
  async function createDocWithContent(title?: string): Promise<string> {
    const createRes = await server.inject({
      method: 'POST',
      url: '/docs',
      payload: title ? { title } : {},
    });
    const docId = createRes.json().document.id;
    const content = buildContentBlocks(55);
    await testDb
      .update(documents)
      .set({ content })
      .where(eq(documents.id, docId));
    return docId;
  }

  it('POST /docs/:id/generate-title returns 200 with updated doc', async () => {
    mockedGenerateText.mockResolvedValue({ text: 'AI Generated Title' } as never);
    const docId = await createDocWithContent();

    const res = await server.inject({
      method: 'POST',
      url: `/docs/${docId}/generate-title`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.document.title).toBe('AI Generated Title');
    expect(body.document.isTitleManual).toBe(false);
    expect(body.document.titleGeneratedFromBlockIds).toEqual(['block-0', 'block-1', 'block-2']);
  });

  it('POST /docs/:id/generate-title returns 404 for non-existent doc', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/docs/00000000-0000-0000-0000-000000000000/generate-title',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Document not found' });
  });

  it('PATCH /docs/:id with title sets isTitleManual = true', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/docs',
      payload: { title: 'Original' },
    });
    const docId = createRes.json().document.id;

    const patchRes = await server.inject({
      method: 'PATCH',
      url: `/docs/${docId}`,
      payload: { title: 'User Edited Title' },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = patchRes.json();
    expect(body.document.title).toBe('User Edited Title');
    expect(body.document.isTitleManual).toBe(true);
  });

  it('POST /docs/:id/generate-title returns doc unchanged when isTitleManual is true', async () => {
    const docId = await createDocWithContent('Manual Title');
    // Mark as manually titled via PATCH
    await server.inject({
      method: 'PATCH',
      url: `/docs/${docId}`,
      payload: { title: 'Manual Title' },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/docs/${docId}/generate-title`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().document.title).toBe('Manual Title');
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });
});
