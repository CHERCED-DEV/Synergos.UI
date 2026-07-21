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
// Gate G-2 (barrido de derivados): G-1 mira UN path hardcodeado, así que su
// OK sólo dice "el bridge está bien" — pero se leía como "no hay drift". Bajo
// esa falsa calma vivía `_brand.scss`, una SEGUNDA copia a mano de los mismos
// --syn-* que se compila DENTRO de cada bundle y que, por orden de fuente,
// GANABA sobre el <link> del CMS en runtime (verificado en navegador). Servía
// valores pre-a11y: silverGold text-accent #8f7035 = 3.47:1 peor caso contra
// 5.19:1 del SSOT. G-2 barre TODO .scss/.css del repo: si un archivo DECLARA
// a nivel de tema un token que el SSOT también define, el valor tiene que
// coincidir con alguno que el SSOT le dé. Los tokens component-local y los
// overrides dentro de un selector de componente se ignoran (son legítimos).
//
// Defaults (sibling dirs convention):
//   CMS:  ../../../Synergos.CMS/Synergos.CMS.Web/wwwroot/css/syn-tokens.css
//   UI:   ./libs/shared/src/styles/_tokens-bridge.scss
// =============================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join, extname } from 'node:path';
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

// Raíz del repo UI y directorios que G-2 no barre (ver gate G-2 abajo).
// Van acá arriba —y no junto al gate— porque `const` no hoistea y runG2()
// se invoca antes en el flujo de --check.
const uiRoot = resolve(angularRoot, '..', '..');
const G2_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.nx', '.angular', 'coverage']);
// Índice perezoso de variables Sass del repo (ver globalScssVars). Vive acá
// arriba por lo mismo que uiRoot: `let` no hoistea y runG2() corre antes.
let globalVarsCache = null;
// Sólo las declaraciones a nivel de TEMA compiten con el <link> del host.
const THEME_SCOPE = /(^|,)\s*(:root|html)\b|\[data-theme|\[theme=|\.theme-/i;
// Funciones CSS legítimas: que aparezcan en el valor no impide compararlo.
const CSS_FNS = /^(var|rgb|rgba|hsl|hsla|calc|clamp|min|max|url|linear-gradient|radial-gradient|conic-gradient|color-mix|env|repeat|minmax|cubic-bezier|translate|rotate|scale|blur|drop-shadow)$/i;

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
  let failed = false;

  // ── Gate G-1: el bridge, comparado sin escribir ──
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
  } else {
    failed = true;
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
  }

  // ── Gate G-2: CUALQUIER derivado, no sólo el bridge ──
  // G-1 mira UN path hardcodeado. Eso dejó pasar `_brand.scss`, una segunda
  // copia a mano de los mismos --syn-* que se compila DENTRO de cada bundle y
  // que, por orden de fuente, GANABA sobre el <link> del CMS en runtime —
  // sirviendo valores pre-a11y (silverGold text-accent #8f7035 = 3.47:1 peor
  // caso, contra 5.19:1 del SSOT). El OK de G-1 invitaba a creer que no había
  // drift. G-2 barre el repo entero: si un archivo DECLARA un token que el
  // SSOT también define, tiene que darle un valor que el SSOT le dé en ALGÚN
  // tema. Los tokens component-local (que el SSOT no conoce) se ignoran.
  if (!runG2(sourceCss)) failed = true;

  process.exit(failed ? 1 : 0);
}

// ── Modo normal: escribir ──
writeFileSync(uiOutputPath, output, 'utf8');
console.log(`[sync-tokens] OK`);
console.log(`[sync-tokens]   source: ${cmsTokensPath}`);
console.log(`[sync-tokens]   target: ${uiOutputPath}`);
console.log(`[sync-tokens]   blocks: ${blocks.length} (${blocks.map(b => b.selector).join(', ')})`);
console.log(`[sync-tokens]   tokens: ${tokenCount} (incluye references via var())`);

// ── Gate G-2: barrido de derivados ─────────────────────────────────────────
// Un "derivado" es cualquier archivo que DECLARE (`--syn-x: valor`) un token
// que el SSOT también declara. Declarar un token que el SSOT NO conoce es
// legítimo: es un token component-local (`--syn-card-gap`, etc.).
//
// Normaliza para que diferencias cosméticas no cuenten como drift:
// espacios, mayúsculas de hex, `0.10` vs `0.1`, `!important`.
function normVal(v) {
  return v
    .replace(/!important/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(\d)0+(?=\D|$)/g, (m, d) => (m.includes('.') ? d : m))
    .replace(/(\.\d*?)0+\b/g, '$1')
    .replace(/\.(?=\D|$)/g, '');
}

