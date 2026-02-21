import 'dotenv/config';

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config.js';
import { threadRoutes, type ThreadRoutesOptions } from './routes/threads.js';
import type { Database } from './services/thread.js';

export interface BuildServerOptions {
  logger?: boolean;
  database?: Database;
}

export function buildServer(opts?: BuildServerOptions) {
  const server = Fastify({
    logger: opts?.logger ?? true,
  });

  server.register(cors, { origin: config.webOrigin });

  server.get('/health', async () => {
    return { status: 'ok' };
  });

  const routeOpts: ThreadRoutesOptions = {};
  if (opts?.database) {
    routeOpts.database = opts.database;
  }
  server.register(threadRoutes, routeOpts);

  return server;
}

// Start the server when this file is run directly (not imported in tests)
if (!process.env.VITEST) {
  const server = buildServer();

  server.listen({ port: config.port, host: '127.0.0.1' }, (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
  });
}
