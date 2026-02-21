#!/usr/bin/env node

/**
 * One Shot — Project Setup
 * Run with: pnpm hello
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Utilities ──────────────────────────────────────────────

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findAvailablePort(start = 3000, step = 100, maxAttempts = 20) {
  const unavailable = [];
  for (let i = 0; i < maxAttempts; i++) {
    const port = start + i * step;
    if (await isPortAvailable(port)) {
      return { port, unavailable };
    }
    unavailable.push(port);
  }
  return { port: null, unavailable };
}

function writeProjectConfig(port) {
  const configPath = path.join(ROOT, 'project.config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  config.port = port;
  config.serverPort = port + 2;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

// ── Setup Steps ────────────────────────────────────────────

const steps = [
  {
    name: 'Port Configuration',
    run: async (rl) => {
      console.log('  Scanning for available ports...');

      const { port: suggested, unavailable } = await findAvailablePort();

      if (suggested === null) {
        console.log('  Could not find an open port in the 3000\u20134900 range.');
        console.log('  You can enter any port number.\n');
      } else if (unavailable.length > 0) {
        console.log(
          `  Port ${suggested} is available (${unavailable.join(', ')} in use).\n`,
        );
      } else {
        console.log(`  Port ${suggested} is available.\n`);
      }

      const defaultPort = suggested ?? 3000;
      const answer = await ask(
        rl,
        `  Which port should the dev server use? [${defaultPort}] `,
      );
      const port = parseInt(answer, 10) || defaultPort;

      writeProjectConfig(port);

      console.log(`\n  Saved port ${port} to project.config.json`);
      console.log(`  Dev server on port ${port}, Remotion Studio on ${port + 1}, Agent server on ${port + 2}`);
      return { port };
    },
  },
];

// ── Main ───────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  One Shot \u2014 Project Setup');
  console.log('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (const step of steps) {
      await step.run(rl);
    }
  } finally {
    rl.close();
  }

  console.log('');
  console.log('  Setup complete! Run `pnpm dev` to start developing.');
  console.log('');
}

main().catch((err) => {
  console.error('\n  Setup failed:', err.message);
  process.exit(1);
});
