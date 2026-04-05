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
 * @param {{ includeAngular?: boolean, includeVite?: boolean }} options
 */
export async function selectFramework({ includeAngular = true, includeVite = true } = {}) {
  const choices = [];
  if (includeAngular) choices.push({ name: 'Angular',  value: 'angular' });
  if (includeVite)    choices.push({ name: 'React',    value: 'react' });
  if (includeVite)    choices.push({ name: 'Svelte',   value: 'svelte' });
  if (includeVite)    choices.push({ name: 'Vanilla',  value: 'vanilla' });

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

  // Group by tier for visual clarity
  const choices = elements.map((p) => ({
    name: elementLabel(p),
    value: p.element,
    checked: false,
  }));

  const selected = await checkbox({
    message: `📦 Select elements (${elements.length} available):`,
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
 * Prompt for skip-runtime toggle (Angular only).
 */
export async function askSkipRuntime() {
  return confirm({
    message: '⏩ Skip runtime check? (use if runtime already published)',
    default: true,
  });
}

/**
 * Full interactive flow for dev-cdn (Angular).
 * Returns parsed args object matching what the scripts expect.
 */
export async function interactiveDevCdn() {
  console.log('\n  🚀 Synergos Dev CDN — Interactive Mode\n');

  const elements = await selectElements('angular');
  const livereload = await askLiveReload();
  const skipRuntime = await askSkipRuntime();

  console.log('');
  console.log('  ─'.repeat(30));
  console.log(`  Elements   : ${elements.join(', ')}`);
  console.log(`  LiveReload : ${livereload ? 'yes' : 'no'}`);
  console.log(`  Runtime    : ${skipRuntime ? 'skip' : 'verify'}`);
  console.log('  ─'.repeat(30));
  console.log('');

  return { elements, livereload, skipRuntime };
}

/**
 * Full interactive flow for dev-cdn-vite (React/Svelte/Vanilla).
 * Returns parsed args object matching what the scripts expect.
 */
export async function interactiveDevCdnVite() {
  console.log('\n  🚀 Synergos Dev CDN (Vite) — Interactive Mode\n');

  const framework = await selectFramework({ includeAngular: false, includeVite: true });
  const elements = await selectElements(framework);
  const livereload = await askLiveReload();

  console.log('');
  console.log('  ─'.repeat(30));
  console.log(`  Framework  : ${framework}`);
  console.log(`  Elements   : ${elements.join(', ')}`);
  console.log(`  LiveReload : ${livereload ? 'yes' : 'no'}`);
  console.log('  ─'.repeat(30));
  console.log('');

  return { framework, elements, livereload };
}

/**
 * Full interactive flow that picks Angular vs Vite-based.
 * Returns { mode, ...args } where mode is 'angular' or 'vite'.
 */
export async function interactiveDevCdnFull() {
  console.log('\n  🚀 Synergos Dev CDN — Interactive Mode\n');

  const framework = await selectFramework();
  const elements = await selectElements(framework);
  const livereload = await askLiveReload();
  const skipRuntime = framework === 'angular' ? await askSkipRuntime() : false;

  console.log('');
  console.log('  ─'.repeat(30));
  console.log(`  Framework  : ${framework}`);
  console.log(`  Elements   : ${elements.join(', ')}`);
  console.log(`  LiveReload : ${livereload ? 'yes' : 'no'}`);
  if (framework === 'angular') {
    console.log(`  Runtime    : ${skipRuntime ? 'skip' : 'verify'}`);
  }
  console.log('  ─'.repeat(30));
  console.log('');

  return { framework, elements, livereload, skipRuntime };
}
