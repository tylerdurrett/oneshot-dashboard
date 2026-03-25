import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read project.config.json once and derive both ports (convention: never hardcode ports). */
function getProjectPorts(): { webPort: number; serverPort: number } {
  try {
    const configPath = path.resolve(__dirname, '../../project.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const basePort = config.port ?? 4900;
    return {
      webPort: basePort,
      serverPort: config.serverPort ?? basePort + 2,
    };
  } catch {
    return { webPort: 4900, serverPort: 4902 };
  }
}

const { webPort, serverPort } = getProjectPorts();

export default defineConfig({
  plugins: [react()],

  envPrefix: 'VITE_',

  // Inject server port so it's available via import.meta.env.VITE_SERVER_PORT.
  define: {
    'import.meta.env.VITE_SERVER_PORT': JSON.stringify(String(serverPort)),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@repo/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },

  server: {
    port: webPort,
    host: true, // LAN / Tailscale access (equivalent to Next.js -H 0.0.0.0)
  },
});
