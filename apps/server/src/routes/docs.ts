import type { FastifyInstance } from 'fastify';
import type { Database } from '../services/thread.js';
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
  generateDocumentTitle,
} from '../services/document.js';
import { getDefaultWorkspaceId } from '../services/workspace.js';

export interface DocsRoutesOptions {
  database?: Database;
}

export async function docsRoutes(
  server: FastifyInstance,
  opts: DocsRoutesOptions,
) {
  const db = opts.database;

  // Cache workspace ID — it's static after server startup (set by ensureDefaultWorkspace).
  let cachedWorkspaceId: string | undefined;

  async function requireWorkspaceId(): Promise<string> {
    if (cachedWorkspaceId) return cachedWorkspaceId;
    const wsId = await getDefaultWorkspaceId(db);
    if (!wsId) throw new Error('No default workspace found');
    cachedWorkspaceId = wsId;
    return wsId;
  }

  // --- Legacy endpoints (backward compat — remove in a later cleanup) ---

  server.get('/docs/default', async () => {
    const doc = await getDefaultDocument(db);
    return { document: doc };
  });

  server.patch<{ Body: { content: unknown[] } }>(
    '/docs/default',
    async (request) => {
      // Ensure the default document exists before updating
      const doc = await getDefaultDocument(db);
      const updated = await updateDocumentContent(
        doc.id,
        request.body.content,
        db,
      );
      return { document: updated };
    },
  );

  // --- Multi-doc endpoints ---

  /** GET /docs — list all documents for the default workspace. */
  server.get('/docs', async () => {
    const wsId = await requireWorkspaceId();
    const docs = await listDocuments(wsId, db);
    return { documents: docs };
  });

  // Register /docs/recent BEFORE /docs/:id so Fastify doesn't treat "recent" as a UUID param.
  /** GET /docs/recent — most recently edited document. */
  server.get('/docs/recent', async () => {
    const wsId = await requireWorkspaceId();
    const doc = await getMostRecentDocument(wsId, db);
    return { document: doc };
  });

  // Register /docs/:id/generate-title BEFORE /docs/:id (static segment before parameterized).
  /** POST /docs/:id/generate-title — auto-generate a title via AI. */
  server.post<{ Params: { id: string } }>(
    '/docs/:id/generate-title',
    async (request, reply) => {
      try {
        const result = await generateDocumentTitle(request.params.id, db);
        if (!result) {
          return reply.status(404).send({ error: 'Document not found' });
        }
        return { document: result };
      } catch {
        return reply.status(502).send({ error: 'Title generation failed' });
      }
    },
  );

  /** GET /docs/:id — single document by ID. */
  server.get<{ Params: { id: string } }>(
    '/docs/:id',
    async (request, reply) => {
      const doc = await getDocumentById(request.params.id, db);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }
      return { document: doc };
    },
  );

  /** POST /docs — create a new document. */
  server.post<{ Body: { title?: string } }>(
    '/docs',
    async (request, reply) => {
      const wsId = await requireWorkspaceId();
      const doc = await createDocument(wsId, request.body?.title, db);
      return reply.status(201).send({ document: doc });
    },
  );

  /** PATCH /docs/:id — update document content and/or title. */
  server.patch<{ Params: { id: string }; Body: { content?: unknown[]; title?: string } }>(
    '/docs/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { content, title } = request.body ?? {};

      const existing = await getDocumentById(id, db);
      if (!existing) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      let doc = existing;

      if (content !== undefined) {
        const updated = await updateDocumentContent(id, content, db);
        if (updated) doc = updated;
      }

      if (title !== undefined) {
        const updated = await updateDocumentTitle(id, title, db);
        if (updated) doc = updated;
      }

      return { document: doc };
    },
  );

  /** DELETE /docs/:id — delete a document. */
  server.delete<{ Params: { id: string } }>(
    '/docs/:id',
    async (request, reply) => {
      const deleted = await deleteDocument(request.params.id, db);
      if (!deleted) {
        return reply.status(404).send({ error: 'Document not found' });
      }
      return { success: true };
    },
  );

  /** POST /docs/:id/pin — pin a document. */
  server.post<{ Params: { id: string } }>(
    '/docs/:id/pin',
    async (request, reply) => {
      const doc = await pinDocument(request.params.id, db);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }
      return { document: doc };
    },
  );

  /** DELETE /docs/:id/pin — unpin a document. */
  server.delete<{ Params: { id: string } }>(
    '/docs/:id/pin',
    async (request, reply) => {
      const doc = await unpinDocument(request.params.id, db);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }
      return { document: doc };
    },
  );
}
