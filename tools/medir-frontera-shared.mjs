#!/usr/bin/env node
/**
 * Mide cuánto de `platforms/angular/libs/shared` es lógica que otro framework
 * necesitaría igual, y hoy está atrapada dentro de un componente (épica #36).
 *
 * Existe para que las cifras de `SynergosDocs/FRONTERA_VITALS.md` §5 se puedan
 * **volver a sacar del disco** en vez de creerlas. Una cifra copiada a un
 * documento se desvía sin que nada se ponga rojo; ésta se recalcula.
 *
 * NO es un gate: no falla, no tiene umbral y no corre en CI. Es una regla.
 *
 * ── LO QUE MIDE, Y POR QUÉ SON DOS LÍMITES Y NO UN NÚMERO ───────────────────
 *
 * Se usa el AST de TypeScript y no regex, porque la pregunta («¿este miembro
 * depende del estado reactivo?») no se contesta con una cadena.
 *
 *   SUELO  = ámbito de módulo sin Angular  +  miembros de clase sin `this`.
 *            Es lo que ya está desacoplado EN SU FORMA. **Subestima**: un
 *            `computed(() => f(this.a(), this.b()))` es lógica pura y dice
 *            `this`, así que cae del otro lado.
 *   TECHO  = suelo + los `computed()` cuyo cuerpo SÓLO lee señales
 *            (`this.algo()` sin argumentos), menos el barril `index.ts`, que
 *            son re-exports y no lógica.
 *
 * La verdad está entre los dos, y por eso se imprimen los dos. Un solo número
 * acá sería más cómodo y menos cierto.
 *
 * ── LO QUE NO VE ────────────────────────────────────────────────────────────
 *  · Un método que dice `this` una sola vez para leer un input y por lo demás
 *    es puro cuenta como acoplado (salvo que sea un `computed`).
 *  · No distingue lógica de NEGOCIO de composición de clases CSS: los ~30
 *    `*Class` salen en el cubo de «módulo libre»/«computed puro» y **no son
 *    candidatos** — van nombrados en el documento para que nadie los sume.
 *  · Cuenta LÍNEAS, que es un proxy del trabajo de mudar, no el trabajo.
 */

import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(REPO, 'platforms/angular/libs/shared');
const RAIZ = path.join(LIB, 'src');

const API_ANGULAR = new Set([
  'signal', 'computed', 'effect', 'input', 'output', 'inject', 'linkedSignal',
  'viewChild', 'viewChildren', 'contentChild', 'contentChildren', 'model',
  'untracked', 'resource', 'afterNextRender', 'afterRenderEffect', 'signalMethod',
  'ElementRef', 'DestroyRef', 'Renderer2', 'TemplateRef', 'ViewContainerRef', 'ChangeDetectorRef',
]);
const SOLO_LECTURA = /^(signal|effect|inject|input|output|linkedSignal|viewChild|model|untracked|document|window|navigator)$/;

function ficheros(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const abs = path.join(dir, e);
    if (statSync(abs).isDirectory()) { out.push(...ficheros(abs)); continue; }
    if (abs.endsWith('.ts') && !abs.endsWith('.spec.ts')) out.push(abs);
  }
  return out.sort();
}

const lineas = (sf, n) =>
  sf.getLineAndCharacterOfPosition(n.getEnd()).line -
  sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

function contiene(sf, nodo, predicado) {
  let visto = false;
  const w = (n) => { if (visto) return; if (predicado(n)) { visto = true; return; } n.forEachChild(w); };
  w(nodo);
  return visto;
}

const usaAngular = (sf, n) => contiene(sf, n, (x) =>
  (ts.isIdentifier(x) && API_ANGULAR.has(x.text)) ||
  (ts.isPropertyAccessExpression(x) && /^(document|window|navigator)$/.test(x.expression.getText(sf))));

const usaThis = (sf, n) => contiene(sf, n, (x) => x.kind === ts.SyntaxKind.ThisKeyword);

