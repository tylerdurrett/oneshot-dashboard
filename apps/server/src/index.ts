import 'dotenv/config';

import cors from '@fastify/cors';
import { db as defaultDb, enableWalMode, getJournalMode } from '@repo/db';
import Fastify from 'fastify';
import { config, isAllowedOrigin } from './config.js';
import { websocket } from './plugins/websocket.js';
import { chatRoutes, type ChatRoutesOptions } from './routes/chat.js';
import { threadRoutes, type ThreadRoutesOptions } from './routes/threads.js';
import { timerRoutes, broadcast, SSE_EVENTS } from './routes/timers.js';
import { isMacOS, refreshAndInjectCredentials } from './services/credentials.js';
import {
  probeSandbox,
  type SandboxProbeResult,
  type SpawnFn,
} from './services/sandbox.js';
import type { Database } from './services/thread.js';
import { seedDefaultBuckets } from './services/timer-bucket.js';
import { TimerScheduler } from './services/timer-scheduler.js';

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
  let lastCredentialSweep: string | null = null;
  const credentialInjectionAvailable = isMacOS();

  // Allow CORS from any host on the web app port (supports Tailscale / LAN access)
  server.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error('CORS: origin not allowed'), false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  server.register(websocket);

  server.get('/health', async () => {
    return {
      status: 'ok',
      sandbox: sandboxStatus
        ? { status: sandboxStatus.status, message: sandboxStatus.message }
        : { status: 'unknown', message: 'Sandbox probe has not run yet' },
      credentialInjection: {
        available: credentialInjectionAvailable,
        lastSweep: lastCredentialSweep,
      },
    };
  });

  const routeOpts: ThreadRoutesOptions = {};
  if (opts?.database) {
    routeOpts.database = opts.database;
  }
  server.register(threadRoutes, routeOpts);

  const chatOpts: ChatRoutesOptions = {};
  if (opts?.database) chatOpts.database = opts.database;
  if (opts?.spawnFn) chatOpts.spawnFn = opts.spawnFn;
  server.register(chatRoutes, chatOpts);

  // -- Timer system: scheduler + routes --

  const timerDb = opts?.database ?? defaultDb;
  const scheduler = new TimerScheduler({
    database: timerDb,
    onTimerCompleted: (bucketId) =>
      broadcast(SSE_EVENTS.TIMER_COMPLETED, { bucketId }),
    onDailyReset: () => broadcast(SSE_EVENTS.DAILY_RESET, {}),
  });

  server.register(timerRoutes, {
    database: timerDb,
    scheduler,
  });

  /** Initialize the timer scheduler (recovery + completion jobs + daily reset).
   *  Call after seeding default buckets. */
  async function initScheduler(): Promise<void> {
    await scheduler.init();
  }

  /** Run the sandbox probe and cache the result for the health endpoint. */
  async function runSandboxProbe(): Promise<SandboxProbeResult> {
    const result = await probeSandbox(opts?.spawnFn);
    sandboxStatus = result;
    return result;
  }

  // -- Credential sweep lifecycle --

  let sweepIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Run a single credential sweep. Logs result but never throws. */
  async function runCredentialSweep(): Promise<void> {
    try {
      const result = await refreshAndInjectCredentials(opts?.spawnFn);
      lastCredentialSweep = new Date().toISOString();
      if (result.ok) {
        server.log.info('Credential sweep: injection succeeded');
      } else {
        server.log.warn(`Credential sweep: ${result.phase} — ${result.message}`);
      }
    } catch (err) {
      server.log.error(`Credential sweep unexpected error: ${err}`);
    }
  }

  function startCredentialSweep(): void {
    if (sweepIntervalId) return;
    sweepIntervalId = setInterval(
      () => void runCredentialSweep(),
      config.credentialSweepIntervalMs,
    );
  }

  function stopCredentialSweep(): void {
    if (sweepIntervalId) {
      clearInterval(sweepIntervalId);
      sweepIntervalId = null;
    }
  }

  server.addHook('onClose', () => {
    scheduler.destroy();
    stopCredentialSweep();
  });

  return Object.assign(server, {
    initScheduler,
    runSandboxProbe,
    runCredentialSweep,
    startCredentialSweep,
    stopCredentialSweep,
  });
}

// Start the server when this file is run directly (not imported in tests)
if (!process.env.VITEST) {
  const server = buildServer();

  // Enable WAL mode for concurrent read/write access
  try {
    const mode = await enableWalMode();
    if (mode === 'wal') {
      server.log.info('SQLite WAL mode enabled');
    } else {
      server.log.warn(
        `SQLite journal mode is "${mode}", expected "wal". Concurrent access may cause locking errors.`,
      );
    }
  } catch (err) {
    const journalMode = await getJournalMode().catch(() => 'unknown');
    server.log.warn(
      `Failed to enable WAL mode (current: ${journalMode}): ${err}`,
    );
  }

  // Seed default timer buckets before starting (idempotent — no-op if buckets exist)
  try {
    const didSeed = await seedDefaultBuckets();
    if (didSeed) {
      server.log.info('Seeded default timer buckets');
    }
  } catch (err) {
    server.log.warn(`Failed to seed default timer buckets: ${err}`);
  }

  // Bind to 0.0.0.0 so the server is reachable over Tailscale / LAN
  server.listen({ port: config.port, host: '0.0.0.0' }, async (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }

    // Must run after seeding — scheduler recovery depends on buckets existing
    try {
      await server.initScheduler();
      server.log.info('Timer scheduler initialized');
    } catch (schedulerErr) {
      server.log.warn(`Timer scheduler init failed: ${schedulerErr}`);
    }

    // Probe sandbox and run initial credential sweep in parallel (non-blocking)
    const [result] = await Promise.all([
      server.runSandboxProbe(),
      server.runCredentialSweep(),
    ]);

    if (result.status === 'healthy') {
      server.log.info(result.message);
    } else if (result.status === 'auth_failed') {
      server.log.warn(result.message);
      server.log.warn(
        `To fix: pnpm sandbox`,
      );
    } else {
      server.log.warn(result.message);
      server.log.warn(
        `To create sandbox: docker sandbox run --name ${config.sandboxName} claude ${config.sandboxWorkspace}`,
      );
    }

    // Start recurring credential sweep if enabled
    if (config.credentialSweepEnabled) {
      server.startCredentialSweep();
      server.log.info(
        `Credential sweep started (interval: ${config.credentialSweepIntervalMs}ms)`,
      );
    }
  });
}
