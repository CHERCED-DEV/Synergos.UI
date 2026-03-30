#!/usr/bin/env node

import { select, checkbox } from '@inquirer/prompts';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, relative } from 'path';

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

// ── CLI Flow ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  🔧 Synergos UI — Multi-Framework CLI\n');

  const projects = await discoverProjects();

  // Step 1: Action
  const action = await select({
    message: 'What do you want to do?',
    choices: [
      { name: 'Build', value: 'build' },
      { name: 'Test', value: 'test' },
      { name: 'Lint', value: 'lint' },
      { name: 'Graph', value: 'graph' },
      { name: 'Setup (npm install)', value: 'setup' },
    ],
  });

  if (action === 'graph') {
    console.log('\n  Opening Nx graph...\n');
    execSync('npx nx graph', { cwd: WORKSPACE_ROOT, stdio: 'inherit' });
    return;
  }

  // Step 2: Framework
  const frameworks = unique(projects.map((p) => p.framework).filter((f) => f !== 'unknown'));

  const framework = await select({
    message: 'Which framework?',
    choices: [
      { name: 'All frameworks', value: 'all' },
      ...frameworks.map((f) => ({ name: f.charAt(0).toUpperCase() + f.slice(1), value: f })),
    ],
  });

  if (action === 'setup') {
    const dirs = framework === 'all' ? frameworks : [framework];
    for (const dir of dirs) {
      if (dir === 'agnostic') continue;
      console.log(`\n  Installing deps for ${dir}...\n`);
      try {
        execSync('npm install', { cwd: resolve(WORKSPACE_ROOT, dir), stdio: 'inherit' });
      } catch {
        console.error(`  Failed to install deps for ${dir}`);
      }
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
      ],
    });
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

  // Step 5: Execute
  const projectNames = selected.map((p) => p.name).join(',');
  const cmd = `npx nx run-many --target=${action} --projects=${projectNames}`;
  console.log(`\n  Running: ${cmd}\n`);

  // Determine which directory to run from
  const uniqueFrameworks = unique(selected.map((p) => p.framework));
  const cwd = uniqueFrameworks.length === 1 && uniqueFrameworks[0] !== 'agnostic'
    ? resolve(WORKSPACE_ROOT, uniqueFrameworks[0])
    : WORKSPACE_ROOT;

  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

main().catch(console.error);