/** `computed()` cuyo cuerpo sólo lee señales: `this.algo()` sin argumentos. */
function computedPuros(sf) {
  const out = [];
  const walk = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'computed' && n.arguments[0]) {
      const cuerpo = n.arguments[0];
      let puro = true;
      const w = (x) => {
        if (!puro) return;
        if (ts.isIdentifier(x) && SOLO_LECTURA.test(x.text)) { puro = false; return; }
        if (ts.isPropertyAccessExpression(x) && x.expression.kind === ts.SyntaxKind.ThisKeyword) {
          const p = x.parent;
          if (!(ts.isCallExpression(p) && p.expression === x && p.arguments.length === 0)) puro = false;
          return;
        }
        x.forEachChild(w);
      };
      w(cuerpo);
      const l = lineas(sf, cuerpo);
      if (puro && l >= 3) {
        out.push({ nombre: ts.isPropertyDeclaration(n.parent) ? n.parent.name.getText(sf) : '?', l });
      }
    }
    n.forEachChild(walk);
  };
  walk(sf);
  return out;
}

const cubos = { total: 0, imports: 0, decorador: 0, plantilla: 0, acoplado: 0, sinThis: 0, moduloLibre: 0, computedPuro: 0 };
const candidatos = { modulo: [], sinThis: [], computed: [] };
const todos = ficheros(RAIZ);
let barril = 0;

for (const abs of todos) {
  const src = readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.ES2022, true);
  const rel = path.relative(LIB, abs);
  cubos.total += src.split('\n').length;

  for (const st of sf.statements) {
    const l = lineas(sf, st);
    if (ts.isImportDeclaration(st)) { cubos.imports += l; continue; }

    if (ts.isClassDeclaration(st)) {
      for (const dec of ts.getDecorators(st) ?? []) {
        cubos.decorador += lineas(sf, dec);
        const arg = ts.isCallExpression(dec.expression) ? dec.expression.arguments[0] : null;
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) {
            if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'template') cubos.plantilla += lineas(sf, p);
          }
        }
      }
      for (const m of st.members) {
        const lm = lineas(sf, m);
        if (usaAngular(sf, m) || usaThis(sf, m)) { cubos.acoplado += lm; continue; }
        cubos.sinThis += lm;
        if (lm >= 3) candidatos.sinThis.push({ rel, nombre: m.name?.getText(sf) ?? '?', l: lm });
      }
      continue;
    }

    if (usaAngular(sf, st)) { cubos.acoplado += l; continue; }
    cubos.moduloLibre += l;
    if (rel === 'src/index.ts') barril += l;
    else if (l >= 3) candidatos.modulo.push({ rel, nombre: st.name?.getText(sf) ?? '(const)', l });
  }

  for (const c of computedPuros(sf)) {
    cubos.computedPuro += c.l;
    candidatos.computed.push({ rel, nombre: c.nombre, l: c.l });
  }
}

const pct = (n) => `${((n / cubos.total) * 100).toFixed(1)} %`;
const suelo = cubos.moduloLibre + cubos.sinThis;
const techo = suelo + cubos.computedPuro - barril;

console.log(`\nlibs/shared — ${todos.length} ficheros de código, ${cubos.total} líneas\n`);
for (const [k, v] of [
  ['plantilla (HTML del @Component)', cubos.plantilla],
  ['clase acoplada (Angular o `this`)', cubos.acoplado],
  ['metadatos del decorador (sin plantilla)', cubos.decorador - cubos.plantilla],
  ['imports', cubos.imports],
  ['ámbito de módulo sin Angular', cubos.moduloLibre],
  ['miembros de clase sin `this`', cubos.sinThis],
  ['— de los cuales, barril src/index.ts', barril],
  ['computed() que sólo lee señales', cubos.computedPuro],
]) {
  console.log(`  ${String(v).padStart(5)}  ${pct(v).padStart(7)}  ${k}`);
}
console.log(`\n  SUELO ${suelo} (${pct(suelo)})   ·   TECHO ${techo} (${pct(techo)})`);
console.log('  → lógica que otro framework necesitaría igual. La verdad está entre los dos.\n');

for (const [titulo, lista] of [
  ['A · ámbito de módulo, ya desacoplado', candidatos.modulo],
  ['B · miembros de clase sin `this`', candidatos.sinThis],
  ['C · computed() puros (recortables)', candidatos.computed],
]) {
  console.log(`── ${titulo} ──`);
  for (const c of lista.sort((a, b) => b.l - a.l).slice(0, 15)) {
    console.log(`  ${String(c.l).padStart(4)}  ${c.rel} · ${c.nombre}`);
  }
  if (lista.length > 15) console.log(`  … y ${lista.length - 15} más`);
  console.log('');
}
