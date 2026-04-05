#!/usr/bin/env node

/**
 * dev-cdn.mjs — CDN-native development mode for Angular Elements
 *
 * Watches element source files, rebuilds on change, and syncs the output
 * directly to LOCAL_CDN so the CMS sees updates without a manual publish step.
 *
 * Usage:
 *   node tools/dev-cdn.mjs --element=hero
 *   node tools/dev-cdn.mjs --element=hero,card,footer
 *   node tools/dev-cdn.mjs --element=hero --skip-runtime
 *   node tools/dev-cdn.mjs --element=hero --livereload
 *
 * How it works:
 *   1. Verifies runtime bundles exist in CDN (builds if missing)
 *   2. Builds the target element(s) with "cdn-dev" config (externals + sourcemaps)
 *   3. Copies output to LOCAL_CDN
 *   4. Starts nx watch on element + dependencies → auto-rebuild on change
 *   5. Watches dist/ output → auto-sync to CDN on each build
 *
 * Requirements:
 *   - Runtime must be published to CDN at least once (npm run publish:runtime)
 *   - The "cdn-dev" configuration must exist in nx.json (externals + sourcemaps)
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createDevSignal, LIVERELOAD_CLIENT_JS } from './lib/livereload.mjs';
import { interactiveDevCdn } from './lib/interactive.mjs';

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NG_DIR = resolve(ROOT, 'platforms/angular');
const CDN_ROOT = resolve(process.env.SYNERGOS_CDN || String.raw`C:\LOCAL_CDN`);
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const NX_BIN = resolve(NG_DIR, 'node_modules/.bin/nx');

// ── CLI args (or interactive mode) ───────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, fallback = null) {
  const found = args.find((a) => a.startsWith(`--${flag}=`));
  return found ? found.slice(`--${flag}=`.length) : fallback;
}

let ELEMENT_ARG = getArg('element');
let SKIP_RUNTIME = args.includes('--skip-runtime');
let LIVERELOAD = args.includes('--livereload');

// No args → interactive mode
if (!ELEMENT_ARG) {
  const answers = await interactiveDevCdn();
  ELEMENT_ARG = answers.elements.join(',');
  LIVERELOAD = answers.livereload;
  SKIP_RUNTIME = answers.skipRuntime;
}

const elementNames = ELEMENT_ARG.split(',').map((e) => e.trim());

// ── Resolve short names → Nx project names ───────────────────────────────────

/** Map from short name (hero) → Nx name (elements-modules-hero) */
const projectMap = new Map();

