#!/usr/bin/env node

/**
 * Restores the PostgreSQL database from the most recent backup.
 * Usage:
 *   pnpm db:restore          — restores the latest backup
 *   pnpm db:restore <file>   — restores a specific backup file
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, '..', 'packages', 'db', 'backups');

const pgUrl = process.env.DATABASE_URL ?? 'postgresql://oneshot:oneshot@localhost:5432/oneshot';

if (!fs.existsSync(backupDir)) {
  console.error('  No backups directory found. Nothing to restore.');
  process.exit(1);
}

const backups = fs.readdirSync(backupDir)
  .filter((f) => f.startsWith('backup-') && f.endsWith('.pgdump'))
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

try {
  execSync(`pg_restore --clean --if-exists -d "${pgUrl}" "${backupPath}"`, {
    stdio: 'inherit',
  });
  console.log('  Done. Restart the dev server to pick up the restored database.');
} catch (err) {
  // pg_restore exits non-zero for warnings (e.g., objects that don't exist yet
  // when using --clean). The restore usually succeeds anyway.
  console.warn(`  pg_restore finished with warnings: ${err.message}`);
  console.log('  Check your data — the restore likely succeeded despite warnings.');
}
