#!/usr/bin/env node

/**
 * Synergos Manifest Generator
 *
 * Generates element manifest.json files from:
 *   - vitals/contracts/src/element-registry.json  (name, alias, tag, tier)
 *   - vitals/contracts/src/element-inputs.json     (declared input descriptors)
 *
 * Manifests are written to an output directory so they can be:
 *   - Inspected without running a full publish
 *   - Committed to a review artifact in CI
 *   - Consumed by tools like the element catalog
 *
 * Usage:
 *   node tools/manifest-gen.mjs                          # generate for all elements
 *   node tools/manifest-gen.mjs --element hero           # single element
 *   node tools/manifest-gen.mjs --version 1.2.3          # set version (default: from package.json)
 *   node tools/manifest-gen.mjs --out dist/manifests     # custom output dir
 *   node tools/manifest-gen.mjs --dry-run                # print to stdout, no files written
 *   node tools/manifest-gen.mjs --framework angular      # filter by framework
 *   node tools/manifest-gen.mjs --validate               # exit 1 if any element has empty inputs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON  = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
const INPUTS_JSON    = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');
const PACKAGE_JSON   = resolve(ROOT, 'package.json');

const ALL_FRAMEWORKS = ['angular', 'react', 'svelte', 'vanilla'];

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const ELEMENT_FILTER    = getArg('--element', null);
const FRAMEWORK_FILTER  = getArg('--framework', null);
const OUT_DIR           = resolve(ROOT, getArg('--out', 'dist/manifests'));
const pkgVersion        = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')).version;
const VERSION           = getArg('--version', pkgVersion);
const DRY_RUN           = args.includes('--dry-run');
const VALIDATE          = args.includes('--validate');

// ── Load data ────────────────────────────────────────────────────────────────

const registry   = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));
const inputsData = JSON.parse(readFileSync(INPUTS_JSON,   'utf-8'));

// ── Filter ───────────────────────────────────────────────────────────────────

const elements   = ELEMENT_FILTER ? registry.filter(e => e.name === ELEMENT_FILTER) : registry;
const frameworks = FRAMEWORK_FILTER ? [FRAMEWORK_FILTER] : ALL_FRAMEWORKS;

if (ELEMENT_FILTER && elements.length === 0) {
  console.error(`\n❌ Element "${ELEMENT_FILTER}" not found in element-registry.json`);
  process.exit(1);
}

if (FRAMEWORK_FILTER && !ALL_FRAMEWORKS.includes(FRAMEWORK_FILTER)) {
  console.error(`\n❌ Unknown framework "${FRAMEWORK_FILTER}". Valid: ${ALL_FRAMEWORKS.join(', ')}`);
  process.exit(1);
}

// ── Generate ─────────────────────────────────────────────────────────────────

const prefix = DRY_RUN ? '[DRY RUN] ' : '';
const generated = [];
const warnings  = [];

console.log(`\n${prefix}📄 Synergos Manifest Generator`);
console.log(`${prefix}   Version:  ${VERSION}`);
if (!DRY_RUN) console.log(`${prefix}   Out dir:  ${OUT_DIR}`);
if (ELEMENT_FILTER)   console.log(`${prefix}   Element:  ${ELEMENT_FILTER}`);
if (FRAMEWORK_FILTER) console.log(`${prefix}   Framework: ${FRAMEWORK_FILTER}`);
console.log('');

for (const entry of elements) {
  const inputs = inputsData[entry.name] ?? [];

  if (inputs.length === 0) {
    warnings.push(entry.name);
  }

  for (const framework of frameworks) {
    const manifest = {
      tag:         entry.tag,
      alias:       entry.alias,
      framework,
      version:     VERSION,
      tier:        entry.tier,
      entryScript: 'main.js',
      inputs,
    };

    if (DRY_RUN) {
      console.log(`${prefix}   ${entry.name} [${framework}]:`);
      console.log(JSON.stringify(manifest, null, 2));
      console.log('');
    } else {
      const outDir = join(OUT_DIR, entry.name, framework);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    }

    generated.push(`${entry.name}/${framework}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (!DRY_RUN) {
  console.log(`${prefix}   ✅ Generated: ${generated.length} manifests → ${OUT_DIR}`);
}

if (warnings.length > 0) {
  console.log(`\n${prefix}   ⚠️  Elements with no declared inputs (${warnings.length}):`);
  for (const name of warnings) {
    console.log(`${prefix}      - ${name}`);
  }
  console.log(`\n${prefix}   Add inputs to vitals/contracts/src/element-inputs.json to resolve warnings.\n`);
}

if (VALIDATE && warnings.length > 0) {
  console.error(`\n❌ Validation failed: ${warnings.length} element(s) have no declared inputs.`);
  process.exit(1);
}

console.log('');
