#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'),
  );
  const serverPort = config.serverPort ?? (config.port ? config.port + 2 : 3002);
  process.stdout.write(String(serverPort));
} catch {
  process.stdout.write('3002');
}
