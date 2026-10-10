#!/usr/bin/env node
/**
 * Gate cross-repo (G-15): el parámetro con el que el enlace del aviso de cada flujo llega a la página
 * es el que lee su participante (ADR 0140 F4, CMS#201).
 *
 * El razonamiento y el cruce viven en `tools/lib/avisos-de-los-flujos.mjs`, que `npm test` ejercita
 * sin el CMS. Acá sólo está la lectura de los dos lados.
 *
 * Necesita el repo del CMS, y sin él **rechaza**: un «no pude comprobar» se leería igual que un «no
 * aplica». Corre en `contracts:validate` y en `design-gates-ui.yml`.
 *
 * Uso: node tools/avisos-de-los-flujos.mjs [--cms-path=RUTA]
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { avisosDelCms, avisosDelUi, cruzarAvisos } from './lib/avisos-de-los-flujos.mjs';
import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';

const RAIZ_UI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TABLA_DEL_UI = join(RAIZ_UI, 'vitals', 'core', 'src', 'flujos', 'avisos.ts');

const { ruta: raizCms, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
const appsettings = join(raizCms, 'Synergos.CMS.Web', 'appsettings.json');

if (!existsSync(appsettings)) {
  console.error('✗ No se pudo cruzar los avisos de los flujos con el CMS.');
  console.error(`  Se buscó en (${origen}): ${appsettings}`);
  console.error(comoApuntarAlCms(raizCms));
  console.error('  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO.');
  process.exit(1);
}

const cms = avisosDelCms(JSON.parse(readFileSync(appsettings, 'utf8')));
const ui = await avisosDelUi(TABLA_DEL_UI);
const errores = cruzarAvisos({ cms, ui });

if (errores.length > 0) {
  console.error('✗ El enlace del aviso y el participante no dicen el mismo parámetro:');
  for (const e of errores) console.error(`  - ${e}`);
  console.error('  Sin el parámetro, el enlace del correo abre la página y no abre la compra, sin decir nada.');
  process.exit(1);
}

console.log(`✓ ${cms.size} enlace(s) de aviso: cada uno trae el parámetro que lee su participante.`);
