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
 *   node tools/publish.mjs --dry-run                # preview without copying
 *   node tools/publish.mjs --element hero            # publish a single element
 *   node tools/publish.mjs --clean                   # clean element dists after publish
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
const INPUTS_JSON   = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');

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

const CDN_ROOT = resolve(getArg('--cdn', process.env.SYNERGOS_CDN || 'C:\\LOCAL_CDN'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const pkgVersion = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')).version;
const VERSION = getArg('--version', pkgVersion);
const DRY_RUN = args.includes('--dry-run');
const CLEAN = args.includes('--clean');
const ELEMENT_FILTER = getArg('--element', null);

// ── Load element registry ────────────────────────────────────────────────────

let registry    = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));
const inputsData  = JSON.parse(readFileSync(INPUTS_JSON,   'utf-8'));

if (ELEMENT_FILTER) {
  const filtered = registry.filter((e) => e.name === ELEMENT_FILTER);
  if (filtered.length === 0) {
    console.error(`\n❌ Element "${ELEMENT_FILTER}" not found in registry.`);
    process.exit(1);
  }
  registry = filtered;
}

// ── Discover and publish ─────────────────────────────────────────────────────

const prefix = DRY_RUN ? '[DRY RUN] ' : '';

console.log(`\n${prefix}📦 Synergos CDN Publish (multi-framework)`);
console.log(`${prefix}   CDN target: ${CDN_SYNERGOS}`);
console.log(`${prefix}   Version:    ${VERSION}`);
if (ELEMENT_FILTER) console.log(`${prefix}   Element:    ${ELEMENT_FILTER}`);
if (CLEAN) console.log(`${prefix}   Clean:      enabled`);
console.log('');

const published = [];
const skipped = [];

for (const entry of registry) {
  let elementPublished = false;

  for (const platform of PLATFORMS) {
    const bundlePath = platform.resolveBundlePath(entry.name);

    if (!existsSync(bundlePath)) continue;

    // CDN path: synergos/<element>/<framework>/latest/
    const targetDir = join(CDN_SYNERGOS, entry.name, platform.name, 'latest');

    const manifest = {
      tag:         entry.tag,
      alias:       entry.alias,
      framework:   platform.name,
      version:     VERSION,
      tier:        entry.tier,
      entryScript: 'main.js',
      inputs:      inputsData[entry.name] ?? [],
    };

    const majorAlias   = `v${VERSION.split('.')[0]}`;

    if (DRY_RUN) {
      console.log(`${prefix}   ✅ ${entry.name} [${platform.name}] → ${entry.tag} (${VERSION} / ${majorAlias})`);
    } else {
      // Publish to exact semver slot (immutable — never overwrite once published)
      const versionedDir = join(CDN_SYNERGOS, entry.name, platform.name, VERSION);
      mkdirSync(versionedDir, { recursive: true });
      copyFileSync(bundlePath, join(versionedDir, 'main.js'));
      writeFileSync(join(versionedDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Publish to major-pinned slot (updated each patch within the major)
      // Production consumers should pin to v{major} for stability
      const majorDir = join(CDN_SYNERGOS, entry.name, platform.name, majorAlias);
      mkdirSync(majorDir, { recursive: true });
      copyFileSync(bundlePath, join(majorDir, 'main.js'));
      writeFileSync(join(majorDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Overwrite latest/ slot (always the newest release — use in staging/dev)
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(bundlePath, join(targetDir, 'main.js'));
      writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      console.log(`   ✅ ${entry.name} [${platform.name}] → ${entry.tag} (${VERSION} | ${majorAlias} | latest)`);
    }

    published.push({ ...entry, framework: platform.name });
    elementPublished = true;
  }

  if (!elementPublished) {
    skipped.push(entry.name);
  }
}

// ── Generate global registry.json ────────────────────────────────────────────

if (published.length > 0) {
  // Group by element name to list all available frameworks and version slots
  const byElement = new Map();
  for (const item of published) {
    if (!byElement.has(item.name)) {
      byElement.set(item.name, {
        name:  item.name,
        alias: item.alias,
        tag:   item.tag,
        tier:  item.tier,
        implementations: {},
      });
    }
    const majorAlias = `v${VERSION.split('.')[0]}`;
    byElement.get(item.name).implementations[item.framework] = {
      latest: VERSION,
      [majorAlias]: VERSION,
    };
  }

  const globalRegistry = {
    generated: new Date().toISOString(),
    version:   VERSION,
    baseUrl:   '/synergos',
    elements:  [...byElement.values()],
  };

  if (DRY_RUN) {
    console.log(`\n${prefix}   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
  } else {
    mkdirSync(CDN_SYNERGOS, { recursive: true });
    writeFileSync(
      join(CDN_SYNERGOS, 'registry.json'),
      JSON.stringify(globalRegistry, null, 2),
    );
    console.log(`\n   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${prefix}   Published: ${published.length} bundles`);
if (skipped.length > 0) {
  console.log(`${prefix}   Skipped (not built): ${skipped.length} — ${skipped.join(', ')}`);
}
console.log('');

// ── Clean element dists (--clean) ───────────────────────────────────────────

if (CLEAN) {
  console.log(`${prefix}🧹 Cleaning element dist directories...\n`);

  // Reload full registry for cleaning (in case --element filtered it)
  const fullRegistry = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));
  let cleanRemoved = 0;

  for (const entry of fullRegistry) {
    for (const platform of PLATFORMS) {
      // For Angular, only remove element dists — preserve libs dist
      const distDir = resolve(ROOT, `platforms/${platform.name}/dist`, entry.name);

      if (!existsSync(distDir)) continue;

      if (DRY_RUN) {
        console.log(`${prefix}   🗑️  ${entry.name} [${platform.name}] → would remove`);
      } else {
        rmSync(distDir, { recursive: true, force: true });
        console.log(`   🗑️  ${entry.name} [${platform.name}] → removed`);
      }
      cleanRemoved++;
    }
  }

  console.log(`\n${prefix}   Cleaned: ${cleanRemoved} dist directories`);
  console.log('');
}
