// =============================================================================
// sync-tokens.mjs — Synergos.CMS ↔ UI tokens sync
//
// Lee `Synergos.CMS.Web/wwwroot/css/syn-tokens.css` (source of truth) y
// regenera `platforms/angular/libs/shared/src/styles/_tokens-bridge.scss`
// con todos los `--syn-*` custom properties + theme overrides para fallback
// standalone.
//
// Contract canónico: Synergos.CMS.Web/docs/contracts/css-tokens.md (cap-220).
// Cap-230 Olas 225-226 / ADR 0084.
//
// Uso:
//   node tools/sync-tokens.mjs                       # escribe el bridge
//   node tools/sync-tokens.mjs --check               # gate G-1: NO escribe,
//                                                     # compara y exit 1 si difiere
//   SYNERGOS_CMS_PATH=/path/to/cms node tools/sync-tokens.mjs
//
// Gate G-1 (anti-drift, Ola 2 del roadmap maestro): con --check regenera
// el bridge a un buffer en memoria y lo COMPARA contra el archivo
// commiteado. Si difieren, imprime un diff y termina con exit 1 SIN
// escribir — atrapa un _tokens-bridge.scss stale en CI / pre-commit.
//
// Defaults (sibling dirs convention):
//   CMS:  ../../../Synergos.CMS/Synergos.CMS.Web/wwwroot/css/syn-tokens.css
//   UI:   ./libs/shared/src/styles/_tokens-bridge.scss
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkMode = process.argv.includes('--check');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const angularRoot = resolve(__dirname, '..');
// platforms/angular → Synergos.UI → workspace root (sibling to Synergos.CMS)
const workspaceRoot = resolve(angularRoot, '..', '..', '..');

const cmsTokensPath = process.env.SYNERGOS_CMS_PATH
  ? resolve(process.env.SYNERGOS_CMS_PATH, 'Synergos.CMS.Web/wwwroot/css/syn-tokens.css')
  : resolve(workspaceRoot, 'Synergos.CMS/Synergos.CMS.Web/wwwroot/css/syn-tokens.css');

const uiOutputPath = resolve(
  angularRoot,
  'libs/shared/src/styles/_tokens-bridge.scss',
);

if (!existsSync(cmsTokensPath)) {
  console.error(`[sync-tokens] CMS tokens file not found: ${cmsTokensPath}`);
  console.error('[sync-tokens] Set SYNERGOS_CMS_PATH env var or check sibling dirs convention.');
  process.exit(1);
}

const sourceCss = readFileSync(cmsTokensPath, 'utf8');

// Extract blocks que contengan al menos un --syn-* declaration. Approach:
// 1. Iterar caracteres tracking depth de braces.
// 2. Cada vez que cerramos al depth 0, leer (selector, body).
// 3. Filtrar a blocks con --syn-.
// Robusto contra @media + comentarios + multi-selector.
function extractBlocks(css) {
  const blocks = [];
  let depth = 0;
  let blockStart = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        // Grab selector — todo entre el último } anterior (o inicio del file)
        // y blockStart, después strip comments.
        let selectorStart = 0;
        for (let j = blockStart - 1; j >= 0; j--) {
          if (css[j] === '}') { selectorStart = j + 1; break; }
        }
        const rawSelector = css.slice(selectorStart, blockStart);
        const cleanSelector = rawSelector
          // Strip block comments
          .replace(/\/\*[\s\S]*?\*\//g, '')
          // Collapse whitespace
          .replace(/\s+/g, ' ')
          .trim();
        const body = css.slice(blockStart + 1, i).trim();
        if (cleanSelector && body.includes('--syn-')) {
          blocks.push({ selector: cleanSelector, body });
        }
      }
    }
  }
  return blocks;
}

const blocks = extractBlocks(sourceCss);
if (blocks.length === 0) {
  console.error('[sync-tokens] No :root or [data-theme] blocks found in source.');
  process.exit(1);
}

// Rebuild SCSS output. Header is hand-maintained to explain consumer pattern;
// body is generated.
const generatedAt = new Date().toISOString();
const cmsRel = relative(angularRoot, cmsTokensPath).replace(/\\/g, '/');

const header = `// =============================================================================
// Synergos UI — CSS tokens bridge (AUTO-GENERATED)
//
// Source of truth: ${cmsRel}
// Regenerate: \`node tools/sync-tokens.mjs\` (cap-230, ADR 0084).
//
// Contract: docs/contracts/css-tokens.md en el repo CMS.
// Owner: Synergos.CMS host emite las tokens via wwwroot/css/syn-tokens.css.
// Consumer: este archivo declara los mismos defaults defensivos para que
// los components UI funcionen también STANDALONE (Storybook, dev preview).
//
// Cada token consumido por un component DEBE usar var(--syn-X, $fallback)
// referenciando un valor de este archivo. NO HARDCODES VALUES — siempre
// via var() para que el host pueda override en runtime.
//
// DO NOT EDIT MANUALLY — sync-tokens.mjs regenera + sobrescribe este file.
// Generated: ${generatedAt}
// =============================================================================

`;

