/**
 * Build `docker sandbox exec` args safely across macOS, Linux, and WSL2.
 *
 * On WSL2, the sandbox is often created from a Windows/UNC workspace path.
 * Passing the Linux host path back via `-w` makes `docker sandbox exec`
 * chdir to a directory that does not exist inside the sandbox, which causes
 * false "not authenticated" and "sandbox missing" failures.
 */

/**
 * Returns true when the current process is running inside WSL.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {NodeJS.Platform} platform
 */
export function isWsl(env = process.env, platform = process.platform) {
  return platform === 'linux' && typeof env.WSL_DISTRO_NAME === 'string' && env.WSL_DISTRO_NAME.length > 0;
}

/**
 * Build args for `docker sandbox exec`.
 *
 * @param {{ name: string, workspace: string, command: string[] }} options
 * @param {NodeJS.ProcessEnv} env
 * @param {NodeJS.Platform} platform
 */
export function buildSandboxExecArgs(
  { name, workspace, command },
  env = process.env,
  platform = process.platform,
) {
  const args = ['sandbox', 'exec'];

  // Keep the sandbox's default workspace on WSL2. The host Linux path does
  // not necessarily match the internal sandbox mount path.
  if (!isWsl(env, platform)) {
    args.push('-w', workspace);
  }

  args.push(name, ...command);
  return args;
}
