import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..', '..');

test('turbo passes through WSL interop env vars', () => {
  const raw = fs.readFileSync(path.join(root, 'turbo.json'), 'utf8');
  const turbo = JSON.parse(raw);
  const vars = turbo.globalPassThroughEnv;

  assert.ok(Array.isArray(vars), 'globalPassThroughEnv should be present');
  assert.ok(vars.includes('WSL_DISTRO_NAME'));
  assert.ok(vars.includes('WSL_INTEROP'));
  assert.ok(vars.includes('WSLENV'));
});