const sections = blocks.map(({ selector, body }) => {
  // Indent body lines by 2 spaces for readability.
  const indented = body
    .split('\n')
    .map(line => (line.trim() ? '  ' + line.trim() : ''))
    .join('\n');
  return `${selector} {\n${indented}\n}`;
}).join('\n\n');

// El bloque de `prefers-reduced-motion` YA NO se inyecta aquí. Vivía en este
// trailer, escrito a mano, y eso significaba que solo existía en el BRIDGE —que
// únicamente aplica en standalone/Storybook—, dejando al CMS (lo único que el
// navegador ve en el sitio real) SIN la media query. Ahora vive en el SSOT,
// `Synergos.CMS.Web/wwwroot/css/syn-tokens.css`, y desde ahí fluye a los dos por
// la vía normal. Reintroducirlo aquí lo DUPLICARÍA en el bridge.
const trailer = '';

const output = header + sections + trailer;
const tokenCount = (output.match(/--syn-/g) || []).length;

// La línea `// Generated: <timestamp>` es volátil por diseño: cambia en
// cada corrida. Para que la comparación G-1 sea estable la normalizamos
// (la quitamos) en ambos lados — el resto del archivo es 100% derivado
// del source, así que cualquier diff real = bridge stale.
function normalize(s) {
  return s
    .replace(/^\/\/ Generated:.*$/m, '// Generated: <normalized>')
    .replace(/\r\n/g, '\n');
}

if (checkMode) {
  // ── Gate G-1: comparar sin escribir ──
  if (!existsSync(uiOutputPath)) {
    console.error('[sync-tokens:check] FAIL — bridge no existe en disco:');
    console.error(`[sync-tokens:check]   ${uiOutputPath}`);
    console.error('[sync-tokens:check] Corré `npm run sync:tokens` para generarlo.');
    process.exit(1);
  }
  const committed = readFileSync(uiOutputPath, 'utf8');
  if (normalize(committed) === normalize(output)) {
    console.log('[sync-tokens:check] OK — bridge en sync con syn-tokens.css (G-1).');
    console.log(`[sync-tokens:check]   source: ${cmsTokensPath}`);
    console.log(`[sync-tokens:check]   target: ${uiOutputPath}`);
    console.log(`[sync-tokens:check]   tokens: ${tokenCount}`);
    process.exit(0);
  }

  // Diff por líneas (LCS simple) para señalar exactamente qué difiere.
  const a = normalize(committed).split('\n');
  const b = normalize(output).split('\n');
  console.error('[sync-tokens:check] FAIL — _tokens-bridge.scss STALE (G-1).');
  console.error('[sync-tokens:check] El bridge commiteado NO coincide con lo que');
  console.error('[sync-tokens:check] sync-tokens.mjs regenera desde syn-tokens.css.');
  console.error(`[sync-tokens:check]   source: ${cmsTokensPath}`);
  console.error(`[sync-tokens:check]   target: ${uiOutputPath}`);
  console.error('');
  console.error('--- committed (_tokens-bridge.scss)');
  console.error('+++ regenerated (from syn-tokens.css)');
  printDiff(a, b);
  console.error('');
  console.error('[sync-tokens:check] Fix: corré `npm run sync:tokens` y commiteá el bridge.');
  process.exit(1);
}

// ── Modo normal: escribir ──
writeFileSync(uiOutputPath, output, 'utf8');
console.log(`[sync-tokens] OK`);
console.log(`[sync-tokens]   source: ${cmsTokensPath}`);
console.log(`[sync-tokens]   target: ${uiOutputPath}`);
console.log(`[sync-tokens]   blocks: ${blocks.length} (${blocks.map(b => b.selector).join(', ')})`);
console.log(`[sync-tokens]   tokens: ${tokenCount} (incluye references via var())`);

// ── Diff helper (Myers-lite por LCS sobre líneas) ──
function printDiff(a, b) {
  const n = a.length, m = b.length;
  // LCS DP (suficiente para archivos de ~cientos de líneas).
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0, shown = 0;
  const MAX = 60; // cap de líneas de diff impresas
  while (i < n && j < m && shown < MAX) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { console.error(`- ${a[i++]}`); shown++; }
    else { console.error(`+ ${b[j++]}`); shown++; }
  }
  while (i < n && shown < MAX) { console.error(`- ${a[i++]}`); shown++; }
  while (j < m && shown < MAX) { console.error(`+ ${b[j++]}`); shown++; }
  if ((i < n || j < m)) console.error(`  … diff truncado (${MAX} líneas máx)`);
}
