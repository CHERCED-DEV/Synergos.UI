#!/usr/bin/env node

/**
 * Synergos Clean Dist Script
 *
 * Removes element dist directories for all platforms based on the element registry.
 * Preserves Angular libs dist (platforms/angular/dist/libs/) — needed internally.
 *
 * Usage:
 *   node tools/clean-dist.mjs
 */

import { readFileSync, rmSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');

// Platform dist configurations: where each framework stores element builds
const PLATFORMS = [
  {
    name: 'angular',
    // Angular element dist: platforms/angular/dist/<element>/
    // NOTE: platforms/angular/dist/libs/ is PRESERVED — only element dirs are removed
    elementDistDir: (elementName) =>
      resolve(ROOT, 'platforms/angular/dist', elementName),
  },
  {
    name: 'react',
    elementDistDir: (elementName) =>
      resolve(ROOT, 'platforms/react/dist', elementName),
  },
  {
    name: 'svelte',
    elementDistDir: (elementName) =>
      resolve(ROOT, 'platforms/svelte/dist', elementName),
  },
  {
    name: 'vanilla',
    elementDistDir: (elementName) =>
      resolve(ROOT, 'platforms/vanilla/dist', elementName),
  },
];

// ── Load element registry ────────────────────────────────────────────────────

const registry = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));

// ── Clean ────────────────────────────────────────────────────────────────────

console.log(`\n🧹 Synergos Clean Dist`);
console.log(`   Registry: ${registry.length} elements\n`);

let removed = 0;
let skippedCount = 0;

for (const entry of registry) {
  for (const platform of PLATFORMS) {
    const distDir = platform.elementDistDir(entry.name);

    if (!existsSync(distDir)) {
      skippedCount++;
      continue;
    }

    rmSync(distDir, { recursive: true, force: true });
    removed++;
    console.log(`   🗑️  ${entry.name} [${platform.name}] → removed`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n   Removed: ${removed} dist directories`);
if (skippedCount > 0) {
  console.log(`   Skipped: ${skippedCount} (not found)`);
}
console.log('');
