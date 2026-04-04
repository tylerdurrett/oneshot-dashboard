import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultDocument,
  updateDocumentContent,
  listDocuments,
  getDocumentById,
  getMostRecentDocument,
  createDocument,
  updateDocumentTitle,
  deleteDocument,
  pinDocument,
  unpinDocument,
} from '../services/document.js';
import { ensureDefaultWorkspace } from '../services/workspace.js';
import { createCleanTestDb } from './test-db.js';
import type { Database } from '../services/thread.js';

describe('document service', () => {
  let testDb: Database;

  beforeEach(async () => {
    // Truncate workspaces too — getDefaultDocument now queries the workspaces table
    testDb = await createCleanTestDb('documents, workspaces');
  });

  describe('getDefaultDocument', () => {
    it('creates a document on first access', async () => {
      const doc = await getDefaultDocument(testDb);

      expect(doc.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(doc.content).toEqual([]);
      expect(doc.createdAt).toBeTypeOf('string');
      expect(doc.updatedAt).toBeTypeOf('string');
    });

    it('returns the same document on subsequent calls', async () => {
      const first = await getDefaultDocument(testDb);
      const second = await getDefaultDocument(testDb);

      expect(first.id).toBe(second.id);
    });
  });

  describe('updateDocumentContent', () => {
    it('updates the content', async () => {
      const doc = await getDefaultDocument(testDb);
      const content = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }];

      const updated = await updateDocumentContent(doc.id, content, testDb);

      expect(updated?.content).toEqual(content);
    });

    it('bumps the updatedAt timestamp', async () => {
      const doc = await getDefaultDocument(testDb);
      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      const updated = await updateDocumentContent(doc.id, [{ type: 'paragraph' }], testDb);

      expect(updated!.updatedAt > doc.updatedAt).toBe(true);
    });
  });

  // -- Multi-doc service functions (Phase 2.1) --

  /** Helper: seed default workspace and return its ID. */
  async function seedWorkspace(): Promise<string> {
    const { workspaceId } = await ensureDefaultWorkspace(testDb);
    return workspaceId;
  }

  describe('listDocuments', () => {
    it('returns docs for the given workspace', async () => {
      const wsId = await seedWorkspace();
      await createDocument(wsId, 'Doc A', testDb);
      await createDocument(wsId, 'Doc B', testDb);

      const docs = await listDocuments(wsId, testDb);

      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.title)).toContain('Doc A');
      expect(docs.map((d) => d.title)).toContain('Doc B');
    });

    it('returns pinned docs first, then unpinned by updatedAt desc', async () => {
      const wsId = await seedWorkspace();
      const old = await createDocument(wsId, 'Old', testDb);
      await new Promise((r) => setTimeout(r, 10));
      const recent = await createDocument(wsId, 'Recent', testDb);
      await new Promise((r) => setTimeout(r, 10));
      const pinned = await createDocument(wsId, 'Pinned', testDb);
      await pinDocument(pinned.id, testDb);

      const docs = await listDocuments(wsId, testDb);

      expect(docs).toHaveLength(3);
      // Pinned doc should be first
      expect(docs[0]!.title).toBe('Pinned');
      // Then unpinned sorted by updatedAt desc: Recent before Old
      expect(docs[1]!.title).toBe('Recent');
      expect(docs[2]!.title).toBe('Old');
    });

    it('returns empty array when workspace has no docs', async () => {
      const wsId = await seedWorkspace();
      const docs = await listDocuments(wsId, testDb);
      expect(docs).toEqual([]);
    });
  });

  describe('getDocumentById', () => {
    it('returns the document when it exists', async () => {
      const wsId = await seedWorkspace();
      const created = await createDocument(wsId, 'Test', testDb);

      const found = await getDocumentById(created.id, testDb);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Test');
    });

    it('returns null when the document does not exist', async () => {
      const found = await getDocumentById('00000000-0000-0000-0000-000000000000', testDb);
      expect(found).toBeNull();
    });
  });

  describe('getMostRecentDocument', () => {
    it('returns the most recently updated document', async () => {
      const wsId = await seedWorkspace();
      await createDocument(wsId, 'Older', testDb);
      await new Promise((r) => setTimeout(r, 10));
      const newer = await createDocument(wsId, 'Newer', testDb);

      const doc = await getMostRecentDocument(wsId, testDb);

      expect(doc.id).toBe(newer.id);
    });

    it('auto-creates a document when none exist', async () => {
      const wsId = await seedWorkspace();

      const doc = await getMostRecentDocument(wsId, testDb);

      expect(doc.id).toBeDefined();
      expect(doc.workspaceId).toBe(wsId);
      // Default title should be date-based
      expect(doc.title).toMatch(/^Notes \d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('createDocument', () => {
    it('creates a document with a custom title', async () => {
      const wsId = await seedWorkspace();

      const doc = await createDocument(wsId, 'My Title', testDb);

      expect(doc.title).toBe('My Title');
      expect(doc.workspaceId).toBe(wsId);
      expect(doc.content).toEqual([]);
    });

    it('defaults title to "Notes [date]" when no title provided', async () => {
      const wsId = await seedWorkspace();

      const doc = await createDocument(wsId, undefined, testDb);

      expect(doc.title).toMatch(/^Notes \d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('updateDocumentTitle', () => {
    it('updates the title and bumps updatedAt', async () => {
      const wsId = await seedWorkspace();
      const doc = await createDocument(wsId, 'Original', testDb);
      await new Promise((r) => setTimeout(r, 10));

      const updated = await updateDocumentTitle(doc.id, 'New Title', testDb);

      expect(updated!.title).toBe('New Title');
      expect(updated!.updatedAt > doc.updatedAt).toBe(true);
    });

    it('returns undefined for a non-existent document', async () => {
      const result = await updateDocumentTitle(
        '00000000-0000-0000-0000-000000000000',
        'Title',
        testDb,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('deleteDocument', () => {
    it('deletes an existing document and returns true', async () => {
      const wsId = await seedWorkspace();
      const doc = await createDocument(wsId, 'To Delete', testDb);

      const deleted = await deleteDocument(doc.id, testDb);

      expect(deleted).toBe(true);
      // Verify it's gone
      const found = await getDocumentById(doc.id, testDb);
      expect(found).toBeNull();
    });

    it('returns false when document does not exist', async () => {
      const deleted = await deleteDocument('00000000-0000-0000-0000-000000000000', testDb);
      expect(deleted).toBe(false);
    });
  });

  describe('pinDocument / unpinDocument', () => {
    it('sets pinnedAt when pinning', async () => {
      const wsId = await seedWorkspace();
      const doc = await createDocument(wsId, 'To Pin', testDb);
      expect(doc.pinnedAt).toBeNull();

      const pinned = await pinDocument(doc.id, testDb);

      expect(pinned!.pinnedAt).toBeTypeOf('string');
      expect(pinned!.pinnedAt).not.toBeNull();
    });

    it('clears pinnedAt when unpinning', async () => {
      const wsId = await seedWorkspace();
      const doc = await createDocument(wsId, 'To Unpin', testDb);
      await pinDocument(doc.id, testDb);

      const unpinned = await unpinDocument(doc.id, testDb);

      expect(unpinned!.pinnedAt).toBeNull();
    });

    it('bumps updatedAt on pin and unpin', async () => {
      const wsId = await seedWorkspace();
      const doc = await createDocument(wsId, 'Pin Test', testDb);
      await new Promise((r) => setTimeout(r, 10));

      const pinned = await pinDocument(doc.id, testDb);
      expect(pinned!.updatedAt > doc.updatedAt).toBe(true);

      await new Promise((r) => setTimeout(r, 10));
      const unpinned = await unpinDocument(doc.id, testDb);
      expect(unpinned!.updatedAt > pinned!.updatedAt).toBe(true);
    });
  });
});
