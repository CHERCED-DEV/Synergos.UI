#!/usr/bin/env node
/**
 * Compila los 240 `*.spec.ts` para que vitest pueda correrlos (issue #1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY UN PASO DE COMPILACIÓN Y NO UN PLUGIN DE VITE.
 *
 * El ticket daba por hecho que esto era «configuración, no infraestructura
 * nueva». No lo es, y la razón es concreta:
 *
 *   > **Los signal inputs de Angular NO funcionan en JIT.** Un componente
 *   > compilado al vuelo se instancia bien, renderiza bien, y
 *   > `componentRef.setInput()` no llega nunca al `input()`: devuelve el valor
 *   > por defecto, en silencio.
 *
 * Se comprobó con un componente de tres líneas antes de decidir nada. Y no es
 * un caso de borde acá: `LLM.txt` obliga a `input()` / `output()` y prohíbe
 * `@Input()`, así que el camino JIT no sirve para NINGUNO de los 139 elementos.
 * El síntoma es peor que un error — los tests corren y mienten.
 *
 * Lo que sí ve los signal inputs es ngtsc, que es análisis en tiempo de
 * compilación. Así que los specs se compilan AOT con el MISMO compilador que
 * publica los elementos (`tools/ngtsc.mjs`), y vitest corre el JS resultante.
 *
 * Eso además vale por sí mismo: los tests se ejecutan sobre exactamente el
 * mismo pipeline que el artefacto publicado. Un componente que compila para el
 * test compila para el CDN.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node tools/build-specs.mjs
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  NG_DIR, REPO, ts, opcionesTs, crearHost, analizar, buscar,
} from './ngtsc.mjs';

const OUT = path.join(NG_DIR, '.test-out');

const t0 = Date.now();
const log = (m) => console.log(`[build-specs] ${((Date.now() - t0) / 1000) | 0}s  ${m}`);

// ── 1. Encontrarlos ──────────────────────────────────────────────────────────
//
// Por filesystem, igual que los elementos: una lista escrita a mano se
// desincroniza y el disco no. `modules/` queda fuera — son submódulos de git y
// pueden estar sin clonar; una suite que falla por un directorio vacío enseña
// a ignorarla.
const specs = [
  ...buscar(path.join(NG_DIR, 'apps'), (f) => f.endsWith('.spec.ts')),
  ...buscar(path.join(NG_DIR, 'libs'), (f) => f.endsWith('.spec.ts')),
];

// El setup entra al MISMO programa y no aparte: declara un `@NgModule` con los
// providers globales, y un decorador de Angular sin ngtsc detrás es
// exactamente el problema que este fichero existe para evitar.
const SETUP = path.join(NG_DIR, 'tools/vitest-setup.ts');

if (specs.length === 0) {
  console.error('[build-specs] ✗ no se encontró ningún *.spec.ts. Algo se movió de sitio.');
  process.exit(1);
}

log(`${specs.length} specs`);

// ── 2. Compilarlos con el compilador de producción ───────────────────────────
//
// La ÚNICA diferencia con `build.mjs` son estas tres opciones:
//
//   types + typeRoots → `describe`, `it` y `expect` son globales de vitest, y
//     vitest vive en el node_modules de la RAÍZ (este workspace tiene el suyo).
//     Sin esto salen 6 342 errores de «Cannot find name 'describe'» que no
//     tienen nada que ver con el código.
//   sourceMap → para que un fallo apunte al .ts y no al .js emitido.
const options = opcionesTs(OUT, {
  sourceMap: true,
  inlineSources: true,
  types: ['vitest/globals'],
  typeRoots: [path.join(REPO, 'node_modules')],
});

rmSync(OUT, { recursive: true, force: true });

const { emitir } = await analizar([...specs, SETUP], options, crearHost(options));

let emitidos = 0;
emitir((fileName, text) => {
  mkdirSync(path.dirname(fileName), { recursive: true });
  writeFileSync(fileName, text);
  if (fileName.endsWith('.spec.js')) emitidos += 1;
});

// Sin esto Node trata el árbol emitido como CommonJS y los `import` fallan con
// un error que habla de módulos y no de que falte un package.json.
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));

if (emitidos !== specs.length) {
  // Un spec que entra al programa y no sale emitido es un spec que deja de
  // correr sin que nadie lo note — que es exactamente el estado del que este
  // ticket viene a sacarnos.
  console.error(`[build-specs] ✗ entraron ${specs.length} specs y salieron ${emitidos}.`);
  process.exit(1);
}

log(`✓ ${emitidos} specs compilados AOT → ${path.relative(REPO, OUT)}`);
