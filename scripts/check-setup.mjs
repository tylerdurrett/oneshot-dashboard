#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getActiveServiceManager } from './lib/service-status.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '..', 'project.config.json');

if (!fs.existsSync(configPath)) {
  if (process.stdin.isTTY) {
    console.log('');
    console.log('  project.config.json not found — running setup first...');
    console.log('');
    execFileSync(process.execPath, [path.resolve(__dirname, 'setup.mjs')], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
  } else {
    console.log('');
    console.log('  Tip: Run `pnpm hello` to pick a custom port.');
    console.log('  Starting on the default port (4900) for now.');
    console.log('');
  }
}

// Warn when a service manager is already running the app. Starting a second
// instance will fail with EADDRINUSE, and agents that pkill processes will
// just see them respawn immediately.
const serviceManager = getActiveServiceManager();
if (serviceManager) {
  console.error('');
  console.error(`  ⚠ oneshot-dashboard is already running via ${serviceManager}.`);
  console.error('');
  console.error('  Starting another instance will fail (EADDRINUSE).');
  console.error('  The service uses tsx watch — code changes are picked up automatically.');
  console.error('');
  console.error('  What to do instead:');
  console.error('    • Nothing — your code changes are already live via hot reload.');
  console.error('    • pnpm service:restart — full restart (kills old process, starts fresh).');
  console.error('    • pnpm service:uninstall — stop the service, then run pnpm go manually.');
  console.error('');
  process.exit(1);
}
