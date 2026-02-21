#!/usr/bin/env node

/**
 * Backs up the SQLite database before migrations run.
 * Called automatically via the premigrate lifecycle hook.
 * Keeps the last 5 backups to avoid disk bloat.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'packages', 'db', 'local.db');
const backupDir = path.resolve(__dirname, '..', 'packages', 'db', 'backups');

const MAX_BACKUPS = 5;

if (!fs.existsSync(dbPath)) {
  // No database yet — nothing to back up.
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `local-${timestamp}.db`);

fs.copyFileSync(dbPath, backupPath);
console.log(`  DB backed up → ${path.relative(process.cwd(), backupPath)}`);

// Prune old backups, keeping the newest MAX_BACKUPS.
const backups = fs.readdirSync(backupDir)
  .filter((f) => f.startsWith('local-') && f.endsWith('.db'))
  .sort()
  .reverse();

for (const old of backups.slice(MAX_BACKUPS)) {
  fs.unlinkSync(path.join(backupDir, old));
}
