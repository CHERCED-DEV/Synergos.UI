#!/usr/bin/env node

/**
 * contracts-export.mjs
 *
 * Produces contracts.json — a machine-readable contract summary consumed by
 * Synergos.CMS in its own CI pipeline to validate resolver outputs without
 * requiring both projects to run in the same environment.
 *
 * Published to CDN as /synergos/contracts.json
 *
 * CMS CI usage pattern:
 *   1. Fetch https://cdn/synergos/contracts.json (after UI publishes)
 *   2. For each Umbraco block type alias, verify:
 *      - The alias exists in contracts.elements
 *      - All fields the C# resolver emits exist in element.configFields
 *      - Fields of type "json" are being JsonSerializer.Serialize()d
 *   3. Fail the CMS CI build if mismatches are found
 *
 * This file is the cross-project boundary between Synergos.UI and Synergos.CMS.
 * Neither project needs to run in the same pod or tenant.
 *
 * Usage:
 *   node tools/contracts-export.mjs                      # write to dist/contracts.json
 *   node tools/contracts-export.mjs --out path/file.json # custom output path
 *   node tools/contracts-export.mjs --dry-run            # print to stdout only
 *   node tools/contracts-export.mjs --version 1.2.3      # pin version
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { ROOT, loadRegistry, loadInputs, readPackageVersion } from './lib/synergos-config.mjs';
import { getArg, DRY_RUN } from './lib/cli-utils.mjs';
import { buildContracts } from './lib/manifest-builder.mjs';

// ── CLI args ─────────────────────────────────────────────────────────────────

const OUT     = resolve(ROOT, getArg('out', 'dist/contracts.json'));
const VERSION = getArg('version', readPackageVersion());

// ── Build contracts ───────────────────────────────────────────────────────────

const registry   = loadRegistry();
const inputsData = loadInputs();
const contracts  = buildContracts(registry, inputsData, VERSION);

// ── Output ────────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log('\n[DRY RUN] contracts-export — contracts.json preview:');
  console.log(JSON.stringify(contracts, null, 2));
} else {
  const dir = resolve(OUT, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(OUT, JSON.stringify(contracts, null, 2));
  console.log(`\n  ✅ contracts.json → ${OUT}`);
  console.log(`     ${contracts.elements.length} element contracts exported (version ${VERSION})\n`);
}
