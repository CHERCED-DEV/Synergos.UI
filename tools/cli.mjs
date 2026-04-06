#!/usr/bin/env node

import { select, checkbox, confirm } from '@inquirer/prompts';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, relative } from 'path';
import { interactiveDevCdnFull } from './lib/interactive.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')));
const WORKSPACE_ROOT = resolve(ROOT, '..');

// ── Discover projects ──────────────────────────────────────────────────────

async function discoverProjects() {
  const files = await glob('**/project.json', {
    cwd: WORKSPACE_ROOT,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  return files.map((f) => {
    const fullPath = resolve(WORKSPACE_ROOT, f);
    const json = JSON.parse(readFileSync(fullPath, 'utf8'));
    const tags = json.tags || [];
    const dir = dirname(relative(WORKSPACE_ROOT, fullPath));

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

function unique(arr) {
  return [...new Set(arr)].sort();
}

function run(cmd, cwd = WORKSPACE_ROOT) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// ── CLI Flow ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  \u{1F527} Synergos UI \u2014 Multi-Framework CLI\n');

  const projects = await discoverProjects();

  // Step 1: Action
  const action = await select({
    message: 'What do you want to do?',
    choices: [
      { name: '🔥 Dev CDN (hot reload)', value: 'dev-cdn' },
      { name: '🚀 Release to CDN', value: 'release-cdn' },
      { name: 'Build', value: 'build' },
      { name: 'Test', value: 'test' },
      { name: 'Lint', value: 'lint' },
      { name: 'Publish to CDN (no build)', value: 'publish' },
      { name: 'Clean dist', value: 'clean' },
      { name: 'Graph', value: 'graph' },
      { name: 'Setup (npm install)', value: 'setup' },
      { name: '← Salir', value: '__exit' },
    ],
  });

  if (action === '__exit') {
    console.log('\n  👋 Hasta luego.\n');
    return;
  }

  // ── Quick actions (no framework selection needed) ──────────────────────

  if (action === 'dev-cdn') {
    const answers = await interactiveDevCdnFull();
    const elementsArg = answers.elements.join(',');

    if (answers.framework === 'angular') {
      const flags = [
        `--element=${elementsArg}`,
        answers.livereload ? '--livereload' : '',
        answers.skipRuntime ? '--skip-runtime' : '',
      ].filter(Boolean).join(' ');
      run(`node tools/dev-cdn.mjs ${flags}`);
    } else {
      const flags = [
        `--element=${elementsArg}`,
        `--framework=${answers.framework}`,
        answers.livereload ? '--livereload' : '',
      ].filter(Boolean).join(' ');
      run(`node tools/dev-cdn-vite.mjs ${flags}`);
    }
    return;
  }

  if (action === 'release-cdn') {
    run('node tools/release-cdn.mjs');
    return;
  }

  if (action === 'graph') {
    console.log('\n  Opening Nx graph...\n');
    run('npx nx graph');
    return;
  }

  if (action === 'publish') {
    console.log('\n  \u{1F4E6} Publishing to CDN...\n');
    run('node tools/publish.mjs');
    return;
  }

  if (action === 'clean') {
    console.log('\n  \u{1F9F9} Cleaning element dist directories...\n');
    run('node tools/clean-dist.mjs');
    return;
  }

  // ── Framework selection ────────────────────────────────────────────────

  const frameworks = unique(projects.map((p) => p.framework).filter((f) => f !== 'unknown'));

  const framework = await select({
    message: 'Which framework?',
    choices: [
      { name: 'All frameworks', value: 'all' },
      ...frameworks.map((f) => ({ name: f.charAt(0).toUpperCase() + f.slice(1), value: f })),
      { name: '← Volver', value: '__back' },
    ],
  });

  if (framework === '__back') {
    return main(); // restart from beginning
  }

  if (action === 'setup') {
    const dirs = framework === 'all' ? frameworks : [framework];
    for (const dir of dirs) {
      if (dir === 'agnostic') continue;
      console.log(`\n  Installing deps for ${dir}...\n`);
      run('npm install', resolve(WORKSPACE_ROOT, 'platforms', dir));
    }
    return;
  }

  // Filter projects by framework
  let filtered = framework === 'all'
    ? projects
    : projects.filter((p) => p.framework === framework);

  // Step 3: Tier (if applicable and has tiers)
  const tiers = unique(filtered.map((p) => p.tier).filter(Boolean));
  let tier = 'all';

  if (tiers.length > 1) {
    tier = await select({
      message: 'Which tier?',
      choices: [
        { name: 'All tiers', value: 'all' },
        ...tiers.map((t) => ({ name: t.charAt(0).toUpperCase() + t.slice(1), value: t })),
        { name: '← Volver', value: '__back' },
      ],
    });

    if (tier === '__back') {
      return main();
    }
  }

  if (tier !== 'all') {
    filtered = filtered.filter((p) => p.tier === tier);
  }

  // Step 4: Select specific elements (if more than 3)
  let selected = filtered;
  if (filtered.length > 3) {
    const elements = await checkbox({
      message: `Select projects to ${action} (${filtered.length} available):`,
      choices: filtered.map((p) => ({
        name: `${p.name} [${p.framework}${p.tier ? '/' + p.tier : ''}]`,
        value: p.name,
        checked: true,
      })),
    });
    selected = filtered.filter((p) => elements.includes(p.name));
  }

  if (selected.length === 0) {
    console.log('\n  No projects selected.\n');
    return;
  }

  // Summary + confirm
  console.log('');
  console.log('  ─'.repeat(30));
  console.log(`  Action     : ${action}`);
  console.log(`  Framework  : ${framework}`);
  console.log(`  Projects   : ${selected.length} selected`);
  if (selected.length <= 8) {
    console.log(`               ${selected.map((p) => p.element || p.name).join(', ')}`);
  }
  console.log('  ─'.repeat(30));

  const go = await confirm({ message: `▶  Proceed with ${action}?`, default: true });
  if (!go) {
    console.log('\n  ❌ Cancelled.\n');
    return;
  }

  // Step 5: Execute — route to the correct nested workspace per framework
  // Angular/React/Svelte/Vanilla each have their own Nx workspace under platforms/<fw>/
  const byFramework = new Map();
  for (const p of selected) {
    const fw = p.framework || 'unknown';
    if (!byFramework.has(fw)) byFramework.set(fw, []);
    byFramework.get(fw).push(p.name);
  }

  for (const [fw, names] of byFramework) {
    const projectNames = names.join(',');
    const platformDir = resolve(WORKSPACE_ROOT, 'platforms', fw);
    const nxBin = resolve(platformDir, 'node_modules', 'nx', 'bin', 'nx.js');

    // Use the nested workspace's own Nx binary so it finds the projects
    const cmd = `node "${nxBin}" run-many --target=${action} --projects=${projectNames}`;
    console.log(`\n  Running [${fw}]: ${cmd}\n`);
    run(cmd, platformDir);
  }
}

main().catch(console.error);
