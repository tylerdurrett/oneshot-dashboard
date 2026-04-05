#!/usr/bin/env node

/**
 * Bundle the MCP server into a single self-contained .mjs file
 * that can run inside the Docker sandbox with just `node`.
 */

import * as esbuild from 'esbuild';
import path from 'node:path';

// Resolve from the server package's node_modules so pnpm hoisting works.
const serverDir = path.resolve('apps/server');

await esbuild.build({
  entryPoints: ['apps/server/src/chat/mcp-server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'apps/server/dist/oneshot-mcp-server.mjs',
  banner: { js: '#!/usr/bin/env node' },
  // Resolve packages from the server package's node_modules first,
  // so pnpm-isolated deps (zod 3.25, @modelcontextprotocol/sdk) are found.
  nodePaths: [path.join(serverDir, 'node_modules')],
});

console.log('  ✓ MCP server bundled → apps/server/dist/oneshot-mcp-server.mjs');
