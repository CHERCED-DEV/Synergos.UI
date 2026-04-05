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
 *   synergos/<element>/<framework>/latest/meta.json
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

import { writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

import {
  ROOT, PLATFORMS, loadRegistry, loadInputs, readPackageVersion, resolveCdnRoot,
} from './lib/synergos-config.mjs';
import { getArg, DRY_RUN, LOG_PREFIX } from './lib/cli-utils.mjs';
import { buildManifest, buildContracts } from './lib/manifest-builder.mjs';

// ── CLI args ─────────────────────────────────────────────────────────────────

const CDN_ROOT = resolveCdnRoot(getArg('cdn'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const VERSION = getArg('version', readPackageVersion());
const CLEAN = process.argv.includes('--clean');
const ELEMENT_FILTER   = getArg('element');
const FRAMEWORK_FILTER = getArg('framework');

// ── Git commit SHA (best-effort) ─────────────────────────────────────────────

let GIT_SHA = '';
try { GIT_SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* ignore */ }

// ── Load element registry ────────────────────────────────────────────────────

let registry   = loadRegistry();
const inputsData = loadInputs();

if (ELEMENT_FILTER) {
  const filtered = registry.filter((e) => e.name === ELEMENT_FILTER);
  if (filtered.length === 0) {
    console.error(`\n❌ Element "${ELEMENT_FILTER}" not found in registry.`);
    process.exit(1);
  }
  registry = filtered;
}

// ── Discover and publish ─────────────────────────────────────────────────────

console.log(`\n${LOG_PREFIX}📦 Synergos CDN Publish (multi-framework)`);
console.log(`${LOG_PREFIX}   CDN target: ${CDN_SYNERGOS}`);
console.log(`${LOG_PREFIX}   Version:    ${VERSION}`);
if (ELEMENT_FILTER)   console.log(`${LOG_PREFIX}   Element:    ${ELEMENT_FILTER}`);
if (FRAMEWORK_FILTER) console.log(`${LOG_PREFIX}   Framework:  ${FRAMEWORK_FILTER}`);
if (CLEAN) console.log(`${LOG_PREFIX}   Clean:      enabled`);
console.log('');

const published = [];
const skipped = [];

for (const entry of registry) {
  let elementPublished = false;

  for (const platform of PLATFORMS) {
    if (FRAMEWORK_FILTER && platform.name !== FRAMEWORK_FILTER) continue;

    const bundlePath = platform.resolveBundlePath(entry.name);

    if (!existsSync(bundlePath)) continue;

    // CDN path: synergos/<element>/<framework>/latest/
    const targetDir = join(CDN_SYNERGOS, entry.name, platform.name, 'latest');

    const manifest = buildManifest(entry, platform.name, VERSION, inputsData[entry.name] ?? []);

    // Build metadata — traces every published bundle to its source
    const bundleSize = statSync(bundlePath).size;
    const meta = {
      element:   entry.name,
      framework: platform.name,
      version:   VERSION,
      commit:    GIT_SHA,
      builtAt:   new Date().toISOString(),
      bundleSize,
    };

    const majorAlias   = `v${VERSION.split('.')[0]}`;

    if (DRY_RUN) {
      console.log(`${LOG_PREFIX}   ✅ ${entry.name} [${platform.name}] → ${entry.tag} (${VERSION} / ${majorAlias})`);
    } else {
      // Helper: write bundle + manifest + meta to a CDN slot directory
      function publishSlot(dir) {
        mkdirSync(dir, { recursive: true });
        copyFileSync(bundlePath, join(dir, 'main.js'));
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
      }

      // Exact semver slot (immutable — never overwrite once published)
      publishSlot(join(CDN_SYNERGOS, entry.name, platform.name, VERSION));

      // Major-pinned slot (updated each patch within the major)
      publishSlot(join(CDN_SYNERGOS, entry.name, platform.name, majorAlias));

      // Latest slot (always the newest release — use in staging/dev)
      publishSlot(targetDir);

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
    console.log(`\n${LOG_PREFIX}   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
  } else {
    mkdirSync(CDN_SYNERGOS, { recursive: true });
    writeFileSync(
      join(CDN_SYNERGOS, 'registry.json'),
      JSON.stringify(globalRegistry, null, 2),
    );
    console.log(`\n   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
  }

  // ── Generate contracts.json — cross-project contract for CMS CI validation ──
  // CMS fetches this from CDN in its own CI pipeline to validate resolver outputs.
  // Neither project needs to run in the same pod or tenant.

  const fullRegistry = loadRegistry();
  const contracts = buildContracts(fullRegistry, inputsData, VERSION);

  if (DRY_RUN) {
    console.log(`${LOG_PREFIX}   📋 contracts.json → ${fullRegistry.length} element contracts (CMS CI)`);
  } else {
    writeFileSync(
      join(CDN_SYNERGOS, 'contracts.json'),
      JSON.stringify(contracts, null, 2),
    );
    console.log(`   📋 contracts.json → ${fullRegistry.length} element contracts (CMS CI)`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${LOG_PREFIX}   Published: ${published.length} bundles`);
if (skipped.length > 0) {
  console.log(`${LOG_PREFIX}   Skipped (not built): ${skipped.length} — ${skipped.join(', ')}`);
}
console.log('');

// ── Clean element dists (--clean) ───────────────────────────────────────────

if (CLEAN) {
  console.log(`${LOG_PREFIX}🧹 Cleaning element dist directories...\n`);

  // Reload full registry for cleaning (in case --element filtered it)
  const fullReg = loadRegistry();
  let cleanRemoved = 0;

  for (const entry of fullReg) {
    for (const platform of PLATFORMS) {
      // For Angular, only remove element dists — preserve libs dist
      const distDir = resolve(ROOT, `platforms/${platform.name}/dist`, entry.name);

      if (!existsSync(distDir)) continue;

      if (DRY_RUN) {
        console.log(`${LOG_PREFIX}   🗑️  ${entry.name} [${platform.name}] → would remove`);
      } else {
        rmSync(distDir, { recursive: true, force: true });
        console.log(`   🗑️  ${entry.name} [${platform.name}] → removed`);
      }
      cleanRemoved++;
    }
  }

  console.log(`\n${LOG_PREFIX}   Cleaned: ${cleanRemoved} dist directories`);
  console.log('');
}
