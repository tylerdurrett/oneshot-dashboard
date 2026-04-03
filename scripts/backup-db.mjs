#!/usr/bin/env node

/**
 * Backs up the PostgreSQL database before migrations run.
 * Called automatically via the premigrate lifecycle hook.
 * Uses pg_dump custom format (.pgdump). Keeps the last 5 backups.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, '..', 'packages', 'db', 'backups');

const MAX_BACKUPS = 5;

const pgUrl = process.env.DATABASE_URL ?? 'postgresql://oneshot:oneshot@localhost:5432/oneshot';

// Quick connectivity check — skip backup if Postgres isn't running
try {
  execSync(`pg_isready -d "${pgUrl}"`, { stdio: 'ignore' });
} catch {
  // Postgres not running — nothing to back up.
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup-${timestamp}.pgdump`);

try {
  execSync(`pg_dump -Fc "${pgUrl}" -f "${backupPath}"`, { stdio: 'inherit' });
  console.log(`  DB backed up → ${path.relative(process.cwd(), backupPath)}`);
} catch (err) {
  console.warn(`  DB backup failed (non-fatal): ${err.message}`);
  process.exit(0);
}

// Prune old backups, keeping the newest MAX_BACKUPS.
const backups = fs.readdirSync(backupDir)
  .filter((f) => f.startsWith('backup-') && f.endsWith('.pgdump'))
  .sort()
  .reverse();

for (const old of backups.slice(MAX_BACKUPS)) {
  fs.unlinkSync(path.join(backupDir, old));
}
