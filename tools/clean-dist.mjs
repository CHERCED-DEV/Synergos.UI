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

import { rmSync, existsSync } from 'node:fs';

import { PLATFORMS, loadRegistry } from './lib/synergos-config.mjs';

// ── Load element registry ────────────────────────────────────────────────────

const registry = loadRegistry();

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
