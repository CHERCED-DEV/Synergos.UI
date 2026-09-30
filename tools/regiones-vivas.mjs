#!/usr/bin/env node
/**
 * Gate: ninguna región viva NACE con su mensaje (#82, regla 42 del `CLAUDE.md`).
 *
 * La regla, el cruce, la red de seguridad y el trinquete viven en `tools/lib/regiones-vivas.mjs`,
 * que `npm test` ejercita con fixtures. Acá sólo está el recorrido y la impresión de la cifra.
 *
 *   node tools/regiones-vivas.mjs               # el gate
 *   node tools/regiones-vivas.mjs --actualizar  # reescribe la DEUDA (el censo no se toca)
 *
 * El diff de la línea base va en el commit que lo causó, como el de `size:baseline`.
 */

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import { PLATAFORMAS } from './lib/element-sources.mjs';
import {
  cruzarConLaLineaBase,
  extraerPlantillas,
  regionesPorCodigo,
  regionesVivas,
  revisarCobertura,
} from './lib/regiones-vivas.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINEA_BASE = join(RAIZ, 'tools', 'regiones-vivas.baseline.json');
const ACTUALIZAR = process.argv.includes('--actualizar');

/** Todo fichero bajo `dir`, sin `node_modules`, `dist` ni carpetas ocultas (`.test-out`). */
function ficheros(dir) {
  const salida = [];
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return salida;
  }
  for (const e of entradas) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      salida.push(...ficheros(ruta));
    } else if (e.isFile()) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Las plataformas cuyas plantillas se escriben con la sintaxis que esta regla mira: las que
 * dependen del compilador de plantillas. Se DERIVA del disco —de `PLATAFORMAS` y de cada
 * `package.json`—, no se escribe: es lo que pide el censo de `frameworks.spec.mjs`. Hoy es una.
 */
function plataformasConPlantillas() {
  const salida = [];
  for (const plataforma of PLATAFORMAS) {
    const base = resolve(RAIZ, plataforma.apps, '..');
    let paquete;
    try {
      paquete = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!paquete.dependencies?.['@angular/compiler']) continue;
    salida.push({ framework: plataforma.framework, base });
  }
  return salida;
}

const leer = (ruta) => ({
  ruta: relative(RAIZ, ruta).replace(/\\/g, '/'),
  fuente: readFileSync(ruta, 'utf8'),
});

let plantillas = 0;
let inline = 0;
const nodos = [];
const errores = [];
const noLiterales = [];
const porCodigo = [];

const plataformas = plataformasConPlantillas();
if (plataformas.length === 0) {
  console.error('[regiones-vivas] ✗ ninguna plataforma con plantillas que revisar: el descubrimiento se rompió.');
  process.exit(1);
}

for (const { framework, base } of plataformas) {
  const compilador = await import(
    pathToFileURL(createRequire(join(base, 'package.json')).resolve('@angular/compiler')).href
  );
  const fuentes = [join(base, 'apps'), join(base, 'libs')]
    .flatMap((d) => ficheros(d))
    .filter((f) => /\.(html|ts)$/.test(f))
    .map(leer);

  const extraidas = extraerPlantillas(fuentes, ts);
  const r = regionesVivas(extraidas.plantillas, compilador);
  const suyasInline = extraidas.plantillas.filter((p) => p.origen === 'inline').length;
  plantillas += extraidas.plantillas.length;
  inline += suyasInline;
  nodos.push(...r.nodos);
  errores.push(...r.errores);
  noLiterales.push(...extraidas.noLiterales);
  porCodigo.push(...regionesPorCodigo(fuentes.filter((f) => f.ruta.endsWith('.ts'))));

  console.log(
    `[regiones-vivas] ${framework}: ${extraidas.plantillas.length} plantillas ` +
      `(${extraidas.plantillas.length - suyasInline} .html + ${suyasInline} inline) · ` +
      `${r.nodos.length} regiones vivas · ${r.nodos.filter((n) => n.enBloque).length} dentro de un bloque`,
  );
}

const cobertura = revisarCobertura({ plantillas, inline, nodosVivos: nodos.length, errores, noLiterales });
// La cobertura se revisa ANTES de `--actualizar`: con el recorrido roto, regenerar hornearía una
// deuda vacía y el gate quedaría verde sobre ella para siempre.
if (cobertura.fallos.length > 0) {
  console.error(`\n[regiones-vivas] ✗ ${cobertura.fallos.length} hallazgo(s) de cobertura:`);
  for (const f of cobertura.fallos) console.error(`    ${f}`);
  process.exit(1);
}

const marcas = nodos.filter((n) => n.enBloque).map((n) => n.clave);
const declarado = JSON.parse(readFileSync(LINEA_BASE, 'utf8'));

if (ACTUALIZAR) {
  // Deuda = marcas − censo, contando repeticiones: dos regiones iguales censadas una vez dejan una.
  const quedan = new Map();
  for (const e of declarado.censo) quedan.set(e.clave, (quedan.get(e.clave) ?? 0) + (e.veces ?? 1));
  const deuda = marcas
    .filter((c) => {
      const n = quedan.get(c) ?? 0;
      if (n === 0) return true;
      quedan.set(c, n - 1);
      return false;
    })
    .sort((a, b) => a.localeCompare(b));
  const crecio = deuda.length - declarado.deuda.length;
  if (crecio > 0) {
    console.warn(
      `\n[regiones-vivas] ⚠ la deuda CRECE en ${crecio}. Una región nueva dentro de un bloque no se ` +
        'registra: se arregla (el mensaje de evento va por LiveAnnouncerService / syn-live-region) ' +
        'o, si de verdad vive con su vista, va al CENSO con su razón.',
    );
  }
  writeFileSync(
    LINEA_BASE,
    `${JSON.stringify({ ...declarado, medido: new Date().toISOString().slice(0, 10), deuda }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\n[regiones-vivas] deuda reescrita: ${deuda.length} región(es); censo intacto (${declarado.censo.length}).`);
  process.exit(0);
}

const { fallos } = cruzarConLaLineaBase(marcas, declarado);
for (const r of porCodigo) {
  fallos.push(`región viva creada por CÓDIGO fuera del anunciador (usá LiveAnnouncerService): ${r}`);
}

const enCenso = declarado.censo.reduce((n, e) => n + (e.veces ?? 1), 0);
console.log(
  `[regiones-vivas] ${plantillas} plantillas · ${nodos.length} regiones vivas · ${marcas.length} dentro de ` +
    `un bloque = ${declarado.deuda.length} en la línea base (deuda) + ${enCenso} en el censo (viven con su vista)`,
);

if (fallos.length > 0) {
  console.error(`\n[regiones-vivas] ✗ ${fallos.length} hallazgo(s):`);
  for (const f of fallos) {
    const nodo = nodos.find((n) => f.endsWith(n.clave));
    console.error(`    ${f}${nodo ? `  (${nodo.ruta}:${nodo.linea})` : ''}`);
  }
  console.error(
    '\n    Un mensaje de EVENTO (agregado, copiado, página cargada, error) se le pide a ' +
      'LiveAnnouncerService, o desde la plantilla a <syn-live-region [message]>, que habla por una ' +
      'región que ya existía. Una región propia, sólo si existe desde el primer render y su texto ' +
      'cambia después — y si vive dentro de un bloque porque nace con su VISTA, al censo con su razón.',
  );
  process.exit(1);
}

console.log('[regiones-vivas] ✓ sin regiones nuevas que nazcan con su mensaje; la línea base no crece.');