// La interpolación SCSS `#{$x}` lleva llaves literales: si no se neutraliza
// primero, el walker de bloques se desincroniza y los valores se truncan en el
// `#` (`--syn-color-neutral-0: #`). Se reemplaza por un marcador sin llaves; el
// valor queda marcado como no-resoluble estáticamente.
// El marcador CONSERVA lo interpolado (`#{$x}` → `«$x»`). Guardar sólo un
// marcador opaco fue lo que dejó pasar `_brand.scss`: sus selectores se
// arman por interpolación (`#{$silver-gold-theme-selectors}`), así que al
// borrar el contenido el bloque dejaba de parecer theme-scope y el gate daba
// OK con el drift presente.
function stripSource(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/#\{([^}]*)\}/g, (_, inner) => `«${inner.trim()}»`);
}

// Mapa de variables SCSS del archivo (`$nombre: valor;`) para poder resolver
// un selector interpolado a su lista real de selectores.
function scssVars(text) {
  const map = new Map();
  for (const m of text.matchAll(/^\s*(\$[\w-]+)\s*:\s*([\s\S]*?);/gm)) {
    map.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  }
  return map;
}

// Expande `«$var»` con su definición para que THEME_SCOPE pueda evaluarlo.
function resolveSelector(sel, vars) {
  return sel.replace(/«([^»]*)»/g, (whole, inner) => vars.get(inner.trim()) ?? whole);
}

