#!/usr/bin/env node
/**
 * Gate cross-repo (G-12): la comisión de servicio que el carrito de `eventos` MUESTRA da los
 * vectores de oro con los que el CMS y el orquestador la COBRAN (ADR 0137 · CMS#194).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. La comisión vivía sólo en el bundle y ningún camino del servidor la
 * cobraba. Ahora la cobran dos motores y la muestra este árbol: tres implementaciones de la
 * misma regla en dos lenguajes, y la de acá redondeaba con `Math.round` —mitad hacia arriba—
 * donde la casa redondea al par. Los vectores del CMS están elegidos para que esa diferencia
 * se vea.
 *
 * Se hace como G-9 (la hipoteca), por las mismas razones:
 *
 * 1. **Se COMPILA la fuente de verdad, no se reimplementa** (`eventos-comision.ts`, con la
 *    API de Node de esbuild).
 * 2. **Sin el repo del CMS RECHAZA, no se salta**: un «no pude comprobar» se lee igual que un
 *    «no aplica» en la lista de checks.
 * 3. **Por eso no está en `npm test`**: corre en `design-gates-ui.yml`, que hace checkout del
 *    CMS. Su lógica sí corre en `test:tools` (`tools/lib/vectores-comision.spec.mjs`).
 *
 * Uso:
 *   node tools/vectores-comision.mjs [--cms-path=RUTA]
 *   SYNERGOS_CMS_PATH=/ruta/al/cms node tools/vectores-comision.mjs
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PLATAFORMAS } from './lib/element-sources.mjs';
import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';
import { cruzarComision } from './lib/vectores-comision.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_UI = resolve(AQUI, '..');

/** El fichero de vectores, dentro de la superficie de acople del CMS. */
const VECTORES_EN_CMS = join('Synergos.CMS.Web', 'docs', 'contracts', 'service-fee-vectors.json');

/** Cómo se llama la regla, en cualquier plataforma que la tenga. */
const REGLA = 'eventos-comision.ts';

function morir(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

/** Las implementaciones del árbol: se RECORRE, no se escribe la ruta (ver G-9). */
function implementaciones() {
  const salida = [];
  const buscar = (dir) => {
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        buscar(join(dir, e.name));
      } else if (e.name === REGLA) {
        salida.push(join(dir, e.name));
      }
    }
  };
  for (const plataforma of PLATAFORMAS) buscar(join(RAIZ_UI, plataforma.apps));
  return salida;
}

const { ruta: raizCms, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
const ficheroVectores = join(raizCms, VECTORES_EN_CMS);

if (!existsSync(ficheroVectores)) {
  console.error('✗ No se pudo comprobar la comisión del carrito contra los vectores del CMS.');
  console.error(`  Se buscó en (${origen}): ${ficheroVectores}`);
  console.error(comoApuntarAlCms(raizCms));
  console.error('  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO.');
  process.exit(1);
}

const fuentes = implementaciones();
if (fuentes.length === 0) {
  morir(`No se encontró ninguna \`${REGLA}\` bajo las apps de las plataformas: el gate perdió su sujeto.`);
}

let esbuild;
try {
  esbuild = await import('esbuild');
} catch (error) {
  morir(`No se pudo cargar esbuild (${error?.code ?? error}). Corré \`npm run setup\`.`);
}

const declarado = JSON.parse(readFileSync(ficheroVectores, 'utf8'));

console.log('Vectores de oro de la comisión de servicio · CMS ↔ UI');
console.log(`  fichero: ${ficheroVectores} (${origen})`);

let fallos = [];
for (const fuente of fuentes) {
  const relativa = fuente.slice(RAIZ_UI.length + 1);
  console.log(`  regla: ${relativa}`);

  const temporal = mkdtempSync(join(tmpdir(), 'comision-'));
  const compilada = join(temporal, 'eventos-comision.mjs');
  try {
    await esbuild.build({
      entryPoints: [fuente],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: compilada,
      logLevel: 'silent',
    });
  } catch (error) {
    rmSync(temporal, { recursive: true, force: true });
    morir(`esbuild no pudo compilar ${relativa}:\n${error?.message ?? error}`);
  }

  const { comisionEnMenores } = await import(pathToFileURL(compilada).href);
  rmSync(temporal, { recursive: true, force: true });
  if (typeof comisionEnMenores !== 'function') {
    morir(`${relativa} ya no exporta \`comisionEnMenores\`: el gate perdió su sujeto.`);
  }

  fallos = [...fallos, ...cruzarComision(declarado.vectores, comisionEnMenores).map((f) => `${relativa}: ${f}`)];
}

if (fallos.length > 0) {
  console.error(`\n✗ ${fallos.length} desviación(es):`);
  for (const f of fallos) console.error(`    ${f}`);
  console.error('\n  Lo que el carrito muestra tiene que ser lo que se cobra, al centavo. Del lado del');
  console.error('  CMS los mismos vectores los corren NegocioDeEventosTests y ComisionDeServicioTests.');
  process.exit(1);
}

console.log(`\n✓ ${declarado.vectores.length} vectores cruzan al centavo.`);
