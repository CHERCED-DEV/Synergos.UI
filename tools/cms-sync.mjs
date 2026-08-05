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
const INPUTS_JSON_PATH      = resolve(ROOT_UI,  'vitals/contracts/src/element-inputs.json');
const MODELS_DIR            = resolve(ROOT_UI,  'vitals/core/src/models');
const MODELS_INDEX_PATH     = resolve(MODELS_DIR, 'index.ts');
const BLOCK_MAPPER_PATH     = resolve(ROOT_UI,  'vitals/core/src/mappers/block.mapper.ts');

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

  // ── Las verticales completas (issue #3) ────────────────────────────────────
  //
  // Faltaban las de abajo, y el default de `composition` NO era una
  // aproximación razonable: era una regresión silenciosa. El registry ya las
  // declaraba bien como `module`, y sincronizar las habría SOBREESCRITO con el
  // valor por defecto — o sea que `cms-sync` no corregía el drift, lo metía.
  //
  // Y no es cosmético. El presupuesto de tamaño (issue #8) elige el techo POR
  // TIER, así que degradar un `module` a `composition` le baja el techo de
  // 72 KB a 44 KB. Se comprobó corriendo el sync de verdad:
  //
  //     ✗ booking-wizard: 45.7 KB > 44.0 KB (tier composition) — 1.04× el techo
  //
  // Los otros diez sobrevivían sólo porque tienen excepción nombrada: la avería
  // quedaba tapada por casualidad, no por diseño.
  //
  // Cada una es una APLICACIÓN entera montada en una página —una tienda, una
  // historia clínica, un portal de trámites—, no un elemento compuesto.
  ['academy', 'module'], ['app-launcher', 'module'], ['blogs', 'module'],
  ['booking-wizard', 'module'], ['ehr', 'module'], ['eventos', 'module'],
  ['gov', 'module'], ['realty', 'module'], ['seller', 'module'],
  ['storefront', 'module'], ['travel-shell', 'module'],

  // Estas cuatro entran NUEVAS al registry, y su tier no se elige libre: el
  // mismo `name` ya existe bajo un alias `elementComp*`, y `publish.mjs`
  // deduplica por nombre quedándose con la primera. Con tiers distintos, el
  // tier publicado dependería del ORDEN del array — así que se copia el que ya
  // tiene la entrada existente.
  ['faq-section', 'module'],          // ya existe como elementCompFaqList [module]
  ['feature-grid', 'module'],         // ya existe como elementCompFeatureGrid [module]
  ['testimonial-section', 'module'],  // ya existe como elementCompTestimonialList [module]
  ['media-text', 'composition'],      // ya existe como elementCompMediaTextSplit [composition]

  // Sin precedente en el registry. Su propio DocType lo dice: «Monta una app
  // Angular completa (módulo) en la página».
  ['module-mount', 'module'],

  // Ya salía bien por el default, pero explícito no avisa — y no se puede
  // degradar sin que alguien lo escriba.
  ['seat-map', 'composition'],

  // Estrenaron DocType al cerrar el issue #16: eran bundles publicados que
  // ningún editor podía colocar. El tier coincide con el que ya traían en el
  // registry; se escribe igual, porque el default no avisa.
  ['button-group', 'composition'],
  ['info-block', 'composition'],
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
  const header = `// ─── Element Schemas: elementSyn* (CDN-hosted) ────────────────────────────────
// AUTO-GENERATED by tools/cms-sync.mjs.
// Source of truth: Synergos.CMS Synergos.CMS.Web/uSync/v9/ContentTypes/elementsyn*.config
//
// Each interface mirrors the property aliases of its CMS Element Type 1:1
// (schema-shape). Property names match the CMS uSync XML <Alias> verbatim;
// values are typed as string (CMS serializes everything as text and the
// component does its own type coercion downstream).
//
// Naming convention: \`Syn{Pascal}Schema\` — distinto del manual
// \`element-config.contract.ts\` (3-way mirror rich editorial) que usa
// \`{Pascal}ElementConfig\`. Los dos archivos coexisten sin colisión:
// el rich es el contract canónico para Web Components; el schema mirror
// es para validación / diagnostics / tooling que necesite el shape literal
// del CMS.
//
// To regenerate after CMS changes: \`node tools/cms-sync.mjs\`.
// Do NOT edit this file by hand.
`;

  const interfaces = entries.map(({ alias, kebab, tier, props }) => {
    const pascal = kebabToPascal(kebab);
    const propLines = props.map(p => `  readonly ${p}?: string;`).join('\n');
    return `\n/** ${alias} — tier:${tier} → tag:<synergos-${kebab}> */
export interface Syn${pascal}Schema {
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

// ── Auto-generation of 4 contract artifacts per elementSyn* ─────────────────
// El audit `tools/element-contract-audit.mjs` exige que cada entry del
// registry tenga: (1) entrada en `vitals/core/src/mappers/block.mapper.ts`,
// (2) file `vitals/core/src/models/{kebab}-inputs.model.ts`, (3) export
// en `vitals/core/src/models/index.ts`, (4) entrada en
// `vitals/contracts/src/element-inputs.json`.
//
// Las 4 son idempotent-merge: si ya existen, no se tocan (preserva los
// hand-curated). Sólo agrega lo que falta. Justificación: los elementSyn*
// son schema-driven desde uSync, así que la mejor fuente para autogenerarlos
// es el mismo cms-sync que ya parsea sus props.

const AUTO_GEN_BANNER = `/**
 * AUTO-GENERATED by tools/cms-sync.mjs.
 * Source: Synergos.CMS Synergos.CMS.Web/uSync/v9/ContentTypes/elementsyn{Name}.config
 * Re-run \`node tools/cms-sync.mjs\` to regenerate. Edits will be lost.
 */`;

function buildModelFile(kebab, props) {
  const pascal = kebabToPascal(kebab);
  // El audit pide modelos con shape `field: type` (ver parseModelFields
  // regex en element-contract-audit.mjs: `/^\s{2}([A-Za-z0-9]+)\??:\s*[^;]+;$/`).
  // Emitimos config opcional + props del schema CMS como string.
  const propLines = props.map(p => `  ${p}?: string;`).join('\n');
  return `${AUTO_GEN_BANNER}
export interface ${pascal}Inputs {
  config?: string;
${propLines}
}
`;
}

// Hints contextuales por sufijo / prefijo común de prop name. Mejora las
// descriptions del element-inputs.json que se exponen al editor en docs.
// Prioridad: match más específico (full token) > sufijo > default.
const PROP_HINT_BY_TOKEN = new Map([
  // Identidad / contenido
  ['heading',         'Texto principal mostrado como heading'],
  ['headingText',     'Texto principal mostrado como heading'],
  ['headingLevel',    'Nivel HTML del heading: h1-h6 (afecta solo semántica, no estilo)'],
  ['title',           'Título mostrado destacado'],
  ['subtitle',        'Texto secundario debajo del título'],
  ['body',            'Texto descriptivo / párrafo de contenido'],
  ['description',     'Descripción extendida del elemento'],
  ['label',           'Texto visible del elemento (botón, input, badge, etc.)'],
  ['placeholder',     'Texto guía mostrado cuando el campo está vacío'],
  ['name',            'Identificador o nombre mostrado'],
  ['caption',         'Texto descriptivo bajo el contenido principal'],
  // Media
  ['imageSrc',        'URL de la imagen (típicamente picker MediaPicker3)'],
  ['imageAlt',        'Texto alternativo para accesibilidad de la imagen'],
  ['videoSrc',        'URL del video'],
  ['avatarImage',     'URL de la imagen avatar'],
  ['icon',            'Nombre del icono stock o URL del SVG custom'],
  ['logo',            'URL del logo'],
  // CTA / acciones
  ['ctaLabel',        'Texto del call-to-action (botón)'],
  ['ctaUrl',          'URL destino del call-to-action'],
  ['ctaTarget',       'Comportamiento click: _self (misma pestaña) | _blank (nueva)'],
  ['href',            'URL destino del link'],
  ['target',          'Comportamiento click: _self | _blank'],
  ['action',          'URL destino del form submit o action handler'],
  // Estado / variantes
  ['variant',         'Variante visual (definida por el theme del host CSS)'],
  ['theme',           'Tema visual: light | dark | silverGold u override custom'],
  ['size',            'Tamaño: sm | md | lg | xl según escala del componente'],
  ['tone',            'Tono semántico: neutral | success | warning | danger | info'],
  ['disabled',        'Si "true", desactiva interacción del elemento'],
  // Layout
  ['width',           'Ancho explícito (CSS value: px / % / fr / auto)'],
  ['minWidth',        'Ancho mínimo (CSS value)'],
  ['maxWidth',        'Ancho máximo (CSS value)'],
  ['height',          'Alto explícito (CSS value)'],
  ['gap',             'Separación entre items hijos (CSS value)'],
  ['alignment',       'Alineación: start | center | end | stretch'],
  // Datos / colecciones
  ['itemsJson',       'Array de items serializado como JSON string'],
  ['allowMultiple',   'Si "true", permite múltiples items abiertos/seleccionados a la vez'],
  ['integration',     'Hook opcional para integración custom — vacío por default'],
  ['ariaLabel',       'Texto descriptivo para screen readers (override)'],
  ['ariaRole',        'Rol ARIA semántico custom'],
]);

function humanizeProp(p) {
  // camelCase → "Camel Case"
  return p
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function describeProp(p, kebab) {
  const exact = PROP_HINT_BY_TOKEN.get(p);
  if (exact) return exact;
  // Match por substring: si el prop contiene un token conocido, usa esa hint
  // como base + agrega el sufijo distintivo.
  for (const [token, hint] of PROP_HINT_BY_TOKEN) {
    if (p.toLowerCase().includes(token.toLowerCase()) && p !== token) {
      return `${hint} (campo "${humanizeProp(p)}" del componente synergos-${kebab})`;
    }
  }
  // Fallback: humanize del prop name + tag context.
  return `Campo "${humanizeProp(p)}" del componente synergos-${kebab}. Editor: editar manualmente para enriquecer documentación.`;
}

function buildInputEntry(props, kebab) {
  // Shape exigido por element-inputs.json: array de descriptores con
  // name/type/required/default/description (ver hero entry como referencia).
  const inputs = [
    {
      name: 'config',
      type: 'json',
      required: false,
      description: 'Base element configuration object. Prefer this payload for structural content; direct inputs act as state or override props.',
    },
    ...props.map(p => ({
      name: p,
      type: 'string',
      required: false,
      default: '',
      description: describeProp(p, kebab),
    })),
  ];
  return inputs;
}

function buildMapperEntry(alias, kebab) {
  // Pass-through mapper: para elementSyn* sin custom mapper function,
  // emitimos los props as-is via toRecord. Si en el futuro se necesita
  // custom mapping (e.g. parse JSON arrays), se reemplaza manualmente
  // y el merge respeta eso (no overwrite si el alias ya existe).
  return `  ${alias}: {
    tag: 'synergos-${kebab}',
    map: (d) => toRecord(d),
  },\n`;
}

function syncModelFiles(entries) {
  let written = 0;
  let skipped = 0;
  for (const { kebab, props } of entries) {
    const modelPath = resolve(MODELS_DIR, `${kebab}-inputs.model.ts`);
    if (existsSync(modelPath)) {
      skipped++;
      continue; // hand-curated o ya generado — preserve
    }
    if (!DRY_RUN) {
      writeFileSync(modelPath, buildModelFile(kebab, props), 'utf8');
    }
    written++;
  }
  return { written, skipped };
}

function syncModelsIndex(entries) {
  const current = readFileSync(MODELS_INDEX_PATH, 'utf8');
  const existingExports = new Set(
    [...current.matchAll(/\.\/([a-z0-9-]+)-inputs\.model/gu)].map(m => m[1]),
  );
  const toAdd = entries.filter(e => !existingExports.has(e.kebab));
  if (toAdd.length === 0) return { added: 0 };

  const newLines = toAdd.map(e => `export * from './${e.kebab}-inputs.model';`).join('\n');
  const updated = current.trimEnd() + '\n' + newLines + '\n';
  if (!DRY_RUN) {
    writeFileSync(MODELS_INDEX_PATH, updated, 'utf8');
  }
  return { added: toAdd.length };
}

function syncInputsJson(entries) {
  const current = JSON.parse(readFileSync(INPUTS_JSON_PATH, 'utf8'));
  let added = 0;
  let enriched = 0;
  for (const { kebab, props } of entries) {
    if (kebab in current) {
      // Re-enrich descriptions if existing entry tiene el stub generic
      // viejo. Preserva manual customizations.
      const arr = current[kebab];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      let touched = false;
      for (const inp of arr) {
        if (inp.description === 'Auto-generated from CMS schema. Edit description manually for editor docs.') {
          inp.description = describeProp(inp.name, kebab);
          touched = true;
        }
      }
      if (touched) enriched++;
      continue;
    }
    current[kebab] = buildInputEntry(props, kebab);
    added++;
  }
  if ((added > 0 || enriched > 0) && !DRY_RUN) {
    writeFileSync(INPUTS_JSON_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
  }
  return { added, enriched };
}

function syncBlockMapper(entries) {
  const current = readFileSync(BLOCK_MAPPER_PATH, 'utf8');
  // Extract aliases ya presentes (todas las keys del REGISTRY object).
  const existingAliases = new Set(
    [...current.matchAll(/^  (element[A-Z][A-Za-z0-9]+):\s*\{$/gmu)].map(m => m[1]),
  );
  const toAdd = entries.filter(e => !existingAliases.has(e.alias));
  if (toAdd.length === 0) return { added: 0 };

  const insertion = toAdd.map(e => buildMapperEntry(e.alias, e.kebab)).join('');
  // Insert before the REGISTRY closing `};` (línea ~581 actualmente).
  // Tolerant of CRLF/LF mixed line endings (Windows files).
  const closingPattern = /\r?\n\};\r?\n\r?\nexport function mapBlockToElementResult/u;
  if (!closingPattern.test(current)) {
    throw new Error('block.mapper.ts: cannot find REGISTRY closing — manual review needed.');
  }
  const updated = current.replace(closingPattern, `\n${insertion}};\n\nexport function mapBlockToElementResult`);
  if (!DRY_RUN) {
    writeFileSync(BLOCK_MAPPER_PATH, updated, 'utf8');
  }
  return { added: toAdd.length };
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

  // 2. Build new contracts file. Naming `Syn{Pascal}Schema` ya NO colisiona
  // con el manual `{Pascal}ElementConfig` — los dos archivos coexisten.
  const contractsContent = buildContractsFile(entries);

  // 3. Merge registry (existing entries preserved)
  const existingRegistry = JSON.parse(readFileSync(REGISTRY_JSON_PATH, 'utf8'));
  const beforeCount = existingRegistry.length;
  const { added, updated } = mergeRegistry(existingRegistry, entries);
  const newRegistryJson = JSON.stringify(existingRegistry, null, 2) + '\n';

  // 4. Detect missing Web Components
  const missing = detectMissingWebComponents(entries);

  // 5. Auto-generate the 4 contract artifacts the audit requires
  // (idempotent — no overwrites of hand-curated files).
  const modelsResult = syncModelFiles(entries);
  const indexResult = syncModelsIndex(entries);
  const inputsResult = syncInputsJson(entries);
  const mapperResult = syncBlockMapper(entries);

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('[cms-sync] Summary');
  console.log(`  elementSyn* parsed:    ${entries.length}`);
  console.log(`  emitted to contract:   ${entries.length}`);
  console.log(`  registry before:       ${beforeCount}`);
  console.log(`  registry added:        ${added}`);
  console.log(`  model files written:   ${modelsResult.written} (${modelsResult.skipped} preserved)`);
  console.log(`  models index added:    ${indexResult.added}`);
  console.log(`  input entries added:   ${inputsResult.added}`);
  console.log(`  input entries enriched: ${inputsResult.enriched}`);
  console.log(`  mapper entries added:  ${mapperResult.added}`);
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
