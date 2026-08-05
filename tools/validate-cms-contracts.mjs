#!/usr/bin/env node
/**
 * validate-cms-contracts.mjs
 *
 * Cross-validates the CMS schema (uSync/v9/DataTypes + uSync/v9/ContentTypes)
 * against the UI contract (element-registry.json) to catch misaligned aliases
 * before runtime.
 *
 * Checks performed:
 *   [E1] Element aliases in element-registry.json that have no matching uSync
 *        ContentType .config (alias not found in CMS) → likely broken reference
 *
 *   [E2] uSync ContentType configs with aliases starting "element" or "experience"
 *        that are NOT in element-registry.json → orphaned element types in CMS
 *
 *   [W1] element-registry.json entries with no mapper registered in block.mapper.ts
 *        (already covered by element-contract-audit.mjs, repeated here for CMS context)
 *
 *   [W2] macroSg* macro configs still present in uSync/v9/Macros/ (legacy cleanup)
 *
 *   [W3] Entries in element-registry.json whose tier does not match the alias prefix:
 *        element* → primitive|composition|module
 *        experience* → module
 *
 *   [W4] Registry entries whose `name` is not present as a key in ELEMENT_CONFIG_FIELDS
 *        (element-config.contract.ts) — component has no typed config contract.
 *
 *   [W5] Deprecated wrapper-component aliases (angular-host, mf-host, macro-host) found
 *        in element-registry.json — they should have been removed.
 *
 * Usage:
 *   node tools/validate-cms-contracts.mjs
 *   node tools/validate-cms-contracts.mjs --strict   (exit 1 on warnings too)
 *   node tools/validate-cms-contracts.mjs --json     (output as JSON)
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — at least one ERROR (or WARNING in --strict mode)
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeE1,
  computeE2,
  applyBaseline,
  validateBaselineShape,
  staleExclusions,
} from './lib/cms-contract-rules.mjs';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT_UI  = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// El CMS se busca, en orden: --cms-path=..., SYNERGOS_CMS_PATH, hermano.
// Antes SOLO existía el hermano, así que en cualquier entorno que no fuera el
// portátil del arquitecto —CI, contenedor— no lo encontraba y se saltaba.
function resolveCmsRoot() {
  const flag = process.argv.slice(2).find(a => a.startsWith('--cms-path='));
  if (flag) return resolve(flag.slice('--cms-path='.length));
  if (process.env.SYNERGOS_CMS_PATH) return resolve(process.env.SYNERGOS_CMS_PATH);
  return resolve(ROOT_UI, '..', 'Synergos.CMS');
}

const ROOT_CMS      = resolveCmsRoot();
const BASELINE_JSON = resolve(ROOT_UI, 'tools/cms-contract-baseline.json');

const REGISTRY_JSON       = resolve(ROOT_UI,  'vitals/contracts/src/element-registry.json');
const BLOCK_MAPPER_TS     = resolve(ROOT_UI,  'vitals/core/src/mappers/block.mapper.ts');
const ELEMENT_CONTRACT_TS = resolve(ROOT_UI,  'vitals/contracts/src/element-config.contract.ts');

const USYNC_CONTENT_CANDIDATES = [
  resolve(ROOT_CMS, 'uSync/v9/ContentTypes'),
  resolve(ROOT_CMS, 'uSync/ContentTypes'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/uSync/v9/ContentTypes'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/uSync/ContentTypes'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/App_Data/uSync/v9/ContentTypes'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/App_Data/uSync/ContentTypes'),
];

const USYNC_MACROS_CANDIDATES = [
  resolve(ROOT_CMS, 'uSync/v9/Macros'),
  resolve(ROOT_CMS, 'uSync/Macros'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/uSync/v9/Macros'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/uSync/Macros'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/App_Data/uSync/v9/Macros'),
  resolve(ROOT_CMS, 'Synergos.CMS.Web/App_Data/uSync/Macros'),
];

// ── Args ──────────────────────────────────────────────────────────────────────

const args   = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const json   = args.has('--json');

// Un gate que no encuentra su entrada NO puede salir verde: eso es
// exactamente cómo `contracts:validate` pasaba en CI sin comprobar nada.
// Ahora la ausencia del CMS es un fallo, y quien la quiera tolerar lo pide
// explícitamente (por ejemplo un `npm run build` local sin el hermano).
const allowMissingCms = args.has('--allow-missing-cms');

// Escotilla para inspeccionar la deuda completa, baseline incluida.
const ignoreBaseline = args.has('--no-baseline');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Extract the Alias attribute from a uSync XML .config file.
 * Returns null if not found OR if the file is a Delete tombstone
 * (<Empty Key="..." Alias="..." Change="Delete" />) — those types are
 * being removed from Umbraco and must not count as "present in CMS".
 */