function declarationsIn(text) {
  const out = [];
  for (const m of stripSource(text).matchAll(/(--syn-[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) {
    out.push([m[1].toLowerCase(), m[2]]);
  }
  return out;
}

// THEME_SCOPE se declara arriba, junto a uiRoot (TDZ: runG2 corre antes).
// Una declaración dentro de un selector de componente (`.product-card__badge {
// --syn-color-state-brand-surface: transparent }`) es un override local
// legítimo — scoping normal de custom properties, no una copia derivada.
function themeScopedDeclarations(text) {
  const css = stripSource(text);
  const vars = scssVars(text);
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        // El selector termina en el `}` anterior O en el `;` anterior. Sin el
        // `;`, todo el preámbulo `@use '...';` se pegaba al selector y `:root`
        // dejaba de quedar al principio — así se colaban 138 declaraciones de
        // `_palette.scss` sin revisar.
        let selStart = 0;
        for (let j = start - 1; j >= 0; j--) {
          if (css[j] === '}' || css[j] === ';') { selStart = j + 1; break; }
        }
        const sel = resolveSelector(
          css.slice(selStart, start).replace(/\s+/g, ' ').trim(),
          vars,
        );
        if (THEME_SCOPE.test(sel)) {
          for (const m of css.slice(start + 1, i).matchAll(/(--syn-[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) {
            out.push({ tok: m[1].toLowerCase(), val: m[2], sel });
          }
        }
      }
    }
  }
  return out;
}

function walkStyleFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (G2_SKIP_DIRS.has(e)) continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    // `.claude/worktrees` son checkouts paralelos de otros agentes: mismo
    // código, otra copia. Barrerlos duplicaría cada hallazgo.
    if (st.isDirectory()) {
      if (full.replace(/\\/g, '/').includes('/.claude/worktrees')) continue;
      walkStyleFiles(full, acc);
    } else if (['.scss', '.css'].includes(extname(e))) {
      acc.push(full);
    }
  }
  return acc;
}

// Las variables Sass viven en OTRO archivo que el consumidor `@use`a
// (`_palette.scss` interpola `#{$color-neutral-0}` desde `tokens/_colors`).
// Sin resolverlas, esas declaraciones quedaban "no verificables" y el gate
// volvía a invitar a confiar de más. Se indexan una vez todas las del repo.
function globalScssVars(files) {
  if (globalVarsCache) return globalVarsCache;
  globalVarsCache = new Map();
  for (const f of files) {
    let t;
    try { t = readFileSync(f, 'utf8'); } catch { continue; }
    for (const [k, v] of scssVars(stripSource(t))) {
      if (!globalVarsCache.has(k)) globalVarsCache.set(k, v);
    }
  }
  return globalVarsCache;
}

// `px-to-rem(N)` es una función Sass del repo (base 16, ver
// scss/functions/_px-to-rem.scss). Evaluarla evita 28 falsos positivos:
// `px-to-rem(6)` ES `0.375rem`, exactamente lo que dice el SSOT.
function evalScssFns(v) {
  return v.replace(/px-to-rem\(\s*([\d.]+)\s*\)/gi, (_, n) => {
    const rem = parseFloat(n) / 16;
    return `${parseFloat(rem.toFixed(6))}rem`;
  });
}

// ¿Queda alguna llamada a función Sass que no sabemos evaluar?
function hasUnevaluatedFn(v) {
  for (const m of v.matchAll(/([a-z][\w-]*)\s*\(/gi)) {
    if (!CSS_FNS.test(m[1])) return true;
  }
  return false;
}

// Resuelve `«$x»` con las vars del archivo y, si no, con las del repo.
// Itera porque una var puede definirse en términos de otra.
// Una variable Sass puede venir interpolada (`#{$x}`) o DESNUDA
// (`--syn-control-h-sm: $space-8`). Resolver sólo la interpolada dejaba 7
// falsos positivos que en realidad coincidían con el SSOT.
function resolveValue(val, fileVars, allVars) {
  let out = val;
  const lookup = k => fileVars.get(k) ?? allVars.get(k);
  for (let pass = 0; pass < 6; pass++) {
    const before = out;
    out = out
      .replace(/«([^»]*)»/g, (whole, inner) => lookup(inner.trim()) ?? whole)
      .replace(/\$[\w-]+/g, whole => lookup(whole) ?? whole);
    if (out === before) break;
  }
  return evalScssFns(out);
}

function runG2(ssotCss) {
  // token -> Set(valores que el SSOT le asigna en cualquier tema)
  const ssotValues = new Map();
  for (const [tok, val] of declarationsIn(ssotCss)) {
    if (!ssotValues.has(tok)) ssotValues.set(tok, new Set());
    ssotValues.get(tok).add(normVal(val));
  }

  const files = walkStyleFiles(uiRoot);
  const allVars = globalScssVars(files);
  const offenders = [];
  const unresolved = new Map();
  for (const file of files) {
    if (resolve(file) === resolve(uiOutputPath)) continue;   // el bridge es G-1
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const fileVars = scssVars(stripSource(text));
    const bad = [];
    for (const { tok, val } of themeScopedDeclarations(text)) {
      const known = ssotValues.get(tok);
      if (!known) continue;                                   // component-local
      const resolved = resolveValue(val, fileVars, allVars);
      // Si ni así se resuelve, se REPORTA — callarlo sería repetir el pecado
      // original: un derivado invisible que el gate da por bueno.
      if (resolved.includes('«') || resolved.includes('$') || hasUnevaluatedFn(resolved)) {
        unresolved.set(file, (unresolved.get(file) ?? 0) + 1);
        continue;
      }
      if (!known.has(normVal(resolved))) {
        bad.push([tok, resolved.replace(/\s+/g, ' ').trim()]);
      }
    }
    if (bad.length) offenders.push({ file, bad });
  }
  for (const [file, n] of unresolved) {
    console.error(`[sync-tokens:check] WARN — ${n} declaración(es) sin resolver en ${relative(uiRoot, file).replace(/\\/g, '/')}`);
  }

  if (offenders.length === 0) {
    console.log('[sync-tokens:check] OK — ningún derivado fuera de sync (G-2).');
    console.log(`[sync-tokens:check]   tokens del SSOT vigilados: ${ssotValues.size}`);
    return true;
  }

  const totalBad = offenders.reduce((n, o) => n + o.bad.length, 0);
  console.error('');
  console.error(`[sync-tokens:check] FAIL — ${totalBad} declaración(es) en ${offenders.length} archivo(s) NO`);
  console.error('[sync-tokens:check] coinciden con ningún valor del SSOT (G-2).');
  console.error(`[sync-tokens:check]   SSOT: ${cmsTokensPath}`);
  for (const { file, bad } of offenders) {
    console.error('');
    console.error(`  ${relative(uiRoot, file).replace(/\\/g, '/')}  (${bad.length})`);
    for (const [tok, val] of bad.slice(0, 12)) {
      const exp = [...(ssotValues.get(tok) ?? [])].slice(0, 3).join(' | ');
      console.error(`    ${tok}: ${val}`);
      console.error(`        SSOT: ${exp}`);
    }
    if (bad.length > 12) console.error(`    … +${bad.length - 12} más`);
  }
  console.error('');
  console.error('[sync-tokens:check] Un token que el SSOT define NO se redeclara a mano.');
  console.error('[sync-tokens:check] Consumilo con var(--syn-x) o generá el derivado desde el SSOT.');
  return false;
}

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
