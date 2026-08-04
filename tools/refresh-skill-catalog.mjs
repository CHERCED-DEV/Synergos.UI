#!/usr/bin/env node
/**
 * refresh-skill-catalog.mjs
 *
 * Regenera los 2 catálogos snapshot de la skill `synergos-architect`
 * desde las fuentes vivas (CDN registry + UI contracts):
 *
 *   1. .claude/skills/synergos-architect/references/ui-elements-catalog.md
 *      → 122 elementos publicados al CDN con tier, tag, framework, props
 *        del Syn{Name}Schema (auto) + {Name}ElementConfig (rich manual)
 *        + inputs declarados en element-inputs.json.
 *
 *   2. .claude/skills/synergos-architect/references/cms-to-ui-mapping.md
 *      → Tabla 1:1 alias CMS (elementSyn*) → UI bundle URL → tag DOM
 *        → schema mirror + rich config + Razor partial path.
 *
 * Run automaticamente al final del `release:angular` (ver package.json) para
 * que la skill nunca se quede desincronizada del CDN publicado.
 *
 * Uso manual:
 *   node tools/refresh-skill-catalog.mjs
 *
 * Exit codes:
 *   0 — OK
 *   1 — error de I/O o parsing
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT_UI       = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_REPO     = resolve(ROOT_UI, '..');

// Mismo override que catalog.mjs: CDN_ROOT gana, y si no, el default de
// Windows. Antes esto era un literal `C:/LOCAL_CDN/...` sin escapatoria, así
// que el script sólo podía correr en la máquina del arquitecto — y como está
// al final de `release:angular`, la cadena de release entera era Windows-only.
// `join`, no `resolve`: en Linux un default `C:/...` no es absoluto, y
// resolve lo pegaría al cwd escupiendo rutas tipo `/workspace/ui/C:/LOCAL_CDN`
// en el mensaje de error. join lo deja literal y el skip se lee claro.
const CDN_ROOT          = process.env.CDN_ROOT ?? 'C:/LOCAL_CDN/synergos';
const CDN_REGISTRY      = join(CDN_ROOT, 'registry.json');
const RICH_CONFIGS      = resolve(ROOT_UI, 'vitals/contracts/src/element-config.contract.ts');
const SCHEMA_MIRROR     = resolve(ROOT_UI, 'vitals/contracts/src/elements-syn.contract.ts');
const ELEMENT_INPUTS    = resolve(ROOT_UI, 'vitals/contracts/src/element-inputs.json');
const ELEMENT_REGISTRY  = resolve(ROOT_UI, 'vitals/contracts/src/element-registry.json');

const SKILL_DIR         = resolve(ROOT_REPO, '.claude/skills/synergos-architect/references');
const CATALOG_OUT       = resolve(SKILL_DIR, 'ui-elements-catalog.md');
const MAPPING_OUT       = resolve(SKILL_DIR, 'cms-to-ui-mapping.md');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

/** Parse `export interface XxxElementConfig { ... }` blocks from rich config. */
function parseRichConfigs(source) {
  const map = new Map();
  // Simpler regex: extract name + body lines (no comment capture).
  const blockRe = /export interface (\w+ElementConfig)\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(source)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = [];
    const fieldRe = /readonly\s+(\w+)\??:\s*([^;]+);/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push({ name: fm[1], type: fm[2].trim() });
    }
    map.set(name, fields);
  }
  return map;
}

/** Parse `export interface SynXxxSchema { ... }` blocks. */
function parseSchemaMirror(source) {
  const map = new Map();
  const blockRe = /\/\*\*\s*(elementSyn\w+)[^*]*\*\/\s*\nexport interface (Syn\w+Schema)\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(source)) !== null) {
    const alias = m[1];
    const interfaceName = m[2];
    const body = m[3];
    const fields = [];
    const fieldRe = /readonly\s+(\w+)\??:\s*([^;]+);/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push({ name: fm[1], type: fm[2].trim() });
    }
    map.set(alias, { interfaceName, fields });
  }
  return map;
}

