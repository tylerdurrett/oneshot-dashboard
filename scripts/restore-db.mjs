#!/usr/bin/env node

/**
 * Restores the SQLite database from the most recent backup.
 * Usage:
 *   pnpm db:restore          — restores the latest backup
 *   pnpm db:restore <file>   — restores a specific backup file
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'packages', 'db', 'local.db');
const backupDir = path.resolve(__dirname, '..', 'packages', 'db', 'backups');

if (!fs.existsSync(backupDir)) {
  console.error('  No backups directory found. Nothing to restore.');
  process.exit(1);
}

const backups = fs.readdirSync(backupDir)
  .filter((f) => f.startsWith('local-') && f.endsWith('.db'))
  .sort()
  .reverse();

if (backups.length === 0) {
  console.error('  No backups found.');
  process.exit(1);
}

const requested = process.argv[2];
let chosen;

if (requested) {
  chosen = backups.find((f) => f === requested || f.includes(requested));
  if (!chosen) {
    console.error(`  No backup matching "${requested}". Available:`);
    backups.forEach((f) => console.log(`    ${f}`));
    process.exit(1);
  }
} else {
  console.log('  Available backups:');
  backups.forEach((f, i) => console.log(`    ${i === 0 ? '→' : ' '} ${f}`));
  chosen = backups[0];
  console.log(`\n  Restoring latest: ${chosen}`);
}

const backupPath = path.join(backupDir, chosen);
fs.copyFileSync(backupPath, dbPath);

// Remove WAL/SHM files so SQLite starts clean
for (const suffix of ['-wal', '-shm', '-journal']) {
  const f = dbPath + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

console.log('  Done. Restart the dev server to pick up the restored database.');
