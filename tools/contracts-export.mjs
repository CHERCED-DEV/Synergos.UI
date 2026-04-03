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

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT         = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
const INPUTS_JSON   = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');
const PACKAGE_JSON  = resolve(ROOT, 'package.json');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const DRY_RUN = args.includes('--dry-run');
const OUT     = resolve(ROOT, getArg('--out', 'dist/contracts.json'));
const pkgVer  = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')).version;
const VERSION = getArg('--version', pkgVer);

// ── Load data ────────────────────────────────────────────────────────────────

const registry   = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));
const inputsData = JSON.parse(readFileSync(INPUTS_JSON,   'utf-8'));

// ── Build contracts ───────────────────────────────────────────────────────────

// Build a lookup of which fields require JSON.stringify on the CMS side.
// A field of type "json" must be serialized before it's set as an HTML attribute.
const jsonFieldsByElement = {};
for (const entry of registry) {
  const inputs = inputsData[entry.name] ?? [];
  jsonFieldsByElement[entry.name] = inputs
    .filter(i => i.type === 'json')
    .map(i => i.name);
}

const elements = registry.map(entry => {
  const inputs = (inputsData[entry.name] ?? []).filter(i => !String(i.name).startsWith('_'));
  return {
    name:         entry.name,
    alias:        entry.alias,
    tag:          entry.tag,
    tier:         entry.tier,
    configFields: inputs.map(({ name, type, required = false, default: def, description }) => ({
      name,
      type,
      required,
      ...(def !== undefined ? { default: def } : {}),
      ...(description       ? { description }  : {}),
    })),
    // Fields that MUST be JSON.stringify-ed by the CMS resolver before passing as attribute
    jsonFields: jsonFieldsByElement[entry.name] ?? [],
  };
});

const contracts = {
  generated: new Date().toISOString(),
  version:   VERSION,
  // CMS CI: fetch this URL and run validation against your resolvers
  $schema:   'synergos-contracts/v1',
  elements,
};

// ── Output ────────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log('\n[DRY RUN] contracts-export — contracts.json preview:');
  console.log(JSON.stringify(contracts, null, 2));
} else {
  const dir = resolve(OUT, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(OUT, JSON.stringify(contracts, null, 2));
  console.log(`\n  ✅ contracts.json → ${OUT}`);
  console.log(`     ${elements.length} element contracts exported (version ${VERSION})\n`);
}
