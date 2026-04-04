import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultDocument,
  updateDocumentContent,
} from '../services/document.js';
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
});
