#!/usr/bin/env node
/**
 * Gate cross-repo (G-13): las unidades menores con las que la UI pinta un importe son las
 * mismas con las que el CMS lo emite (CMS#196).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. La tasa de un trámite y la facturación de salud salían en PESOS con el nombre
 * `feeMinor`/`balanceMinor`; la UI divide por 100 y un saldo de 123.500 se
 * pintaba $ 1.235 (medido en el sitio real). El CMS emite con `UnidadesMenores` y la UI pinta con `aMenores` /
 * `desdeMenores`: dos implementaciones de la misma tabla, en dos lenguajes. Se hace como G-12:
 *
 * 1. **Se COMPILA la fuente de verdad, no se reimplementa** (`vitals/core/src/formato`, con la
 *    API de Node de esbuild).
 * 2. **Sin el repo del CMS RECHAZA, no se salta**: un «no pude comprobar» se lee igual que un
 *    «no aplica» en la lista de checks.
 * 3. **Por eso no está en `npm test`**: corre en `design-gates-ui.yml`, que hace checkout del
 *    CMS. Su lógica sí corre en `test:tools` (`tools/lib/vectores-unidades-menores.spec.mjs`).
 *
 * Uso:
 *   node tools/vectores-unidades-menores.mjs [--cms-path=RUTA]
 *   SYNERGOS_CMS_PATH=/ruta/al/cms node tools/vectores-unidades-menores.mjs
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';
import { cruzarUnidadesMenores } from './lib/vectores-unidades-menores.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_UI = resolve(AQUI, '..');

/** El fichero de vectores, dentro de la superficie de acople del CMS. */
const VECTORES_EN_CMS = join('Synergos.CMS.Web', 'docs', 'contracts', 'minor-units-vectors.json');

/** La fuente de verdad del lado UI: agnóstica, así que una sola para todas las plataformas. */
const REGLA = join(RAIZ_UI, 'vitals', 'core', 'src', 'formato', 'importe.ts');

function morir(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

const { ruta: raizCms, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
const ficheroVectores = join(raizCms, VECTORES_EN_CMS);

if (!existsSync(ficheroVectores)) {
  console.error('✗ No se pudieron comprobar las unidades menores contra los vectores del CMS.');
  console.error(`  Se buscó en (${origen}): ${ficheroVectores}`);
  console.error(comoApuntarAlCms(raizCms));
  console.error('  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO.');
  process.exit(1);
}

if (!existsSync(REGLA)) {
  morir(`No está ${REGLA}: el gate perdió su sujeto.`);
}

let esbuild;
try {
  esbuild = await import('esbuild');
} catch (error) {
  morir(`No se pudo cargar esbuild (${error?.code ?? error}). Corré \`npm run setup\`.`);
}

const declarado = JSON.parse(readFileSync(ficheroVectores, 'utf8'));

console.log('Vectores de oro de las unidades menores · CMS ↔ UI');
console.log(`  fichero: ${ficheroVectores} (${origen})`);
console.log(`  regla: ${REGLA.slice(RAIZ_UI.length + 1)}`);

const temporal = mkdtempSync(join(tmpdir(), 'unidades-menores-'));
const compilada = join(temporal, 'importe.mjs');
try {
  await esbuild.build({
    entryPoints: [REGLA],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: compilada,
    logLevel: 'silent',
  });
} catch (error) {
  rmSync(temporal, { recursive: true, force: true });
  morir(`esbuild no pudo compilar ${REGLA}:\n${error?.message ?? error}`);
}

const { aMenores, desdeMenores } = await import(pathToFileURL(compilada).href);
rmSync(temporal, { recursive: true, force: true });
if (typeof aMenores !== 'function' || typeof desdeMenores !== 'function') {
  morir('La regla ya no exporta `aMenores` y `desdeMenores`: el gate perdió su sujeto.');
}

const fallos = cruzarUnidadesMenores(declarado.vectores, aMenores, desdeMenores);
if (fallos.length > 0) {
  console.error(`\n✗ ${fallos.length} desviación(es):`);
  for (const f of fallos) console.error(`    ${f}`);
  console.error('\n  Lo que se pinta tiene que ser lo que el servidor emite, en la misma unidad. Del lado');
  console.error('  del CMS los mismos vectores los corre UnidadesMenoresTests.');
  process.exit(1);
}

console.log(`\n✓ ${declarado.vectores.length} vectores cruzan en la misma unidad.`);
