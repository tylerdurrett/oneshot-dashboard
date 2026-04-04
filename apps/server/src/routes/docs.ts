import type { FastifyInstance } from 'fastify';
import type { Database } from '../services/thread.js';
import {
  getDefaultDocument,
  updateDocumentContent,
} from '../services/document.js';

export interface DocsRoutesOptions {
  database?: Database;
}

export async function docsRoutes(
  server: FastifyInstance,
  opts: DocsRoutesOptions,
) {
  const db = opts.database;

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
}
