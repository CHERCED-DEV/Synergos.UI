#!/usr/bin/env node
/**
 * audit-themes.mjs — auditoría REPETIBLE de contraste sobre las 8 rutas de render.
 *
 * Doc 24, ítem 10. Existe porque el método anterior era la inspección visual, y eso
 * produjo un doc rector en el que OCHO de nueve filas estaban mal: rancias, mal
 * ubicadas, o describiendo como roto algo que ya funcionaba. Una lista escrita mirando
 * envejece; un script se vuelve a correr.
 *
 * Uso:
 *   node tools/audit-themes.mjs            # solo los fallos
 *   node tools/audit-themes.mjs --all      # todos los pares medidos
 *   node tools/audit-themes.mjs --json     # para encadenar
 *
 * Sale con código 1 si hay fallos, para poder colgarlo de un gate.
 *
 * ── Las cinco trampas que este script YA tiene resueltas ────────────────────
 * Cada una costó una medición equivocada esta semana; están aquí para no repetirlas.
 *
 * 1. AUTOTEST QUE ABORTA. Si negro/blanco no da 21.0000 el script no reporta nada.
 *    Un arnés roto que igualmente imprime cifras es peor que no medir: da falsa
 *    confianza y sus números acaban citados en un commit.
 * 2. CONTROL NEGATIVO. Se pregunta por un token inexistente y DEBE no resolver. Si
 *    resolviera, el resolutor estaría inventando y todo lo demás sería humo.
 * 3. SON 8 RUTAS, NO 7. Los 7 data-theme MÁS `prefers-color-scheme: dark` sin
 *    data-theme. Esa octava se olvida sistemáticamente y ya produjo un hueso de
 *    esqueleto a 9.7:1 —una losa clara sobre fondo oscuro— que nadie vio.
 * 4. COMPOSICIÓN DE ALFA. Un color con alfa NO se mide contra sí mismo: se compone
 *    sobre el fondo real. El anillo de foco daba 2.93:1 en meridian justo por esto, y
 *    medirlo sin componer lo daba por bueno.
 * 5. LO QUE LA NORMA EXIME. WCAG 1.4.3 exime el texto de controles DESHABILITADOS.
 *    Contarlos inflaba el resultado un 42% (88 de 208 "fallos") y habría mandado a
 *    arreglar lo que no está roto. Se excluyen y se dice que se excluyen.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SSOT = resolve(AQUI, '../../Synergos.CMS/Synergos.CMS.Web/wwwroot/css/syn-tokens.css');

const args = process.argv.slice(2);
const MOSTRAR_TODO = args.includes('--all');
const JSON_OUT = args.includes('--json');

// ─── Color ──────────────────────────────────────────────────────────────────

/** Devuelve [r,g,b,a] o null. Acepta #rgb, #rrggbb, rgb()/rgba() con alfa `/` o `,`. */
function parseColor(str) {
  if (!str) return null;
  const s = str.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)).concat(1);
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    const partes = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (partes.length < 3 || partes.slice(0, 3).some(Number.isNaN)) return null;
    return [partes[0], partes[1], partes[2], partes.length > 3 ? partes[3] : 1];
  }
  return null;
}

