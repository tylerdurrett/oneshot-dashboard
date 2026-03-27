import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSandboxExecArgs, isWsl } from '../lib/sandbox-exec.mjs';

test('isWsl detects WSL from env on Linux', () => {
  assert.equal(isWsl({ WSL_DISTRO_NAME: 'Ubuntu' }, 'linux'), true);
  assert.equal(isWsl({}, 'linux'), false);
  assert.equal(isWsl({ WSL_DISTRO_NAME: 'Ubuntu' }, 'darwin'), false);
});

test('buildSandboxExecArgs omits -w on WSL to avoid invalid sandbox cwd', () => {
  const args = buildSandboxExecArgs(
    {
      name: 'oneshot-sandbox',
      workspace: '/home/user/project',
      command: ['claude', 'auth', 'status', '--json'],
    },
    { WSL_DISTRO_NAME: 'Ubuntu' },
    'linux',
  );

  assert.deepEqual(args, [
    'sandbox',
    'exec',
    'oneshot-sandbox',
    'claude',
    'auth',
    'status',
    '--json',
  ]);
});

test('buildSandboxExecArgs keeps -w on non-WSL platforms', () => {
  const args = buildSandboxExecArgs(
    {
      name: 'oneshot-sandbox',
      workspace: '/home/user/project',
      command: ['echo', 'ok'],
    },
    {},
    'darwin',
  );

  assert.deepEqual(args, [
    'sandbox',
    'exec',
    '-w',
    '/home/user/project',
    'oneshot-sandbox',
    'echo',
    'ok',
  ]);
});
