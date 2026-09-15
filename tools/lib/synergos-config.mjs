/**
 * Synergos shared configuration — single source of truth.
 *
 * Every tools/ script imports from here instead of re-defining
 * ROOT, paths, PLATFORMS, CDN defaults, and version resolution.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { valoresDeUnion, camposDeInterfaz } from './contract-schema.mjs';

// ── Root ─────────────────────────────────────────────────────────────────────

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ── Contract source paths ────────────────────────────────────────────────────

export const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
export const INPUTS_JSON   = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');
export const MANIFEST_SCHEMA_TS = resolve(ROOT, 'vitals/contracts/src/element-manifest.schema.ts');
export const PACKAGE_JSON  = resolve(ROOT, 'package.json');

// ── Framework constants ──────────────────────────────────────────────────────

// Las plataformas que HOY publican. No es la lista de frameworks válidos: ésa
// la declara `ElementFramework` en el contrato y se lee de ahí (ver
// `contratoDelManifiesto`), para que no haya dos listas que puedan discrepar.
export const ALL_FRAMEWORKS = ['angular'];

/**
 * El contrato del manifiesto, leído del `.ts` que lo declara.
 *
 * Es lo que convierte a `ElementManifest` en algo que alguien consume (issue
 * #43): las claves que el publicador escribe y los valores que puede tomar
 * `framework` y `tier` salen de la interfaz, no de una copia en un `.mjs`.
 */
export function contratoDelManifiesto() {
  const fuente = readFileSync(MANIFEST_SCHEMA_TS, 'utf-8');
  const contrato = {
    claves:     camposDeInterfaz(fuente, 'ElementManifest'),
    frameworks: valoresDeUnion(fuente, 'ElementFramework'),
    tiers:      valoresDeUnion(fuente, 'ElementTier'),
  };

  // Un parser que no encuentra nada devuelve listas vacías, y con listas
  // vacías toda validación pasa. Ése es el modo de fallo silencioso de un gate
  // que lee fuente: sale verde justo cuando dejó de mirar.
  if (contrato.claves.length === 0 || contrato.frameworks.length === 0 || contrato.tiers.length === 0) {
    fail(
      `no se pudo leer el contrato de ${MANIFEST_SCHEMA_TS}: ` +
      `ElementManifest/${contrato.claves.length} claves, ` +
      `ElementFramework/${contrato.frameworks.length} valores, ` +
      `ElementTier/${contrato.tiers.length} valores.`,
    );
  }

  return contrato;
}

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

function validateRegistryEntry(entry, index, seenAliases, frameworks) {
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

  // El framework NO tiene valor por defecto, y ésa es toda la gracia (issue
  // #42): una entrada que no lo declara no se publica. Caer a 'angular' porque
  // hoy es la única plataforma sería escribir la suposición en el código en vez
  // de medirla, y dejaría el registry afirmando algo que nadie decidió.
  if (!frameworks.includes(entry.framework)) {
    fail(
      `registry[${index}] ("${String(name)}") framework "${String(entry.framework)}" is invalid. ` +
      `Expected one of: ${frameworks.join(', ')}. Sin framework no se publica.`,
    );
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
  const { frameworks } = contratoDelManifiesto();
  rawRegistry.forEach((entry, index) => validateRegistryEntry(entry, index, seenAliases, frameworks));
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
