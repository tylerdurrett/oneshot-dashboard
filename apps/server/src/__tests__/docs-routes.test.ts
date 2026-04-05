import { beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { ensureDefaultWorkspace } from '../services/workspace.js';
import type { Database } from '../services/thread.js';
import { createCleanTestDb } from './test-db.js';

describe('docs routes', () => {
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createCleanTestDb('documents, workspaces');
    // Routes require a workspace to exist for list/create/recent operations
    await ensureDefaultWorkspace(testDb);
  });

  function createServer() {
    return buildServer({ logger: false, database: testDb });
  }

  // --- GET /docs ---

  describe('GET /docs', () => {
    it('returns an empty array when no documents exist', async () => {
      const server = createServer();
      const res = await server.inject({ method: 'GET', url: '/docs' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ documents: [] });
      await server.close();
    });

    it('returns documents for the default workspace', async () => {
      const server = createServer();

      await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Doc A' } });
      await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Doc B' } });

      const res = await server.inject({ method: 'GET', url: '/docs' });
      const body = res.json();

      expect(res.statusCode).toBe(200);
      expect(body.documents).toHaveLength(2);
      await server.close();
    });
  });

  // --- GET /docs/recent ---

  describe('GET /docs/recent', () => {
    it('auto-creates a document when none exist', async () => {
      const server = createServer();
      const res = await server.inject({ method: 'GET', url: '/docs/recent' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.document.id).toBeDefined();
      expect(body.document.title).toMatch(/^Notes \d{4}-\d{2}-\d{2}$/);
      await server.close();
    });

    it('returns the most recently updated document', async () => {
      const server = createServer();

      await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Older' } });
      await new Promise((r) => setTimeout(r, 10));
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Newer' } });
      const newerId = createRes.json().document.id;

      const res = await server.inject({ method: 'GET', url: '/docs/recent' });
      expect(res.json().document.id).toBe(newerId);
      await server.close();
    });
  });

  // --- GET /docs/:id ---

  describe('GET /docs/:id', () => {
    it('returns a document by ID', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Test' } });
      const docId = createRes.json().document.id;

      const res = await server.inject({ method: 'GET', url: `/docs/${docId}` });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.title).toBe('Test');
      await server.close();
    });

    it('returns 404 for a nonexistent document', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'GET',
        url: '/docs/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Document not found' });
      await server.close();
    });
  });

  // --- POST /docs ---

  describe('POST /docs', () => {
    it('creates a document with a custom title and returns 201', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'POST',
        url: '/docs',
        payload: { title: 'My Doc' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.document.title).toBe('My Doc');
      expect(body.document.id).toBeDefined();
      await server.close();
    });

    it('defaults title to "Notes [date]" when no title provided', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'POST',
        url: '/docs',
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().document.title).toMatch(/^Notes \d{4}-\d{2}-\d{2}$/);
      await server.close();
    });
  });

  // --- PATCH /docs/:id ---

  describe('PATCH /docs/:id', () => {
    it('updates document title', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Original' } });
      const docId = createRes.json().document.id;

      const res = await server.inject({
        method: 'PATCH',
        url: `/docs/${docId}`,
        payload: { title: 'Updated' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.title).toBe('Updated');
      await server.close();
    });

    it('updates document content', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Test' } });
      const docId = createRes.json().document.id;

      const content = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }];
      const res = await server.inject({
        method: 'PATCH',
        url: `/docs/${docId}`,
        payload: { content },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.content).toEqual(content);
      await server.close();
    });

    it('updates both title and content in one call', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Test' } });
      const docId = createRes.json().document.id;

      const content = [{ type: 'paragraph' }];
      const res = await server.inject({
        method: 'PATCH',
        url: `/docs/${docId}`,
        payload: { title: 'New Title', content },
      });

      expect(res.statusCode).toBe(200);
      const doc = res.json().document;
      expect(doc.title).toBe('New Title');
      expect(doc.content).toEqual(content);
      await server.close();
    });

    it('returns 404 for a nonexistent document', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'PATCH',
        url: '/docs/00000000-0000-0000-0000-000000000000',
        payload: { title: 'Nope' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Document not found' });
      await server.close();
    });
  });

  // --- DELETE /docs/:id ---

  describe('DELETE /docs/:id', () => {
    it('deletes a document and returns success', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'To Delete' } });
      const docId = createRes.json().document.id;

      const res = await server.inject({ method: 'DELETE', url: `/docs/${docId}` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      // Verify it's gone
      const getRes = await server.inject({ method: 'GET', url: `/docs/${docId}` });
      expect(getRes.statusCode).toBe(404);
      await server.close();
    });

    it('returns 404 for a nonexistent document', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'DELETE',
        url: '/docs/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Document not found' });
      await server.close();
    });
  });

  // --- POST /docs/:id/pin & DELETE /docs/:id/pin ---

  describe('pin / unpin', () => {
    it('pins a document', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Pin Me' } });
      const docId = createRes.json().document.id;

      const res = await server.inject({ method: 'POST', url: `/docs/${docId}/pin` });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.pinnedAt).not.toBeNull();
      await server.close();
    });

    it('unpins a document', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Unpin Me' } });
      const docId = createRes.json().document.id;

      // Pin first
      await server.inject({ method: 'POST', url: `/docs/${docId}/pin` });
      // Then unpin
      const res = await server.inject({ method: 'DELETE', url: `/docs/${docId}/pin` });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.pinnedAt).toBeNull();
      await server.close();
    });

    it('returns 404 when pinning a nonexistent document', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'POST',
        url: '/docs/00000000-0000-0000-0000-000000000000/pin',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Document not found' });
      await server.close();
    });

    it('pinned docs appear first in the list', async () => {
      const server = createServer();

      const r1 = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Unpinned' } });
      await new Promise((r) => setTimeout(r, 10));
      const r2 = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Pinned' } });
      const pinnedId = r2.json().document.id;

      // Pin the second doc
      await server.inject({ method: 'POST', url: `/docs/${pinnedId}/pin` });

      const listRes = await server.inject({ method: 'GET', url: '/docs' });
      const docs = listRes.json().documents;

      expect(docs[0].title).toBe('Pinned');
      expect(docs[0].pinnedAt).not.toBeNull();
      await server.close();
    });
  });

  // --- GET /docs/:id/markdown ---

  describe('GET /docs/:id/markdown', () => {
    it('returns markdown for a doc with content', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'MD Test' } });
      const docId = createRes.json().document.id;

      const content = [
        { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Hello' }], children: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'World' }], children: [] },
      ];
      await server.inject({ method: 'PATCH', url: `/docs/${docId}`, payload: { content } });

      const res = await server.inject({ method: 'GET', url: `/docs/${docId}/markdown` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.markdown).toContain('Hello');
      expect(body.markdown).toContain('World');
      await server.close();
    });

    it('returns empty string for a doc with no content', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Empty' } });
      const docId = createRes.json().document.id;

      const res = await server.inject({ method: 'GET', url: `/docs/${docId}/markdown` });

      expect(res.statusCode).toBe(200);
      expect(res.json().markdown).toBe('');
      await server.close();
    });

    it('returns 404 for a nonexistent doc', async () => {
      const server = createServer();
      const res = await server.inject({
        method: 'GET',
        url: '/docs/00000000-0000-0000-0000-000000000000/markdown',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Document not found' });
      await server.close();
    });
  });

  // --- GET /docs/:id?format=markdown ---

  describe('GET /docs/:id?format=markdown', () => {
    it('includes both document and markdown fields when format=markdown', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Format Test' } });
      const docId = createRes.json().document.id;

      const content = [{ type: 'paragraph', content: [{ type: 'text', text: 'test content' }], children: [] }];
      await server.inject({ method: 'PATCH', url: `/docs/${docId}`, payload: { content } });

      const res = await server.inject({ method: 'GET', url: `/docs/${docId}?format=markdown` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.document).toBeDefined();
      expect(body.document.title).toBe('Format Test');
      expect(body.markdown).toContain('test content');
      await server.close();
    });

    it('does not include markdown field without format param', async () => {
      const server = createServer();
      const createRes = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'No Format' } });
      const docId = createRes.json().document.id;

      const res = await server.inject({ method: 'GET', url: `/docs/${docId}` });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.document).toBeDefined();
      expect(body.markdown).toBeUndefined();
      await server.close();
    });
  });

  // --- Backward compatibility ---

  describe('backward compat: /docs/default', () => {
    it('GET /docs/default still works', async () => {
      const server = createServer();
      const res = await server.inject({ method: 'GET', url: '/docs/default' });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.id).toBeDefined();
      await server.close();
    });

    it('PATCH /docs/default still works', async () => {
      const server = createServer();
      // Ensure default doc exists
      await server.inject({ method: 'GET', url: '/docs/default' });

      const content = [{ type: 'paragraph', content: [{ type: 'text', text: 'legacy' }] }];
      const res = await server.inject({
        method: 'PATCH',
        url: '/docs/default',
        payload: { content },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().document.content).toEqual(content);
      await server.close();
    });
  });
});