function luminancia([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** TRAMPA 4: un color con alfa se COMPONE sobre su fondo antes de medirse. */
function componer(frente, fondo) {
  const a = frente[3] ?? 1;
  if (a >= 1) return frente;
  return [0, 1, 2].map((i) => Math.round(frente[i] * a + fondo[i] * (1 - a))).concat(1);
}

/**
 * El FONDO también puede ser translúcido, y entonces hay que componerlo sobre el lienzo
 * antes de usarlo. Sin esto la primera versión de este script medía
 * `state-danger-surface: rgb(220 38 38 / 0.10)` como un rojo saturado en vez de como el
 * rosa casi blanco que se pinta de verdad, y reportaba 40 fallos que no existían.
 * Una auditoría que grita lobo es peor que ninguna: la siguiente persona la ignora.
 */
function ratio(frente, fondo, lienzo) {
  const bg = lienzo ? componer(fondo, lienzo) : fondo;
  const f = componer(frente, bg);
  const [x, y] = [luminancia(f), luminancia(bg)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 1000) / 1000;
}

// ─── Parseo del SSOT ────────────────────────────────────────────────────────

const css = readFileSync(SSOT, 'utf8');

/** TRAMPA 3: las 8 rutas de render, no 7. */
const RUTAS = [
  { id: 'light', test: (sel) => /^:root\s*$/.test(sel) },
  { id: 'dark', test: (sel) => /data-theme="dark"/.test(sel) },
  { id: 'silverGold', test: (sel) => /data-theme="silverGold"/.test(sel) },
  { id: 'eventsNight', test: (sel) => /data-theme="eventsNight"/.test(sel) },
  { id: 'terraLux', test: (sel) => /data-theme="terraLux"/.test(sel) },
  { id: 'scholar', test: (sel) => /data-theme="scholar"/.test(sel) },
  { id: 'meridian', test: (sel) => /data-theme="meridian"/.test(sel) },
  { id: 'auto-dark', test: (sel) => /:root:not\(\[data-theme\]\)/.test(sel) },
];

/** Extrae las declaraciones de cada bloque, saltando comentarios. */
function extraer() {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const mapa = Object.fromEntries(RUTAS.map((r) => [r.id, {}]));
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(limpio))) {
    const sel = m[1].trim();
    const cuerpo = m[2];
    for (const ruta of RUTAS) {
      if (!ruta.test(sel)) continue;
      for (const decl of cuerpo.split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const k = decl.slice(0, i).trim();
        if (k.startsWith('--')) mapa[ruta.id][k] = decl.slice(i + 1).trim();
      }
    }
  }
  return mapa;
}

const BLOQUES = extraer();

