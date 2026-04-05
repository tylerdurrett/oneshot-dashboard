import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStartArgs, buildCreateArgs, parseSandboxList } from '../lib/sandbox-commands.mjs';

// ── buildStartArgs ─────────────────────────────────────

test('buildStartArgs produces docker sandbox run <name>', () => {
  assert.deepEqual(buildStartArgs('oneshot-sandbox'), ['sandbox', 'run', 'oneshot-sandbox']);
});

// Guard: `docker sandbox start` does not exist — this test prevents regression.
test('buildStartArgs never produces "start" subcommand', () => {
  const args = buildStartArgs('oneshot-sandbox');
  assert.ok(!args.includes('start'), 'docker sandbox start does not exist as a CLI command');
});

// ── buildCreateArgs ────────────────────────────────────

test('buildCreateArgs produces docker sandbox run --name <name> claude <workspace>', () => {
  assert.deepEqual(
    buildCreateArgs('oneshot-sandbox', '/path/to/workspace'),
    ['sandbox', 'run', '--name', 'oneshot-sandbox', 'claude', '/path/to/workspace'],
  );
});

test('buildCreateArgs never produces "start" subcommand', () => {
  const args = buildCreateArgs('test', '/workspace');
  assert.ok(!args.includes('start'), 'docker sandbox start does not exist as a CLI command');
});

// ── parseSandboxList ───────────────────────────────────

test('parseSandboxList finds a running sandbox', () => {
  const output = [
    'SANDBOX             AGENT    STATUS    WORKSPACE',
    'oneshot-sandbox     claude   Running   /path/to/workspace',
  ].join('\n');
  assert.deepEqual(parseSandboxList(output, 'oneshot-sandbox'), {
    exists: true,
    status: 'running',
  });
});

test('parseSandboxList finds a stopped sandbox', () => {
  const output = [
    'SANDBOX             AGENT    STATUS    WORKSPACE',
    'oneshot-sandbox     claude   Stopped   /path/to/workspace',
  ].join('\n');
  assert.deepEqual(parseSandboxList(output, 'oneshot-sandbox'), {
    exists: true,
    status: 'stopped',
  });
});

test('parseSandboxList returns not-found for missing sandbox', () => {
  const output = [
    'SANDBOX             AGENT    STATUS    WORKSPACE',
    'other-sandbox       claude   Running   /other/path',
  ].join('\n');
  assert.deepEqual(parseSandboxList(output, 'oneshot-sandbox'), {
    exists: false,
    status: null,
  });
});

test('parseSandboxList handles empty output', () => {
  assert.deepEqual(parseSandboxList('', 'oneshot-sandbox'), {
    exists: false,
    status: null,
  });
});

test('parseSandboxList picks correct sandbox from multiple entries', () => {
  const output = [
    'SANDBOX                         AGENT    STATUS    WORKSPACE',
    'claude-my-agent                 claude   stopped   /repos/my-agent',
    'oneshot-sandbox                 claude   running   /repos/oneshot/workspace',
    'claude-repo-researcher          claude   stopped   /repos/researcher',
  ].join('\n');
  assert.deepEqual(parseSandboxList(output, 'oneshot-sandbox'), {
    exists: true,
    status: 'running',
  });
});
