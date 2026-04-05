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

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { ROOT, ALL_FRAMEWORKS, loadRegistry, loadInputs, readPackageVersion } from './lib/synergos-config.mjs';
import { getArg, DRY_RUN, LOG_PREFIX } from './lib/cli-utils.mjs';
import { buildManifest } from './lib/manifest-builder.mjs';

// ── CLI args ──────────────────────────────────────────────────────────────────

const ELEMENT_FILTER    = getArg('element');
const FRAMEWORK_FILTER  = getArg('framework');
const OUT_DIR           = resolve(ROOT, getArg('out', 'dist/manifests'));
const VERSION           = getArg('version', readPackageVersion());
const VALIDATE          = process.argv.includes('--validate');

// ── Load data ────────────────────────────────────────────────────────────────

const registry   = loadRegistry();
const inputsData = loadInputs();

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

const generated = [];
const warnings  = [];

console.log(`\n${LOG_PREFIX}📄 Synergos Manifest Generator`);
console.log(`${LOG_PREFIX}   Version:  ${VERSION}`);
if (!DRY_RUN) console.log(`${LOG_PREFIX}   Out dir:  ${OUT_DIR}`);
if (ELEMENT_FILTER)   console.log(`${LOG_PREFIX}   Element:  ${ELEMENT_FILTER}`);
if (FRAMEWORK_FILTER) console.log(`${LOG_PREFIX}   Framework: ${FRAMEWORK_FILTER}`);
console.log('');

for (const entry of elements) {
  const inputs = inputsData[entry.name] ?? [];

  if (inputs.length === 0) {
    warnings.push(entry.name);
  }

  for (const framework of frameworks) {
    const manifest = buildManifest(entry, framework, VERSION, inputs);

    if (DRY_RUN) {
      console.log(`${LOG_PREFIX}   ${entry.name} [${framework}]:`);
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
  console.log(`${LOG_PREFIX}   ✅ Generated: ${generated.length} manifests → ${OUT_DIR}`);
}

if (warnings.length > 0) {
  console.log(`\n${LOG_PREFIX}   ⚠️  Elements with no declared inputs (${warnings.length}):`);
  for (const name of warnings) {
    console.log(`${LOG_PREFIX}      - ${name}`);
  }
  console.log(`\n${LOG_PREFIX}   Add inputs to vitals/contracts/src/element-inputs.json to resolve warnings.\n`);
}

if (VALIDATE && warnings.length > 0) {
  console.error(`\n❌ Validation failed: ${warnings.length} element(s) have no declared inputs.`);
  process.exit(1);
}

console.log('');
