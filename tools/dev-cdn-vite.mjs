#!/usr/bin/env node

/**
 * dev-cdn-vite.mjs — CDN-native development mode for Vite-based elements
 *                     (React, Svelte, Vanilla)
 *
 * Watches element source files via `npx vite build --watch`, syncs output
 * directly to LOCAL_CDN so the CMS sees updates without a manual publish step.
 *
 * Usage:
 *   node tools/dev-cdn-vite.mjs --element=hero --framework=react
 *   node tools/dev-cdn-vite.mjs --element=hero,card --framework=svelte
 *   node tools/dev-cdn-vite.mjs --element=hero --framework=vanilla --livereload
 *
 * How it works:
 *   1. Resolves Nx projects via tags (element:<name> + framework:<fw>)
 *   2. Builds target element(s) with Vite (IIFE output)
 *   3. Copies output to LOCAL_CDN/<element>/<framework>/latest/
 *   4. Starts `vite build --watch` → auto-rebuild on change
 *   5. Watches dist/ output → auto-sync to CDN
 *   6. (optional) LiveReload WS server for instant browser refresh
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createDevSignal, LIVERELOAD_CLIENT_JS } from './lib/livereload.mjs';
import { ROOT, ALL_FRAMEWORKS, resolveCdnRoot } from './lib/synergos-config.mjs';
import { getArg } from './lib/cli-utils.mjs';

// ── Paths ────────────────────────────────────────────────────────────────────

const CDN_ROOT = resolveCdnRoot(getArg('cdn'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const ELEMENT_ARG   = getArg('element');
const FRAMEWORK_ARG = getArg('framework');
const LIVERELOAD    = args.includes('--livereload');

if (!ELEMENT_ARG || !FRAMEWORK_ARG) {
  console.error('\n  Usage: node tools/dev-cdn-vite.mjs --element=hero --framework=react\n');
  process.exit(1);
}

if (!ALL_FRAMEWORKS.includes(FRAMEWORK_ARG) || FRAMEWORK_ARG === 'angular') {
  console.error(`\n  ❌ Framework must be one of: react, svelte, vanilla`);
  console.error(`     (For Angular, use: node tools/dev-cdn.mjs --element=hero)\n`);
  process.exit(1);
}

const elementNames = ELEMENT_ARG.split(',').map((e) => e.trim());
const PLATFORM_DIR = resolve(ROOT, 'platforms', FRAMEWORK_ARG);
const NX_BIN = resolve(PLATFORM_DIR, 'node_modules/.bin/nx');

// ── Resolve short names → Nx project names ───────────────────────────────────

/** Map from short name (hero) → Nx name (react-hero) */
const projectMap = new Map();

