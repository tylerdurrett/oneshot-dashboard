#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    console.log('  Starting on the default port (3000) for now.');
    console.log('');
  }
}
