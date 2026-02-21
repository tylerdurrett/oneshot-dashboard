import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getTargetPorts,
  parseLsofPids,
  readDevPortFromConfig,
} from '../stop-dev-processes.mjs';

test('readDevPortFromConfig returns configured port when valid', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-dev-valid-'));
  const configPath = path.join(tempDir, 'project.config.json');

  fs.writeFileSync(configPath, JSON.stringify({ port: 4200 }));
  assert.equal(readDevPortFromConfig(configPath), 4200);
});

test('readDevPortFromConfig falls back to default for missing/invalid config', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-dev-fallback-'));
  const missingConfigPath = path.join(tempDir, 'missing.config.json');
  const invalidConfigPath = path.join(tempDir, 'project.config.json');

  fs.writeFileSync(invalidConfigPath, JSON.stringify({ port: 'not-a-number' }));

  assert.equal(readDevPortFromConfig(missingConfigPath), 3000);
  assert.equal(readDevPortFromConfig(invalidConfigPath), 3000);
});

test('getTargetPorts includes web, studio, and server ports', () => {
  assert.deepEqual(getTargetPorts(3300), [3300, 3301, 3302]);
});

test('parseLsofPids parses, filters, and deduplicates pids', () => {
  const output = '\n123\n456\n123\nabc\n-4\n0\n';
  assert.deepEqual(parseLsofPids(output), [123, 456]);
});
