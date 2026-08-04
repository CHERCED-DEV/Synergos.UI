import { defineConfig } from 'vitest/config';
import path from 'node:path';

const NG = import.meta.dirname;
const REPO = path.resolve(NG, '../..');
const OUT = path.join(NG, '.test-out');

/**
 * Los specs de la plataforma Angular (issue #1).
 *
 * 240 ficheros `*.spec.ts` llevaban en el árbol sin correr desde que la purga
 * de Nx se llevó a Jest con el resto de la maquinaria — el runner ERA el
 * executor de Nx.
 *
 * SE CORRE EL JS COMPILADO, NO EL TS. `tools/build-specs.mjs` los compila AOT
 * con el mismo ngtsc que publica los elementos, y esto corre el resultado. La
 * razón está entera en la cabecera de ese fichero, y en una línea es: los
 * signal inputs de Angular NO existen en JIT, y este repo prohíbe `@Input()`.
 * Un plugin de Vite que transpile al vuelo hace que los tests corran y mientan.
 *
 * Los alias apuntan al ÁRBOL EMITIDO por la misma razón: el JS compilado
 * importa `@synergos/shared`, y mandarlo al `.ts` fuente metería en la misma
 * ejecución dos copias del design system —una AOT y otra sin compilar— con
 * dos identidades de token de DI distintas. El síntoma sería un
 * `NullInjectorError` sobre un provider que está a la vista.
 */
const emitido = (rel: string) => path.join(OUT, rel.replace(/\.ts$/, '.js'));

export default defineConfig({
  resolve: {
    alias: {
      '@synergos/contracts': emitido('vitals/contracts/src/index.ts'),
      '@synergos/vitals-core': emitido('vitals/core/src/index.ts'),
      '@synergos/core': emitido('platforms/angular/libs/core/src/index.ts'),
      '@synergos/shared': emitido('platforms/angular/libs/shared/src/index.ts'),
      '@synergos/rendering': emitido('platforms/angular/libs/rendering/src/index.ts'),
      '@synergos/integrations': emitido('platforms/angular/libs/integrations/src/index.ts'),
      '@synergos/transaction-engine': emitido('platforms/angular/libs/transaction-engine/src/index.ts'),
      '@synergos/shells': emitido('platforms/angular/libs/shells/src/index.ts'),
      '@synergos/shop': emitido('platforms/angular/libs/shop/src/index.ts'),
      // core-assets es SCSS: no se emite JS y ningún spec lo importa. Si algún
      // día lo hace, el fallo será un import que no resuelve — ruidoso, que es
      // como tiene que fallar.
    },
  },

  test: {
    name: 'angular',
    globals: true,
    environment: 'jsdom',
    root: NG,
    setupFiles: [emitido('platforms/angular/tools/vitest-setup.ts')],
    include: ['.test-out/platforms/angular/{apps,libs}/**/*.spec.js'],
    exclude: ['**/node_modules/**'],
    coverage: {
      reportsDirectory: path.join(REPO, 'coverage/angular'),
      reporter: ['text', 'lcov'],
    },
  },
});
