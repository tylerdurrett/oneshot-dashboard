#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'),
  );
  process.stdout.write(String(config.port + 1));
} catch {
  process.stdout.write('3001');
}
