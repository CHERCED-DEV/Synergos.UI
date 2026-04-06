#!/usr/bin/env node

/**
 * dev-cdn-stop.mjs — Gracefully stop all running dev-cdn processes.
 *
 * Creates a `__dev-stop` signal file in the CDN directory.
 * All running dev-cdn / dev-cdn-vite processes watch for this file
 * and trigger their cleanup() when they detect it.
 *
 * Usage:
 *   node tools/dev-cdn-stop.mjs
 *   npm run dev:stop
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { requestStop, readDevServers } from './lib/dev-servers.mjs';
import { resolveCdnRoot } from './lib/synergos-config.mjs';
import { getArg } from './lib/cli-utils.mjs';

const CDN_ROOT = resolveCdnRoot(getArg('cdn'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');

const servers = readDevServers(CDN_SYNERGOS);
const count = Object.keys(servers).length;

if (count === 0) {
  console.log('\n  ℹ  No dev servers running.\n');
  process.exit(0);
}

console.log(`\n  🛑 Sending stop signal to ${count} dev server(s):`);
for (const [name, info] of Object.entries(servers)) {
  console.log(`     • ${name} (${info.framework || '?'}, pid ${info.pid || '?'})`);
}

requestStop(CDN_SYNERGOS);
console.log('  ✓ Stop signal sent (__dev-stop). Processes will shut down gracefully.\n');
