import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

interface ProjectConfig {
  port: number;
  serverPort?: number;
}

function readProjectConfig(): ProjectConfig {
  try {
    const raw = fs.readFileSync(
      path.join(root, 'project.config.json'),
      'utf8',
    );
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { port: 3000 };
    const obj = parsed as Record<string, unknown>;
    return {
      port: typeof obj.port === 'number' ? obj.port : 3000,
      serverPort:
        typeof obj.serverPort === 'number' ? obj.serverPort : undefined,
    };
  } catch {
    return { port: 3000 };
  }
}

const projectConfig = readProjectConfig();

export const config = {
  /** Fastify server port. Uses serverPort if available, otherwise port + 2. */
  port: projectConfig.serverPort ?? projectConfig.port + 2,

  /** Docker sandbox name. */
  sandboxName: process.env.SANDBOX_NAME ?? 'my-sandbox',

  /** Workspace path inside the Docker sandbox. */
  sandboxWorkspace: process.env.SANDBOX_WORKSPACE ?? '/workspace',
} as const;
