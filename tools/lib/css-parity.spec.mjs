import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import { raicesEnDisco } from './frameworks.mjs';
import { clasesDeclaradas, clasesEmitidas, estaEmitida, huerfanas } from './css-parity.mjs';

/**
 * El espejo de G-3 (issue #23).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA.
 *
 * El CMS exige que toda clase `syn-*` EMITIDA tenga CSS (`check-css-parity.mjs`).
 * Faltaba la otra dirección, y se notaba: cada vez que una app cambia markup
 * propio por una pieza del catálogo, su CSS se queda y nadie se entera.
 *
 * Al medirlo salieron **155** clases declaradas que nadie emite, y se reconoce de
 * dónde vienen: `__facet-*` es de antes de SH-1, `__gallery-*` de antes de SH-2,
 * y `__confirm-*` —en varias apps, con el mismo nombre— de antes de SH-11. O sea
 * de despliegues anteriores a éste.
 *
 * No es suciedad estética: el SCSS de un elemento viaja al CDN, y `cdn-size-budget`
 * mira el total sin poder saber si lo que hay dentro sirve.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');
/**
 * Las raíces de TODAS las plataformas construibles, no `platforms/angular` (#60).
 *
 * La regla de este gate es NEUTRAL —el CSS muerto lo tiene cualquier framework: una app que cambia markup propio por una pieza del catálogo deja su SCSS atrás— y estaba apuntando a una ruta
 * cableada: la regla 25. La lista sale del disco, que es lo único que encuentra
 * una plataforma que nadie escribió en ningún sitio. Lo que NO cubre, dicho en
 * vez de insinuado: una plataforma cuyo árbol interno no se parezca al de
 * Angular queda invisible acá, porque este gate sigue sabiendo qué subcarpeta
 * mirar. El contrato de layout es #62; hasta entonces lo que impide que esto
 * pase en verde sin mirar nada es la red de seguridad de más abajo.
 */
const RAICES = raicesEnDisco(REPO);

/**
 * Clases que se declaran a propósito sin emisor en la app, con la razón al lado.
 * Sacar una de acá es borrar su CSS; añadir una exige escribir por qué.
 *
 * (Las `syn-*` NO van acá: se exceptúan por namespace dentro del módulo, porque
 * quien las emite es el design system y la próxima se llamará de otra manera.)
 */
const EXENTAS = new Map();

function apps() {
  return RAICES.flatMap((raiz) => {
    const base = path.join(raiz, 'apps/elements/modules');
    if (!existsSync(base)) return [];
    return readdirSync(base)
      .map((app) => ({ app, dir: path.join(base, app, 'src', app) }))
      .filter(({ dir }) => existsSync(dir));
  });
}

function fuentesDe(dir) {
  const ficheros = readdirSync(dir);
  const scss = ficheros
    .filter((f) => f.endsWith('.scss'))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  const consumidores = ficheros
    .filter((f) => f.endsWith('.html') || f.endsWith('.ts'))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'));
  return { scss, consumidores };
}

describe('paridad inversa: el CSS de una app tiene quien lo emita', () => {
  it('el anidamiento `&__` se expande — sin esto el barrido no encuentra casi nada', () => {
    const declaradas = clasesDeclaradas(`
      .app {
        &__uno { color: red; }
        &__dos:hover { color: blue; }
        .suelto { color: green; }
      }
    `).map((d) => d.clase);

    // La trampa nº1 del ticket: un barrido por `\\.app__clase` da casi cero.
    expect(declaradas).toContain('app__uno');
    expect(declaradas).toContain('app__dos');
    expect(declaradas).toContain('suelto');
  });

  it('un grupo de selectores declara TODOS, y cada uno sabe que es un grupo', () => {
    const declaradas = clasesDeclaradas(`
      .app {
        &__vivo, &__muerto, &__otro { display: none; }
      }
    `);

    const delGrupo = declaradas.filter((d) => d.clase.includes('__'));
    expect(delGrupo.map((d) => d.clase)).toEqual(['app__vivo', 'app__muerto', 'app__otro']);
    // La trampa nº2: el bloque sólo se borra entero si TODOS están muertos. Quien
    // limpia necesita saberlo, así que el tamaño del grupo viaja con la huérfana.
    expect(delGrupo.every((d) => d.grupo === 3)).toBe(true);
  });

  it('una clase compuesta en el TS cuenta como emitida, y su prefijo cubre los sufijos', () => {
    const emitidas = clasesEmitidas([
      `const a = 'app__chip is-' + estado;`,
      'const b = `app__card-${tipo}`;',
    ]);

    // La trampa nº3: se miran los DOS ficheros, y la interpolación deja un prefijo.
    expect(estaEmitida('app__chip', emitidas)).toBe(true);
    expect(estaEmitida('app__card-grande', emitidas)).toBe(true);
    expect(estaEmitida('app__inventada', emitidas)).toBe(false);
  });

  it('las `syn-*` no se juzgan: las emite el design system, no la app', () => {
    // Tres apps estilan `syn-tabs__*` desde su SCSS y quien las pinta es
    // `libs/shared/.../tabs.ts`. Borrarlas por «nadie las emite acá» habría roto
    // las pestañas de las tres.
    const sueltas = huerfanas('.syn-tabs { &__tab { color: red; } }', ['<div></div>']);
    expect(sueltas).toEqual([]);
  });

  it('EL caso: ninguna app declara CSS que nadie emita', () => {
    const sinEmisor = [];
    for (const { app, dir } of apps()) {
      const { scss, consumidores } = fuentesDe(dir);
      if (!scss) {
        continue;
      }
      for (const h of huerfanas(scss, consumidores, new Set(EXENTAS.keys()))) {
        sinEmisor.push(`${app}: .${h.clase} (${path.basename(dir)}.scss:${h.linea})`);
      }
    }

    expect(
      sinEmisor,
      `Estas clases tienen CSS y nadie las emite. El SCSS de un elemento viaja al\n` +
        `CDN, así que esto pesa; y el siguiente que abra el fichero las va a\n` +
        `mantener creyendo que pintan algo. Bórralas, o muévelas a EXENTAS con la\n` +
        `razón escrita:\n  ${sinEmisor.join('\n  ')}`,
    ).toEqual([]);
  });

  it('EXENTAS no nombra clases que ya no existen', () => {
    const declaradas = new Set();
    for (const { dir } of apps()) {
      const { scss } = fuentesDe(dir);
      for (const d of clasesDeclaradas(scss)) {
        declaradas.add(d.clase);
      }
    }
    const fantasmas = [...EXENTAS.keys()].filter((c) => !declaradas.has(c));
    expect(fantasmas, `EXENTAS nombra CSS que ya no está: ${fantasmas.join(', ')}`).toEqual([]);
  });
});
