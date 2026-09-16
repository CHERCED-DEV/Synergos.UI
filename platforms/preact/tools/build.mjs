#!/usr/bin/env node
/**
 * EL build de la plataforma Preact (#64).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES UN esbuild Y NADA MÁS, Y ÉSA ES MEDIA RESPUESTA DE LA ÉPICA #37.
 *
 * El de Angular necesita un `NgtscProgram` —compilar plantillas, resolver DI,
 * emitir el árbol AOT— y tarda ~19 s con 127 elementos. Acá el JSX lo transforma
 * el propio esbuild (`jsx: 'automatic'`, `jsxImportSource: 'preact'`) y no hay
 * compilador de framework que arrancar.
 *
 * Eso no dice que Preact sea «mejor»: dice que **el contrato de plataforma no
 * exige un compilador**, que es lo que había que comprobar. Las ocho
 * obligaciones se cumplen igual con 30 líneas de esbuild que con un programa de
 * ngtsc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS TRES ARTEFACTOS, Y POR QUÉ SON TRES Y NO UNO.
 *
 *   dist/<elemento>/browser/main.js   el elemento — pesa lo que pesa su lógica
 *   dist/libs/sg-preact-core.js       el adaptador de montaje
 *   dist/libs/sg-preact-shared.js     el design system CON su CSS dentro
 *
 * Es el MISMO reparto que Angular hace con `sg-core.js` y `sg-shared.js`. Si acá
 * se empaquetara todo dentro del elemento, el número que la épica #37 quiere
 * comparar —el piso de una página— saldría más bajo por una razón que no tiene
 * nada que ver con el framework, y la comparación no significaría nada.
 *
 * La ruta `dist/<elemento>/browser/main.js` la promete `resolveBundlePath` en
 * `tools/lib/synergos-config.mjs`. Que coincida NO lo comprueba este fichero: lo
 * comprueba `publish.mjs` con el dist hecho (obligación 4, mitad declarada).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { build } from 'esbuild';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

import { EXTERNALS, PREACT_EXTERNALS } from '../cdn.config.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(AQUI, '..');
const REPO = path.resolve(BASE, '../..');
const DIST = path.join(BASE, 'dist');

/** La entrada de un elemento, tal como la declara `PLATFORMS[].entrada` (#64). */
const ENTRADA = 'src/main.tsx';

/**
 * ⚠ **UN ALIAS PISA A `external`, Y ESO COSTÓ UN BUNDLE 9× MÁS GORDO.**
 *
 * esbuild resuelve el alias PRIMERO: `@synergos/preact-shared` deja de ser un
 * bare specifier y pasa a ser una ruta absoluta, así que la lista de `external`
 * —que casa por nombre de módulo— ya no lo ve y lo empaqueta. Medido: el badge
 * salió a **17.525 B** con el adaptador y el design system dentro, contra los
 * 1.845 B del de Angular. **No falla**: compila, publica y hasta entra en el
 * techo de su tier. Lo único que se rompe es la idea fundacional del repo
 * —veinte elementos, UN runtime—, y se rompe en silencio.
 *
 * Por eso los alias van POR DESTINO y no en un `comun`: lo que se empaqueta se
 * aliasea, lo que se comparte se deja como bare import.
 */
const ALIAS_VITALS = {
  // El subcamino ANTES que el raíz: el alias casa por prefijo (la misma trampa
  // de #63, que costó 236 specs en rojo del lado de Angular).
  '@synergos/core/inputs': path.join(REPO, 'vitals/core/src/inputs/index.ts'),
  '@synergos/contracts': path.join(REPO, 'vitals/contracts/src/index.ts'),
  '@synergos/core': path.join(REPO, 'vitals/core/src/index.ts'),
};

const ALIAS_PLATAFORMA = {
  '@synergos/preact-core': path.join(BASE, 'libs/core/src/index.ts'),
  '@synergos/preact-shared': path.join(BASE, 'libs/shared/src/index.ts'),
};

const comun = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  logLevel: 'warning',
};

/** Las fuentes: cada carpeta bajo `apps/` con la entrada declarada. */
function descubrir(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    const completo = path.join(dir, nombre);
    if (!statSync(completo).isDirectory()) continue;
    if (existsSync(path.join(completo, ENTRADA))) salida.push({ nombre, dir: completo });
    else descubrir(completo, salida);
  }
  return salida;
}

/** El SCSS del design system, compilado a una cadena para `instalarEstilos`. */
function estilos() {
  const raiz = path.join(BASE, 'libs/shared/src/components');
  const hojas = [];
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const completo = path.join(dir, nombre);
      if (statSync(completo).isDirectory()) recorrer(completo);
      else if (nombre.endsWith('.scss')) hojas.push(completo);
    }
  };
  recorrer(raiz);
  // Se compilan por separado y se concatenan: cada hoja declara sus propios
  // `@use`, y Sass exige que vayan al principio del fichero — un `@use` a mitad
  // de una concatenación es un error de compilación, no un aviso.
  return hojas
    .sort()
    .map((hoja) => sass.compile(hoja, { style: 'compressed' }).css)
    .join('\n');
}

async function principal() {
  const inicio = Date.now();
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(path.join(DIST, 'libs'), { recursive: true });

  const css = estilos();
  const fuentes = descubrir(path.join(BASE, 'apps'));
  console.log(`[build] 0s  ${fuentes.length} elemento(s) + libs {core, shared}`);

  // El runtime compartido. `define` sustituye el placeholder del instalador de
  // estilos por el CSS ya compilado — así el design system y su aspecto viajan
  // juntos y no hay una segunda petición que se pueda perder.
  await build({
    ...comun,
    entryPoints: [ALIAS_PLATAFORMA['@synergos/preact-core']],
    outfile: path.join(DIST, 'libs/sg-preact-core.js'),
    alias: ALIAS_VITALS,
    external: [...PREACT_EXTERNALS, '@synergos/preact-shared'],
  });
  await build({
    ...comun,
    entryPoints: [ALIAS_PLATAFORMA['@synergos/preact-shared']],
    outfile: path.join(DIST, 'libs/sg-preact-shared.js'),
    alias: ALIAS_VITALS,
    external: [...PREACT_EXTERNALS, '@synergos/preact-core'],
    define: { __SYNERGOS_ESTILOS__: JSON.stringify(css) },
  });

  for (const fuente of fuentes) {
    await build({
      ...comun,
      entryPoints: [path.join(fuente.dir, ENTRADA)],
      outfile: path.join(DIST, fuente.nombre, 'browser/main.js'),
      // Sólo `vitals`: lo demás es EXTERNAL y tiene que llegar como bare import
      // al import map. Aliasear acá `preact-shared` lo metería dentro (ver la
      // nota de ALIAS_VITALS).
      alias: ALIAS_VITALS,
      external: EXTERNALS,
    });
  }

  const s = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`[build] ${s}s  dist listo → platforms/preact/dist/<nombre>/browser/main.js`);
  console.log(`[build] ${s}s  hecho`);
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
