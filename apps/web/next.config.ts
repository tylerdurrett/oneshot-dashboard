import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

function getServerPort(): number {
  try {
    const configPath = resolve(import.meta.dirname, '../../project.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.serverPort ?? (config.port ? config.port + 2 : 3002);
  } catch {
    return 3002;
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui', '@repo/db', '@repo/video'],
  env: {
    NEXT_PUBLIC_SERVER_PORT: String(getServerPort()),
  },
};

export default nextConfig;
