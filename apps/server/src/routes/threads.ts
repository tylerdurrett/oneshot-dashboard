import type { FastifyInstance } from 'fastify';
import {
  createThread,
  deleteThread,
  getThread,
  getThreadMessages,
  listThreads,
  type Database,
} from '../services/thread.js';

export interface ThreadRoutesOptions {
  database?: Database;
}

/** Fastify plugin that registers thread CRUD routes. */
export async function threadRoutes(
  server: FastifyInstance,
  opts: ThreadRoutesOptions,
) {
  const db = opts.database;

  server.get('/threads', async () => {
    const result = await listThreads(db);
    return { threads: result };
  });

  server.get<{ Params: { id: string } }>(
    '/threads/:id/messages',
    async (request, reply) => {
      const { id } = request.params;

      const thread = await getThread(id, db);
      if (!thread) {
        return reply.status(404).send({ error: 'Thread not found' });
      }

      const result = await getThreadMessages(id, db);
      return { messages: result };
    },
  );

  server.post<{ Body: { title?: string } }>('/threads', async (_, reply) => {
    const title = _.body?.title ?? 'New conversation';
    const thread = await createThread(title, db);
    return reply.status(201).send({ thread });
  });

  server.delete<{ Params: { id: string } }>(
    '/threads/:id',
    async (request, reply) => {
      const { id } = request.params;
      const deleted = await deleteThread(id, db);

      if (!deleted) {
        return reply.status(404).send({ error: 'Thread not found' });
      }

      return reply.status(200).send({ success: true });
    },
  );
}
