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
//   node tools/sync-tokens.mjs                       # uses default paths
//   SYNERGOS_CMS_PATH=/path/to/cms node tools/sync-tokens.mjs
//
// Defaults (sibling dirs convention):
//   CMS:  ../../../Synergos.CMS/Synergos.CMS.Web/wwwroot/css/syn-tokens.css
//   UI:   ./libs/shared/src/styles/_tokens-bridge.scss
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const trailer = `

// =============================================================================
// Reduced motion respect (UI components opt-in con esta query)
// =============================================================================

@media (prefers-reduced-motion: reduce) {
  :root {
    --syn-motion-duration-instant:  0ms;
    --syn-motion-duration-fast:     0ms;
    --syn-motion-duration-default:  0ms;
  }
}
`;

const output = header + sections + trailer;
writeFileSync(uiOutputPath, output, 'utf8');

const tokenCount = (output.match(/--syn-/g) || []).length;
console.log(`[sync-tokens] OK`);
console.log(`[sync-tokens]   source: ${cmsTokensPath}`);
console.log(`[sync-tokens]   target: ${uiOutputPath}`);
console.log(`[sync-tokens]   blocks: ${blocks.length} (${blocks.map(b => b.selector).join(', ')})`);
console.log(`[sync-tokens]   tokens: ${tokenCount} (incluye references via var())`);
