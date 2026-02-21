#!/usr/bin/env node

/**
 * One Shot — New Video Composition Scaffolder
 * Run with: pnpm new-video <CompositionName>
 *
 * Creates a new Remotion composition file and registers it in Root.tsx.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VIDEO_PKG = path.join(ROOT, 'packages', 'video');
const COMPOSITIONS_DIR = path.join(VIDEO_PKG, 'src', 'compositions');
const ROOT_TSX = path.join(VIDEO_PKG, 'src', 'Root.tsx');
const INDEX_TS = path.join(VIDEO_PKG, 'src', 'index.ts');

const name = process.argv[2];

if (!name) {
  console.error('');
  console.error('  Usage: pnpm new-video <CompositionName>');
  console.error('  Example: pnpm new-video LogoReveal');
  console.error('');
  process.exit(1);
}

if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
  console.error(`  Error: "${name}" must be PascalCase (e.g., MyAnimation)`);
  process.exit(1);
}

const compositionPath = path.join(COMPOSITIONS_DIR, `${name}.tsx`);

if (fs.existsSync(compositionPath)) {
  console.error(`  Error: ${name}.tsx already exists in compositions/`);
  process.exit(1);
}

// 1. Create composition file
const template = `import type React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const ${name}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const scale = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill className="flex items-center justify-center bg-black">
      <div
        style={{ opacity, transform: \`scale(\${scale})\` }}
        className="text-5xl font-bold text-white"
      >
        ${name}
      </div>
    </AbsoluteFill>
  );
};
`;

fs.writeFileSync(compositionPath, template);
console.log(`  Created: packages/video/src/compositions/${name}.tsx`);

// 2. Register in Root.tsx
let rootContent = fs.readFileSync(ROOT_TSX, 'utf8');

// Add import after the last composition import
const importLine = `import { ${name} } from './compositions/${name}';`;
const lastCompImportRegex = /import .+ from '\.\/compositions\/.+';/g;
let lastMatch = null;
let match;
while ((match = lastCompImportRegex.exec(rootContent)) !== null) {
  lastMatch = match;
}

if (lastMatch) {
  const insertPos = lastMatch.index + lastMatch[0].length;
  rootContent =
    rootContent.slice(0, insertPos) +
    '\n' +
    importLine +
    rootContent.slice(insertPos);
} else {
  // Fallback: add import at top after other imports
  const lastImportIdx = rootContent.lastIndexOf('import ');
  const lineEnd = rootContent.indexOf('\n', lastImportIdx);
  rootContent =
    rootContent.slice(0, lineEnd + 1) +
    importLine +
    '\n' +
    rootContent.slice(lineEnd + 1);
}

// Add Composition entry before the closing fragment
const compositionEntry = `      <Composition
        id="${name}"
        component={${name}}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />`;

rootContent = rootContent.replace('    </>', compositionEntry + '\n    </>');
fs.writeFileSync(ROOT_TSX, rootContent);
console.log('  Registered in Root.tsx');

// 3. Add to barrel exports in index.ts
let indexContent = fs.readFileSync(INDEX_TS, 'utf8');

// Add export after the last composition export
const exportLine = `export { ${name} } from './compositions/${name}';`;
const lastCompExportRegex = /export .+ from '\.\/compositions\/.+';/g;
let lastExportMatch = null;
while ((match = lastCompExportRegex.exec(indexContent)) !== null) {
  lastExportMatch = match;
}

if (lastExportMatch) {
  const insertPos = lastExportMatch.index + lastExportMatch[0].length;
  indexContent =
    indexContent.slice(0, insertPos) +
    '\n' +
    exportLine +
    indexContent.slice(insertPos);
} else {
  indexContent = exportLine + '\n' + indexContent;
}

// Add to compositions metadata object
const compositionsObjEnd = indexContent.indexOf('} as const');
if (compositionsObjEnd !== -1) {
  const metadataEntry = `  ${name}: {\n    id: '${name}',\n    durationInFrames: 90,\n    fps: 30,\n    width: 1920,\n    height: 1080,\n  },\n`;
  indexContent =
    indexContent.slice(0, compositionsObjEnd) +
    metadataEntry +
    indexContent.slice(compositionsObjEnd);
}

fs.writeFileSync(INDEX_TS, indexContent);
console.log('  Added to index.ts exports');

console.log('');
console.log(
  `  Done! Open packages/video/src/compositions/${name}.tsx to start editing.`,
);
console.log('  Run `pnpm studio` to preview in Remotion Studio.');
console.log('');
