#!/usr/bin/env node
/**
 * Genera —o comprueba— los tipos del contrato HTTP de los orquestadores, desde el OpenAPI que
 * el CMS publica de cada uno (ADR 0140, F2 · CMS#201).
 *
 *   CMS  Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.<X>.json   (lo genera ContratoOpenApiTests)
 *    UI  vitals/contracts/src/http/bff-<x>.contract.ts + index.ts         (lo genera ESTE script)
 *    UI  vitals/core/src/flujos/generados/<flujo>.ts + index.ts          (los envoltorios, núcleo N3)
 *
 * La lógica vive en `tools/lib/contrato-http.mjs` (probada en `test:tools`, sin hermano). Este
 * script sólo lee el disco de los dos lados, y por eso **sin el repo del CMS RECHAZA, no se
 * salta**: un gate cross-repo que se queda sin su fuente y sale con 0 se lee igual que uno que
 * comprobó (la regla de `contrato-synhost.mjs`, G-11).
 *
 * Uso:
 *   node tools/contrato-http.mjs            # regenera la carpeta vitals/contracts/src/http
 *   node tools/contrato-http.mjs --check    # sale 1 si la carpeta no es la que da el contrato
 *   node tools/contrato-http.mjs --cms-path=RUTA   (o SYNERGOS_CMS_PATH, o el hermano)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';
import { avisosDelCms } from './lib/avisos-de-los-flujos.mjs';
import { RUTA_DE_LOS_ENVOLTORIOS, RUTA_EN_CMS, RUTA_GENERADA, diferencias, planDeFicheros } from './lib/contrato-http.mjs';

const RAIZ_UI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPROBAR = process.argv.includes('--check');

function morir(lineas) {
  for (const l of [].concat(lineas)) console.error(l);
  process.exit(1);
}

const { ruta: raizCms, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
const carpeta = join(raizCms, ...RUTA_EN_CMS);

if (!existsSync(carpeta)) {
  morir([
    '✗ No se pudo leer el contrato HTTP de los orquestadores.',
    `  Se buscó en (${origen}): ${carpeta}`,
    comoApuntarAlCms(raizCms),
    '  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO.',
  ]);
}

const leer = (fichero) => {
  try {
    return JSON.parse(readFileSync(join(carpeta, fichero), 'utf8'));
  } catch (e) {
    return morir(`✗ ${fichero}: no es un JSON que se pueda leer (${e.message}).`);
  }
};

// Los avisos de los flujos salen del `appsettings.json` del CMS, la misma fuente que cruza G-15
// (núcleo N3, FR-032). Sin él no se genera: la tabla saldría vacía y diría que nadie avisa.
const appsettings = join(raizCms, 'Synergos.CMS.Web', 'appsettings.json');
if (!existsSync(appsettings)) {
  morir([`✗ No se pudo leer los avisos de los flujos: falta ${appsettings}.`, comoApuntarAlCms(raizCms)]);
}
const avisos = avisosDelCms(JSON.parse(readFileSync(appsettings, 'utf8')));

const { errores, ficheros, envoltorios } = planDeFicheros(readdirSync(carpeta), leer, avisos);
if (errores.length > 0) {
  morir(['✗ El contrato HTTP del CMS no se puede traducir:', ...errores.map((e) => `    ${e}`)]);
}

console.log('Contrato HTTP · CMS → UI (ADR 0140, F2 · núcleo N3)');
console.log(`  documentos: ${carpeta} (${origen})`);
console.log(`  genera: ${[...ficheros.keys()].join(', ')}`);
console.log(`  envoltorios: ${[...envoltorios.keys()].join(', ')}`);

// Las dos carpetas son enteras generadas: los tipos (F2) y los envoltorios de los flujos (N3).
const carpetas = [
  [RUTA_GENERADA, ficheros],
  [RUTA_DE_LOS_ENVOLTORIOS, envoltorios],
];

if (COMPROBAR) {
  const fallos = [];
  for (const [ruta, esperados] of carpetas) {
    const destino = join(RAIZ_UI, ...ruta);
    const enDisco = new Map(
      existsSync(destino) ? readdirSync(destino).map((f) => [f, readFileSync(join(destino, f), 'utf8')]) : [],
    );
    fallos.push(...diferencias(esperados, enDisco).map((x) => `    ${ruta.join('/')}/${x}`));
  }
  if (fallos.length > 0) {
    morir([
      '✗ Lo generado no está al día con el contrato HTTP del CMS:',
      ...fallos,
      '  Un orquestador cambió allá y el tipo de acá sigue describiendo el cable viejo. Regeneralo',
      '  con `node tools/contrato-http.mjs` y el diff va en el commit que lo causó. A mano no se',
      '  edita: lo que no sale del documento, este mismo --check lo pone en rojo.',
    ]);
  }
  for (const [ruta, esperados] of carpetas) console.log(`✓ ${ruta.join('/')} al día (${esperados.size} fichero(s)).`);
} else {
  for (const [ruta, esperados] of carpetas) {
    const destino = join(RAIZ_UI, ...ruta);
    const relativo = ruta.join('/');
    // La carpeta es entera generada: lo que ya no sale de ningún documento se borra, o un
    // orquestador que dejó de publicar seguiría exportado desde el índice viejo.
    mkdirSync(destino, { recursive: true });
    for (const f of readdirSync(destino)) {
      if (!esperados.has(f)) {
        rmSync(join(destino, f));
        console.log(`  borrado ${relativo}/${f}`);
      }
    }
    for (const [f, texto] of esperados) writeFileSync(join(destino, f), texto);
    console.log(`✓ escrito ${relativo} (${esperados.size} fichero(s)).`);
  }
}
