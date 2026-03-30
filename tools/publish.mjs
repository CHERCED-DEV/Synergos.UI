#!/usr/bin/env node

/**
 * Synergos CDN Publish Script
 *
 * Publishes built Angular Elements to LOCAL_CDN with manifests.
 *
 * Usage:
 *   node tools/publish.mjs                          # default CDN path
 *   node tools/publish.mjs --cdn C:\MY_CDN          # custom CDN path
 *   node tools/publish.mjs --version 0.2.0          # custom version
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const ANGULAR_DIST = resolve(ROOT, 'platforms/angular/dist');
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const CDN_ROOT = resolve(getArg('--cdn', 'C:\\LOCAL_CDN'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const VERSION = getArg('--version', '0.1.0');

// ── Load element registry ────────────────────────────────────────────────────

const registry = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));
const registryByName = Object.fromEntries(registry.map((e) => [e.name, e]));

// ── Discover built artifacts ─────────────────────────────────────────────────

console.log(`\n📦 Synergos CDN Publish`);
console.log(`   Angular dist: ${ANGULAR_DIST}`);
console.log(`   CDN target:   ${CDN_SYNERGOS}`);
console.log(`   Version:      ${VERSION}\n`);

if (!existsSync(ANGULAR_DIST)) {
  console.error(`❌ Angular dist not found at ${ANGULAR_DIST}`);
  console.error(`   Run "npm run build:angular" first.\n`);
  process.exit(1);
}

const published = [];
const skipped = [];

for (const entry of registry) {
  const bundlePath = join(ANGULAR_DIST, entry.name, 'browser', 'main.js');

  if (!existsSync(bundlePath)) {
    skipped.push(entry.name);
    continue;
  }

  // Create CDN directory: synergos/<name>/latest/
  const targetDir = join(CDN_SYNERGOS, entry.name, 'latest');
  mkdirSync(targetDir, { recursive: true });

  // Copy main.js
  const targetJs = join(targetDir, 'main.js');
  copyFileSync(bundlePath, targetJs);

  // Generate manifest.json
  const manifest = {
    alias: entry.alias,
    tag: entry.tag,
    entryScript: 'main.js',
    version: VERSION,
  };
  writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  published.push(entry);
  console.log(`   ✅ ${entry.name} → ${entry.tag}`);
}

// ── Generate global registry.json ────────────────────────────────────────────

if (published.length > 0) {
  const globalRegistry = {
    version: VERSION,
    baseUrl: '/synergos',
    artifacts: published.map((entry) => ({
      alias: entry.alias,
      tag: entry.tag,
      name: entry.name,
      tier: entry.tier,
      path: `/synergos/${entry.name}/latest/main.js`,
      version: VERSION,
    })),
  };

  mkdirSync(CDN_SYNERGOS, { recursive: true });
  writeFileSync(
    join(CDN_SYNERGOS, 'registry.json'),
    JSON.stringify(globalRegistry, null, 2),
  );

  console.log(`\n   📋 registry.json → ${published.length} artifacts`);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n   Published: ${published.length}`);
if (skipped.length > 0) {
  console.log(`   Skipped (not built): ${skipped.length} — ${skipped.join(', ')}`);
}
console.log('');
