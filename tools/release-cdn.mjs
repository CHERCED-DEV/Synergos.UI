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
let framework   = getArg('framework') || 'angular';   // la purga dejó una
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

/**
 * El build de una lista de elementos, con el motor de la purga.
 *
 * Antes esto resolvía tags de Nx a nombres de proyecto y lanzaba run-many
 * (con parada de daemons incluida, porque Nx los dejaba colgados). Ahora el
 * nombre del elemento ES el nombre de la carpeta —la misma fuente de verdad
 * que usa tools/build.mjs— así que la resolución desaparece: se pasa la lista
 * tal cual con --solo. Un elemento inexistente hace fallar el build con la
 * lista de lo que no encontró, que es el mismo aviso que daba resolveNxProjects.
 */
function buildElements(elementList) {
  const cwd = resolve(ROOT, 'platforms/angular');
  const cmd = `node tools/build.mjs --solo=${elementList.join(',')}`;
  return run(cmd, `Building ${elementList.length} element(s) [angular]`, cwd);
}

// ── Release flows ────────────────────────────────────────────────────────────

async function releaseElements() {
  console.log(`\n  📦 Releasing ${elements.length} element(s) [${framework}]...\n`);

  // 1. Build — el nombre del elemento es el nombre de la carpeta; sin resolución
  if (!buildElements(elements)) return false;

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
  console.log('\n  🔥 Full release — Angular + runtime...\n');
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
