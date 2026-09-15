import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  sinComentarios,
  especificadores,
  aliasPermitidos,
  esPermitido,
  ficherosDeVitals,
  impurezas,
  regexConComillas,
} from './vitals-purity.mjs';

/**
 * La capa agnóstica es agnóstica **porque hay gate**, no porque hoy esté limpia
 * (épica #36).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE VIGILA: cada framework tiene su propio `shared`, escrito en su
 * propio lenguaje, y TODOS se alimentan de `vitals`. Lo que se cuele en
 * `vitals/` lo arrastra el siguiente framework sin usarlo.
 *
 * POR QUÉ NO ALCANZA LA CONVENCIÓN, Y CUÁL ES EL IMPORT QUE HAY QUE VIGILAR.
 * El import obvio ya era imposible: `import { signal } from '@angular/core'`
 * dentro de `vitals/core` **no compila** (TS2307), porque `vitals/` no cuelga
 * de `platforms/angular/` y la resolución sube al `node_modules` de la raíz,
 * donde no hay ningún framework. Lo que SÍ compila —medido, con el build en
 * verde— es lo que no lleva el nombre: una fuga relativa a
 * `../../../../platforms/angular/libs/shared/…/button` (un `@Component` entero
 * dentro de vitals, con `grep '@angular' vitals/` devolviendo NADA) y un
 * `import('@' + 'angular/core')`. Las dos las caza este gate.
 *
 * EL CRITERIO ES UNA LISTA BLANCA DERIVADA DEL DISCO. Buscar la cadena
 * `@angular` es la forma frágil: no ve `rxjs`, no ve `zone.js`, no ve el
 * paquete del año que viene. Se permite lo que sale de `tsconfig.base.json` y
 * cae dentro de `vitals/`; todo lo demás se rechaza sin nombrarlo.
 *
 * Lo que este gate NO ve está escrito arriba de `vitals-purity.mjs`, con letra
 * (a) a (f). Dos de esos puntos ciegos se **miden** acá abajo en vez de
 * suponerse.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');

describe('el barrido de comentarios', () => {
  it('no se come una URL dentro de una cadena — el atajo de regex sí', () => {
    const src = `const cdn = 'https://synergos-ui.workers.dev/registry.json';\nimport { X } from './x';`;
    const limpio = sinComentarios(src);
    expect(limpio).toContain('registry.json');
    expect(especificadores(src).map((u) => u.especificador)).toEqual(['./x']);
  });

  it('no se come una URL dentro de una plantilla', () => {
    const src = 'const u = `https://cdn/${v}/a.js`;\nimport { X } from "./x";';
    expect(sinComentarios(src)).toContain('https://cdn');
    expect(especificadores(src).map((u) => u.especificador)).toEqual(['./x']);
  });

  it('un import COMENTADO no cuenta — el caso real de `synergos-bridge.ts`', () => {
    const src = [
      '//   import { t, getMember } from \'@synergos/core/bridge/synergos-bridge\';',
      "/* import { signal } from '@angular/core'; */",
      "import type { A } from '@synergos/contracts';",
    ].join('\n');
    expect(especificadores(src).map((u) => u.especificador)).toEqual(['@synergos/contracts']);
  });

  it('conserva el número de línea, que es lo que lee quien va a arreglarlo', () => {
    const src = ['/*', ' * nota', ' */', "import { A } from '@angular/core';"].join('\n');
    expect(especificadores(src)[0].linea).toBe(4);
  });
});

