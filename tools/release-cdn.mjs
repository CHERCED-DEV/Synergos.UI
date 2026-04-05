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

let scope     = getArg('scope');
let framework = getArg('framework');
let elements  = getArg('element')?.split(',').map((e) => e.trim()) || [];
let verify    = !process.argv.includes('--no-verify');
let clean     = process.argv.includes('--clean');

if (!scope) {
  const answers = await interactiveRelease();
  scope     = answers.scope;
  framework = answers.framework;
  elements  = answers.elements;
  verify    = answers.verify;
  clean     = answers.clean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, label) {
  console.log(`\n  ⚡ ${label}`);
  if (DRY_RUN) {
    console.log(`     [DRY RUN] ${cmd}`);
    return true;
  }
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch {
    console.error(`  ❌ Failed: ${label}`);
    return false;
  }
}

function nxBuild(fw, projectNames) {
  const bin = fw === 'angular'
    ? 'npx --prefix platforms/angular nx'
    : `npx --prefix platforms/${fw} nx`;

  return run(
    `${bin} run-many --target=build --projects=${projectNames} --parallel=4`,
    `Building ${projectNames.split(',').length} element(s) [${fw}]`,
  );
}

function resolveNxProjects(fw, elementList) {
  const bin = fw === 'angular'
    ? resolve(ROOT, 'platforms/angular/node_modules/.bin/nx')
    : resolve(ROOT, 'platforms', fw, 'node_modules/.bin/nx');
  const cwd = resolve(ROOT, 'platforms', fw);

  const projects = [];
  for (const el of elementList) {
    try {
      const result = execSync(
        `"${bin}" show projects --projects=tag:element:${el}`,
        { cwd, encoding: 'utf-8', env: { ...process.env, NX_WORKSPACE_ROOT_PATH: '', NX_DAEMON: 'false', NX_TUI: 'false' } },
      ).trim();
      if (result) projects.push(result);
    } catch {
      console.warn(`  ⚠ Could not resolve project for "${el}" [${fw}]`);
    }
  }
  return projects;
}

// ── Release flows ────────────────────────────────────────────────────────────

async function releaseElements() {
  console.log(`\n  📦 Releasing ${elements.length} element(s) [${framework}]...\n`);

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
