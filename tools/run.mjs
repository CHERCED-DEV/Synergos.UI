#!/usr/bin/env node

/**
 * tools/run.mjs — Run toolchain binaries from root node_modules.
 *
 * Resolves tool binaries (vite, vitest, eslint, nx, tsc, etc.) from the
 * workspace root's node_modules/.bin/ and spawns them with the caller's CWD.
 *
 * This allows platform directories to keep only framework-core dependencies
 * locally — all shared tooling (vite, vitest, eslint, typescript, nx, etc.)
 * lives in root package.json and is resolved from here.
 *
 * Usage (from any CWD within the monorepo):
 *   node ../../tools/run.mjs vite build
 *   node ../../tools/run.mjs vitest run --config vitest.config.ts
 *   node ../../tools/run.mjs eslint src/
 *   node ../../tools/run.mjs nx run-many --target=build --projects=tag:framework:react
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = resolve(ROOT, 'node_modules', '.bin');

const [tool, ...toolArgs] = process.argv.slice(2);

if (!tool) {
  console.error('Usage: node tools/run.mjs <tool> [args...]');
  process.exit(1);
}

// On Windows, node_modules/.bin/ contains .cmd wrappers
const cmdPath = resolve(BIN_DIR, `${tool}.cmd`);
const shPath  = resolve(BIN_DIR, tool);
const binPath = process.platform === 'win32' && existsSync(cmdPath) ? cmdPath : shPath;

const env = { ...process.env };

// For Nx: ensure clean workspace discovery and no daemon overhead
if (tool === 'nx') {
  env.NX_WORKSPACE_ROOT_PATH ??= '';
  env.NX_DAEMON ??= 'false';
  env.NX_TUI ??= 'false';
}

const result = spawnSync(binPath, toolArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  shell: true,
  env,
});

process.exit(result.status ?? 1);