describe('qué cuenta como especificador', () => {
  it('ve `from`, el import de efecto de lado, `export … from`, `import()` y `require()`', () => {
    const src = [
      "import { A } from 'react';",
      "import 'zone.js';",
      "export { B } from 'svelte/store';",
      "const C = await import('rxjs');",
      "const D = require('vue');",
    ].join('\n');
    expect(especificadores(src).map((u) => u.especificador)).toEqual([
      'react',
      'zone.js',
      'svelte/store',
      'rxjs',
      'vue',
    ]);
  });

  it('ve la referencia triple-barra AUNQUE sea un comentario', () => {
    // Quitar comentarios primero la haría invisible: es justo como un
    // `/// <reference types="react" />` entra sin que nada chiste.
    const src = '/// <reference types="react" />\nexport const x = 1;';
    expect(especificadores(src)).toEqual([
      { especificador: 'react', linea: 1, forma: 'reference' },
    ]);
  });

  it('ve `declare module` — aumentar el módulo de un framework es depender de él', () => {
    const src = "declare module '@angular/core' { export const z: number; }";
    expect(especificadores(src)[0].especificador).toBe('@angular/core');
  });

  it('acepta `import(\'x\', { with: … })` — el literal con opciones sigue siendo literal', () => {
    const src = "const a = await import('@synergos/contracts', { with: { type: 'json' } });";
    expect(especificadores(src)[0]).toMatchObject({
      especificador: '@synergos/contracts',
      forma: 'import_dinamico',
    });
  });

  it('RECHAZA el especificador calculado en vez de darlo por bueno — punto ciego (a)', () => {
    // `'@' + 'angular/core'` EMPIEZA por comilla y no TERMINA en comilla+`)`,
    // así que se cuela entre los dos cortes obvios. Con dos regex —una para el
    // literal y otra para «lo que no empieza por comilla»— este caso pasaba en
    // VERDE, y lo destapó este test, no leer el gate.
    const src = [
      "const a = await import('@' + 'angular/core');",
      'const b = require(nombreDelModulo);',
    ].join('\n');
    const usos = especificadores(src);
    expect(usos.map((u) => u.forma)).toEqual([
      'import_dinamico:especificador_calculado',
      'require:especificador_calculado',
    ]);
    const permitidos = aliasPermitidos(REPO);
    for (const uso of usos) {
      expect(esPermitido(uso.especificador, path.join(REPO, 'vitals/core/src/x.ts'), REPO, permitidos)).toBe(false);
    }
  });
});

describe('la lista blanca sale del disco, no de una constante', () => {
  it('son los alias de `tsconfig.base.json` que caen dentro de vitals/', () => {
    expect([...aliasPermitidos(REPO)].sort()).toEqual([
      '@synergos/contracts',
      '@synergos/core',
      '@synergos/core-assets',
    ]);
  });

  it('`@synergos/shared` NO está permitido, y existe: apunta a libs/shared de Angular', () => {
    // Es la prueba de que la derivación sirve para algo. El alias es real —el
    // `tsconfig.json` de la plataforma lo declara— y su destino cae fuera de
    // `vitals/`, así que queda fuera sin que nadie lo escriba en una lista negra.
    const angular = JSON.parse(
      readFileSync(path.join(REPO, 'platforms/angular/tsconfig.json'), 'utf8'),
    );
    expect(Object.keys(angular.compilerOptions.paths)).toContain('@synergos/shared');
    expect(aliasPermitidos(REPO).has('@synergos/shared')).toBe(false);
  });

  it('un framework que nadie nombró cae por la misma puerta que `react`', () => {
    const permitidos = aliasPermitidos(REPO);
    const fichero = path.join(REPO, 'vitals/core/src/models/x.model.ts');
    for (const specifier of ['@angular/core', 'react', 'rxjs', 'zone.js', 'preact/hooks', 'el-framework-de-2027']) {
      expect(esPermitido(specifier, fichero, REPO, permitidos)).toBe(false);
    }
  });
});

describe('relativo no basta: se resuelve', () => {
  const permitidos = aliasPermitidos(REPO);
  const desde = path.join(REPO, 'vitals/core/src/mappers/hero.mapper.ts');

  it('acepta el relativo que se queda dentro de vitals/', () => {
    expect(esPermitido('../models/hero-inputs.model', desde, REPO, permitidos)).toBe(true);
  });

  it('rechaza el relativo que se ESCAPA a la plataforma — la fuga sin nombre de framework', () => {
    expect(
      esPermitido('../../../../platforms/angular/libs/shared/src/index', desde, REPO, permitidos),
    ).toBe(false);
  });
});

describe('el árbol', () => {
  it('vitals/ no importa nada fuera de la capa agnóstica', () => {
    const malas = impurezas(REPO);
    expect(
      malas.map((m) => `${m.fichero}:${m.linea} → ${m.especificador ?? `(${m.forma})`}`),
    ).toEqual([]);
  });

  it('el barrido llega a los tres vitales, no sólo a core', () => {
    // Un gate que mire una carpeta y no las tres pasa en verde con el defecto
    // puesto en las otras dos.
    const ficheros = ficherosDeVitals(REPO).map((f) => path.relative(REPO, f));
    for (const vital of ['vitals/contracts/', 'vitals/core/', 'vitals/core-assets/']) {
      expect(ficheros.some((f) => f.startsWith(vital))).toBe(true);
    }
    expect(ficheros.length).toBeGreaterThan(200);
  });

  it('el punto ciego (f) se MIDE: hoy no hay regex con comillas dentro en vitals/', () => {
    // El escáner de comentarios distingue cadenas y plantillas, pero no
    // literales de regex. Si esto deja de estar vacío el gate puede
    // descolocarse, y entonces hay que decirlo — no callarlo.
    expect(regexConComillas(REPO)).toEqual([]);
  });
});
