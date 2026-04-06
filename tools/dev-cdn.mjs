#!/usr/bin/env node

/**
 * dev-cdn.mjs — CDN-native development mode for Angular Elements
 *
 * Uses Angular's native --watch flag for sub-second incremental rebuilds,
 * then syncs output to LOCAL_CDN so the CMS sees updates instantly.
 *
 * Usage:
 *   node tools/dev-cdn.mjs --element=hero
 *   node tools/dev-cdn.mjs --element=hero,card
 *   node tools/dev-cdn.mjs --element=hero --skip-runtime
 *   node tools/dev-cdn.mjs --element=hero --livereload
 *
 * How it works:
 *   1. Verifies runtime bundles exist in CDN (builds if missing)
 *   2. Launches `nx build <project> -c cdn-dev --watch` per element
 *      → Angular's builder stays alive in memory (no plugin worker re-spawns)
 *      → Incremental rebuilds in <1s (vs 15-30s with run-many)
 *   3. Watches dist/ output → auto-sync to CDN on each rebuild
 *   4. Optional LiveReload via CDN polling
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, watch as fsWatch, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { createDevSignal, LIVERELOAD_CLIENT_JS } from './lib/livereload.mjs';
import { registerDevServer, unregisterDevServer, watchStopSignal, clearStopSignal } from './lib/dev-servers.mjs';
import { DEFAULT_CDN_ORIGIN } from './lib/synergos-config.mjs';
import { interactiveDevCdn } from './lib/interactive.mjs';

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NG_DIR = resolve(ROOT, 'platforms/angular');
const CDN_ROOT = resolve(process.env.SYNERGOS_CDN || String.raw`C:\LOCAL_CDN`);
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const NX_BIN = resolve(NG_DIR, 'node_modules', 'nx', 'bin', 'nx.js');

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
      const result = await runCommand('node', [NX_BIN,
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

function distDir(element) {
  return resolve(NG_DIR, 'dist', element, 'browser');
}

function distPath(element) {
  return resolve(distDir(element), 'main.js');
}

function cdnPath(element) {
  return resolve(CDN_SYNERGOS, element, 'angular', 'latest');
}

function syncToCdn(element) {
  const src = distPath(element);
  const srcMap = src + '.map';
  const dest = cdnPath(element);

  if (!existsSync(src)) return false;

  mkdirSync(dest, { recursive: true });

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

/** Clean env — strips every NX_* var so the root workspace cannot bleed in. */
function cleanEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('NX_')),
  );
  env.NX_PLUGIN_NO_TIMEOUTS = 'true';
  env.NX_DAEMON = 'false';
  env.NX_TUI    = 'false';
  return env;
}

/** Kill any Nx daemons that could interfere (root + nested workspace). */
function stopNxDaemons() {
  const env = cleanEnv();
  const rootNx = resolve(ROOT, 'node_modules', 'nx', 'bin', 'nx.js');
  try { execSync(`node "${NX_BIN}" daemon --stop`, { cwd: NG_DIR, stdio: 'ignore', env, timeout: 10_000 }); } catch {}
  try { execSync(`node "${rootNx}" daemon --stop`, { cwd: ROOT, stdio: 'ignore', env, timeout: 10_000 }); } catch {}
}

