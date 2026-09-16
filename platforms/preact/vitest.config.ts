import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import path from 'node:path';

const AQUI = import.meta.dirname;
const require_ = createRequire(path.join(AQUI, 'package.json'));
const VERSION = require_('preact/package.json').version;
const RUNTIME = path.join(AQUI, '../../dist/runtime/preact', VERSION);

/**
 * Los specs de la plataforma Preact (#64).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORREN CONTRA EL BUNDLE CONSTRUIDO, NO CONTRA EL FUENTE. ES DELIBERADO.
 *
 * Lo que esta HU tiene que demostrar es que **un elemento publicado hidrata**,
 * y un spec que importe `BadgeElement` del `.tsx` y lo renderice prueba otra
 * cosa: que el componente funciona. La regla 5 del `CLAUDE.md` lo dice con el
 * caso que costó —`addCarToCart` existía y ninguna plantilla lo llamaba—, y la
 * mutación 3 del ticket #64 la nombra: **quitar `customElements.define` del
 * adaptador deja un componente perfectamente sano y un tag que no existe.**
 * Sólo se cae el test que pide la página y busca el elemento hidratado.
 *
 * Por eso `alias` apunta a `dist/` y no a `src/`, y por eso el spec falla a
 * gritos si el `dist` no está: un test que se salta lo que no encuentra informa
 * «✓ todo bien» sobre nada (regla 25c).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default defineConfig({
  resolve: {
    alias: {
      // ⚠ APUNTA AL RUNTIME PUBLICADO, NO AL PAQUETE DE NODE.
      //
      // Esto decía `node_modules/preact` —«el equivalente de lo que hace el
      // import map»— y **no lo era**. El runtime publicado se construía desde
      // `require.resolve('preact')`, que resuelve por la condición `require` y
      // devuelve el CommonJS; empaquetado como ESM salía con UN solo export, y
      // el navegador contestaba «does not provide an export named 'render'».
      // Los 8 specs seguían verdes porque acá `preact` venía de node, que sí
      // tiene exports nombrados: lo que estaba bajo prueba no era el artefacto
      // publicado. Lo destapó Chromium, no la suite.
      //
      // Apuntando al fichero del runtime, un bundle sin `render` pone los specs
      // en rojo — que es lo que tenía que haber pasado la primera vez.
      //
      // Y LOS SUBCAMINOS VAN PRIMERO. El alias casa por PREFIJO y en orden, así
      // que con `preact` delante, `preact/jsx-runtime` se reescribía a
      // `…/preact.js/jsx-runtime`. Es la tercera vez en esta épica: pasó en el
      // `vitest.config.ts` de Angular y en su `build.mjs` (#63), y vuelve a
      // pasar acá. Una tabla de alias se lee de arriba abajo, siempre.
      'preact/hooks': path.join(RUNTIME, 'preact-hooks.js'),
      'preact/jsx-runtime': path.join(RUNTIME, 'preact-jsx-runtime.js'),
      preact: path.join(RUNTIME, 'preact.js'),
      '@synergos/preact-core': path.join(AQUI, 'dist/libs/sg-preact-core.js'),
      '@synergos/preact-shared': path.join(AQUI, 'dist/libs/sg-preact-shared.js'),
    },
  },
  test: {
    name: 'preact',
    globals: true,
    environment: 'jsdom',
    root: AQUI,
    include: ['tools/**/*.spec.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
