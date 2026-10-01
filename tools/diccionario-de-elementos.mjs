#!/usr/bin/env node
/**
 * Gate: cada `t('clave')` de un elemento está en las claves que declara su record, y nadie más
 * traduce (ADR 0136 del CMS, piloto CMS#186; regla 44 del `CLAUDE.md`).
 *
 * La regla vive en `tools/lib/diccionario-de-elementos.mjs`, que `npm test` ejercita con
 * fixtures. Acá sólo está el recorrido: las fuentes de cada elemento (la misma regla de
 * descubrimiento que el build), las librerías de cada plataforma, y el contrato GENERADO
 * (`vitals/contracts/src/elementos-synhost.contract.ts`, versionado) — así que corre sin el CMS al
 * lado, en `npm test`.
 *
 *   node tools/diccionario-de-elementos.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { PLATAFORMAS, descubrirFuentes } from './lib/element-sources.mjs';
import { revisarElemento, revisarLibrerias } from './lib/diccionario-de-elementos.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRATO = join(RAIZ, 'vitals', 'contracts', 'src', 'elementos-synhost.contract.ts');

/** Los `.ts` de código bajo `dir` (sin specs ni salidas de build). */
function fuentesTs(dir) {
  const salida = [];
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      salida.push(...fuentesTs(ruta));
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts')) {
      salida.push({ ruta: relative(RAIZ, ruta).replace(/\\/g, '/'), fuente: readFileSync(ruta, 'utf8') });
    }
  }
  return salida;
}

/** El contrato generado, ejecutado: es TS sin imports, se transpila y se importa. */
async function contratos() {
  const js = ts.transpileModule(readFileSync(CONTRATO, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return new Map(modulo.ELEMENTOS_SYNHOST.map((e) => [e.nombre, { diccionario: e.diccionario, claves: e.claves }]));
}

const porNombre = await contratos();
const errores = [];
let conT = 0;
let llamadas = 0;
const vistos = new Set();

for (const plataforma of PLATAFORMAS) {
  const fuentes = descubrirFuentes({
    listar: (dir) => {
      const abs = resolve(RAIZ, dir);
      return existsSync(abs) && statSync(abs).isDirectory()
        ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        : [];
    },
    existe: (ruta) => existsSync(resolve(RAIZ, ruta)),
    plataformas: [plataforma],
  });

  for (const [nombre, { dir }] of fuentes) {
    vistos.add(nombre);
    const { errores: suyos, usadas } = revisarElemento({
      nombre,
      contrato: porNombre.get(nombre) ?? null,
      fuentes: fuentesTs(resolve(RAIZ, dir)),
    });
    errores.push(...suyos);
    if (usadas.length > 0) {
      conT += 1;
      llamadas += usadas.length;
    }
  }

  errores.push(...revisarLibrerias(fuentesTs(resolve(RAIZ, plataforma.apps, '..', 'libs'))));
}

// Red de seguridad por el vacío: un contrato cuyo elemento no se encontró en el disco no se
// revisó, y un recorrido que no ve ningún t() daría verde sin mirar nada.
for (const nombre of porNombre.keys()) {
  if (!vistos.has(nombre)) errores.push(`${nombre}: tiene contrato y no se encontró su fuente — este gate no lo revisó.`);
}
if (llamadas === 0) errores.push('No se encontró ni una llamada a t(): el recorrido está roto (el piloto de la ADR 0136 dejó varias).');

console.log(`[diccionario] ${porNombre.size} contratos · ${conT} elementos traducen con t() · ${llamadas} llamadas`);
if (errores.length > 0) {
  console.error(`✗ ${errores.length} problema(s):\n  - ${errores.join('\n  - ')}`);
  process.exit(1);
}
console.log('✓ cada t() pide una clave que su elemento declara, ninguna librería traduce, y ninguna sección sobra');
