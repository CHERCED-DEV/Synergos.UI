#!/usr/bin/env node
/**
 * Genera —o comprueba— el tipo TS de lo que viaja a cada elemento con resolver tipado, desde
 * el contrato que el CMS deriva de sus records (ADR 0135 · CMS#173).
 *
 *   CMS  Synergos.CMS.Web/docs/contracts/elementos-synhost.json   (lo genera ContratoSynHostTests)
 *    UI  vitals/contracts/src/elementos-synhost.contract.ts        (lo genera ESTE script)
 *
 * La lógica vive en `tools/lib/contrato-synhost.mjs` (probada en `test:tools`, sin hermano).
 * Este script sólo lee el disco de los dos lados, y por eso **sin el repo del CMS RECHAZA,
 * no se salta**: un gate cross-repo que se queda sin su fuente y sale con 0 se lee igual que
 * uno que comprobó (la regla de G-8 del repo hermano, y la de `vectores-hipoteca.mjs`).
 *
 * Uso:
 *   node tools/contrato-synhost.mjs            # regenera el .ts
 *   node tools/contrato-synhost.mjs --check    # sale 1 si el .ts no es el que da el contrato
 *   node tools/contrato-synhost.mjs --cms-path=RUTA   (o SYNERGOS_CMS_PATH, o el hermano)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';
import {
  RUTA_EN_CMS,
  RUTA_GENERADA,
  cruzarConRegistry,
  generarTs,
  validarContrato,
} from './lib/contrato-synhost.mjs';

const RAIZ_UI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPROBAR = process.argv.includes('--check');

function morir(lineas) {
  for (const l of [].concat(lineas)) console.error(l);
  process.exit(1);
}

const { ruta: raizCms, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
const ficheroContrato = join(raizCms, ...RUTA_EN_CMS);

if (!existsSync(ficheroContrato)) {
  morir([
    '✗ No se pudo leer el contrato de los elementos con resolver tipado.',
    `  Se buscó en (${origen}): ${ficheroContrato}`,
    comoApuntarAlCms(raizCms),
    '  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO.',
  ]);
}

const contrato = JSON.parse(readFileSync(ficheroContrato, 'utf8'));
const registry = JSON.parse(readFileSync(join(RAIZ_UI, 'vitals', 'contracts', 'src', 'element-registry.json'), 'utf8'));

const errores = [...validarContrato(contrato), ...cruzarConRegistry(contrato, registry)];
if (errores.length > 0) {
  morir(['✗ El contrato del CMS no se puede usar:', ...errores.map((e) => `    ${e}`)]);
}

const destino = join(RAIZ_UI, ...RUTA_GENERADA);
const generado = generarTs(contrato);

console.log('Contrato SynHost · CMS → UI (ADR 0135)');
console.log(`  contrato: ${ficheroContrato} (${origen})`);
console.log(`  elementos: ${contrato.elementos.map((e) => e.nombre).join(', ')}`);

if (COMPROBAR) {
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8').replaceAll('\r\n', '\n') : null;
  if (actual !== generado) {
    morir([
      `✗ ${RUTA_GENERADA.join('/')} no es el que da el contrato del CMS.`,
      '  Un record cambió allá y el tipo de acá sigue describiendo el cable viejo: el sanitizador',
      '  compilaría contra claves que ya no llegan. Regeneralo con `node tools/contrato-synhost.mjs`',
      '  y el diff va en el commit que lo causó.',
    ]);
  }
  console.log(`✓ ${RUTA_GENERADA.join('/')} al día (${contrato.elementos.length} elemento(s)).`);
} else {
  writeFileSync(destino, generado);
  console.log(`✓ escrito ${RUTA_GENERADA.join('/')}`);
}
