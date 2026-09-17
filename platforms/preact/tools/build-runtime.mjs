#!/usr/bin/env node
/**
 * El runtime compartido de Preact, para el CDN (#64).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES EL GEMELO DE `tools/build-runtime.mjs` Y CABE EN UNA PANTALLA. ESO ES UN
 * DATO, NO UNA PRESUNCIÓN.
 *
 * El de Angular pasa el **linker de Angular** sobre los `@angular/*` de npm con
 * `@babel/core` —sin eso el navegador se descarga `ng-compiler.js`, 523 KB, y
 * `ngDevMode` se queda en `true`—, resuelve doce entradas y produce quince
 * ficheros. Acá son cinco `build` de esbuild sobre paquetes que ya vienen en
 * ESM listo para el navegador.
 *
 * La diferencia NO es «Preact es mejor»: es que Angular publica un framework
 * que se compila y Preact publica una librería. La épica #37 quería el número
 * de esa diferencia, y el número es el peso de lo que la página descarga.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VERSIÓN DE LA CARPETA ES LA DEL FRAMEWORK, NO LA DEL REPO.
 *
 * `runtime/angular/21.1.6/` lleva la versión de Angular; ésta lleva la de
 * Preact. Es lo que hace que el `latest/` de cada framework se pueda mover por
 * separado y que un `immutable` sobre la carpeta versionada sea cierto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ficherosDelRuntime, importsDelRuntime } from '../../../tools/lib/mapa-del-runtime.mjs';

const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(BASE, '../..');
const require_ = createRequire(path.join(BASE, 'package.json'));
const VERSION = require_('preact/package.json').version;

/**
 * ⚠ La salida va a `dist/runtime/preact/<ver>/` **en la raíz del repo**, no en
 * `platforms/preact/dist/`. Es donde `tools/build-runtime.mjs` deja el de
 * Angular, y es lo que permite que `publish-runtime.mjs` RECORRA `dist/runtime/`
 * en vez de preguntar por una ruta por framework. Dejarlo dentro de la
 * plataforma habría obligado al publicador a saberse dónde guarda cada una lo
 * suyo, que es la lista a mano que este repo ya pagó tres veces.
 */
const SALIDA = path.join(REPO, 'dist/runtime/preact', VERSION);

/**
 * La entrada **de navegador** de un subcamino de `preact`, leída de su `exports`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ `require.resolve()` DEVUELVE EL CommonJS, Y ESO ROMPE EL RUNTIME PUBLICADO.
 *
 * `createRequire(...).resolve('preact')` resuelve por la condición `require`, o
 * sea `dist/preact.js`, que es CJS. esbuild lo empaqueta con `format: 'esm'`
 * envolviéndolo en un módulo con **un solo export**, así que el navegador
 * contesta:
 *
 *     SyntaxError: The requested module 'preact' does not provide an export
 *                  named 'render'
 *
 * y NADA hidrata. **Ningún test de este repo lo vio**: el `vitest.config.ts` de
 * la plataforma resuelve `preact` al paquete de node —que sí tiene exports
 * nombrados— así que los 8 specs del elemento pasaban en verde contra un
 * runtime que en el navegador no arranca. Es la regla 16 con el sujeto movido:
 * lo que estaba bajo prueba no era el artefacto publicado. Lo destapó pedir la
 * página en Chromium, que es lo mismo que `humo-portada.mjs` enseñó del lado del
 * CMS.
 *
 * Se lee `browser` y si no `import`, de la propia tabla `exports` del paquete:
 * escribir `dist/preact.module.js` a mano sería una copia de un dato que el
 * paquete ya publica, y la copia se desvía en la siguiente versión.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function entradaDeNavegador(subcamino) {
  const pkg = require_('preact/package.json');
  const raiz = path.dirname(require_.resolve('preact/package.json'));
  const entrada = pkg.exports?.[subcamino];
  const destino = entrada?.browser ?? entrada?.import;
  if (!destino) {
    throw new Error(
      `preact no declara una entrada de navegador para "${subcamino}". ` +
        `Sin ella habría que empaquetar el CommonJS, que sale sin exports nombrados ` +
        `y el navegador se niega a cargarlo.`,
    );
  }
  return path.join(raiz, destino);
}

/** Cada fichero del runtime y de dónde sale. Las dos mitades, en una tabla. */
const PIEZAS = {
  'preact.js': { entrada: entradaDeNavegador('.'), external: [] },
  'preact-hooks.js': { entrada: entradaDeNavegador('./hooks'), external: ['preact'] },
  'preact-jsx-runtime.js': {
    entrada: entradaDeNavegador('./jsx-runtime'),
    external: ['preact'],
  },
  'sg-preact-core.js': {
    entrada: path.join(BASE, 'dist/libs/sg-preact-core.js'),
    external: ['preact', 'preact/hooks', 'preact/jsx-runtime', '@synergos/preact-shared'],
  },
  'sg-preact-shared.js': {
    entrada: path.join(BASE, 'dist/libs/sg-preact-shared.js'),
    external: ['preact', 'preact/hooks', 'preact/jsx-runtime', '@synergos/preact-core'],
  },
};

async function principal() {
  // Se cruza contra la tabla del import map ANTES de construir: si las dos
  // mitades se desalinean, el mapa nombra un fichero que nadie publica y el
  // navegador se queda sin resolver un bare import — 200, SSR entero, y nada
  // hidrata. Es el defecto CMS #126 por otra puerta.
  const esperados = ficherosDelRuntime('preact');
  const construidos = Object.keys(PIEZAS);
  const faltan = esperados.filter((f) => !construidos.includes(f));
  const sobran = construidos.filter((f) => !esperados.includes(f));
  if (faltan.length > 0 || sobran.length > 0) {
    console.error(
      `[runtime] la tabla de este fichero y FICHEROS_POR_FRAMEWORK.preact no coinciden:\n` +
        (faltan.length ? `  falta(n) por construir: ${faltan.join(', ')}\n` : '') +
        (sobran.length ? `  construidos y no declarados: ${sobran.join(', ')}\n` : ''),
    );
    process.exit(1);
  }

  rmSync(SALIDA, { recursive: true, force: true });
  mkdirSync(SALIDA, { recursive: true });

  for (const [nombre, { entrada, external }] of Object.entries(PIEZAS)) {
    await build({
      entryPoints: [entrada],
      outfile: path.join(SALIDA, nombre),
      bundle: true,
      format: 'esm',
      target: 'es2022',
      minify: true,
      external,
      logLevel: 'warning',
    });
  }

  // El mapa de `dist/` usa una base relativa; el del CDN lo reescribe
  // `publish-runtime.mjs` con la url pública. Los dos salen de la MISMA tabla:
  // dos copias de un import map es cómo el de `dist/` y el del CDN acaban
  // diciendo cosas distintas del mismo runtime (#58).
  writeFileSync(
    path.join(SALIDA, 'import-map.json'),
    `${JSON.stringify({ imports: importsDelRuntime('preact', `/synergos/runtime/preact/${VERSION}`) }, null, 2)}\n`,
  );

  console.log(`[runtime] preact ${VERSION} → dist/runtime/preact/${VERSION}/`);
  for (const nombre of esperados) {
    const { size } = require_('node:fs').statSync(path.join(SALIDA, nombre));
    console.log(`  ${nombre.padEnd(24)} ${String(size).padStart(7)} B`);
  }
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
