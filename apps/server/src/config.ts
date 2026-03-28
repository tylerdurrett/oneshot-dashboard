import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeatures } from '@repo/features';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

interface ProjectConfig {
  port: number;
  serverPort?: number;
  features?: unknown;
}

function readProjectConfig(): ProjectConfig {
  try {
    const raw = fs.readFileSync(
      path.join(root, 'project.config.json'),
      'utf8',
    );
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { port: 4900 };
    const obj = parsed as Record<string, unknown>;
    return {
      port: typeof obj.port === 'number' ? obj.port : 4900,
      serverPort:
        typeof obj.serverPort === 'number' ? obj.serverPort : undefined,
      features: obj.features,
    };
  } catch {
    return { port: 4900 };
  }
}

const projectConfig = readProjectConfig();

/** Read an env var as an integer, returning `fallback` if missing or NaN. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Read an env var as a boolean (`'true'`/`'1'` → true, `'false'`/`'0'` → false), returning `fallback` if missing or unrecognised. */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}

export const config = {
  /** Feature flags — which features are active. All default to enabled. */
  features: parseFeatures(projectConfig.features),

  /** Fastify server port. Uses serverPort if available, otherwise port + 2. */
  port: projectConfig.serverPort ?? projectConfig.port + 2,

  /** Port of the web app, used for dynamic CORS origin matching. */
  webPort: projectConfig.port,

  /** Docker sandbox name. */
  sandboxName: process.env.SANDBOX_NAME ?? 'oneshot-sandbox',

  /** Workspace path inside the Docker sandbox. Defaults to the monorepo root. */
  sandboxWorkspace: process.env.SANDBOX_WORKSPACE ?? root,

  // -- Credential injection & circuit breaker --

  keychainTimeoutMs: envInt('KEYCHAIN_TIMEOUT_MS', 10_000),
  injectTimeoutMs: envInt('INJECT_TIMEOUT_MS', 15_000),
  /** Refresh host token proactively when it expires within this window. */
  hostRefreshThresholdMs: envInt('HOST_REFRESH_THRESHOLD_MS', 600_000),
  credentialSweepIntervalMs: envInt('CREDENTIAL_SWEEP_INTERVAL_MS', 14_400_000),
  healMaxAttempts: envInt('HEAL_MAX_ATTEMPTS', 3),
  /** Attempts outside this window are pruned, so the breaker resets naturally. */
  healWindowMs: envInt('HEAL_WINDOW_MS', 900_000),
  credentialSweepEnabled: envBool('CREDENTIAL_SWEEP_ENABLED', true),
};

/** Check whether an origin is allowed for CORS (any host on the web app port). */
export function isAllowedOrigin(origin: string): boolean {
  try {
    return parseInt(new URL(origin).port, 10) === config.webPort;
  } catch {
    return false;
  }
}
