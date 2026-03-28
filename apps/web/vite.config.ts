import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeatures } from '@repo/features';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read project.config.json once and derive ports + feature flags. */
function getProjectConfig() {
  try {
    const configPath = path.resolve(__dirname, '../../project.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const basePort = config.port ?? 4900;
    return {
      webPort: basePort,
      serverPort: config.serverPort ?? basePort + 2,
      features: parseFeatures(config.features),
    };
  } catch {
    return { webPort: 4900, serverPort: 4902, features: parseFeatures(undefined) };
  }
}

const { webPort, serverPort, features } = getProjectConfig();

export default defineConfig({
  plugins: [react()],

  envPrefix: 'VITE_',

  // Inject server port and feature flags so they're available via import.meta.env.
  define: {
    'import.meta.env.VITE_SERVER_PORT': JSON.stringify(String(serverPort)),
    'import.meta.env.VITE_FEATURE_TIMERS': JSON.stringify(features.timers),
    'import.meta.env.VITE_FEATURE_CHAT': JSON.stringify(features.chat),
    'import.meta.env.VITE_FEATURE_VIDEO': JSON.stringify(features.video),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@repo/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@repo/features': path.resolve(__dirname, '../../packages/features/src'),
    },
  },

  server: {
    port: webPort,
    host: true, // LAN / Tailscale access (equivalent to Next.js -H 0.0.0.0)
  },
});
