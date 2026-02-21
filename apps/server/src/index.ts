import 'dotenv/config';

import Fastify from 'fastify';
import { config } from './config.js';

export function buildServer(opts?: { logger?: boolean }) {
  const server = Fastify({
    logger: opts?.logger ?? true,
  });

  server.get('/health', async () => {
    return { status: 'ok' };
  });

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
