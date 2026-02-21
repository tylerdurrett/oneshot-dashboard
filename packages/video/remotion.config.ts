import fs from 'node:fs';
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

// Remotion CLI loads config via esbuild as CJS, so import.meta.url is unavailable.
// Use a CJS-safe dirname derivation instead.
const configDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(configDir, '../..');

try {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'),
  );
  Config.setStudioPort(config.port + 1);
} catch {
  Config.setStudioPort(3001);
}

Config.overrideWebpackConfig((currentConfiguration) => {
  return enableTailwind(currentConfiguration);
});
