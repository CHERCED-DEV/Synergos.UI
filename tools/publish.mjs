#!/usr/bin/env node

/**
 * Synergos CDN Publish Script — Multi-framework
 *
 * Scans dist/ directories of ALL platforms and publishes to LOCAL_CDN
 * with framework-namespaced paths to avoid collisions.
 *
 * CDN structure:
 *   synergos/<element>/<framework>/latest/main.js
 *   synergos/<element>/<framework>/latest/manifest.json
 *   synergos/registry.json  ← global index
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
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');

// Framework dist configurations: where each framework puts its built bundles
const PLATFORMS = [
  {
    name: 'angular',
    distDir: resolve(ROOT, 'platforms/angular/dist'),
    // Angular puts bundles at dist/<element>/browser/main.js
    bundlePath: (elementName) => join('angular', 'dist', elementName, 'browser', 'main.js'),
    resolveBundlePath: (elementName) =>
      resolve(ROOT, 'platforms/angular/dist', elementName, 'browser', 'main.js'),
  },
  {
    name: 'react',
    distDir: resolve(ROOT, 'platforms/react/dist'),
    // React puts bundles at dist/<element>/main.js
    bundlePath: (elementName) => join('react', 'dist', elementName, 'main.js'),
    resolveBundlePath: (elementName) =>
      resolve(ROOT, 'platforms/react/dist', elementName, 'main.js'),
  },
  {
    name: 'svelte',
    distDir: resolve(ROOT, 'platforms/svelte/dist'),
    bundlePath: (elementName) => join('svelte', 'dist', elementName, 'main.js'),
    resolveBundlePath: (elementName) =>
      resolve(ROOT, 'platforms/svelte/dist', elementName, 'main.js'),
  },
  {
    name: 'vanilla',
    distDir: resolve(ROOT, 'platforms/vanilla/dist'),
    bundlePath: (elementName) => join('vanilla', 'dist', elementName, 'main.js'),
    resolveBundlePath: (elementName) =>
      resolve(ROOT, 'platforms/vanilla/dist', elementName, 'main.js'),
  },
];

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

// ── Discover and publish ─────────────────────────────────────────────────────

console.log(`\n📦 Synergos CDN Publish (multi-framework)`);
console.log(`   CDN target: ${CDN_SYNERGOS}`);
console.log(`   Version:    ${VERSION}\n`);

const published = [];
const skipped = [];

for (const entry of registry) {
  let elementPublished = false;

  for (const platform of PLATFORMS) {
    const bundlePath = platform.resolveBundlePath(entry.name);

    if (!existsSync(bundlePath)) continue;

    // CDN path: synergos/<element>/<framework>/latest/
    const targetDir = join(CDN_SYNERGOS, entry.name, platform.name, 'latest');
    mkdirSync(targetDir, { recursive: true });

    copyFileSync(bundlePath, join(targetDir, 'main.js'));

    const manifest = {
      alias: entry.alias,
      tag: entry.tag,
      framework: platform.name,
      entryScript: 'main.js',
      version: VERSION,
    };
    writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    published.push({ ...entry, framework: platform.name });
    elementPublished = true;
    console.log(`   ✅ ${entry.name} [${platform.name}] → ${entry.tag}`);
  }

  if (!elementPublished) {
    skipped.push(entry.name);
  }
}

// ── Generate global registry.json ────────────────────────────────────────────

if (published.length > 0) {
  // Group by element name to list all available frameworks
  const byElement = new Map();
  for (const item of published) {
    if (!byElement.has(item.name)) {
      byElement.set(item.name, {
        alias: item.alias,
        tag: item.tag,
        name: item.name,
        tier: item.tier,
        frameworks: [],
      });
    }
    byElement.get(item.name).frameworks.push({
      framework: item.framework,
      path: `/synergos/${item.name}/${item.framework}/latest/main.js`,
    });
  }

  const globalRegistry = {
    version: VERSION,
    baseUrl: '/synergos',
    artifacts: [...byElement.values()],
  };

  mkdirSync(CDN_SYNERGOS, { recursive: true });
  writeFileSync(
    join(CDN_SYNERGOS, 'registry.json'),
    JSON.stringify(globalRegistry, null, 2),
  );

  console.log(`\n   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n   Published: ${published.length} bundles`);
if (skipped.length > 0) {
  console.log(`   Skipped (not built): ${skipped.length} — ${skipped.join(', ')}`);
}
console.log('');
