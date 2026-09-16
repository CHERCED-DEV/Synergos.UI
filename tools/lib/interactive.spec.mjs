import { describe, it, expect } from 'vitest';

import { descubrirElementos, elementosOFallar, selectFramework } from './interactive.mjs';

/**
 * Los menús interactivos, que no tenían spec (#52).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **Por eso la herramienta llevaba seis semanas muerta y nadie lo sabía.**
 * `npm test` corre `tools/lib`, y de `interactive.mjs` no había fichero — así
 * que el `glob('**​/project.json')` de Nx seguía ahí, devolviendo cero, y el
 * menú se abría vacío. No falla: CONTESTA, que es la forma de degradación
 * silenciosa que este repo persigue en otros diez sitios, sólo que aplicada a
 * la herramienta de entrada que `ONBOARDING.md` ofrece como primer paso.
 *
 * Lo que NO se puede probar acá son los prompts: `@inquirer/prompts` quiere un
 * TTY. Por eso el corte está donde está — el descubrimiento y la decisión son
 * funciones puras sobre el disco, y lo interactivo es sólo la capa de arriba.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un descubrimiento de mentira con la forma del de verdad. */
const fuentes = (...entradas) =>
  new Map(entradas.map(([nombre, framework, tier]) => [
    nombre, { framework, dir: `platforms/${framework}/apps/elements/${tier}s/${nombre}`, tier },
  ]));

describe('el descubrimiento del CLI (#52)', () => {
  it('EL CASO: sin elementos se FALLA, no se abre un menú vacío', () => {
    // El defecto entero. Con el glob de Nx esto devolvía `[]` y el menú se
    // abría en blanco; un menú vacío se lee como «todavía no construí nada».
    expect(() => elementosOFallar(undefined, { fuentes: new Map() }))
      .toThrow(/no encontró ni un elemento/);
  });

  it('…y el mensaje dice DÓNDE busca, para que se pueda comprobar', () => {
    // Sin esto, «no encontró nada» manda a adivinar. La ruta es la misma que
    // usa el build, así que quien la lea puede mirarla.
    try {
      elementosOFallar(undefined, { fuentes: new Map() });
      throw new Error('tenía que lanzar');
    } catch (err) {
      expect(err.message).toContain('src/main.ts');
      expect(err.message).toContain('no es un menú vacío: es un fallo');
    }
  });

  it('un framework sin elementos también falla, y lo NOMBRA', () => {
    const io = { fuentes: fuentes(['badge', 'angular', 'primitive']) };
    expect(() => elementosOFallar('react', io)).toThrow(/"react"/);
  });

  it('ordena por framework, TIER y nombre — no por el orden del disco', () => {
    // Un `Map` conserva el orden de inserción, que es el del recorrido del
    // sistema de ficheros. Sin orden propio, el mismo árbol lista distinto en
    // dos máquinas y una captura de pantalla deja de servir para comparar.
    //
    // El tier va ANTES que el nombre, y es lo que agrupa el menú: por eso
    // `hero` (module) sale antes que `alert` (primitive) aunque alfabéticamente
    // vaya después. Escribí la expectativa al revés antes de medirlo.
    const io = {
      fuentes: fuentes(
        ['hero', 'angular', 'module'],
        ['badge', 'angular', 'primitive'],
        ['alert', 'angular', 'primitive'],
      ),
    };
    expect(descubrirElementos(io).map((e) => e.element)).toEqual(['hero', 'alert', 'badge']);
  });

  it('un elemento sin segmento de tier dice `` y no se lo inventa', () => {
    // `apps/domains/shop/*` y `apps/experiences/*` no llevan tier en la ruta:
    // ahí lo sabe el registry, no el disco. Rellenarlo sería la fabricación
    // que #42 y #43 ya pagaron.
    const io = { fuentes: new Map([['cart-item', { framework: 'angular', dir: 'x', tier: null }]]) };
    expect(descubrirElementos(io)[0].tier).toBe('');
  });

  it('y contra el disco de VERDAD encuentra lo que el build compila', () => {
    // La red de seguridad: si el descubrimiento deja de ver, todo lo de arriba
    // pasa en verde sobre fixtures y esto es lo único que lo nota. El número no
    // se escribe —lo diría dos veces—, se exige que sea el orden correcto.
    const reales = descubrirElementos();
    expect(reales.length).toBeGreaterThan(100);
    expect(reales.every((e) => e.framework && e.element && e.path)).toBe(true);
  });
});

describe('la elección de framework (#52)', () => {
  it('con UNA plataforma no pregunta: la anuncia y sigue', async () => {
    // Un menú de una opción es teatro, y además éste no llegaba a serlo: la
    // lista estaba escrita a mano (`[{ name: 'Angular' }]`), así que con la
    // segunda plataforma en el disco habría seguido ofreciendo una.
    await expect(selectFramework({ frameworks: ['angular'] })).resolves.toBe('angular');
  });

  it('sin ninguna plataforma construible, falla nombrando el contrato', async () => {
    await expect(selectFramework({ frameworks: [] })).rejects.toThrow(/platforms\//);
  });
});
