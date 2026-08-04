/**
 * Synergos shared configuration — single source of truth.
 *
 * Every tools/ script imports from here instead of re-defining
 * ROOT, paths, PLATFORMS, CDN defaults, and version resolution.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Root ─────────────────────────────────────────────────────────────────────

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ── Contract source paths ────────────────────────────────────────────────────

export const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
export const INPUTS_JSON   = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');
export const PACKAGE_JSON  = resolve(ROOT, 'package.json');

// ── Framework constants ──────────────────────────────────────────────────────

export const ALL_FRAMEWORKS = ['angular'];

// ── Platform dist configurations ─────────────────────────────────────────────
// Angular es LA plataforma (purga 2026-08-04). El array se conserva —no una
// constante suelta— porque publish.mjs, manifest-gen y catalog iteran sobre él,
// y porque el contrato del CDN conserva el segmento de framework en las rutas:
// si algún día vuelve otra plataforma, se añade una entrada acá y el pipeline
// entero la reconoce.

export const PLATFORMS = [
  {
    name: 'angular',
    distDir: resolve(ROOT, 'platforms/angular/dist'),
    // Angular: dist/<element>/browser/main.js
    resolveBundlePath: (elementName) =>
      resolve(ROOT, 'platforms/angular/dist', elementName, 'browser', 'main.js'),
    elementDistDir: (elementName) =>
      resolve(ROOT, 'platforms/angular/dist', elementName),
  },
];

// ── CDN defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_CDN_ROOT   = String.raw`C:\LOCAL_CDN`;
export const DEFAULT_CDN_ORIGIN = 'https://synergos-static-local';
export const VALID_INPUT_TYPES  = ['string', 'number', 'boolean', 'json'];
export const VALID_TIERS        = ['primitive', 'composition', 'module', 'experience'];

const ELEMENT_ALIAS_PATTERN = /^(element|experience)[A-Za-z0-9]+$/u;
const ELEMENT_TAG_PATTERN = /^synergos-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Resolve the CDN root directory from CLI arg or env, with fallback.
 * @param {string | null} cliValue — value from --cdn arg
 */
export function resolveCdnRoot(cliValue) {
  return resolve(cliValue || process.env.SYNERGOS_CDN || DEFAULT_CDN_ROOT);
}

// ── Version resolution ───────────────────────────────────────────────────────

/** Read version from root package.json */
export function readPackageVersion() {
  return JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')).version;
}

// ── Data loaders ─────────────────────────────────────────────────────────────

function fail(message) {
  throw new Error(`[synergos-config] ${message}`);
}

function ensureObject(value, fieldName) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${fieldName} must be an object.`);
  }
}

function validateRegistryEntry(entry, index, seenAliases) {
  ensureObject(entry, `registry[${index}]`);

  const { name, alias, tag, tier } = entry;

  if (typeof name !== 'string' || name.length === 0) {
    fail(`registry[${index}].name must be a non-empty string.`);
  }

  if (typeof alias !== 'string' || !ELEMENT_ALIAS_PATTERN.test(alias)) {
    fail(`registry[${index}].alias "${String(alias)}" is invalid.`);
  }

  if (seenAliases.has(alias)) {
    fail(`Duplicate registry alias detected: "${alias}".`);
  }
  seenAliases.add(alias);

  if (typeof tag !== 'string' || !ELEMENT_TAG_PATTERN.test(tag)) {
    fail(`registry[${index}].tag "${String(tag)}" is invalid.`);
  }

  if (!VALID_TIERS.includes(tier)) {
    fail(`registry[${index}].tier "${String(tier)}" is invalid. Expected one of: ${VALID_TIERS.join(', ')}.`);
  }
}

function validateInputDescriptor(descriptor, elementName, inputIndex) {
  ensureObject(descriptor, `inputs["${elementName}"][${inputIndex}]`);

  if (typeof descriptor.name !== 'string' || descriptor.name.length === 0) {
    fail(`inputs["${elementName}"][${inputIndex}].name must be a non-empty string.`);
  }

  if (!VALID_INPUT_TYPES.includes(descriptor.type)) {
    fail(`inputs["${elementName}"][${inputIndex}].type "${String(descriptor.type)}" is invalid. Expected one of: ${VALID_INPUT_TYPES.join(', ')}.`);
  }

  if (typeof descriptor.required !== 'boolean') {
    fail(`inputs["${elementName}"][${inputIndex}].required must be a boolean.`);
  }
}

function validateRegistry(rawRegistry) {
  if (!Array.isArray(rawRegistry)) {
    fail('element-registry.json root must be an array.');
  }

  const seenAliases = new Set();
  rawRegistry.forEach((entry, index) => validateRegistryEntry(entry, index, seenAliases));
  return rawRegistry;
}

function validateInputs(rawInputs) {
  ensureObject(rawInputs, 'element-inputs.json root');

  for (const [elementName, descriptors] of Object.entries(rawInputs)) {
    if (elementName.startsWith('_')) {
      continue;
    }

    if (!Array.isArray(descriptors)) {
      fail(`inputs["${elementName}"] must be an array.`);
    }

    descriptors.forEach((descriptor, index) => {
      validateInputDescriptor(descriptor, elementName, index);
    });
  }

  return rawInputs;
}

/** Load the element registry (array of entries) */
export function loadRegistry() {
  const rawRegistry = JSON.parse(readFileSync(REGISTRY_JSON, 'utf-8'));
  return validateRegistry(rawRegistry);
}

/** Load the element inputs map (keyed by element name) */
export function loadInputs() {
  const rawInputs = JSON.parse(readFileSync(INPUTS_JSON, 'utf-8'));
  return validateInputs(rawInputs);
}
