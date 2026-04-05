/**
 * Pure functions for building Docker Sandbox CLI commands.
 * Extracted so the command construction is testable independently
 * of the spawn/exec calls that use them.
 *
 * Note: There is no `docker sandbox start` command. Resuming a
 * stopped sandbox uses `docker sandbox run <name>` — the same
 * subcommand used for creation.
 */

/**
 * Build args for resuming a stopped sandbox.
 * @param {string} name - sandbox name
 * @returns {string[]} args for spawn('docker', ...)
 */
export function buildStartArgs(name) {
  return ['sandbox', 'run', name];
}

/**
 * Build args for creating a new sandbox.
 * @param {string} name - sandbox name
 * @param {string} workspace - host workspace path
 * @returns {string[]} args for spawn('docker', ...)
 */
export function buildCreateArgs(name, workspace) {
  return ['sandbox', 'run', '--name', name, 'claude', workspace];
}

/**
 * Parse `docker sandbox list` output to find a sandbox by name.
 * @param {string} output - raw stdout from `docker sandbox list`
 * @param {string} name - sandbox name to find
 * @returns {{ exists: boolean, status: string | null }}
 */
export function parseSandboxList(output, name) {
  for (const line of output.split('\n')) {
    // Columns: NAME  AGENT  STATUS  WORKSPACE (separated by 2+ spaces)
    const cols = line.trim().split(/\s{2,}/);
    if (cols[0] === name) {
      return { exists: true, status: cols[2]?.toLowerCase() ?? 'unknown' };
    }
  }
  return { exists: false, status: null };
}