function extractAlias(xmlContent) {
  if (xmlContent.includes('Change="Delete"')) return null;
  const m = xmlContent.match(/\bAlias="([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Parse block.mapper.ts to find which aliases are registered.
 * Returns a Set<string> of alias keys.
 */
function parseBlockMapper(source) {
  const aliases = new Set();
  for (const m of source.matchAll(/^\s{2}([A-Za-z0-9]+):\s*\{$/gmu)) {
    aliases.add(m[1]);
  }
  return aliases;
}

/**
 * Parse element-config.contract.ts to find keys in ELEMENT_CONFIG_FIELDS.
 * Returns a Set<string> of element name keys (e.g. 'hero', 'faq-section').
 * Handles both quoted ('faq-section') and unquoted (section) TypeScript property keys.
 */
function parseElementConfigFields(source) {
  const keys = new Set();
  // Match the ELEMENT_CONFIG_FIELDS block (non-greedy stops at first } — safe since values are arrays not objects)
  const blockMatch = source.match(/ELEMENT_CONFIG_FIELDS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!blockMatch) return keys;
  // ^ + \s+ ensures we only match keys at the start of a line (not values inside arrays)
  for (const m of blockMatch[1].matchAll(/^\s+(?:'([\w-]+)'|(\w+))\s*:/gm)) {
    keys.add(m[1] ?? m[2]);
  }
  return keys;
}

function resolveFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ── Load data ─────────────────────────────────────────────────────────────────

if (!existsSync(REGISTRY_JSON)) {
  console.error(`[validate-cms-contracts] element-registry.json not found at:\n  ${REGISTRY_JSON}`);
  process.exit(2);
}

const USYNC_CONTENT = resolveFirstExistingPath(USYNC_CONTENT_CANDIDATES);
const USYNC_MACROS = resolveFirstExistingPath(USYNC_MACROS_CANDIDATES);

if (!USYNC_CONTENT) {
  const warning = [
    '[validate-cms-contracts] No uSync ContentTypes directory was found.',
    'Checked paths:',
    ...USYNC_CONTENT_CANDIDATES.map((path) => `  - ${path}`),
    '',
    'Apuntá al CMS con --cms-path=RUTA o SYNERGOS_CMS_PATH, o cloná el repo',
    'como hermano. Si de verdad querés saltarte la validación cruzada (por',
    'ejemplo un build local sin el CMS a mano), pasá --allow-missing-cms.',
    allowMissingCms
      ? 'Saltando la validación cruzada: --allow-missing-cms.'
      : 'FALLO: un gate que no encuentra su entrada no puede pasar en verde.',
  ].join('\n');

  if (json) {
    console.log(
      JSON.stringify(
        {
          errors: { e1: [], e2: [] },
          warnings: { w0: [{ note: warning }] },
          errorCount: allowMissingCms ? 0 : 1,
          warningCount: allowMissingCms ? 1 : 0,
          skipped: true,
        },
        null,
        2,
      ),
    );
  } else if (allowMissingCms) {
    console.warn(`${warning}\n`);
  } else {
    console.error(`${warning}\n`);
  }

  process.exit(allowMissingCms ? 0 : 1);
}

const registry = readJson(REGISTRY_JSON);

// All element aliases from element-registry.json
const registryAliases = new Set(registry.map(e => e.alias));

// All uSync ContentType aliases (from .config files in ContentTypes and subdirectories)
const cmsAliases = new Set();
function scanDir(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.name.endsWith('.config')) {
      const xml   = readFileSync(full, 'utf8');
      const alias = extractAlias(xml);
      if (alias) cmsAliases.add(alias);
    }
  }
}
scanDir(USYNC_CONTENT);

// uSync Macro aliases
const macroAliases = new Set();
if (USYNC_MACROS && existsSync(USYNC_MACROS)) {
  for (const name of readdirSync(USYNC_MACROS)) {
    if (name.endsWith('.config')) {
      const xml   = readFileSync(join(USYNC_MACROS, name), 'utf8');
      const alias = extractAlias(xml);
      if (alias) macroAliases.add(alias);
    }
  }
}

// Block mapper aliases
const mapperAliases = existsSync(BLOCK_MAPPER_TS)
  ? parseBlockMapper(readFileSync(BLOCK_MAPPER_TS, 'utf8'))
  : new Set();

// Element config field keys
const configFieldKeys = existsSync(ELEMENT_CONTRACT_TS)
  ? parseElementConfigFields(readFileSync(ELEMENT_CONTRACT_TS, 'utf8'))
  : new Set();

// ── Valid tiers ───────────────────────────────────────────────────────────────

const VALID_TIERS = new Set(['primitive', 'composition', 'module', 'experience']);

// ── Known exclusions ──────────────────────────────────────────────────────────

/**
 * CMS element types that are intentionally NOT in element-registry.json because
 * they are server-rendered only (no web component) or scheduled for removal.
 * Adding an alias here suppresses the [E2] warning for that type.
 */
const CMS_INTERNAL_ALIASES = new Set([
  // Blog (server-rendered article blocks — no web component)
  'elementCompArticleList',
  'elementCompBlogHighlight',
  // Forms (server-side form rendering pipeline)
  'elementFormEmbed',
  'elementFormField',
  'elementFormContainer',
  // Pricing (server-rendered: no hay vista en Views/Partials/SynHost/ para
  // ninguno de los dos, así que no montan web component)
  'elementPricingPlan',
  'elementPricingTable',
  // Montador genérico: `ModuleMount.cshtml` emite <synergos-{moduleAlias}> con
  // el alias que elige el editor (ADR 0096). Es el HOST, no un elemento con
  // bundle propio — por diseño nunca tendrá entrada en el registro.
  'elementSynModuleMount',
  // Corporate / Navigation (server-rendered, no CDN mount)
  'elementCorpContactInfo',
  'elementCorpMapEmbed',
  'elementCorpMissionBlock',
  'elementCorpTabPanel',
  'elementNavItem',
  'elementNavGroup',
  // Deprecated wrapper-component arch — still in DB, removed by CleanupLegacyTypes on next bump.
  // `elementIntAngularHost` y `elementIntMfHost` ya no estan en el CMS: los delato
  // el chequeo de exclusiones rancias del issue #16 y salieron de esta lista.
  'elementIntIframeHost',
  'elementIntScriptHost',
  // Layout presets (server-rendered Umbraco layouts — Block Grid sections)
  'elementLayout1Col',
  'elementLayout2ColEven',
  'elementLayout2ColMainSidebar',
  'elementLayout3Col',
  'elementLayout4Col',
  'elementLayoutColumn',
  'elementLayoutContainer',
  'elementLayoutGrid',
  'elementLayoutHero',
  'elementLayoutHolyGrail',
  'elementLayoutSection',
  'elementLayoutSidebarMain',
  'elementLayoutSnippetRef',
  'elementLayoutStack',
  // Member auth (server-rendered Razor views)
  'elementMemberGate',
  'elementMemberLogin',
  'elementMemberLogout',
  'elementMemberProfile',
  // Comments / Flow / Info / Media (server-rendered — distinct from elementSyn* CDN equivalents)
  'elementCommentThread',
  'elementFlowProgress',
  'elementFlowTrigger',
  'elementInfoFaqList',
  'elementInfoTestimonialCarousel',
  'elementInfoTimelineList',
  'elementMediaGallery',
  'elementMediaLogoCloud',
  'elementTextRichtext',
  // Modelos de DATOS anidados, consumidos por un BlockList y proyectados a JSON
  // por su fuente de catálogo. No montan web component Y TAMPOCO tienen partial
  // Razor: no son "SSR-only", son una tercera categoría — el editor los llena
  // dentro de la ficha de su padre y quien los pinta es el bundle del vertical
  // (eventos, gov) leyéndolos ya proyectados desde la API.
  // ADR 0117 (Eventos: localidades / agenda / zonas) y ADR 0123 (Gobierno:
  // secciones y preguntas del formulario del trámite).
  'elementEventTier',
  'elementEventSession',
  'elementEventZone',
  'elementTramiteFormSection',
  'elementTramiteFormField',
]);

// NOTA (issue #16). Acá vivían tres listas más —`UI_ONLY_ALIASES`,
// `LEGACY_RENAMED_ALIASES` y `SCHEMA_MANAGED_ALIASES`— que silenciaban 27
// aliases del [E1]. Ninguna se imprimía, ninguna exigía motivo y ninguna
// caducaba. La última se justificaba con `ElementTypeInitializer`, una clase
// que NO existe en el CMS y que además el proyecto prohíbe (CLAUDE.md §0.A,
// principios 2 y 4: schema vía uSync, cero seeders en boot).
//
// Lo que quedaba vivo se movió a `cms-contract-baseline.json`, que sí hace las
// tres cosas. Que no vuelvan a aparecer lo defiende
// `tools/lib/cms-contract-rules.spec.mjs`.

// ── Run checks ────────────────────────────────────────────────────────────────

// Deprecated wrapper-component names that must NOT be in the registry
const DEPRECATED_NAMES = new Set(['angular-host', 'mf-host', 'macro-host']);

const errors   = { e1: [], e2: [] };
const warnings = { w1: [], w2: [], w3: [], w4: [], w5: [] };

// [E1] Registry alias with no matching CMS element type
errors.e1.push(...computeE1(registry, cmsAliases));

// [E2] CMS element/experience types not in registry
errors.e2.push(...computeE2(cmsAliases, registryAliases, CMS_INTERNAL_ALIASES));

// [E3] Entradas de CMS_INTERNAL_ALIASES cuyo alias ya no existe en el CMS.
// No bloquea —no hay desajuste, hay basura— pero se REPORTA, que es justo lo
// que ninguna de las tres listas borradas hacía (issue #16).
const exclusionesRancias = staleExclusions(CMS_INTERNAL_ALIASES, cmsAliases);

// [W1] Registry alias with no mapper in block.mapper.ts
for (const entry of registry) {
  if (mapperAliases.size > 0 && !mapperAliases.has(entry.alias)) {
    warnings.w1.push({
      alias: entry.alias,
      name:  entry.name,
      note:  'No mapper registered in block.mapper.ts — element will fall back to null on Dispatch',
    });
  }
}

// [W2] Legacy macroSg* macros still in uSync
for (const alias of macroAliases) {
  if (alias.startsWith('macroSg')) {
    warnings.w2.push({
      alias,
      note: 'Legacy macroSg* macro still present in uSync/v9/Macros/ — should be deleted',
    });
  }
}

// [W3] Tier mismatch between alias prefix and declared tier
for (const entry of registry) {
  if (!VALID_TIERS.has(entry.tier)) {
    warnings.w3.push({
      alias: entry.alias,
      tier:  entry.tier,
      note:  `Unknown tier '${entry.tier}'. Valid: ${[...VALID_TIERS].join(', ')}`,
    });
  }
}

// [W4] Registry entry name not found in ELEMENT_CONFIG_FIELDS
// Intentional exclusions: elements that are server-rendered (no CDN config) or UI-only templates.
const CONFIG_EXEMPT_NAMES = new Set([
  'accordion',     // server-rendered composition — no CDN/macro mount path
]);

if (configFieldKeys.size > 0) {
  // Some registry entries map multiple names to the same web component tag
  // (e.g. heading/paragraph/rich-text → synergos-text-block).
  // We only warn if the registry `name` itself is not in ELEMENT_CONFIG_FIELDS AND
  // its `tag` (without prefix) is also absent — meaning there is truly no config shape.
  const tagToName = name => name.replace(/^synergos-/, '');
  for (const entry of registry) {
    if (CONFIG_EXEMPT_NAMES.has(entry.name)) continue;
    const nameInConfig = configFieldKeys.has(entry.name);
    const tagName      = tagToName(entry.tag);
    const tagInConfig  = configFieldKeys.has(tagName);
    if (!nameInConfig && !tagInConfig) {
      warnings.w4.push({
        name:  entry.name,
        alias: entry.alias,
        tag:   entry.tag,
        note:  'No entry in ELEMENT_CONFIG_FIELDS — component has no typed config contract',
      });
    }
  }
}

// [W5] Deprecated wrapper-component names still in registry
for (const entry of registry) {
  if (DEPRECATED_NAMES.has(entry.name)) {
    warnings.w5.push({
      name:  entry.name,
      alias: entry.alias,
      note:  'Deprecated wrapper-component architecture — remove from element-registry.json',
    });
  }
}

// ── Baseline ──────────────────────────────────────────────────────────────────
//
// La deuda ya conocida sale de la cuenta de errores pero NO de la salida: se
// sigue imprimiendo como [BASELINE] en cada corrida. La idea es que el gate
// pueda bloquear la deriva nueva sin estar rojo de forma permanente por la
// vieja — un gate siempre rojo deja de leerse, y entonces no gatea nada.
//
// Una entrada del baseline que ya NO se corresponde con un desajuste vivo se
// reporta como stale: significa que se arregló y hay que borrarla de la lista.

const baseline = { e1: new Map(), e2: new Map() };

if (!ignoreBaseline && existsSync(BASELINE_JSON)) {
  const raw = readJson(BASELINE_JSON);

  // Una baseline sin `reason` es una lista de silencio con otro nombre — el
  // defecto del issue #16. Se comprueba acá y es un fallo duro: no tiene
  // sentido seguir si el mecanismo que autoriza el silencio está roto.
  const problemas = validateBaselineShape(raw);
  if (problemas.length > 0) {
    console.error('\n[BASELINE INVÁLIDA] toda entrada exige `alias` y `reason`:');
    for (const p of problemas) console.error(`  ✗ ${p}`);
    console.error();
    process.exit(2);
  }

  for (const e of raw.e1_registryAliasMissingFromCms ?? []) baseline.e1.set(e.alias, e);
  for (const e of raw.e2_cmsAliasMissingFromRegistry ?? []) baseline.e2.set(e.alias, e);
}

const baselined = { e1: [], e2: [] };
const staleBaseline = [];

for (const key of ['e1', 'e2']) {
  const r = applyBaseline(errors[key], baseline[key]);
  errors[key] = r.kept;
  baselined[key] = r.baselined;
  staleBaseline.push(...r.stale);
}

// ── Output ────────────────────────────────────────────────────────────────────

const errorCount   = errors.e1.length + errors.e2.length;
const warningCount = warnings.w1.length + warnings.w2.length + warnings.w3.length + warnings.w4.length + warnings.w5.length;

const baselinedCount = baselined.e1.length + baselined.e2.length;

if (json) {
  console.log(JSON.stringify(
    { errors, warnings, baselined, staleBaseline, errorCount, warningCount }, null, 2));
} else {
  console.log('\nSynergos CMS ↔ UI Contract Validator');
  console.log('─────────────────────────────────────');
  console.log(`  CMS root:                ${ROOT_CMS}`);
  console.log(`  Registry entries:        ${registry.length}`);
  console.log(`  CMS ContentType aliases: ${cmsAliases.size}`);
  console.log(`  Macro aliases:           ${macroAliases.size}`);
  console.log(`  Block mapper aliases:    ${mapperAliases.size}`);
  console.log(`  Config field keys:       ${configFieldKeys.size}`);
  console.log();

  if (baselinedCount > 0) {
    console.log(`[BASELINE] Deuda conocida, no bloquea (${baselinedCount}) — tools/cms-contract-baseline.json:`);
    for (const e of [...baselined.e1, ...baselined.e2])
      console.log(`  · ${e.alias}  [${e.owner}]  ${e.reason}`);
    console.log();
  }

  if (staleBaseline.length > 0) {
    console.log(`[BASELINE STALE] Ya no hay desajuste — borralas del baseline (${staleBaseline.length}):`);
    for (const a of staleBaseline) console.log(`  ✓ ${a}`);
    console.log();
  }

  if (exclusionesRancias.length > 0) {
    console.log(`[EXCLUSIÓN STALE] Alias en CMS_INTERNAL_ALIASES que ya no existe en el CMS — borralos (${exclusionesRancias.length}):`);
    for (const a of exclusionesRancias) console.log(`  ✓ ${a}`);
    console.log();
  }

  if (errors.e1.length > 0) {
    console.log(`[E1] Registry aliases missing from CMS (${errors.e1.length}):`);
    for (const e of errors.e1)
      console.log(`  ✗ ${e.alias} (${e.name}, tier=${e.tier})`);
    console.log();
  }

  if (errors.e2.length > 0) {
    console.log(`[E2] CMS element types not in registry (${errors.e2.length}):`);
    for (const e of errors.e2)
      console.log(`  ✗ ${e.alias}`);
    console.log();
  }

  if (warnings.w1.length > 0) {
    console.log(`[W1] Registry entries with no block mapper (${warnings.w1.length}):`);
    for (const w of warnings.w1)
      console.log(`  ⚠ ${w.alias} (${w.name})`);
    console.log();
  }

  if (warnings.w2.length > 0) {
    console.log(`[W2] Legacy macroSg* configs still in uSync (${warnings.w2.length}):`);
    for (const w of warnings.w2)
      console.log(`  ⚠ ${w.alias}`);
    console.log();
  }

  if (warnings.w3.length > 0) {
    console.log(`[W3] Invalid tier values (${warnings.w3.length}):`);
    for (const w of warnings.w3)
      console.log(`  ⚠ ${w.alias}: ${w.note}`);
    console.log();
  }

  if (warnings.w4.length > 0) {
    console.log(`[W4] Registry entries missing from ELEMENT_CONFIG_FIELDS (${warnings.w4.length}):`);
    for (const w of warnings.w4)
      console.log(`  ⚠ ${w.name} (${w.alias})`);
    console.log();
  }

  if (warnings.w5.length > 0) {
    console.log(`[W5] Deprecated wrapper-component names in registry (${warnings.w5.length}):`);
    for (const w of warnings.w5)
      console.log(`  ⚠ ${w.name} (${w.alias}): ${w.note}`);
    console.log();
  }

  if (errorCount === 0 && warningCount === 0) {
    console.log('✓ All CMS ↔ UI contract checks passed.\n');
  } else {
    const parts = [];
    if (errorCount   > 0) parts.push(`${errorCount} error(s)`);
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    console.log(`Result: ${parts.join(', ')}`);
    if (errorCount > 0) console.log('Contract validation FAILED.\n');
    else                console.log('Contract validation passed (with warnings).\n');
  }
}

const shouldFail = errorCount > 0 || (strict && warningCount > 0);
process.exit(shouldFail ? 1 : 0);
