import assert from 'node:assert/strict';
import test from 'node:test';

// The shared module uses process.platform to dispatch, so we test by
// importing it and checking the shape of the return value. We can't easily
// mock platform in node:test, but we can verify that the function returns
// the correct shape on the current platform.

import { readHostCredentials } from '../lib/read-host-credentials.mjs';

test('readHostCredentials returns an object with ok property', () => {
  const result = readHostCredentials();
  assert.equal(typeof result.ok, 'boolean');

  if (result.ok) {
    assert.notEqual(result.credentials, undefined);
  } else {
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0);
  }
});

test('readHostCredentials returns a result matching the current platform', () => {
  const result = readHostCredentials();

  if (process.platform === 'darwin') {
    // On macOS, it either succeeds (Keychain has credentials) or fails with a Keychain message
    if (!result.ok) {
      assert.ok(
        result.message.includes('Keychain') || result.message.includes('credentials'),
        `Expected Keychain-related message, got: ${result.message}`,
      );
    }
  } else if (process.platform === 'linux') {
    // On Linux, it either succeeds (file exists) or fails with a file-related message
    if (!result.ok) {
      assert.ok(
        result.message.includes('Credential file') || result.message.includes('credentials'),
        `Expected file-related message, got: ${result.message}`,
      );
    }
  } else {
    // On unsupported platforms, should always fail
    assert.equal(result.ok, false);
    assert.ok(result.message.includes('Unsupported platform'));
  }
});
