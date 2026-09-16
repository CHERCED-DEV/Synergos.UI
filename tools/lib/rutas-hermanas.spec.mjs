import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolverRaizCms, comoApuntarAlCms, raizCdnLocal, REPO_CMS } from './rutas-hermanas.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

describe('dónde está el CMS (#57)', () => {
  const raizUi = '/repos/ui';

  it('la bandera gana sobre todo', () => {
    // Lo explícito de la línea de comandos manda: una corrida puntual no tiene
    // por qué obligar a exportar nada.
    expect(resolverRaizCms({
      raizUi, argv: ['--cms-path=/otro/cms'], env: { SYNERGOS_CMS_PATH: '/del/entorno' },
    })).toEqual({ ruta: '/otro/cms', origen: 'bandera' });
  });

  it('EL CASO: sin bandera, la VARIABLE DE ENTORNO — que es la que faltaba', () => {
    // El defecto entero de #57. `cms-sync.mjs` no la miraba, así que en un
    // contenedor exportarla hacía pasar `cms:validate` y dejaba caer
    // `cms:sync:check`, la ÚLTIMA etapa de `contracts:validate`.
    expect(resolverRaizCms({ raizUi, argv: [], env: { SYNERGOS_CMS_PATH: '/del/entorno' } }))
      .toEqual({ ruta: '/del/entorno', origen: 'entorno' });
  });

  it('y sin ninguna de las dos, el hermano', () => {
    expect(resolverRaizCms({ raizUi, argv: [], env: {} }))
      .toEqual({ ruta: resolve('/repos', REPO_CMS), origen: 'hermano' });
  });

  it('dice de DÓNDE salió la ruta, no sólo cuál es', () => {
    // Un gate que no encuentra su entrada tiene que poder decir dónde buscó, o
    // el mensaje manda a adivinar — y con tres formas de apuntarlo, «no está»
    // no distingue «la variable está mal» de «no la exportaste».
    const origenes = [
      resolverRaizCms({ raizUi, argv: ['--cms-path=/a'], env: {} }).origen,
      resolverRaizCms({ raizUi, argv: [], env: { SYNERGOS_CMS_PATH: '/b' } }).origen,
      resolverRaizCms({ raizUi, argv: [], env: {} }).origen,
    ];
    expect(origenes).toEqual(['bandera', 'entorno', 'hermano']);
  });

  it('el mensaje de fallo nombra LAS TRES formas', () => {
    // Si nombrara sólo el hermano, el mensaje reproduciría el defecto: es lo
    // que decía `cms-sync` («Use --cms-path=PATH or place repos as siblings»),
    // sin mencionar la variable que él mismo ignoraba.
    const texto = comoApuntarAlCms('/no/existe');
    expect(texto).toContain('--cms-path=');
    expect(texto).toContain('SYNERGOS_CMS_PATH');
    expect(texto).toContain('hermano');
    expect(texto).toContain('/no/existe');
  });

  it('LOS DOS CONSUMIDORES usan el mismo resolutor — no cada uno el suyo', () => {
    // La razón de que esto exista. Mientras lo supiera uno solo era abstracción
    // prematura; con dos que tienen que coincidir, dos copias es la que se
    // desvía — y se desvió. Se afirma sobre la FUENTE porque el defecto era que
    // una de las dos resolvía distinto, no que resolviera mal.
    for (const fichero of ['cms-sync.mjs', 'validate-cms-contracts.mjs']) {
      const src = readFileSync(join(ROOT, 'tools', fichero), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(src, `${fichero} no usa resolverRaizCms`).toContain('resolverRaizCms(');
      expect(src, `${fichero} vuelve a resolver el CMS por su cuenta`)
        .not.toMatch(/resolve\([^)]*['"]\.\.['"]\s*,\s*['"]Synergos\.CMS['"]/);
    }
  });
});

describe('dónde está el CDN local (#57)', () => {
  it('sin CDN_ROOT cae a public/synergos, no a una ruta de Windows', () => {
    // La otra mitad del ticket: `'C:\\LOCAL_CDN\\synergos'` sólo existe en la
    // máquina donde se escribió. Degradaba bien —avisaba y seguía— y por eso
    // no rompía nada; pero es el patrón que este repo ya pagó caro en el #126.
    expect(raizCdnLocal({ raizUi: '/repos/ui', env: {} })).toBe(resolve('/repos/ui/public/synergos'));
  });

  it('y CDN_ROOT sigue mandando — que es lo que hace build-cdn', () => {
    // `build-cdn.mjs` le pasa el árbol RECIÉN publicado, para que las insignias
    // de «publicado / no publicado» salgan de lo que acaba de escribir.
    expect(raizCdnLocal({ raizUi: '/repos/ui', env: { CDN_ROOT: '/salida/synergos' } }))
      .toBe('/salida/synergos');
  });

  it('nadie en tools/ vuelve a escribir LOCAL_CDN como default de lectura', () => {
    // `publish-runtime.mjs` SÍ lo conserva y es correcto: es el destino de una
    // publicación en la máquina del arquitecto, no la fuente de una lectura.
    // Por eso el cruce nombra al que puede y exige que sea el único.
    const conLocalCdn = readdirSync(join(ROOT, 'tools'))
      .filter((f) => f.endsWith('.mjs'))
      .filter((f) => {
        const src = readFileSync(join(ROOT, 'tools', f), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        return /LOCAL_CDN/.test(src);
      });

    expect(conLocalCdn).toEqual(['publish-runtime.mjs']);
  });

  it('el fichero existe de verdad en este árbol, o el cruce no mira nada', () => {
    expect(existsSync(join(ROOT, 'tools', 'catalog.mjs'))).toBe(true);
  });
});
