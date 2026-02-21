#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultPort = 3000;
const signalWaitMs = 750;

export function readDevPortFromConfig(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const port = Number(config?.port);
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
      return port;
    }
    return defaultPort;
  } catch {
    return defaultPort;
  }
}

export function getTargetPorts(devPort) {
  return [devPort, devPort + 1];
}

export function parseLsofPids(output) {
  const pids = output
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(pids)];
}

export function findListeningPidsOnPort(port) {
  try {
    const output = execFileSync(
      'lsof',
      ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    );
    return parseLsofPids(output);
  } catch (error) {
    if (error?.status === 1) {
      return [];
    }

    if (error?.code === 'ENOENT') {
      throw new Error('`lsof` is required to run `pnpm stop`.');
    }

    throw error;
  }
}

export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return false;
    }

    return true;
  }
}

export function killPids(pids, signal) {
  const signaled = [];

  for (const pid of pids) {
    try {
      process.kill(pid, signal);
      signaled.push(pid);
    } catch (error) {
      if (error?.code === 'ESRCH') {
        continue;
      }
      throw error;
    }
  }

  return signaled;
}

function formatPortPidLine(port, pids) {
  const plural = pids.length > 1 ? 's' : '';
  return `  - Port ${port}: PID${plural} ${pids.join(', ')}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const configPath = path.join(root, 'project.config.json');
  const devPort = readDevPortFromConfig(configPath);
  const [webPort, studioPort] = getTargetPorts(devPort);

  const pidMap = new Map();
  for (const port of [webPort, studioPort]) {
    pidMap.set(port, findListeningPidsOnPort(port));
  }

  const allPids = [...new Set([...pidMap.values()].flat())];

  if (allPids.length === 0) {
    console.log(
      `No running dev/studio processes found on ports ${webPort} and ${studioPort}.`,
    );
    return;
  }

  console.log(`Found running processes on ports ${webPort} and ${studioPort}:`);
  for (const [port, pids] of pidMap.entries()) {
    if (pids.length > 0) {
      console.log(formatPortPidLine(port, pids));
    }
  }

  const terminated = killPids(allPids, 'SIGTERM');
  if (terminated.length > 0) {
    console.log(`Sent SIGTERM to PID(s): ${terminated.join(', ')}`);
  }

  await wait(signalWaitMs);

  const stubborn = allPids.filter((pid) => isPidAlive(pid));
  if (stubborn.length > 0) {
    killPids(stubborn, 'SIGKILL');
    console.log(`Force-killed PID(s): ${stubborn.join(', ')}`);
  }

  console.log('Done.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `Failed to stop dev/studio processes: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  });
}
