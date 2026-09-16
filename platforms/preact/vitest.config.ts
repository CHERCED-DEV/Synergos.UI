import { defineConfig } from 'vitest/config';
import path from 'node:path';

const AQUI = import.meta.dirname;

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
      // El bundle deja `preact` como bare import porque en el navegador lo
      // resuelve el import map. Acá lo resuelve esto, que es el equivalente.
      preact: path.join(AQUI, 'node_modules/preact'),
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