async function resolveProjectNames() {
  for (const name of elementNames) {
    try {
      const result = await runCommand(NX_BIN, [
        'show', 'projects',
        `--projects=tag:element:${name}`,
        `--projects=tag:framework:${FRAMEWORK_ARG}`,
      ]);
      const nxName = result.trim();
      if (!nxName) throw new Error(`No project with tags element:${name} + framework:${FRAMEWORK_ARG}`);
      projectMap.set(name, nxName);
    } catch {
      console.error(`  ❌ Cannot resolve Nx project for "${name}" [${FRAMEWORK_ARG}]. Check tags in project.json`);
      process.exit(1);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function distPath(element) {
  // Vite-based platforms: dist/<element>/main.js
  return resolve(PLATFORM_DIR, 'dist', element, 'main.js');
}

function cdnPath(element) {
  return resolve(CDN_SYNERGOS, element, FRAMEWORK_ARG, 'latest');
}

function syncToCdn(element) {
  const src = distPath(element);
  const dest = cdnPath(element);

  if (!existsSync(src)) {
    console.log(`  ⚠ ${element}: dist not found, skipping sync`);
    return false;
  }

  mkdirSync(dest, { recursive: true });

  // If LiveReload is active, inject the WS client into the bundle
  if (liveReload) {
    const code = readFileSync(src, 'utf-8') + LIVERELOAD_CLIENT_JS;
    writeFileSync(join(dest, 'main.js'), code);
  } else {
    copyFileSync(src, join(dest, 'main.js'));
  }

  // Copy sourcemap if present
  const srcMap = src + '.map';
  if (existsSync(srcMap)) {
    copyFileSync(srcMap, join(dest, 'main.js.map'));
  }

  const now = new Date().toLocaleTimeString();
  console.log(`  ✓ ${element} [${FRAMEWORK_ARG}] → CDN  [${now}]`);
  if (liveReload) liveReload.touch();
  return true;
}

function runCommand(cmd, cmdArgs, options = {}) {
  return new Promise((resolveP, reject) => {
    const proc = spawn(cmd, cmdArgs, {
      stdio: options.inherit ? 'inherit' : 'pipe',
      shell: true,
      cwd: options.cwd || PLATFORM_DIR,
      env: {
        ...process.env,
        NX_WORKSPACE_ROOT_PATH: '',
        NX_DAEMON: 'false',
      },
    });

    let stdout = '';
    if (!options.inherit && proc.stdout) {
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
    }
    if (!options.inherit && proc.stderr) {
      proc.stderr.on('data', (d) => { process.stderr.write(d); });
    }

    proc.on('close', (code) => {
      if (code === 0) resolveP(stdout);
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

// ── Phase 1: Initial build + sync ───────────────────────────────────────────

async function initialBuild() {
  for (const element of elementNames) {
    const nxProject = projectMap.get(element);
    console.log(`  🔨 Building ${element} → ${nxProject}...`);
    try {
      await runCommand(NX_BIN, [
        'build', nxProject,
        '--skip-nx-cache',
      ], { inherit: true });
      syncToCdn(element);
    } catch (err) {
      console.error(`  ❌ Build failed for ${element}:`, err.message);
    }
  }
}

// ── Phase 2: Watch dist/ for changes and sync to CDN ────────────────────────

function startDistWatcher() {
  const watchers = new Map();

  for (const element of elementNames) {
    const distDir = resolve(PLATFORM_DIR, 'dist', element);

    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true });
    }

    let debounce = null;
    const watcher = fsWatch(distDir, { recursive: false }, (eventType, filename) => {
      if (filename !== 'main.js') return;
      clearTimeout(debounce);
      debounce = setTimeout(() => syncToCdn(element), 300);
    });

    watchers.set(element, watcher);
  }

  return watchers;
}

// ── Phase 3: Start Vite build --watch ───────────────────────────────────────

const watchProcs = [];

function startWatchBuild() {
  for (const element of elementNames) {
    const nxProject = projectMap.get(element);
    console.log(`  👁 ${element} → ${nxProject} (watch mode)`);

    const proc = spawn(NX_BIN, [
      'serve', nxProject,
    ], {
      stdio: 'inherit',
      shell: true,
      cwd: PLATFORM_DIR,
      env: {
        ...process.env,
        NX_WORKSPACE_ROOT_PATH: '',
        NX_DAEMON: 'false',
      },
    });

    proc.on('error', (err) => {
      console.error(`  ❌ watch failed for ${element}:`, err.message);
    });

    watchProcs.push(proc);
  }
}

// ── Phase 4 (optional): LiveReload via CDN polling ─────────────────────────

/** @type {{ touch: () => void, clean: () => void } | null} */
let liveReload = null;

function initLiveReload() {
  if (!LIVERELOAD) return;
  liveReload = createDevSignal(CDN_SYNERGOS);
  liveReload.touch();
  console.log(`  📡 LiveReload via CDN polling (__dev.json) — auto-injected into bundles\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Synergos Dev CDN Mode (Vite)`);
  console.log(`   Elements  : ${elementNames.join(', ')}`);
  console.log(`   Framework : ${FRAMEWORK_ARG}`);
  console.log(`   CDN       : ${CDN_SYNERGOS}`);
  console.log('─'.repeat(60));

  await resolveProjectNames();
  for (const [short, nx] of projectMap) {
    console.log(`  📦 ${short} → ${nx}`);
  }

  await initialBuild();

  console.log('─'.repeat(60));
  console.log('  Starting watch mode...\n');

  initLiveReload();
  const watchers = startDistWatcher();
  startWatchBuild();

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n  🛑 Stopping dev-cdn-vite...');
    for (const p of watchProcs) p.kill();
    for (const [, w] of watchers) w.close();
    if (liveReload) liveReload.clean();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    for (const p of watchProcs) p.kill();
    for (const [, w] of watchers) w.close();
    if (liveReload) liveReload.clean();
    process.exit(0);
  });
}

try {
  await main();
} catch (err) {
  console.error('\n[dev-cdn-vite]', err.message);
  process.exit(1);
}
