import 'dotenv/config';

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config.js';
import { threadRoutes, type ThreadRoutesOptions } from './routes/threads.js';
import {
  probeSandbox,
  type SandboxProbeResult,
  type SpawnFn,
} from './services/sandbox.js';
import type { Database } from './services/thread.js';

export interface BuildServerOptions {
  logger?: boolean;
  database?: Database;
  /** Override the spawn function for sandbox probe (testing). */
  spawnFn?: SpawnFn;
}

export function buildServer(opts?: BuildServerOptions) {
  const server = Fastify({
    logger: opts?.logger ?? true,
  });

  let sandboxStatus: SandboxProbeResult | null = null;

  server.register(cors, { origin: config.webOrigin });

  server.get('/health', async () => {
    return {
      status: 'ok',
      sandbox: sandboxStatus
        ? { status: sandboxStatus.status, message: sandboxStatus.message }
        : { status: 'unknown', message: 'Sandbox probe has not run yet' },
    };
  });

  const routeOpts: ThreadRoutesOptions = {};
  if (opts?.database) {
    routeOpts.database = opts.database;
  }
  server.register(threadRoutes, routeOpts);

  /** Run the sandbox probe and cache the result for the health endpoint. */
  async function runSandboxProbe(): Promise<SandboxProbeResult> {
    const result = await probeSandbox(opts?.spawnFn);
    sandboxStatus = result;
    return result;
  }

  return Object.assign(server, { runSandboxProbe });
}

// Start the server when this file is run directly (not imported in tests)
if (!process.env.VITEST) {
  const server = buildServer();

  server.listen({ port: config.port, host: '127.0.0.1' }, async (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }

    // Probe sandbox after server is listening (non-blocking to startup)
    const result = await server.runSandboxProbe();

    if (result.status === 'healthy') {
      server.log.info(result.message);
    } else if (result.status === 'auth_failed') {
      server.log.warn(result.message);
      server.log.warn(
        `To authenticate: docker sandbox exec -it ${config.sandboxName} claude`,
      );
    } else {
      server.log.warn(result.message);
      server.log.warn(
        `To create sandbox: docker sandbox run --name ${config.sandboxName} claude ${config.sandboxWorkspace}`,
      );
    }
  });
}
