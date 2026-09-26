#!/usr/bin/env node
/**
 * Gate cross-repo: la calculadora de hipoteca de ESTE árbol da los vectores de oro que
 * el CMS declara (#76 · CMS#167).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. `IMortgageCalculator` del CMS afirmaba «el cálculo base es el mismo
 * en cliente y servidor» y era FALSO desde que existe el endpoint: las dos son la misma
 * fórmula con la tasa a 100× de distancia —acá porcentaje, allá fracción— y nada las
 * cruzaba. Medido con las dos implementaciones reales sobre 300.000.000 / 60.000.000 /
 * 240 meses: el borde contestaba 240.000.000 al mes donde esta app pinta 2.642.606,72.
 *
 * Las expectativas NO salen de ninguna de las dos: se derivaron de la fórmula cerrada
 * con aritmética decimal de 50 dígitos. Un fixture sacado de una implementación es una
 * FOTO — detecta que se separan, no que las dos están mal a la vez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES COSAS QUE NO SON OBVIAS.
 *
 * 1. **Se COMPILA la fuente de verdad, no se reimplementa.** `mortgage.calc.ts` es
 *    TypeScript y este gate es `.mjs`, así que se pasa por esbuild y se importa el
 *    resultado. Copiar la fórmula acá haría un gate que se cruza consigo mismo — la
 *    tercera copia del algoritmo, que es lo contrario de lo que el ticket vino a cerrar.
 *
 * 2. **Sin el repo del CMS RECHAZA, no se salta.** Los vectores viven en su
 *    `docs/contracts/`, que es la única superficie de acople. Un gate cross-repo que se
 *    queda sin su fuente y sale con 0 es peor que no tenerlo: en la lista de checks un
 *    «no pude comprobar» se lee igual que un «no aplica». Es la regla de G-8 del repo
 *    hermano.
 *
 * 3. **Por eso NO está en `npm test`**, que corre sin hermano: está en
 *    `design-gates-ui.yml`, que hace checkout del CMS. Lo que sí corre en `npm test` es
 *    su LÓGICA, en `tools/lib/vectores-hipoteca.spec.mjs` — el reparto de
 *    `humo-tras-desplegar` y `setup-completo`. Va dicho en vez de insinuar que el cruce
 *    entero corre en cada PR.
 *
 * Uso:
 *   node tools/vectores-hipoteca.mjs [--cms-path=RUTA]
 *   SYNERGOS_CMS_PATH=/ruta/al/cms node tools/vectores-hipoteca.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PLATAFORMAS } from './lib/element-sources.mjs';
import { comoApuntarAlCms, resolverRaizCms } from './lib/rutas-hermanas.mjs';
import { cruzarVectores } from './lib/vectores-hipoteca.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_UI = resolve(AQUI, '..');

/** El fichero de vectores, dentro de la superficie de acople del CMS. */
const VECTORES_EN_CMS = join('Synergos.CMS.Web', 'docs', 'contracts', 'mortgage-vectors.json');

/** Cómo se llama la implementación, en cualquier plataforma que la tenga. */
const CALCULADORA = 'mortgage.calc.ts';

function morir(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

/**
 * Las calculadoras del árbol — se RECORRE, no se escribe la ruta.
 *
 * Nombrar `platforms/angular/apps/…/mortgage.calc.ts` habría resuelto a un literal una
 * dimensión de lo que el gate mide (la regla 25) y, peor, habría caducado sola: hoy sólo
 * Angular implementa el vertical Propiedades, así que la excepción sería «legítimamente de
 * Angular» — que es exactamente la forma de la excepción que la regla 26 vio caducar el día
 * que hubo dos plataformas, dejando a `cdn-runtime-check` pasando en verde sobre la segunda.
 * Recorriendo, el día que otra plataforma traiga su calculadora se cruza también, sin tocar
 * este fichero.
 */
function calculadoras() {
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
      } else if (e.name === CALCULADORA) {
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
  console.error('✗ No se pudo comprobar la calculadora de hipoteca contra los vectores del CMS.');
  console.error(`  Se buscó en (${origen}): ${ficheroVectores}`);
  console.error(comoApuntarAlCms(raizCms));
  console.error('  NO se pasa por alto: un gate que no pudo comprobar nada sale en ROJO, porque en');
  console.error('  la lista de checks un «no pude» se lee igual que un «no aplica».');
  process.exit(1);
}

const fuentes = calculadoras();
if (fuentes.length === 0) {
  morir(
    `No se encontró ninguna \`${CALCULADORA}\` bajo las apps de las plataformas. Si se movió o se ` +
      'renombró, este gate perdió su sujeto — y un cruce sin sujeto sale en ROJO, no en verde.',
  );
}

// `esbuild` pasó a estar DECLARADO en el `package.json` de la raíz por esto: estaba sólo
// hoisteado desde una dependencia transitiva, así que un `npm ci` lo traía mientras algún otro
// paquete lo arrastrara. Un gate que depende de un binario que nadie declaró se cae el día que
// ese otro paquete cambia, y el fallo no habla de este fichero. Declararlo no añade nada al
// árbol: nombra lo que la lock ya resolvía (0.25.12).
const esbuild = [
  join(RAIZ_UI, 'node_modules', '.bin', 'esbuild'),
  ...PLATAFORMAS.map((p) => join(RAIZ_UI, 'platforms', p.framework, 'node_modules', '.bin', 'esbuild')),
].find(existsSync);
if (!esbuild) {
  morir('No se encontró esbuild. Corré `npm run setup` (una instalación por plataforma).');
}

const declarado = JSON.parse(readFileSync(ficheroVectores, 'utf8'));

console.log('Vectores de oro de la hipoteca · CMS ↔ UI');
console.log(`  fichero: ${ficheroVectores} (${origen})`);

let fallos = [];

for (const fuente of fuentes) {
  const relativa = fuente.slice(RAIZ_UI.length + 1);
  console.log(`  calculadora: ${relativa}`);

  const temporal = mkdtempSync(join(tmpdir(), 'hipoteca-'));
  const compilada = join(temporal, 'mortgage.calc.mjs');

  try {
    execFileSync(esbuild, [fuente, '--bundle', '--format=esm', '--platform=node', `--outfile=${compilada}`], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (error) {
    rmSync(temporal, { recursive: true, force: true });
    morir(`esbuild no pudo compilar ${relativa}:\n${error?.stderr?.toString() ?? error}`);
  }

  const { calculateMortgage } = await import(pathToFileURL(compilada).href);
  rmSync(temporal, { recursive: true, force: true });

  if (typeof calculateMortgage !== 'function') {
    morir(`${relativa} ya no exporta \`calculateMortgage\`: el gate perdió su sujeto.`);
  }

  fallos = [
    ...fallos,
    ...cruzarVectores(declarado.vectores, (req) => calculateMortgage(req)).map((f) => `${relativa}: ${f}`),
  ];
}

if (fallos.length > 0) {
  console.error(`\n✗ ${fallos.length} desviación(es):`);
  for (const f of fallos) console.error(`    ${f}`);
  console.error('\n  Las dos implementaciones de la cuota tienen que dar el MISMO número al');
  console.error('  centavo. Si esto se pone rojo, una de las dos se movió — y la de allá la');
  console.error('  vigila `HipotecaVectoresTests`, así que empezá por correr las dos.');
  process.exit(1);
}

console.log(`\n✓ ${declarado.vectores.length} vectores cruzan al centavo en monthly y principal.`);
