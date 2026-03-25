import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read the web port from project.config.json (convention: never hardcode ports). */
function getWebPort(): number {
  try {
    const configPath = path.resolve(__dirname, '../../project.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.port ?? 4900;
  } catch {
    return 4900;
  }
}

/** Read the server (Fastify) port so we can expose it as VITE_SERVER_PORT. */
function getServerPort(): number {
  try {
    const configPath = path.resolve(__dirname, '../../project.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.serverPort ?? (config.port ? config.port + 2 : 4902);
  } catch {
    return 4902;
  }
}

export default defineConfig({
  plugins: [react()],

  envPrefix: 'VITE_',

  // Inject server port so it's available via import.meta.env.VITE_SERVER_PORT
  // even before .env files are updated (section 1.3 will do that).
  define: {
    'import.meta.env.VITE_SERVER_PORT': JSON.stringify(String(getServerPort())),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@repo/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },

  server: {
    port: getWebPort(),
    host: true, // LAN / Tailscale access (equivalent to Next.js -H 0.0.0.0)
  },
});
