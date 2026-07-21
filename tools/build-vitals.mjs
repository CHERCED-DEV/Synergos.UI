#!/usr/bin/env node
/**
 * build-vitals.mjs
 *
 * Builds all framework-agnostic vitals/* packages with plain `tsc`.
 * Runs BEFORE platform builds (angular/react/svelte/vanilla) because
 * downstream Angular libs (libs/core, libs/rendering) consume vitals
 * via path mapping that resolves to the dist .d.ts at build context.
 *
 * Pipeline order:
 *   build:vitals  →  build:angular  →  build:runtime  →  publish:cdn
 *
 * Why plain tsc (not ng-packagr / vite / rollup):
 * vitals are framework-agnostic by design (governance for all frameworks).
 * Coupling them to ng-packagr would create a hard Angular dep across
 * the entire UI stack and defeat the multi-framework promise.
 * Plain tsc emits .js + .d.ts that any framework consumer can pick up.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Add new vitals here as they become buildable. Order matters when
// vitals depend on each other (e.g. core consumes contracts).
const VITALS = [
  { name: 'contracts', tsconfig: 'vitals/contracts/tsconfig.json' },
];

let failed = 0;
for (const vital of VITALS) {
  const tsconfigAbs = resolve(ROOT, vital.tsconfig);
  if (!existsSync(tsconfigAbs)) {
    console.error(`[build-vitals] SKIP ${vital.name} — tsconfig missing: ${tsconfigAbs}`);
    failed++;
    continue;
  }
  console.log(`[build-vitals] Building @synergos/${vital.name}...`);
  try {
    execSync(`npx tsc -p "${tsconfigAbs}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log(`[build-vitals] OK @synergos/${vital.name}`);
  } catch {
    console.error(`[build-vitals] FAIL @synergos/${vital.name}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`[build-vitals] ${failed} package(s) failed.`);
  process.exit(1);
}

console.log(`[build-vitals] All ${VITALS.length} package(s) built OK.`);
process.exit(0);