async function resolveProjectNames() {
  for (const name of elementNames) {
    try {
      const result = await runCommand(NX_BIN, [
        'show', 'projects', `--projects=tag:element:${name}`,
      ]);
      const nxName = result.trim();
      if (!nxName) throw new Error(`No project with tag element:${name}`);
      projectMap.set(name, nxName);
    } catch {
      console.error(`  ❌ Cannot resolve Nx project for "${name}". Check element:${name} tag in project.json`);
      process.exit(1);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function distPath(element) {
  return resolve(NG_DIR, 'dist', element, 'browser', 'main.js');
}

function distMapPath(element) {
  return resolve(NG_DIR, 'dist', element, 'browser', 'main.js.map');
}

function cdnPath(element) {
  return resolve(CDN_SYNERGOS, element, 'angular', 'latest');
}

function syncToCdn(element) {
  const src = distPath(element);
  const srcMap = distMapPath(element);
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

  if (existsSync(srcMap)) {
    copyFileSync(srcMap, join(dest, 'main.js.map'));
  }

  const now = new Date().toLocaleTimeString();
  console.log(`  ✓ ${element} → CDN  [${now}]`);
  if (liveReload) liveReload.touch();
  return true;
}

function runCommand(cmd, cmdArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, {
      stdio: options.inherit ? 'inherit' : 'pipe',
      shell: true,
      cwd: options.cwd || NG_DIR,
      env: {
        ...process.env,
        NX_WORKSPACE_ROOT_PATH: '',
        NX_DAEMON: 'false',
        NX_TUI: 'false',
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
      if (code === 0) resolve(stdout);
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

// ── Phase 1: Verify runtime ─────────────────────────────────────────────────

async function verifyRuntime() {
  if (SKIP_RUNTIME) {
    console.log('  ⏩ Runtime check skipped (--skip-runtime)');
    return;
  }

  const importMapPath = resolve(CDN_ROOT, 'synergos', 'runtime', 'angular', 'latest', 'import-map.json');

  if (existsSync(importMapPath)) {
    console.log('  ✓ Runtime import-map found in CDN');
  } else {
    console.log('  ⚠ Runtime not found in CDN — building and publishing...');
    await runCommand('node', ['tools/build-runtime.mjs'], { cwd: ROOT, inherit: true });
    await runCommand('node', ['tools/publish-runtime.mjs'], { cwd: ROOT, inherit: true });
    console.log('  ✓ Runtime published to CDN');
  }
}

// ── Phase 2: Initial build + sync ───────────────────────────────────────────

async function initialBuild() {
  const nxProjects = elementNames.map((e) => projectMap.get(e)).join(',');
  console.log(`  🔨 Building ${elementNames.length} element(s) (cdn-dev)...`);
  try {
    await runCommand(NX_BIN, [
      'run-many',
      '--target=build',
      `--projects=${nxProjects}`,
      '-c', 'cdn-dev',
      '--skip-nx-cache',
      '--parallel=4',
    ], { inherit: true });
    for (const element of elementNames) {
      syncToCdn(element);
    }
  } catch (err) {
    console.error(`  ❌ Build failed:`, err.message);
  }
}

// ── Phase 3: Watch dist/ for changes and sync to CDN ────────────────────────

function startDistWatcher() {
  const watchers = new Map();

  for (const element of elementNames) {
    const distDir = resolve(NG_DIR, 'dist', element, 'browser');

    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true });
    }

    // Debounce: esbuild may write multiple times rapidly
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

// ── Phase 4: Single nx watch → rebuild only affected projects ────────────────

function startWatchBuild() {
  const nxProjects = elementNames.map((e) => projectMap.get(e)).join(',');

  // Single nx watch process — monitors the dep graph and rebuilds only
  // the project(s) affected by each file change.
  // {projectName} is replaced by Nx with the affected project name at runtime.
  console.log(`  👁 Watching ${elementNames.length} element(s) via single nx watch`);

  const proc = spawn(NX_BIN, [
    'watch',
    `--projects=${nxProjects}`,
    '--includeDependentProjects',
    '--',
    NX_BIN, 'build', '{projectName}',
    '-c', 'cdn-dev',
    '--skip-nx-cache',
  ], {
    stdio: 'inherit',
    shell: true,
    cwd: NG_DIR,
    env: {
      ...process.env,
      NX_WORKSPACE_ROOT_PATH: '',
      NX_DAEMON: 'true',
      NX_TUI: 'false',
    },
  });

  proc.on('error', (err) => {
    console.error(`  ❌ nx watch failed:`, err.message);
  });

  watchProcs.push(proc);
}

const watchProcs = [];

// ── Phase 5 (optional): LiveReload via CDN polling ─────────────────────────

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
  console.log(`\n🚀 Synergos Dev CDN Mode`);
  console.log(`   Elements : ${elementNames.join(', ')}`);
  console.log(`   CDN      : ${CDN_SYNERGOS}`);
  console.log(`   Config   : cdn-dev (externals + sourcemaps)`);
  console.log('─'.repeat(60));

  await resolveProjectNames();
  for (const [short, nx] of projectMap) {
    console.log(`  📦 ${short} → ${nx}`);
  }

  await verifyRuntime();
  await initialBuild();

  console.log('─'.repeat(60));
  console.log('  Starting watch mode...\n');

  initLiveReload();
  const watchers = startDistWatcher();
  startWatchBuild();

  // Cleanup on exit
  const cleanup = () => {
    console.log('\n  🛑 Stopping dev-cdn...');
    for (const p of watchProcs) p.kill();
    for (const [, w] of watchers) w.close();
    if (liveReload) liveReload.clean();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

try {
  await main();
} catch (err) {
  console.error('\n[dev-cdn]', err.message);
  process.exit(1);
}
