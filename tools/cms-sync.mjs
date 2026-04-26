#!/usr/bin/env node

/**
 * cms-sync.mjs
 *
 * Auto-genera el contrato CMS↔UI para los Element Types `elementSyn*`
 * de Synergos.CMS, evitando drift entre repos. Lee directamente los
 * XMLs uSync del CMS (fuente de verdad por ADR 0008) y produce:
 *
 *   1. vitals/contracts/src/elements-syn.contract.ts
 *      → 1 interface TypeScript por cada elementSyn* del CMS, con sus
 *        propiedades (excluyendo las que vienen de compIntegration y
 *        compDom* universales).
 *
 *   2. vitals/contracts/src/element-registry.json
 *      → Para cada elementSyn* del CMS: añade entry { name, alias,
 *        tag, tier } si no existe; deja intactas las entries existentes
 *        (incluidas las de elementComp/Corp/Info/Media legacy).
 *
 * NO toca:
 *   - Web Components Angular (apps/elements/{tier}/{name}/) — el
 *     scaffold inicial se hizo en Ola 53; cuando un elementSyn* nuevo
 *     aparece en CMS y este sync lo detecta sin Web Component
 *     correspondiente, lo reporta para acción manual.
 *   - Aliases existentes que NO sean elementSyn* — el contrato dual-path
 *     SSR (elementComp/Corp/Info/Media → tag) se preserva tal como está.
 *
 * Uso:
 *   node tools/cms-sync.mjs                    # sync + reporte
 *   node tools/cms-sync.mjs --dry-run          # solo reporte, no escribe
 *   node tools/cms-sync.mjs --cms-path=PATH    # path custom al CMS
 *
 * Exit codes:
 *   0 — sync OK (con o sin cambios)
 *   1 — error de parsing o I/O
 *   2 — drift detectado en --dry-run (CI mode: faltan sincronizar archivos)
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArg, DRY_RUN } from './lib/cli-utils.mjs';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT_UI  = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_CMS = resolve(getArg('cms-path', resolve(ROOT_UI, '..', 'Synergos.CMS')));

const CMS_CONTENT_TYPES_DIR = resolve(ROOT_CMS, 'Synergos.CMS.Web/uSync/v9/ContentTypes');
const REGISTRY_JSON_PATH    = resolve(ROOT_UI,  'vitals/contracts/src/element-registry.json');
const CONTRACT_OUT_PATH     = resolve(ROOT_UI,  'vitals/contracts/src/elements-syn.contract.ts');
const APPS_ELEMENTS_DIR     = resolve(ROOT_UI,  'platforms/angular/apps/elements');

// Property aliases that come from universal compositions (compDom*,
// compIntegration). Excluded from per-element contracts because they
// live in the wrapper, not in the per-component data payload.
const UNIVERSAL_PROP_ALIASES = new Set([
  'cssClass',
  'cssDataAttributes',
  'variantKey',
  'hideOnMobile',
  'hideOnTablet',
  'hideOnDesktop',
  'ariaRole',
  'ariaLabel',
  'configOverride',
]);

// Tier classification for elementSyn* — hand-tuned heuristic. When a
// new elementSyn* appears that isn't here, the script will assign
// 'composition' as default + log a warning recommending review.
const TIER_BY_NAME = new Map([
  // primitives
  ['avatar', 'primitive'], ['badge', 'primitive'], ['breadcrumb', 'primitive'],
  ['copy-button', 'primitive'], ['divider', 'primitive'], ['fab', 'primitive'],
  ['icon-label', 'primitive'], ['popover', 'primitive'], ['progress-bar', 'primitive'],
  ['qr-code', 'primitive'], ['scroll-top', 'primitive'], ['separator', 'primitive'],
  ['skeleton', 'primitive'], ['spacer', 'primitive'], ['stat-ticker', 'primitive'],
  ['tag', 'primitive'], ['tooltip', 'primitive'],
  // compositions
  ['accordion', 'composition'], ['autocomplete', 'composition'],
  ['avatar-group', 'composition'], ['avatar-upload', 'composition'],
  ['badge-group', 'composition'], ['code-block', 'composition'],
  ['color-picker', 'composition'], ['color-swatches', 'composition'],
  ['date-picker', 'composition'], ['dropdown', 'composition'],
  ['form-stepper', 'composition'], ['modal-trigger', 'composition'],
  ['otp-input', 'composition'], ['pagination', 'composition'],
  ['range-slider', 'composition'], ['rating-stars', 'composition'],
  ['rich-tooltip', 'composition'], ['search-box', 'composition'],
  ['select-multi', 'composition'], ['share-bar', 'composition'],
  ['signature-pad', 'composition'], ['social-proof', 'composition'],
  ['splitter', 'composition'], ['stepper', 'composition'], ['tabs', 'composition'],
  ['timeline-horizontal', 'composition'],
  // modules
  ['audio-player', 'module'], ['calendar', 'module'], ['carousel', 'module'],
  ['chart-bar', 'module'], ['comments-widget', 'module'], ['cookie-consent', 'module'],
  ['countdown-clock', 'module'], ['countdown-digital', 'module'],
  ['data-grid', 'module'], ['drawer', 'module'], ['dropzone', 'module'],
  ['file-uploader', 'module'], ['hero-banner', 'module'], ['kpi-card', 'module'],
  ['lightbox-gallery', 'module'], ['livestream', 'module'], ['map-pin', 'module'],
  ['notification-center', 'module'], ['notification-toast', 'module'],
  ['oembed', 'module'], ['poll', 'module'], ['quote-animated', 'module'],
  ['testimonial-carousel', 'module'], ['timeline', 'module'],
  ['toast-center', 'module'], ['tour-guide', 'module'], ['tree-view', 'module'],
  ['video-player', 'module'],
]);

// ── XML parsing helpers ──────────────────────────────────────────────────────

const ALIAS_RE = /<ContentType\s+Key="[^"]+"\s+Alias="(elementSyn[A-Z][a-zA-Z]*)"/;
const PROP_ALIAS_RE = /<Alias>([a-zA-Z]+)<\/Alias>/g;

function parseElementSynXml(xmlPath) {
  const xml = readFileSync(xmlPath, 'utf8');
  const aliasMatch = xml.match(ALIAS_RE);
  if (!aliasMatch) return null;
  const alias = aliasMatch[1];

  const props = [];
  let match;
  while ((match = PROP_ALIAS_RE.exec(xml)) !== null) {
    const propAlias = match[1];
    if (propAlias === alias) continue;             // ContentType alias itself
    if (UNIVERSAL_PROP_ALIASES.has(propAlias)) continue;
    if (props.includes(propAlias)) continue;        // dedup
    props.push(propAlias);
  }
  return { alias, props };
}

// ── Naming helpers ───────────────────────────────────────────────────────────

// Acronym overrides — names where the default kebab heuristic would
// split incorrectly. Add new entries here as needed.
const KEBAB_OVERRIDES = new Map([
  ['OEmbed', 'oembed'],
  ['QrCode', 'qr-code'],
  ['KpiCard', 'kpi-card'],
  ['OtpInput', 'otp-input'],
]);

/** elementSynAvatarUpload → avatar-upload */
function aliasToKebab(alias) {
  const suffix = alias.replace(/^elementSyn/, '');
  if (KEBAB_OVERRIDES.has(suffix)) return KEBAB_OVERRIDES.get(suffix);
  return suffix
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/** avatar-upload → AvatarUpload */
function kebabToPascal(kebab) {
  return kebab.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

// ── Generators ───────────────────────────────────────────────────────────────

function buildContractsFile(entries) {
  const header = `// ─── Element Configs: elementSyn* (CDN-hosted) ────────────────────────────────
// AUTO-GENERATED by tools/cms-sync.mjs.
// Source of truth: Synergos.CMS Synergos.CMS.Web/uSync/v9/ContentTypes/elementsyn*.config
//
// Each interface mirrors the property aliases of its CMS Element Type.
// Properties from compIntegration / compDom* are intentionally excluded —
// they live in shared base types and are applied by the wrapper, not
// per-component.
//
// To regenerate after CMS changes: \`node tools/cms-sync.mjs\`.
// Do NOT edit this file by hand.
`;

  const interfaces = entries.map(({ alias, kebab, tier, props }) => {
    const pascal = kebabToPascal(kebab);
    const propLines = props.map(p => `  readonly ${p}?: string;`).join('\n');
    return `\n/** ${alias} — tier:${tier} → tag:<synergos-${kebab}> */
export interface ${pascal}ElementConfig {
${propLines}
}`;
  }).join('\n');

  return header + interfaces + '\n';
}

function mergeRegistry(existing, syncEntries) {
  // Index existing by alias for fast lookup
  const byAlias = new Map(existing.map(e => [e.alias, e]));
  let added = 0;
  let updated = 0;

  for (const sync of syncEntries) {
    const current = byAlias.get(sync.alias);
    if (!current) {
      existing.push({
        name: sync.kebab,
        alias: sync.alias,
        tag: `synergos-${sync.kebab}`,
        tier: sync.tier,
      });
      added++;
      continue;
    }
    // Update tier if mismatch (tag/name preserved if they match)
    if (current.tier !== sync.tier) {
      current.tier = sync.tier;
      updated++;
    }
  }
  return { added, updated };
}

function detectMissingWebComponents(entries) {
  const missing = [];
  for (const { kebab, tier } of entries) {
    const path = resolve(APPS_ELEMENTS_DIR, `${tier}s`, kebab);
    if (!existsSync(path)) {
      missing.push({ kebab, tier, expectedPath: path });
    }
  }
  return missing;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log(`[cms-sync] Reading from: ${CMS_CONTENT_TYPES_DIR}`);

  if (!existsSync(CMS_CONTENT_TYPES_DIR)) {
    console.error(`[cms-sync] ERROR: CMS path not found. Use --cms-path=PATH or place repos as siblings.`);
    process.exit(1);
  }

  // 1. Find and parse all elementsyn* XMLs
  const synFiles = readdirSync(CMS_CONTENT_TYPES_DIR)
    .filter(f => f.toLowerCase().startsWith('elementsyn') && f.endsWith('.config'));

  console.log(`[cms-sync] Found ${synFiles.length} elementSyn* XMLs.`);

  const entries = [];
  let warnings = 0;
  for (const file of synFiles) {
    const parsed = parseElementSynXml(join(CMS_CONTENT_TYPES_DIR, file));
    if (!parsed) {
      console.warn(`[cms-sync] WARN: could not parse ${file}, skipping.`);
      warnings++;
      continue;
    }
    const kebab = aliasToKebab(parsed.alias);
    let tier = TIER_BY_NAME.get(kebab);
    if (!tier) {
      tier = 'composition';
      console.warn(`[cms-sync] WARN: ${parsed.alias} (${kebab}) has no tier assigned in TIER_BY_NAME — defaulting to "composition". Review tools/cms-sync.mjs.`);
      warnings++;
    }
    entries.push({ alias: parsed.alias, kebab, tier, props: parsed.props });
  }
  entries.sort((a, b) => a.alias.localeCompare(b.alias));

  // 2. Build new contracts file
  const contractsContent = buildContractsFile(entries);

  // 3. Merge registry (existing entries preserved)
  const existingRegistry = JSON.parse(readFileSync(REGISTRY_JSON_PATH, 'utf8'));
  const beforeCount = existingRegistry.length;
  const { added, updated } = mergeRegistry(existingRegistry, entries);
  const newRegistryJson = JSON.stringify(existingRegistry, null, 2) + '\n';

  // 4. Detect missing Web Components
  const missing = detectMissingWebComponents(entries);

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('[cms-sync] Summary');
  console.log(`  elementSyn* parsed:    ${entries.length}`);
  console.log(`  registry before:       ${beforeCount}`);
  console.log(`  registry added:        ${added}`);
  console.log(`  registry tier-updated: ${updated}`);
  console.log(`  missing Web Components: ${missing.length}`);
  console.log(`  parse warnings:        ${warnings}`);
  if (missing.length > 0) {
    console.log('');
    console.log('  Missing Web Component scaffolds (run scaffold manually):');
    for (const m of missing) {
      console.log(`    - ${m.tier}/${m.kebab}`);
    }
  }
  console.log('');

  // ── Write or report ───────────────────────────────────────────────────────
  if (DRY_RUN) {
    const currentContracts = existsSync(CONTRACT_OUT_PATH)
      ? readFileSync(CONTRACT_OUT_PATH, 'utf8')
      : '';
    const contractsChanged = currentContracts !== contractsContent;
    const registryChanged = added > 0 || updated > 0;
    if (contractsChanged || registryChanged) {
      console.log('[cms-sync] DRY-RUN: changes pending.');
      console.log(`  contracts file:  ${contractsChanged ? 'WOULD UPDATE' : 'unchanged'}`);
      console.log(`  registry json:   ${registryChanged ? 'WOULD UPDATE' : 'unchanged'}`);
      process.exit(2);
    }
    console.log('[cms-sync] DRY-RUN: in sync. No changes pending.');
    process.exit(0);
  }

  writeFileSync(CONTRACT_OUT_PATH, contractsContent, 'utf8');
  console.log(`[cms-sync] Wrote ${CONTRACT_OUT_PATH}`);

  if (added > 0 || updated > 0) {
    writeFileSync(REGISTRY_JSON_PATH, newRegistryJson, 'utf8');
    console.log(`[cms-sync] Wrote ${REGISTRY_JSON_PATH} (+${added} added, ${updated} tier-updated)`);
  } else {
    console.log(`[cms-sync] Registry unchanged.`);
  }

  if (missing.length > 0) {
    console.log('');
    console.log(`[cms-sync] WARNING: ${missing.length} Web Components missing.`);
    console.log('  Scaffold manually with the Ola 53 pattern (see SynergosDocs/ELEMENT_CONTRACT.md).');
  }

  process.exit(0);
}

main();