/** Run a command and return stdout (for short-lived commands like show projects). */
function runCommand(cmd, cmdArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, {
      stdio: options.inherit ? 'inherit' : 'pipe',
      shell: true,
      cwd: options.cwd || NG_DIR,
      env: cleanEnv(),
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

// ── Phase 2: Launch `nx build --watch` per element ──────────────────────────
// Angular's @angular/build:application with --watch keeps the compiler alive
// in memory.  Incremental rebuilds are sub-second (no Nx plugin workers
// re-spawned, no full project graph recalculation).

/** @type {import('child_process').ChildProcess[]} */
const watchProcesses = [];

function launchWatchBuilders() {
  for (const [element, nxProject] of projectMap) {
    console.log(`  🔨 ${element} → nx build ${nxProject} -c cdn-dev --watch`);

    const proc = spawn('node', [
      NX_BIN, 'build', nxProject,
      '-c', 'cdn-dev',
      '--watch',
    ], {
      cwd: NG_DIR,
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    // Forward output with element prefix
    proc.stdout.on('data', (d) => {
      const text = d.toString();
      process.stdout.write(text);
    });
    proc.stderr.on('data', (d) => {
      process.stderr.write(d.toString());
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`  ❌ ${element} watcher exited with code ${code}`);
      }
    });

    watchProcesses.push(proc);
  }
}

// ── Phase 3: Watch dist/ output → sync to CDN ──────────────────────────────
// When the Angular builder writes new output, we copy it to the CDN.

function startDistWatchers() {
  const watchers = [];

  for (const element of elementNames) {
    const dir = distDir(element);

    // Create dist dir if it doesn't exist yet (first build will create it)
    mkdirSync(dir, { recursive: true });

    // Track last mtime to avoid duplicate syncs
    let lastMtime = 0;
    let debounce = null;

    const watcher = fsWatch(dir, { recursive: false }, (_event, filename) => {
      if (!filename || !filename.endsWith('main.js')) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const file = distPath(element);
        if (!existsSync(file)) return;
        const mtime = statSync(file).mtimeMs;
        if (mtime <= lastMtime) return;   // same file, skip
        lastMtime = mtime;
        syncToCdn(element);
      }, 300);
    });

    watchers.push(watcher);
  }

  return watchers;
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
  console.log(`\n🚀 Synergos Dev CDN Mode`);
  console.log(`   Elements : ${elementNames.join(', ')}`);
  console.log(`   CDN      : ${CDN_SYNERGOS}`);
  console.log(`   Config   : cdn-dev (externals + sourcemaps)`);
  console.log(`   Strategy : Angular native --watch (sub-second rebuilds)`);
  console.log('─'.repeat(60));

  // Kill stale daemons before any Nx calls
  stopNxDaemons();

  await resolveProjectNames();
  for (const [short, nx] of projectMap) {
    console.log(`  📦 ${short} → ${nx}`);
  }

  // Register in __dev-servers.json — CMS picks up overrides via FileSystemWatcher
  for (const [element] of projectMap) {
    const devUrl = `${DEFAULT_CDN_ORIGIN}/synergos/${element}/angular/latest`;
    registerDevServer(CDN_SYNERGOS, element, devUrl, 'angular');
  }
  console.log(`  📡 ${elementNames.length} element(s) registered in __dev-servers.json`);

  await verifyRuntime();

  console.log('─'.repeat(60));
  console.log('  Launching watch builders...\n');

  initLiveReload();
  const distWatchers = startDistWatchers();
  launchWatchBuilders();

  console.log(`\n  ✓ ${elementNames.length} builder(s) running — edit any .ts/.html/.scss and CDN updates automatically`);
  console.log('  Press q + Enter to stop\n');

  // Cleanup on exit
  const cleanup = () => {
    console.log('\n  🛑 Stopping dev-cdn...');
    for (const proc of watchProcesses) {
      try { proc.kill(); } catch {}
    }
    for (const w of distWatchers) w.close();
    if (liveReload) liveReload.clean();
    for (const element of elementNames) {
      unregisterDevServer(CDN_SYNERGOS, element);
    }
    clearStopSignal(CDN_SYNERGOS);
    stopWatcher.close();
    process.exit(0);
  };

  // Watch for graceful stop signal (__dev-stop file)
  const stopWatcher = watchStopSignal(CDN_SYNERGOS, () => {
    console.log('\n  📩 Stop signal received — shutting down gracefully...');
    cleanup();
  });

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Listen for 'q' on stdin to stop from this terminal
  process.stdin.setEncoding('utf-8');
  process.stdin.resume();
  process.stdin.on('data', (key) => {
    if (key.trim().toLowerCase() === 'q') {
      cleanup();
    }
  });
}

try {
  await main();
} catch (err) {
  console.error('\n[dev-cdn]', err.message);
  process.exit(1);
}
