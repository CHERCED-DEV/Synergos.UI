#!/usr/bin/env node

/**
 * release-cdn.mjs — Interactive CDN release for Synergos elements
 *
 * Orchestrates: build → validate → publish → verify → clean
 * Supports granular releases: single element, multiple, framework, runtime, or full.
 *
 * Usage:
 *   node tools/release-cdn.mjs                                # interactive mode
 *   node tools/release-cdn.mjs --scope=elements --framework=angular --element=hero,card
 *   node tools/release-cdn.mjs --scope=framework --framework=react
 *   node tools/release-cdn.mjs --scope=runtime
 *   node tools/release-cdn.mjs --scope=full
 *   node tools/release-cdn.mjs --scope=elements --framework=angular --element=hero --dry-run
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { interactiveRelease } from './lib/interactive.mjs';
import { getArg } from './lib/cli-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Parse CLI or interactive ─────────────────────────────────────────────────

let scope       = getArg('scope');
let framework   = getArg('framework');
let elements    = getArg('element')?.split(',').map((e) => e.trim()) || [];
let verify      = !process.argv.includes('--no-verify');
let clean       = process.argv.includes('--clean');
let rebuildLibs = process.argv.includes('--rebuild-libs');

if (!scope) {
  const answers = await interactiveRelease();
  scope       = answers.scope;
  framework   = answers.framework;
  elements    = answers.elements;
  verify      = answers.verify;
  clean       = answers.clean;
  rebuildLibs = answers.rebuildLibs;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clean env for running Nx in a nested (per-framework) workspace.
 *  Strips every NX_* var so the root workspace cannot bleed into the child. */
function nxCleanEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('NX_')),
  );
  env.NX_DAEMON              = 'false';
  env.NX_TUI                 = 'false';
  env.NX_PLUGIN_NO_TIMEOUTS  = 'true';
  return env;
}

/** Kill any Nx daemons that could interfere with nested workspace operations. */
function stopNxDaemons(fw) {
  const fwNx = resolve(ROOT, 'platforms', fw, 'node_modules', 'nx', 'bin', 'nx.js');
  const rootNx = resolve(ROOT, 'node_modules', 'nx', 'bin', 'nx.js');
  const env = nxCleanEnv();
  // Stop nested workspace daemon
  try { execSync(`node "${fwNx}" daemon --stop`, { cwd: resolve(ROOT, 'platforms', fw), stdio: 'ignore', env, timeout: 10_000 }); } catch {}
  // Stop root workspace daemon (VS Code Nx Console can start this)
  try { execSync(`node "${rootNx}" daemon --stop`, { cwd: ROOT, stdio: 'ignore', env, timeout: 10_000 }); } catch {}
}

function run(cmd, label, cwd = ROOT, env) {
  console.log(`\n  ⚡ ${label}`);
  if (DRY_RUN) {
    console.log(`     [DRY RUN] ${cmd}`);
    return true;
  }
  try {
    const opts = { cwd, stdio: 'inherit' };
    if (env) opts.env = env;
    execSync(cmd, opts);
    return true;
  } catch {
    console.error(`  ❌ Failed: ${label}`);
    return false;
  }
}

function nxBuild(fw, projectNames) {
  const nxBin = resolve(ROOT, 'platforms', fw, 'node_modules', 'nx', 'bin', 'nx.js');
  const cwd   = resolve(ROOT, 'platforms', fw);

  // When rebuildLibs is false, only build the element itself (deps come from cache)
  const cacheFlag = rebuildLibs ? '--skip-nx-cache' : '';
  const cmd = `node "${nxBin}" run-many --target=build --projects=${projectNames} --parallel=4 ${cacheFlag}`.trim();
  return run(cmd, `Building ${projectNames.split(',').length} element(s) [${fw}]${rebuildLibs ? ' + libs' : ' (libs from cache)'}`, cwd, nxCleanEnv());
}

