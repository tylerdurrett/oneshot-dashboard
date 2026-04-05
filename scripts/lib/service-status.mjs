/**
 * Detect whether the oneshot-dashboard service is managed by
 * a system service manager (launchd on macOS, systemd on Linux).
 *
 * Shared by check-setup.mjs and stop-dev-processes.mjs.
 */

import { execFileSync } from 'node:child_process';

// Must match LAUNCHD_LABEL in scripts/launchd-common.sh
const LAUNCHD_LABEL = 'com.tdogmini.oneshot-dashboard';

// Must match SYSTEMD_SERVICE_NAME in scripts/systemd-common.sh
const SYSTEMD_SERVICE_NAME = 'oneshot-dashboard';

export function isLaunchdManaged() {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('launchctl', ['print', `gui/${process.getuid()}/${LAUNCHD_LABEL}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function isSystemdManaged() {
  if (process.platform !== 'linux') return false;
  try {
    const output = execFileSync(
      'systemctl',
      ['--user', 'is-active', `${SYSTEMD_SERVICE_NAME}.service`],
      { encoding: 'utf8', stdio: 'pipe' },
    ).trim();
    return output === 'active';
  } catch {
    return false;
  }
}

/** Returns 'launchd' | 'systemd' | null depending on which service manager is active. */
export function getActiveServiceManager() {
  if (isLaunchdManaged()) return 'launchd';
  if (isSystemdManaged()) return 'systemd';
  return null;
}