/** Resuelve una cadena `var()` hasta color literal. `light` es el fallback de todos. */
function resolver(ruta, token, prof = 0) {
  if (prof > 16) return null;
  const v = BLOQUES[ruta]?.[token] ?? BLOQUES.light?.[token];
  if (!v) return null;
  const directo = parseColor(v);
  if (directo) return directo;
  const ref = /var\(\s*(--[a-z0-9-]+)/i.exec(v);
  if (ref) return resolver(ruta, ref[1], prof + 1);
  return null;
}

// ─── Autotest — TRAMPA 1: si falla, no se reporta nada ──────────────────────

function autotest() {
  const fallos = [];
  const r = (a, b) => ratio(parseColor(a), parseColor(b));
  if (r('#000000', '#ffffff').toFixed(4) !== '21.0000') fallos.push('negro/blanco != 21.0000');
  if (r('#ffffff', '#ffffff').toFixed(2) !== '1.00') fallos.push('blanco/blanco != 1.00');
  // frontera canónica WCAG: #767676 sobre blanco ≈ 4.54
  if (Math.abs(r('#767676', '#ffffff') - 4.54) > 0.02) fallos.push('#767676/blanco fuera de rango');
  // composición: negro al 50% sobre blanco = gris medio
  const comp = componer([0, 0, 0, 0.5], [255, 255, 255, 1]);
  if (comp[0] !== 128) fallos.push('composicion de alfa incorrecta');
  // fondo translúcido: un rojo al 10% sobre blanco es casi blanco, no rojo
  const rosa = componer([220, 38, 38, 0.1], [255, 255, 255, 1]);
  if (rosa[1] < 220) fallos.push('composicion del FONDO incorrecta');
  // TRAMPA 2 — control negativo: un token que no existe NO debe resolver
  if (resolver('light', '--syn-color-no-existe-jamas') !== null) {
    fallos.push('CONTROL NEGATIVO: el resolutor inventa valores');
  }
  return fallos;
}

const fallosArnes = autotest();
if (fallosArnes.length) {
  console.error('\n  ✘ EL ARNÉS NO PASA SU PROPIO AUTOTEST. No se reporta ninguna cifra.\n');
  for (const f of fallosArnes) console.error('    · ' + f);
  console.error('\n  Un arnés roto que igualmente imprime números es peor que no medir.\n');
  process.exit(2);
}

// ─── Los pares que se miden ─────────────────────────────────────────────────
//
// TRAMPA 5: `text-disabled` y `action-disabled-text` NO entran. WCAG 1.4.3 exime el
// texto de controles inactivos; contarlos inflaba el resultado un 42%.

const TEXTOS = [
  '--syn-color-text-primary',
  '--syn-color-text-secondary',
  '--syn-color-text-muted',
];
const FONDOS = [
  '--syn-color-surface-canvas',
  '--syn-color-surface-primary',
  '--syn-color-surface-secondary',
  '--syn-color-surface-tertiary',
];
/** Pares con su propio texto: el rol trae ambos lados. */
const ROLES = ['state-info', 'state-success', 'state-warning', 'state-danger', 'info', 'success', 'warning', 'danger'];

const AA_TEXTO = 4.5;
const NO_TEXTO = 3.0; // WCAG 1.4.11 — indicador de foco, bordes de control

const resultados = [];

for (const { id: ruta } of RUTAS) {
  // El lienzo del tema: es el fondo ÚLTIMO sobre el que se compone todo lo translúcido.
  const lienzo = resolver(ruta, '--syn-color-surface-canvas') ?? [255, 255, 255, 1];

  for (const t of TEXTOS) {
    const fg = resolver(ruta, t);
    if (!fg) continue;
    for (const b of FONDOS) {
      const bg = resolver(ruta, b);
      if (!bg) continue;
      const r = ratio(fg, bg, lienzo);
      resultados.push({ ruta, fg: t, bg: b, ratio: r, umbral: AA_TEXTO, pasa: r >= AA_TEXTO });
    }
  }
  for (const rol of ROLES) {
    const fg = resolver(ruta, `--syn-color-${rol}-text`);
    const bg = resolver(ruta, `--syn-color-${rol}-surface`);
    if (!fg || !bg) continue;
    const r = ratio(fg, bg, lienzo);
    resultados.push({ ruta, fg: `${rol}-text`, bg: `${rol}-surface`, ratio: r, umbral: AA_TEXTO, pasa: r >= AA_TEXTO });
  }
  // Indicador de foco: 1.4.11 pide 3:1, y se compone sobre cada superficie
  const anillo = resolver(ruta, '--syn-color-focus-ring');
  if (anillo) {
    for (const b of FONDOS.slice(0, 3)) {
      const bg = resolver(ruta, b);
      if (!bg) continue;
      const r = ratio(anillo, bg, lienzo);
      resultados.push({ ruta, fg: 'focus-ring', bg: b, ratio: r, umbral: NO_TEXTO, pasa: r >= NO_TEXTO });
    }
  }
}

// ─── Reporte ────────────────────────────────────────────────────────────────

const fallos = resultados.filter((r) => !r.pasa);

if (JSON_OUT) {
  console.log(JSON.stringify({ rutas: RUTAS.length, medidos: resultados.length, fallos }, null, 2));
  process.exit(fallos.length ? 1 : 0);
}

const corto = (s) => s.replace('--syn-color-', '').replace('surface-', '');
console.log(`\n  Auditoría de contraste — ${RUTAS.length} rutas de render, ${resultados.length} pares medidos`);
console.log(`  Arnés autotesteado (negro/blanco = 21.0000) y control negativo en verde.`);
console.log(`  Excluido a propósito: texto deshabilitado (WCAG 1.4.3 lo exime).\n`);

const aMostrar = MOSTRAR_TODO ? resultados : fallos;
if (!aMostrar.length) {
  console.log('  ✓ Sin fallos.\n');
} else {
  let rutaActual = '';
  for (const r of aMostrar.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.ratio - b.ratio)) {
    if (r.ruta !== rutaActual) {
      rutaActual = r.ruta;
      console.log(`  ── ${rutaActual}`);
    }
    const marca = r.pasa ? '·' : '✘';
    console.log(
      `    ${marca} ${String(r.ratio).padStart(7)}  (min ${r.umbral})  ${corto(r.fg)} sobre ${corto(r.bg)}`,
    );
  }
  console.log('');
}

console.log(`  ${fallos.length} fallo(s) sobre ${resultados.length} pares.\n`);
process.exit(fallos.length ? 1 : 0);
