/**
 * Interactive prompt helpers for dev-cdn and other tools.
 *
 * Discovers Nx projects from project.json files and provides
 * @inquirer/prompts-based selection flows for frameworks, elements,
 * and common options like --livereload.
 */

import { select, checkbox, confirm } from '@inquirer/prompts';
import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { ROOT } from './synergos-config.mjs';

// ── Project discovery ────────────────────────────────────────────────────────

/**
 * Discover all Nx projects from project.json files.
 * @returns {Promise<Array<{name:string, path:string, tags:string[], framework:string, tier:string, scope:string, element:string}>>}
 */
export async function discoverProjects() {
  const files = await glob('**/project.json', {
    cwd: ROOT,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  return files.map((f) => {
    const fullPath = resolve(ROOT, f);
    const json = JSON.parse(readFileSync(fullPath, 'utf8'));
    const tags = json.tags || [];
    const dir = dirname(relative(ROOT, fullPath));

    return {
      name: json.name || dir,
      path: dir,
      tags,
      framework: tags.find((t) => t.startsWith('framework:'))?.split(':')[1] || 'unknown',
      tier: tags.find((t) => t.startsWith('tier:'))?.split(':')[1] || '',
      scope: tags.find((t) => t.startsWith('scope:'))?.split(':')[1] || '',
      element: tags.find((t) => t.startsWith('element:'))?.split(':')[1] || '',
    };
  });
}

/**
 * Filter projects that are deployable elements (have an element: tag).
 * @param {string} [framework] — optional framework filter
 */
export async function discoverElements(framework) {
  const projects = await discoverProjects();
  let elements = projects.filter((p) => p.element);
  if (framework) {
    elements = elements.filter((p) => p.framework === framework);
  }
  return elements.sort((a, b) => {
    const fw = a.framework.localeCompare(b.framework);
    if (fw !== 0) return fw;
    const tr = (a.tier || '').localeCompare(b.tier || '');
    if (tr !== 0) return tr;
    return a.element.localeCompare(b.element);
  });
}

// ── Display helpers ──────────────────────────────────────────────────────────

const TIER_ICONS = {
  primitive: '🟢',
  composition: '🔵',
  module: '🟣',
  experience: '🟠',
};

function tierIcon(tier) {
  return TIER_ICONS[tier] || '⚪';
}

function elementLabel(p) {
  return `${tierIcon(p.tier)} ${p.element}  [${p.tier || 'lib'}]`;
}

// ── Interactive flows ────────────────────────────────────────────────────────

/**
 * Prompt user to select a framework.
 * Con una sola plataforma queda casi vacío, y así se queda a propósito: el
 * contrato del CDN conserva el segmento `/angular/` y `FrameworkKind` sigue
 * existiendo, así que reintroducir otra es posible. `includeVite` murió con la
 * purga — pedía react/svelte/vanilla, que ya no existen, y devolvía una lista
 * de opciones VACÍA a quien lo llamara.
 *
 * @param {{ includeCancel?: boolean }} options
 */
export async function selectFramework({ includeCancel = false } = {}) {
  const choices = [{ name: 'Angular', value: 'angular' }];
  if (includeCancel) choices.push({ name: '← Cancelar', value: '__cancel' });

  return select({ message: '🏗  Framework:', choices });
}

/**
 * Prompt user to select one or more elements from the discovered list.
 * @param {string} framework
 * @returns {Promise<string[]>} — array of element short names
 */
export async function selectElements(framework) {
  const elements = await discoverElements(framework);

  if (elements.length === 0) {
    console.error(`\n  ❌ No elements found for framework "${framework}"\n`);
    process.exit(1);
  }

  if (elements.length === 1) {
    console.log(`\n  📦 Auto-selected: ${elements[0].element}\n`);
    return [elements[0].element];
  }

  // Ask: all or pick?
  const mode = await select({
    message: `📦 Elements (${elements.length} available):`,
    choices: [
      { name: `🔥 ALL (${elements.length} elements)`, value: 'all' },
      { name: '🎯 Pick specific elements', value: 'pick' },
    ],
  });

  if (mode === 'all') {
    return elements.map((p) => p.element);
  }

  // Group by tier for visual clarity
  const choices = elements.map((p) => ({
    name: elementLabel(p),
    value: p.element,
    checked: false,
  }));

  const selected = await checkbox({
    message: `Select elements:`,
    choices,
    required: true,
  });

  return selected;
}

/**
 * Prompt for LiveReload toggle.
 */
export async function askLiveReload() {
  return confirm({
    message: '📡 Enable LiveReload (CDN polling)?',
    default: true,
  });
}

/**
 * Full interactive flow that picks Angular vs Vite-based.
 * Returns { mode, ...args } where mode is 'angular' or 'vite'.
 */
export async function interactiveDevCdnFull() {
  console.log('\n  🚀 Synergos Dev CDN — Interactive Mode\n');

  // Ya no se pregunta el framework: sólo Angular publica elementos desde la
  // purga. Ni `skipRuntime`: el dev-cdn lo construye solo si falta, así que
  // «saltárselo» era ofrecer un pie del que tirar.
  const elements = await selectElements('angular');
  const livereload = await askLiveReload();

  console.log('');
  console.log('  ─'.repeat(30));
  console.log(`  Elements   : ${elements.join(', ')}`);
  console.log(`  LiveReload : ${livereload ? 'yes' : 'no'}`);
  console.log('  ─'.repeat(30));
  console.log('');

  return { elements, livereload };
}

// ── Release flows ────────────────────────────────────────────────────────────

/**
 * Interactive release scope selection.
 * Returns { scope, framework?, elements?, verify, clean }
 */
export async function interactiveRelease() {
  console.log('\n  🚀 Synergos CDN Release — Interactive Mode\n');

  const scope = await select({
    message: '📦 Release scope:',
    choices: [
      { name: '🎯 Specific elements',           value: 'elements' },
      { name: '🏗  Entire framework',             value: 'framework' },
      { name: '📚 Runtime only (Angular shared)', value: 'runtime' },
      { name: '🔥 Everything (full release)',     value: 'full' },
      { name: '← Cancelar',                       value: '__cancel' },
    ],
  });

  if (scope === '__cancel') {
    console.log('\n  👋 Cancelado.\n');
    process.exit(0);
  }

  let framework = null;
  let elements = [];

  if (scope === 'elements') {
    framework = await selectFramework({ includeCancel: true });
    if (framework === '__cancel') {
      console.log('\n  👋 Cancelado.\n');
      process.exit(0);
    }
    elements = await selectElements(framework);
  } else if (scope === 'framework') {
    framework = await selectFramework({ includeCancel: true });
    if (framework === '__cancel') {
      console.log('\n  👋 Cancelado.\n');
      process.exit(0);
    }
    // all elements for that framework
    const all = await discoverElements(framework);
    elements = all.map((p) => p.element);
  }

  const rebuildLibs = await confirm({
    message: '📚 Rebuild libs/shared? (solo si cambiaste shared, core o contracts)',
    default: false,
  });

  const verify = await confirm({
    message: '🔍 Verify integrity after publish?',
    default: true,
  });

  const clean = await confirm({
    message: '🧹 Clean dist/ after publish?',
    default: false,
  });

  // Summary
  console.log('');
  console.log('  ─'.repeat(30));
  if (scope === 'full') {
    console.log('  Scope      : FULL RELEASE (all frameworks + runtime)');
  } else if (scope === 'runtime') {
    console.log('  Scope      : Runtime only (Angular shared libs)');
  } else {
    console.log(`  Scope      : ${scope}`);
    console.log(`  Framework  : ${framework}`);
    console.log(`  Elements   : ${elements.length} selected`);
    if (elements.length <= 10) {
      console.log(`               ${elements.join(', ')}`);
    }
  }
  console.log(`  Rebuild libs: ${rebuildLibs ? 'yes' : 'no (cache)'}`);
  console.log(`  Verify     : ${verify ? 'yes' : 'no'}`);
  console.log(`  Clean dist : ${clean ? 'yes' : 'no'}`);
  console.log('  ─'.repeat(30));

  const go = await confirm({
    message: '🚀 Proceed with release?',
    default: true,
  });

  if (!go) {
    console.log('\n  ❌ Release cancelled.\n');
    process.exit(0);
  }

  console.log('');
  return { scope, framework, elements, verify, clean, rebuildLibs };
}