function resolveNxProjects(fw, elementList) {
  const nxBin = resolve(ROOT, 'platforms', fw, 'node_modules', 'nx', 'bin', 'nx.js');
  const cwd   = resolve(ROOT, 'platforms', fw);

  const projects = [];
  for (const el of elementList) {
    try {
      const result = execSync(
        `node "${nxBin}" show projects --projects=tag:element:${el}`,
        { cwd, encoding: 'utf-8', env: nxCleanEnv(), timeout: 30_000 },
      ).trim();
      if (result) projects.push(result);
    } catch (err) {
      if (err.killed) {
        console.warn(`  ⚠ Timed out resolving "${el}" [${fw}] — is another Nx process running?`);
      } else {
        console.warn(`  ⚠ Could not resolve project for "${el}" [${fw}]`);
      }
    }
  }
  return projects;
}

// ── Release flows ────────────────────────────────────────────────────────────

async function releaseElements() {
  console.log(`\n  📦 Releasing ${elements.length} element(s) [${framework}]...\n`);

  // 0. Kill stale daemons that could interfere with nested workspace
  stopNxDaemons(framework);

  // 1. Build
  const projects = resolveNxProjects(framework, elements);
  if (!projects.length) {
    console.error('  ❌ No Nx projects resolved. Aborting.');
    process.exit(1);
  }
  if (!nxBuild(framework, projects.join(','))) return false;

  // 2. Publish
  const publishFlags = [
    `--framework ${framework}`,
    ...elements.map((e) => `--element ${e}`),
    verify ? '--verify' : '',
    clean ? '--clean' : '',
    DRY_RUN ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  // publish.mjs supports single --element, so loop for multiple
  for (const el of elements) {
    const flags = [
      `--framework ${framework}`,
      `--element ${el}`,
      verify ? '--verify' : '',
      clean ? '--clean' : '',
      DRY_RUN ? '--dry-run' : '',
    ].filter(Boolean).join(' ');

    if (!run(`node tools/publish.mjs ${flags}`, `Publishing ${el} [${framework}]`)) {
      return false;
    }
  }

  return true;
}

async function releaseFramework() {
  console.log(`\n  🏗  Releasing all ${framework} elements...\n`);

  // Build entire framework
  const buildCmd = `npm run build:${framework}`;
  if (!run(buildCmd, `Building ${framework}`)) return false;

  // Build runtime if Angular
  if (framework === 'angular') {
    if (!run('node tools/build-runtime.mjs', 'Building Angular runtime')) return false;
    if (!run('node tools/publish-runtime.mjs', 'Publishing Angular runtime')) return false;
  }

  // Publish all elements for this framework
  const publishFlags = [
    `--framework ${framework}`,
    verify ? '--verify' : '',
    clean ? '--clean' : '',
    DRY_RUN ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  return run(`node tools/publish.mjs ${publishFlags}`, `Publishing all ${framework} elements`);
}

async function releaseRuntime() {
  console.log('\n  📚 Releasing Angular runtime...\n');

  if (!run('node tools/build-runtime.mjs', 'Building Angular runtime')) return false;
  return run(`node tools/publish-runtime.mjs${DRY_RUN ? ' --dry-run' : ''}`, 'Publishing Angular runtime');
}

async function releaseFull() {
  console.log('\n  🔥 Full release — all frameworks + runtime...\n');
  return run(`npm run release`, 'Full release pipeline');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const handlers = {
  elements: releaseElements,
  framework: releaseFramework,
  runtime: releaseRuntime,
  full: releaseFull,
};

const handler = handlers[scope];
if (!handler) {
  console.error(`  ❌ Unknown scope: ${scope}`);
  process.exit(1);
}

const ok = await handler();

if (ok) {
  console.log('\n  ✅ Release complete.\n');
} else {
  console.error('\n  ❌ Release failed.\n');
  process.exit(1);
}
