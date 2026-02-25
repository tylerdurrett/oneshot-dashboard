import fs from 'node:fs';
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

// Remotion CLI loads config via esbuild as CJS, so __dirname is always available.
const root = path.resolve(__dirname, '../..');

try {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'),
  );
  Config.setStudioPort(config.port + 1);
} catch {
  Config.setStudioPort(3001);
}

Config.setShouldOpenBrowser(false);

Config.overrideWebpackConfig((currentConfiguration) => {
  return enableTailwind(currentConfiguration);
});
