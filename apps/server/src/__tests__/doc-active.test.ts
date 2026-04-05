import { beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { ensureDefaultWorkspace } from '../services/workspace.js';
import type { Database } from '../services/thread.js';
import { createCleanTestDb } from './test-db.js';
import { resetActiveDoc, setActiveDocForTest } from '../routes/docs.js';

describe('active doc tracking', () => {
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createCleanTestDb('documents, workspaces');
    await ensureDefaultWorkspace(testDb);
    // Reset module-level active doc state between tests
    resetActiveDoc();
  });

  function createServer() {
    return buildServer({ logger: false, database: testDb });
  }

  // --- PUT /docs/active ---

  describe('PUT /docs/active', () => {
    it('sets the active doc and GET retrieves it', async () => {
      const server = createServer();

      // Create a doc with some content
      const createRes = await server.inject({
        method: 'POST',
        url: '/docs',
        payload: { title: 'Active Test' },
      });
      const docId = createRes.json().document.id;

      // Add content so we can verify markdown in GET response
      const content = [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }], children: [] },
      ];
      await server.inject({
        method: 'PATCH',
        url: `/docs/${docId}`,
        payload: { content },
      });

      // Set as active
      const putRes = await server.inject({
        method: 'PUT',
        url: '/docs/active',
        payload: { docId },
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json()).toEqual({ ok: true });

      // Retrieve active doc
      const getRes = await server.inject({ method: 'GET', url: '/docs/active' });
      expect(getRes.statusCode).toBe(200);
      const body = getRes.json();
      expect(body.id).toBe(docId);
      expect(body.title).toBe('Active Test');
      expect(body.markdown).toContain('Hello world');

      await server.close();
    });

    it('returns 404 for a non-existent doc ID', async () => {
      const server = createServer();

      const res = await server.inject({
        method: 'PUT',
        url: '/docs/active',
        payload: { docId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Document not found' });

      await server.close();
    });
  });

  // --- GET /docs/active ---

  describe('GET /docs/active', () => {
    it('returns 404 when no active doc is set', async () => {
      const server = createServer();

      const res = await server.inject({ method: 'GET', url: '/docs/active' });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'No active document' });

      await server.close();
    });

    it('returns 404 when the active doc has been deleted', async () => {
      const server = createServer();

      // Create and set active
      const createRes = await server.inject({
        method: 'POST',
        url: '/docs',
        payload: { title: 'Will Delete' },
      });
      const docId = createRes.json().document.id;

      await server.inject({
        method: 'PUT',
        url: '/docs/active',
        payload: { docId },
      });

      // Delete the doc
      await server.inject({ method: 'DELETE', url: `/docs/${docId}` });

      // Active doc should now be cleared
      const getRes = await server.inject({ method: 'GET', url: '/docs/active' });
      expect(getRes.statusCode).toBe(404);
      expect(getRes.json()).toEqual({ error: 'No active document' });

      await server.close();
    });

    it('returns 404 and clears stale reference when activeDocId points to a nonexistent doc', async () => {
      const server = createServer();

      // Simulate a stale reference by setting activeDocId to a nonexistent UUID
      // (bypasses PUT validation to exercise the GET handler's defensive fallback)
      setActiveDocForTest('00000000-0000-0000-0000-000000000000');

      const getRes = await server.inject({ method: 'GET', url: '/docs/active' });
      expect(getRes.statusCode).toBe(404);
      expect(getRes.json()).toEqual({ error: 'No active document' });

      // Verify the stale reference was cleared — a second GET should still be 404
      const getRes2 = await server.inject({ method: 'GET', url: '/docs/active' });
      expect(getRes2.statusCode).toBe(404);

      await server.close();
    });

    it('switching active doc updates correctly', async () => {
      const server = createServer();

      const r1 = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Doc A' } });
      const r2 = await server.inject({ method: 'POST', url: '/docs', payload: { title: 'Doc B' } });
      const docAId = r1.json().document.id;
      const docBId = r2.json().document.id;

      // Set Doc A as active
      await server.inject({ method: 'PUT', url: '/docs/active', payload: { docId: docAId } });
      let getRes = await server.inject({ method: 'GET', url: '/docs/active' });
      expect(getRes.json().title).toBe('Doc A');

      // Switch to Doc B
      await server.inject({ method: 'PUT', url: '/docs/active', payload: { docId: docBId } });
      getRes = await server.inject({ method: 'GET', url: '/docs/active' });
      expect(getRes.json().title).toBe('Doc B');

      await server.close();
    });
  });
});