function kebabToPascal(kebab) {
  return kebab.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

// ── Loaders ──────────────────────────────────────────────────────────────────

// Los guards de main() comprobaban estas rutas, pero este módulo las leía
// ANTES en el nivel superior: el proceso reventaba con un ENOENT crudo y los
// mensajes de error nunca llegaban a imprimirse. Diferidos a main().
let cdnRegistry;
const elementRegistry = readJson(ELEMENT_REGISTRY);
const elementInputs = readJson(ELEMENT_INPUTS);
const richConfigs = parseRichConfigs(readText(RICH_CONFIGS));
const schemaMirror = parseSchemaMirror(readText(SCHEMA_MIRROR));

// Index UI registry by name for tag/alias lookup
const uiByName = new Map(elementRegistry.map(e => [e.name, e]));

// ── Generator: ui-elements-catalog.md ────────────────────────────────────────

function buildCatalog() {
  // Group CDN elements by tier
  const byTier = { primitive: [], composition: [], module: [], experience: [] };
  for (const el of cdnRegistry.elements) {
    const tier = el.tier || 'composition';
    if (!byTier[tier]) byTier[tier] = [];
    byTier[tier].push(el);
  }
  for (const tier of Object.keys(byTier)) {
    byTier[tier].sort((a, b) => a.name.localeCompare(b.name));
  }

  let md = `# UI Elements Catalog — 122 bundles publicados al CDN

> **AUTO-GENERATED** by \`tools/refresh-skill-catalog.mjs\`. Re-run via \`npm run skill:refresh\`
> o automáticamente al final de \`npm run release:angular\`. Edits manuales se pierden.
>
> Snapshot del CDN registry (\`C:\\LOCAL_CDN\\synergos\\registry.json\`) + UI contracts
> (\`vitals/contracts/src/{element-config,elements-syn,element-inputs}\`).
>
> Generated: ${new Date().toISOString()}

## Cómo leer este catálogo

Cada elemento listado tiene:
- **\`tag\`**: el custom element DOM name que el SSR Razor del CMS emite
  (\`<synergos-{kebab}>\`).
- **\`alias\`**: el alias CMS uSync (\`elementSyn{Pascal}\`) que aparece en los
  ContentTypes XMLs de \`Synergos.CMS.Web/uSync/v9/ContentTypes/\`.
- **\`framework\`(s)**: el(los) framework(s) en los que el bundle está publicado
  Hoy la única plataforma es angular (purga 2026-08-04).
- **\`shape rich\`** (cuando existe): el contract canónico editorial 3-way mirror
  C# \`CdnConfig\` ↔ TypeScript \`{Name}ElementConfig\` ↔ Web Component \`config\`
  prop. Vive en \`vitals/contracts/src/element-config.contract.ts\` (manual).
- **\`shape schema\`**: mirror 1:1 del schema CMS uSync (props con sus aliases
  literales). Vive en \`vitals/contracts/src/elements-syn.contract.ts\`
  (auto-generado por \`cms-sync.mjs\`).
- **\`inputs\`**: declaraciones públicas exposadas como atributos del Custom
  Element (\`element-inputs.json\` — kebab-case en HTML, camelCase aquí).

Cuando recomendes un elemento, **siempre** mencioná: tier, tag DOM, y la
shape que el bundle espera (rich si existe, schema si no).

`;

  const tierDescriptions = {
    primitive: '**Primitives** — atómicos, sin lógica de negocio. Building blocks reutilizables (avatar, badge, divider, etc.). Pueden vivir solos o composarse.',
    composition: '**Compositions** — combinan 2+ primitives + lógica simple. Self-contained editorial pieces (accordion, dropdown, search-box, etc.). Hidratan en cliente.',
    module: '**Modules** — features ricas con state propio + posiblemente fetch (carousel, hero, comments-widget, etc.). Self-contained but heavier.',
    experience: '**Experiences** — apps completas multi-step, normalmente con su propio routing/state machine (feature-journey, insight-explorer, etc.). El más alto nivel.',
  };

  for (const tier of ['primitive', 'composition', 'module', 'experience']) {
    const elements = byTier[tier] || [];
    if (elements.length === 0) continue;
    md += `\n## ${tier[0].toUpperCase() + tier.slice(1)}s (${elements.length})\n\n`;
    md += `${tierDescriptions[tier]}\n\n`;

    for (const el of elements) {
      const pascal = kebabToPascal(el.name);
      const richKey = `${pascal}ElementConfig`;
      const richFields = richConfigs.get(richKey);
      const aliasGuess = `elementSyn${pascal}`;
      const schemaEntry = schemaMirror.get(aliasGuess);
      const inputsArr = Array.isArray(elementInputs[el.name]) ? elementInputs[el.name] : [];
      const frameworks = Object.keys(el.implementations || {}).join(', ') || '(none)';

      md += `### \`<synergos-${el.name}>\` — ${el.alias || aliasGuess}\n\n`;
      md += `- **tag**: \`<synergos-${el.name}>\`\n`;
      md += `- **alias CMS**: \`${el.alias || aliasGuess}\`\n`;
      md += `- **tier**: ${tier}\n`;
      md += `- **frameworks**: ${frameworks}\n`;

      if (richFields && richFields.length > 0) {
        md += `- **shape rich** (\`${richKey}\` — manual canónico):\n`;
        for (const f of richFields) {
          md += `  - \`${f.name}\`: ${f.type}\n`;
        }
      }

      if (schemaEntry && schemaEntry.fields.length > 0) {
        md += `- **shape schema** (\`${schemaEntry.interfaceName}\` — auto del CMS):\n`;
        for (const f of schemaEntry.fields) {
          md += `  - \`${f.name}\`: ${f.type}\n`;
        }
      }

      if (inputsArr.length > 0) {
        md += `- **inputs públicos** (HTML attributes, kebab-case en DOM):\n`;
        for (const inp of inputsArr) {
          const required = inp.required ? ' *(required)*' : '';
          const desc = inp.description ? ` — ${inp.description}` : '';
          md += `  - \`${inp.name}\` (${inp.type})${required}${desc}\n`;
        }
      }

      if (!richFields && !schemaEntry && inputsArr.length === 0) {
        md += `- **shape**: (sin declaración — auto-generated, edit \`element-inputs.json\` manual para enriquecer)\n`;
      }

      md += '\n';
    }
  }

  md += `\n## Cómo se consume desde el CMS Razor

Cuando un ContentType (e.g. \`elementSynHero\`) renderiza, el partial Razor en
\`Views/Partials/SynHost/{Block}.cshtml\` invoca \`ISynHostEmitter.EmitAsync\` que:

1. Resuelve el bundle vía \`IBundleRegistryClient\` (default \`FileSystemBundleRegistryClient\`
   leyendo \`C:\\LOCAL_CDN\\synergos\\registry.json\`).
2. Emite \`<script type="module" defer src="/cdn-bundles/{name}/{framework}/{slot}/main.js"
   integrity="sha384-..." crossorigin="anonymous"></script>\`.
3. Emite \`<synergos-{name} config='{...JSON con culture+props+overrides}'></synergos-{name}>\`.
4. Si el registry no resuelve (CDN offline), emite el offline fallback con
   \`data-synergos-cdn-offline="true"\` + skeleton shimmer (cap-310 default CSS).

## Edit policy

- **Rich shape (\`element-config.contract.ts\`)**: editar a mano. Es el contract
  canónico para los Web Components que evolucionaron a tener config editorial
  rico (translations, semantic fields, etc.). 64 elements actualmente.
- **Schema mirror (\`elements-syn.contract.ts\`)**: NO editar. Auto-regenerado
  por \`tools/cms-sync.mjs\` cada vez que cambia el schema uSync del CMS. 71
  interfaces \`Syn{Pascal}Schema\`.
- **Inputs JSON (\`element-inputs.json\`)**: editar manualmente para enriquecer
  las declaraciones públicas de cada Custom Element (default values, descriptions
  para editor docs). Es leído por el audit \`element-contract-audit.mjs\`.
- **Este catálogo**: NO editar — auto-regenerado.
`;

  return md;
}

// ── Generator: cms-to-ui-mapping.md ──────────────────────────────────────────

function buildMapping() {
  const synEntries = cdnRegistry.elements
    .filter(el => (el.alias || '').startsWith('elementSyn'))
    .sort((a, b) => a.alias.localeCompare(b.alias));

  let md = `# CMS Schema ↔ UI Bundle — Mapping table

> **AUTO-GENERATED** by \`tools/refresh-skill-catalog.mjs\`. Re-run via \`npm run skill:refresh\`.
>
> Esta tabla cierra el loop entre el schema CMS uSync (lo que el editor llena
> en backoffice) y el bundle UI que efectivamente hidrata en el browser.
>
> Generated: ${new Date().toISOString()}

## Pipeline editor → bundle

\`\`\`
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Editor crea contenido en backoffice usando ContentType:          │
│    → Synergos.CMS.Web/uSync/v9/ContentTypes/elementsyn{name}.config │
├─────────────────────────────────────────────────────────────────────┤
│ 2. Razor partial Views/Partials/SynHost/{Pascal}.cshtml renderiza:  │
│    → ISynHostEmitter.EmitAsync(blockAlias, props)                   │
├─────────────────────────────────────────────────────────────────────┤
│ 3. IBundleRegistryClient resuelve URL del bundle:                   │
│    → /cdn-bundles/{name}/{framework}/{slot}/main.js                 │
├─────────────────────────────────────────────────────────────────────┤
│ 4. HTML emitido al browser:                                         │
│    <script src="..." integrity="..." defer type="module"></script>  │
│    <synergos-{name} config='{...}'>                                 │
│      <!-- offline fallback si descriptor null -->                   │
│    </synergos-{name}>                                               │
├─────────────────────────────────────────────────────────────────────┤
│ 5. Browser carga el bundle, define el Custom Element, hidrata:      │
│    → upgrade reemplaza el fallback con el component real           │
└─────────────────────────────────────────────────────────────────────┘
\`\`\`

## Tabla maestra (alias CMS → bundle UI)

| Alias CMS | Tag DOM | Tier | Framework(s) | Versions disponibles | Schema mirror | Rich config |
|---|---|---|---|---|---|---|
`;

  for (const el of synEntries) {
    const pascal = kebabToPascal(el.name);
    const aliasGuess = `elementSyn${pascal}`;
    const richKey = `${pascal}ElementConfig`;
    const hasRich = richConfigs.has(richKey);
    const schemaEntry = schemaMirror.get(el.alias || aliasGuess);

    const frameworks = Object.keys(el.implementations || {}).join(', ');
    const versions = [];
    for (const [fw, slots] of Object.entries(el.implementations || {})) {
      const slotList = Object.keys(slots).join('/');
      versions.push(`${fw}: ${slotList}`);
    }
    const versionStr = versions.join('<br/>');

    md += `| \`${el.alias || aliasGuess}\` | \`<synergos-${el.name}>\` | ${el.tier || '?'} | ${frameworks || '?'} | ${versionStr || '?'} | ${schemaEntry ? '`' + schemaEntry.interfaceName + '`' : '—'} | ${hasRich ? '`' + richKey + '`' : '—'} |\n`;
  }

  md += `\n## Recomendaciones para el arquitecto

### Cuando recomiende un elementSyn*

Para cada \`elementSyn{Name}\`, siempre cita:

1. **Alias CMS**: \`elementSyn{Name}\` (lo que va en \`<Composition>\` references o como tipo del Block Grid)
2. **Tag DOM**: \`<synergos-{kebab}>\` (lo que el browser va a hidratar)
3. **Bundle URL**: \`/cdn-bundles/{name}/{framework}/{slot}/main.js\` (lo que el Razor emite)
4. **Shape esperado**: si tiene rich config, usar \`{Pascal}ElementConfig\`; si no, \`Syn{Pascal}Schema\`.
5. **Razor partial** (si el arquitecto va a customizar SSR): \`Views/Partials/SynHost/{Pascal}.cshtml\`.

### Cuando vea un schema con compIntegration

Si un ContentType compone \`compIntegration\`, significa que es un block
CDN-hosted (\`elementSyn*\`) y necesita un bundle UI publicado para hidratar.
Confirma que el alias está en esta tabla. Si NO está, el block existe en CMS
pero el bundle UI no está publicado todavía — el SSR va a emitir offline
fallback (\`data-synergos-cdn-offline="true"\`).

### Cuando el arquitecto pregunte "qué inputs acepta X"

Cita el \`{Pascal}ElementConfig\` (rich, si existe — más completo) o
\`Syn{Pascal}Schema\` (auto, refleja el schema CMS literal). El detalle por
cada elemento está en \`ui-elements-catalog.md\`.

## Edit policy

NO editar este archivo a mano — auto-regenerado.
`;

  return md;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Refrescar el catálogo de la skill es una COMODIDAD del entorno local, no
  // un paso del release: la skill vive en `.claude/`, que está gitignorado.
  // Antes su ausencia tumbaba `release:angular` entero. Ahora avisa y sale 0.
  if (!existsSync(CDN_REGISTRY)) {
    console.warn(`[refresh-skill-catalog] SKIP — no hay registry del CDN en ${CDN_REGISTRY}`);
    console.warn('  Publicá bundles primero, o apuntá CDN_ROOT a tu CDN local.');
    return;
  }
  if (!existsSync(SKILL_DIR)) {
    console.warn(`[refresh-skill-catalog] SKIP — no existe ${SKILL_DIR}`);
    console.warn('  Normal fuera de la máquina del arquitecto: .claude/ está gitignorado.');
    return;
  }

  cdnRegistry = readJson(CDN_REGISTRY);

  console.log('[refresh-skill-catalog] Reading sources...');
  console.log(`  CDN registry:    ${cdnRegistry.elements.length} elements`);
  console.log(`  Rich configs:    ${richConfigs.size} interfaces`);
  console.log(`  Schema mirrors:  ${schemaMirror.size} interfaces`);
  console.log(`  Element inputs:  ${Object.keys(elementInputs).filter(k => !k.startsWith('_')).length} keys`);

  console.log('\n[refresh-skill-catalog] Generating ui-elements-catalog.md...');
  writeFileSync(CATALOG_OUT, buildCatalog(), 'utf8');
  console.log(`  → ${CATALOG_OUT}`);

  console.log('\n[refresh-skill-catalog] Generating cms-to-ui-mapping.md...');
  writeFileSync(MAPPING_OUT, buildMapping(), 'utf8');
  console.log(`  → ${MAPPING_OUT}`);

  console.log('\n[refresh-skill-catalog] Done. Skill catalogs in sync with CDN registry.');
}

main();
