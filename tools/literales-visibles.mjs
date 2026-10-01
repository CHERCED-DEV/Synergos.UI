#!/usr/bin/env node
/**
 * Gate: ningún elemento suma textos de interfaz escritos a mano (ADR 0136 §4 del CMS, piloto
 * CMS#186) — con línea base, porque hoy hay miles y bajarlos es una migración.
 *
 * La regla, el detector y el cruce viven en `tools/lib/literales-visibles.mjs`, que `npm test`
 * ejercita con fixtures. Acá sólo está el recorrido —las fuentes de cada elemento, con la misma
 * regla de descubrimiento que el build— y la línea base.
 *
 *   node tools/literales-visibles.mjs               # el gate
 *   node tools/literales-visibles.mjs --actualizar  # reescribe la línea base
 *   node tools/literales-visibles.mjs --ver=app-launcher   # lista los textos de un elemento
 *
 * El diff de la línea base va en el commit que lo causó, como el de `size:baseline`.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { PLATAFORMAS, descubrirFuentes } from './lib/element-sources.mjs';
import { cruzarConLaLineaBase, lineaBaseDe, literalesDelElemento } from './lib/literales-visibles.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINEA_BASE = join(RAIZ, 'tools', 'literales-visibles.baseline.json');
const ACTUALIZAR = process.argv.includes('--actualizar');
const VER = process.argv.find((a) => a.startsWith('--ver='))?.slice('--ver='.length);

function fuentes(dir) {
  const salida = [];
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      salida.push(...fuentes(ruta));
    } else {
      salida.push({ ruta: relative(RAIZ, ruta).replace(/\\/g, '/'), fuente: readFileSync(ruta, 'utf8') });
    }
  }
  return salida;
}

const actual = {};
for (const plataforma of PLATAFORMAS) {
  const descubiertas = descubrirFuentes({
    listar: (dir) => {
      const abs = resolve(RAIZ, dir);
      return existsSync(abs) && statSync(abs).isDirectory()
        ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        : [];
    },
    existe: (ruta) => existsSync(resolve(RAIZ, ruta)),
    plataformas: [plataforma],
  });
  for (const [nombre, { dir }] of descubiertas) {
    const hallados = literalesDelElemento(ts, fuentes(resolve(RAIZ, dir)));
    actual[nombre] = (actual[nombre] ?? 0) + hallados.length;
    if (VER === nombre) for (const h of hallados) console.log(`  ${h.ruta}:${h.linea}  [${h.tipo}]  ${h.texto}`);
  }
}

const elementos = Object.keys(actual).length;
const total = Object.values(actual).reduce((a, n) => a + n, 0);
console.log(`[literales] ${elementos} elementos · ${total} textos de interfaz escritos a mano (fuera de t())`);

// Red de seguridad por el vacío: un recorrido que no ve elementos daría «0 textos, todo verde».
if (elementos < 50 || total === 0) {
  console.error(`✗ el recorrido vio ${elementos} elementos y ${total} textos: está roto, no limpio.`);
  process.exit(1);
}

if (ACTUALIZAR) {
  writeFileSync(LINEA_BASE, JSON.stringify(lineaBaseDe(actual), null, 2) + '\n');
  console.log(`✓ línea base reescrita: ${Object.keys(lineaBaseDe(actual)).length} elementos con deuda, ${total} textos`);
  process.exit(0);
}

const base = existsSync(LINEA_BASE) ? JSON.parse(readFileSync(LINEA_BASE, 'utf8')) : {};
const { subieron, bajaron, fantasmas } = cruzarConLaLineaBase(actual, base);
const problemas = [
  ...subieron.map((s) => `texto nuevo escrito a mano — ${s}. Traducilo con t() desde una sección que el record declare (ADR 0136). Ver: node tools/literales-visibles.mjs --ver=<elemento>`),
  ...bajaron.map((s) => `bajó — ${s}. Bien: reescribí la línea base (--actualizar) en este commit, o la deuda pagada se puede volver a contraer en silencio`),
  ...fantasmas.map((e) => `la línea base nombra «${e}», que ya no existe: reescribila (--actualizar)`),
];
if (problemas.length > 0) {
  console.error(`✗ ${problemas.length}:\n  - ${problemas.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ ningún elemento suma textos a mano (línea base: ${Object.values(base).reduce((a, n) => a + n, 0)})`);
