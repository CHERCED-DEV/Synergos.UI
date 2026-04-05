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

import { existsSync, copyFileSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NG_DIR = resolve(ROOT, 'platforms/angular');
const CDN_ROOT = resolve(process.env.SYNERGOS_CDN || String.raw`C:\LOCAL_CDN`);
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const NX_BIN = resolve(NG_DIR, 'node_modules/.bin/nx');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, fallback = null) {
  const found = args.find((a) => a.startsWith(`--${flag}=`));
  return found ? found.slice(`--${flag}=`.length) : fallback;
}

const ELEMENT_ARG = getArg('element');
const SKIP_RUNTIME = args.includes('--skip-runtime');
const LIVERELOAD = args.includes('--livereload');

if (!ELEMENT_ARG) {
  console.error('\n  Usage: node tools/dev-cdn.mjs --element=hero\n');
  process.exit(1);
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
  copyFileSync(src, join(dest, 'main.js'));

  if (existsSync(srcMap)) {
    copyFileSync(srcMap, join(dest, 'main.js.map'));
  }

  const now = new Date().toLocaleTimeString();
  console.log(`  ✓ ${element} → CDN  [${now}]`);
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
  for (const element of elementNames) {
    const nxProject = projectMap.get(element);
    console.log(`  🔨 Building ${element} → ${nxProject} (cdn-dev)...`);
    try {
      await runCommand(NX_BIN, [
        'build', nxProject,
        '-c', 'cdn-dev',
        '--skip-nx-cache',
      ], { inherit: true });
      syncToCdn(element);
    } catch (err) {
      console.error(`  ❌ Build failed for ${element}:`, err.message);
    }
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

// ── Phase 4: Start Angular build --watch (no daemon needed) ─────────────────

function startWatchBuild() {
  // Use Angular's native --watch flag — esbuild incremental rebuilds (~200ms)
  // No nx daemon required. Watches source files + dependencies automatically.
  for (const element of elementNames) {
    const nxProject = projectMap.get(element);
    console.log(`  👁 ${element} → ${nxProject} (watch mode)`);

    const proc = spawn(NX_BIN, [
      'build', nxProject,
      '-c', 'cdn-dev',
      '--watch',
      '--skip-nx-cache',
    ], {
      stdio: 'inherit',
      shell: true,
      cwd: NG_DIR,
      env: {
        ...process.env,
        NX_WORKSPACE_ROOT_PATH: '',
        NX_DAEMON: 'false',
        NX_TUI: 'false',
      },
    });

    proc.on('error', (err) => {
      console.error(`  ❌ watch failed for ${element}:`, err.message);
    });

    // Store for cleanup
    watchProcs.push(proc);
  }
}

const watchProcs = [];

// ── Phase 5 (optional): LiveReload server ───────────────────────────────────

// Tiny WebSocket server that sends "reload" when CDN files change.
// The CMS page includes a small script that connects and reloads on message.
// This is a future enhancement — for now, manual browser refresh works.

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

  const watchers = startDistWatcher();
  startWatchBuild();

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n  🛑 Stopping dev-cdn...');
    for (const p of watchProcs) p.kill();
    for (const [, w] of watchers) w.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    for (const p of watchProcs) p.kill();
    for (const [, w] of watchers) w.close();
    process.exit(0);
  });
}

try {
  await main();
} catch (err) {
  console.error('\n[dev-cdn]', err.message);
  process.exit(1);
}
