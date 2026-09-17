import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { sinComentarios, valoresDeUnion, valoresDeConstante, camposDeInterfaz } from './contract-schema.mjs';

/**
 * El lector del contrato TypeScript (issue #43).
 *
 * Un gate que LEE CÓDIGO con expresiones regulares tiene puntos ciegos que no
 * se ven midiendo: sale un número plausible y nadie lo cruza. Por eso cada
 * corte se prueba contra el CASO FEO —el que tiene el fichero de verdad— y no
 * contra el bonito, y el último test lo corre contra el fichero real.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA = readFileSync(
  resolve(ROOT, 'vitals/contracts/src/element-manifest.schema.ts'),
  'utf8',
);

describe('sinComentarios', () => {
  it('un comentario con llaves y dos puntos no aporta campos', () => {
    // El fichero de verdad documenta `/synergos/{element}/{framework}/v{major}/`
    // dentro de un bloque. Un parser que no lo quite primero se come llaves
    // que no son código y cierra la interfaz donde no debe.
    const fuente = `
      /** CDN: /synergos/{element}/{framework}/manifest.json */
      interface X { a: string; }
    `;

    expect(camposDeInterfaz(fuente, 'X').map((c) => c.nombre)).toEqual(['a']);
  });

  it('las cadenas sobreviven intactas, que es de donde salen las uniones', () => {
    expect(sinComentarios(`const x = '// no es comentario'; // sí lo es`).trim())
      .toBe(`const x = '// no es comentario';`);
  });
});

describe('valoresDeConstante', () => {
  it('lee un array `as const` de varias líneas', () => {
    const fuente = `export const X = [
      'uno',   // un comentario en medio
      'dos',
    ] as const;`;

    expect(valoresDeConstante(fuente, 'X')).toEqual(['uno', 'dos']);
  });

  it('un tipo suelto NO se lee como constante — y por eso quien llama comprueba', () => {
    expect(valoresDeConstante(`export type X = 'uno' | 'dos';`, 'X')).toEqual([]);
  });
});

describe('camposDeInterfaz', () => {
  it('un tipo objeto en línea no cierra la interfaz antes de tiempo', () => {
    // Éste es el corte que un `.indexOf('}')` se come: devolvería ['a'] y el
    // gate quedaría mirando la mitad de las claves, en verde.
    const fuente = `interface X {
      a: string;
      b: { anidado: string };
      c: number;
    }`;

    expect(camposDeInterfaz(fuente, 'X').map((c) => c.nombre)).toEqual(['a', 'b', 'c']);
  });

  it('los campos anidados NO cuentan como claves del manifiesto', () => {
    const fuente = `interface X {
      a: string;
      b: {
        dentro: string;
      };
    }`;

    expect(camposDeInterfaz(fuente, 'X').map((c) => c.nombre)).toEqual(['a', 'b']);
  });

  it('distingue opcional de obligatorio, y devuelve la clave sin el "?"', () => {
    const campos = camposDeInterfaz(`interface X { a: string; b?: number; }`, 'X');
    expect(campos).toEqual([
      { nombre: 'a', opcional: false },
      { nombre: 'b', opcional: true },
    ]);
  });

  it('una firma de índice no es una clave', () => {
    // `CdnVersionInfo` tiene `[majorAlias: string]: string;`. Contarla como
    // clave haría que todo manifiesto fuera inválido por una clave que no
    // existe.
    expect(camposDeInterfaz(`interface X { latest: string; [k: string]: string; }`, 'X'))
      .toEqual([{ nombre: 'latest', opcional: false }]);
  });

  it('una interfaz que no está devuelve vacío — y por eso quien llama lo comprueba', () => {
    // El modo de fallo silencioso de un gate que parsea: no encuentra nada,
    // devuelve listas vacías, y toda validación pasa. `contratoDelManifiesto`
    // falla a propósito cuando esto ocurre.
    expect(camposDeInterfaz(SCHEMA, 'NoExiste')).toEqual([]);
    expect(valoresDeUnion(SCHEMA, 'NoExiste')).toEqual([]);
    expect(valoresDeConstante(SCHEMA, 'NO_EXISTE')).toEqual([]);
  });
});

describe('contra el contrato de verdad', () => {
  it('ElementManifest declara las siete claves que el publicador escribe', () => {
    expect(camposDeInterfaz(SCHEMA, 'ElementManifest').map((c) => c.nombre)).toEqual([
      'tag', 'alias', 'framework', 'version', 'tier', 'entryScript', 'inputs',
    ]);
  });

  it('las listas del contrato se leen enteras', () => {
    // Van como constante `as const` con el tipo derivado: una unión de tipos no
    // se puede recorrer, así que todo el que necesitara los valores escribía su
    // propia copia al lado — que es la duplicación que el issue #42 encontró
    // entre `ElementFramework` y `FrameworkKind`.
    expect(valoresDeConstante(SCHEMA, 'ELEMENT_FRAMEWORKS')).toEqual([
      'angular', 'react', 'svelte', 'vanilla',
    ]);
    expect(valoresDeConstante(SCHEMA, 'ELEMENT_TIERS')).toEqual([
      'primitive', 'composition', 'module',
    ]);
  });
});
