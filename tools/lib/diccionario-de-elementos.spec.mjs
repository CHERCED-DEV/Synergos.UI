import { describe, expect, it } from 'vitest';

import {
  enAlgunaSeccion,
  llamadasDeT,
  revisarElemento,
  revisarLibrerias,
} from './diccionario-de-elementos.mjs';

/**
 * La regla de `gate:diccionario` (ADR 0136 del CMS, piloto CMS#186), con fixtures: cada caso es
 * una de las formas en que un `t()` se pone a pintar su respaldo con cara de traducido.
 */
const IMPORT = "import { t } from '@synergos/vitals-core';\n";
const CONTRATO = {
  diccionario: ['Slider'],
  claves: ['Slider.Next', 'Slider.Previous', 'Slider.Pager'],
};
const fuente = (cuerpo) => [{ ruta: 'apps/x/x.ts', fuente: IMPORT + cuerpo }];

describe('llamadasDeT', () => {
  it('lee las claves literales con su línea', () => {
    const { claves, noLiterales } = llamadasDeT(`${IMPORT}const a = t('Slider.Next', 'Siguiente');\nconst b = t("Slider.Pager", "x", { n: 1 });`);
    expect(claves).toEqual([
      { clave: 'Slider.Next', linea: 2 },
      { clave: 'Slider.Pager', linea: 3 },
    ]);
    expect(noLiterales).toEqual([]);
  });

  it('una clave que no es literal se reporta: el cruce no la vería', () => {
    const { claves, noLiterales } = llamadasDeT(`${IMPORT}const k = 'Slider.' + x;\nt(k, 'x');\nt(\`Slider.\${x}\`, 'y');`);
    expect(claves).toEqual([]);
    expect(noLiterales.map((n) => n.linea)).toEqual([3, 4]);
  });

  it('sin importar t del bridge no cuenta nada (otro `t` es otra cosa)', () => {
    expect(llamadasDeT("const t = (k) => k; t('Slider.Next');").claves).toEqual([]);
  });

  it('no cuenta `algo.t(`, ni lo comentado', () => {
    const { claves } = llamadasDeT(`${IMPORT}bridge.i18n.t('Slider.Next');\n// t('Slider.Pager', 'x')\n/* t('Slider.Previous') */`);
    expect(claves).toEqual([]);
  });
});

describe('enAlgunaSeccion — la regla con la que el CMS publica', () => {
  it('casa la sección ENTERA como prefijo, sin mayúsculas', () => {
    expect(enAlgunaSeccion('Common.States.NoResults', ['common.states'])).toBe(true);
    expect(enAlgunaSeccion('Tagline.Hero', ['Tag'])).toBe(false);
    expect(enAlgunaSeccion('Common.Buttons.Save', ['Common.States'])).toBe(false);
  });
});

describe('revisarElemento', () => {
  it('limpio: cada clave existe y cada sección se usa', () => {
    const r = revisarElemento({ nombre: 'carousel', contrato: CONTRATO, fuentes: fuente("t('Slider.Next', 'a'); t('Slider.Previous', 'b');") });
    expect(r.errores).toEqual([]);
    expect(r.usadas).toEqual(['Slider.Next', 'Slider.Previous']);
  });

  it('una clave de la sección que no existe en uSync → rojo, y lo dice', () => {
    const { errores } = revisarElemento({ nombre: 'carousel', contrato: CONTRATO, fuentes: fuente("t('Slider.Nope', 'x');") });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/«Slider\.Nope», que no existe en uSync/);
  });

  it('una clave de una sección que el record NO declara → rojo: la página no la publica', () => {
    const { errores } = revisarElemento({ nombre: 'carousel', contrato: CONTRATO, fuentes: fuente("t('Slider.Next', 'a'); t('Rating.Submit', 'x');") });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/no cae en ninguna sección que declara su record \(Slider\)/);
  });

  it('una clave no literal → rojo', () => {
    const { errores } = revisarElemento({ nombre: 'carousel', contrato: CONTRATO, fuentes: fuente("t('Slider.Next', 'a'); t(clave, 'b');") });
    expect(errores.some((e) => /no es literal/.test(e))).toBe(true);
  });

  it('t() en un elemento SIN record → rojo: no declara secciones', () => {
    const { errores } = revisarElemento({ nombre: 'search-box', contrato: null, fuentes: fuente("t('Search.Placeholder', 'Buscar…');") });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/no tiene record/);
  });

  it('una sección declarada que el elemento no usa → rojo: se publicaría para nadie', () => {
    const contrato = { diccionario: ['Slider', 'Common.States'], claves: [...CONTRATO.claves, 'Common.States.NoResults'] };
    const { errores } = revisarElemento({ nombre: 'carousel', contrato, fuentes: fuente("t('Slider.Next', 'a');") });
    expect(errores).toEqual([expect.stringMatching(/declara la sección «Common\.States» y no pide ninguna clave suya/)]);
  });

  it('un elemento sin t() ni secciones no tiene nada que revisar', () => {
    expect(revisarElemento({ nombre: 'badge', contrato: null, fuentes: [{ ruta: 'b.ts', fuente: 'export const x = 1;' }] }).errores).toEqual([]);
  });
});

describe('revisarLibrerias — las hojas reciben strings', () => {
  it('una librería que importa t() → rojo', () => {
    expect(revisarLibrerias([{ ruta: 'libs/shared/carousel.ts', fuente: IMPORT + "t('Slider.Next', 'x');" }])).toHaveLength(1);
  });

  it('una librería que recibe el texto por input no dice nada', () => {
    expect(revisarLibrerias([{ ruta: 'libs/shared/carousel.ts', fuente: "readonly nextLabel = input('Next');" }])).toEqual([]);
  });
});
