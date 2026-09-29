#!/usr/bin/env node
/**
 * `npm test`: corre TODOS los tramos y agrega (#79).
 *
 * Era un encadenado con `&&`, y el primer rojo escondía a los siguientes —en Windows, cuatro
 * rojos de separador en `test:tools` dejaban sin correr 1.601 tests—. La lógica y el porqué están
 * en `lib/tramos-de-test.mjs`; esto es sólo la parte que toca el disco y lanza procesos.
 *
 *   npm test                                          # todos los `test:*` del package.json
 *   node tools/test-todo.mjs --solo=test:tools,test:vitals
 *
 * `pretest` (`setup.mjs --verificar`) sigue corriendo antes, porque lo dispara `npm test` y no
 * este fichero.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getArg } from './lib/cli-utils.mjs';
import { ejecutarNpm } from './lib/npm.mjs';
import { ROOT } from './lib/synergos-config.mjs';
import { correrTramos, elegirTramos, resumen, tramosDeTest } from './lib/tramos-de-test.mjs';

const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

let tramos;
try {
  tramos = elegirTramos(tramosDeTest(scripts), getArg('solo', null));
} catch (error) {
  console.error(`[npm test] ✗ ${error.message}`);
  process.exit(1);
}

console.log(`[npm test] ${tramos.length} tramo(s): ${tramos.join(', ')}`);

const resultados = correrTramos(tramos, (tramo) => {
  console.log(`\n[npm test] ── ${tramo} ──`);
  const r = ejecutarNpm(['run', tramo], { cwd: ROOT });
  if (r.error) console.error(`[npm test] ✗ ${tramo} no pudo arrancar: ${r.error.message}`);
  return r.status ?? 1;
});

const { lineas, codigo } = resumen(resultados);
for (const linea of lineas) (codigo === 0 ? console.log : console.error)(linea);
process.exit(codigo);
