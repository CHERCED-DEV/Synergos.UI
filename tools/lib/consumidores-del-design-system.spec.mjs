import { describe, expect, it } from 'vitest';

import {
  DESIGN_SYSTEM_NO_MEDIBLE,
  RAIZ_DEL_DESIGN_SYSTEM,
  componentesDeclarados,
  cruzarConLaLineaBase,
  declaracionesDeComponente,
  formatearReparto,
  inalcanzablesDesdeProducto,
  repartoPorTier,
  revisarCobertura,
  sinComentarios,
} from './consumidores-del-design-system.mjs';

const DS = RAIZ_DEL_DESIGN_SYSTEM;

/** Un componente del design system, con la forma con la que Angular los declara. */
const componente = (tier, carpeta, clase, selector, plantilla = '') => ({
  ruta: `${DS}/${tier}/${carpeta}/${carpeta}.ts`,
  fuente: `
import { Component } from '@angular/core';
${plantilla}
@Component({
  selector: '${selector}',
  standalone: true,
  template: \`<span></span>\`,
})
export class ${clase} {}
`,
});

/**
 * El árbol de prueba. Lleva **las dos formas** a propósito:
 *
 *  - `TooltipComponent` — muerto suelto, nadie lo nombra;
 *  - `PricingCardComponent` — muerto suelto, pero usa a `ListComponent`;
 *  - `ListComponent` — **vivo por un muerto**: tiene UN consumidor y ese consumidor es
 *    `PricingCardComponent`, que no alcanza nadie.
 *
 * Sin el segundo par, el conteo directo y el cierre transitivo dan el mismo número y la
 * mutación pasa en verde (regla 7).
 */
const COMPONENTES = [
  componente('primitives', 'button', 'ButtonComponent', 'syn-button'),
  componente('primitives', 'list', 'ListComponent', 'syn-list'),
  componente('compositions', 'tooltip', 'TooltipComponent', 'syn-tooltip'),
  componente(
    'compositions',
    'pricing-card',
    'PricingCardComponent',
    'syn-pricing-card',
    "import { ListComponent } from '../../primitives/list/list';",
  ),
];

/** El elemento publicado: lo único que está FUERA del design system. */
const ELEMENTO = {
  ruta: 'apps/elements/primitives/badge/src/badge.ts',
  fuente: `
import { ButtonComponent } from '@synergos/shared';
@Component({ imports: [ButtonComponent], template: \`<syn-button></syn-button>\` })
export class BadgeElement {}
`,
};

/**
 * El barril: re-exporta las cuatro. No consume ninguna.
 *
 * **Re-exporta por NOMBRE y eso es el fixture, no decoración.** La primera versión escribía
 * `export * from './…'`, que no nombra ni una clase: con ese barril la mutación —contarlo como
 * consumidor— pasaba en VERDE, porque no era consumidor de nada ni con la regla apagada. Es la
 * regla 7 tal cual: la culpa era del fixture. El barril real de
 * `libs/shared/src/index.ts` re-exporta nombrando (`PricingCardComponent,`).
 */
const BARRIL = {
  ruta: `${DS}/index.ts`,
  fuente: `
export { ButtonComponent } from './primitives/button/button';
export { ListComponent } from './primitives/list/list';
export { TooltipComponent } from './compositions/tooltip/tooltip';
export { PricingCardComponent } from './compositions/pricing-card/pricing-card';
`,
};

const fuentesBase = () => [
  ELEMENTO,
  BARRIL,
  ...COMPONENTES,
];

describe('sinComentarios', () => {
  it('quita bloque, línea y comentario de plantilla', () => {
    const limpia = sinComentarios(`
/* <syn-tooltip> */
const a = 1; // <syn-tooltip>
<!-- <syn-tooltip> -->
<syn-button></syn-button>
`);
    expect(limpia).not.toContain('syn-tooltip');
    expect(limpia).toContain('syn-button');
  });

  it('no parte una URL por su doble barra', () => {
    expect(sinComentarios("const u = 'https://ejemplo/x'; const b = 2;")).toContain('const b = 2');
  });

  it("un '/*' dentro de una CADENA no abre un comentario — H5, el que se comía el @Component", () => {
    // `dropzone.ts:160` tiene `'/*'`, y el regex de antes abría ahí un comentario que cerraba en
    // el primer `*/` de verdad: el `@Component` de `dropzone` y el de `file-uploader`
    // desaparecían (195 componentes vistos contra 197). El gate de #81 los necesita en el grafo.
    const fuente = `
const acepta = accept === '*/*' || accept.endsWith('/*');
/** docs */
@Component({ selector: 'sg-dropzone' })
export class DropzoneElementComponent {}
`;
    expect(declaracionesDeComponente(fuente).map((d) => d.clase)).toEqual(['DropzoneElementComponent']);
  });

  it('una regex con `\\/\\/` no abre un comentario de línea (fab.ts)', () => {
    const limpia = sinComentarios("const esExterno = /^https?:\\/\\//i.test(h) || h.startsWith('//'); const sigue = 1;");
    expect(limpia).toContain('const sigue = 1');
  });

  it('una plantilla con `${…}` anidado no confunde al escáner', () => {
    const limpia = sinComentarios('const t = `a ${ { b: `c ${d} // no` }.b } e`; // sí\nconst f = 1;');
    expect(limpia).toContain('// no');
    expect(limpia).not.toContain('sí');
    expect(limpia).toContain('const f = 1');
  });

  it('conserva las líneas: un comentario de bloque se vuelve blanco, no desaparece', () => {
    const fuente = 'a\n/* uno\ndos */\nb';
    expect(sinComentarios(fuente).split('\n')).toHaveLength(fuente.split('\n').length);
  });

  it('a una plantilla sólo se le quitan los <!-- -->: el apóstrofo no es una cadena', () => {
    const limpia = sinComentarios("<p>Don't</p>\n<!-- <syn-tooltip> -->\n<a href=//x>y</a> <syn-button></syn-button>", 'x.html');
    expect(limpia).not.toContain('syn-tooltip');
    expect(limpia).toContain('<syn-button>');
  });
});

describe('declaracionesDeComponente', () => {
  it('devuelve la clase, el selector (o null) y el bloque de metadatos', () => {
    const [con, sin] = declaracionesDeComponente(`
@Component({ selector: "syn-x", templateUrl: './x.html' })
export class XComponent {}
@Component({ template: \`<b></b>\` })
export class RaizSinSelector {}
`);
    expect(con).toMatchObject({ clase: 'XComponent', selector: 'syn-x' });
    expect(con.metadatos).toContain("templateUrl: './x.html'");
    expect(sin).toMatchObject({ clase: 'RaizSinSelector', selector: null });
  });
});

describe('componentesDeclarados', () => {
  it('saca clase, selector, carpeta y tier', () => {
    const piezas = componentesDeclarados(COMPONENTES);
    expect(piezas.map((p) => p.clase).sort()).toEqual([
      'ButtonComponent', 'ListComponent', 'PricingCardComponent', 'TooltipComponent',
    ]);
    const lista = piezas.find((p) => p.clase === 'ListComponent');
    expect(lista).toMatchObject({ selector: 'syn-list', tier: 'primitives' });
    expect(lista.carpeta).toBe(`${DS}/primitives/list`);
  });

  it('descubre varios @Component en un mismo fichero', () => {
    const piezas = componentesDeclarados([
      {
        ruta: `${DS}/states/states.ts`,
        fuente: `
@Component({ selector: 'syn-empty-state' })
export class SynEmptyStateComponent {}
@Component({ selector: 'syn-skeleton' })
export class SynSkeletonComponent {}
`,
      },
    ]);
    expect(piezas).toHaveLength(2);
  });

  it('no se cree un @Component que sólo vive en un comentario', () => {
    const piezas = componentesDeclarados([
      {
        ruta: `${DS}/primitives/x/x.ts`,
        fuente: `/*
@Component({ selector: 'syn-fantasma' })
export class FantasmaComponent {}
*/`,
      },
    ]);
    expect(piezas).toHaveLength(0);
  });
});

describe('inalcanzablesDesdeProducto', () => {
  it('sólo sobrevive lo que alcanza un elemento, y arrastra lo que cuelga de un muerto', () => {
    const piezas = componentesDeclarados(COMPONENTES);
    const r = inalcanzablesDesdeProducto(piezas, fuentesBase());

    expect(r.medidos).toBe(4);
    expect(r.alcanzables).toBe(1);
    expect(r.inalcanzables).toEqual(['ListComponent', 'PricingCardComponent', 'TooltipComponent']);
  });

  it('`ListComponent` TIENE un consumidor directo — y aun así no lo alcanza nadie', () => {
    // Éste es el test que separa el cierre transitivo del conteo directo. Con un conteo de
    // consumidores, `ListComponent` sale vivo: lo usa `pricing-card`. El defecto pasa en verde.
    const piezas = componentesDeclarados(COMPONENTES);
    const r = inalcanzablesDesdeProducto(piezas, fuentesBase());

    expect(r.sinConsumidorDirecto).toEqual(['PricingCardComponent', 'TooltipComponent']);
    expect(r.sinConsumidorDirecto).not.toContain('ListComponent');
    expect(r.inalcanzables).toContain('ListComponent');
  });

  it('el barril NO cuenta: es lo que separa «cero consumidores» de «uno»', () => {
    // **Este test existe porque la mutación del barril pasó en VERDE contra `inalcanzables`.**
    // Y el hallazgo fue que el barril no puede resucitar a nadie bajo el cierre transitivo: un
    // `index.ts` del design system está DENTRO del design system, así que no entra en la
    // semilla. A lo que sí afecta es a `sinConsumidorDirecto`, que es el 18 contra 22 que el
    // runner imprime — y con los barriles dentro sale **0**, o sea el gate diciendo que no hay
    // ni una pieza huérfana. Ésa es la cifra que el barril sostiene, y la otra no; decir cuál
    // es la mitad que cuesta.
    const piezas = componentesDeclarados(COMPONENTES);
    const r = inalcanzablesDesdeProducto(piezas, fuentesBase());

    expect(r.sinConsumidorDirecto).toEqual(['PricingCardComponent', 'TooltipComponent']);
    expect(r.inalcanzables).toHaveLength(3);
  });

  it('un spec tampoco cuenta: prueba que la pieza funciona, no que alguien la use', () => {
    const conSpec = [
      ...fuentesBase(),
      {
        ruta: 'apps/elements/primitives/badge/src/tooltip.spec.ts',
        fuente: "import { TooltipComponent } from '@synergos/shared';",
      },
    ];
    const piezas = componentesDeclarados(COMPONENTES);
    expect(inalcanzablesDesdeProducto(piezas, conSpec).inalcanzables).toContain('TooltipComponent');
  });

  it('una mención en prosa no resucita a nadie', () => {
    const conProsa = [
      ...fuentesBase(),
      {
        ruta: 'libs/shells/src/x.ts',
        fuente: '/** Reemplaza a `TooltipComponent`; ver <syn-tooltip>. */\nexport const x = 1;',
      },
    ];
    const piezas = componentesDeclarados(COMPONENTES);
    expect(inalcanzablesDesdeProducto(piezas, conProsa).inalcanzables).toContain('TooltipComponent');
  });

  it('una lib que no es el design system SÍ cuenta como producto', () => {
    // Sin `libs/`, un componente usado sólo por `libs/shells` saldría muerto — falso positivo,
    // que es el lado del que este gate no se puede equivocar (#158 del hermano).
    const conShell = [
      ...fuentesBase(),
      { ruta: 'libs/shells/src/map/results-map.ts', fuente: '<syn-tooltip></syn-tooltip>' },
    ];
    const piezas = componentesDeclarados(COMPONENTES);
    expect(inalcanzablesDesdeProducto(piezas, conShell).inalcanzables).not.toContain('TooltipComponent');
  });

  it('los ficheros de la propia carpeta no cuentan', () => {
    const conPlantillaPropia = [
      ...fuentesBase(),
      { ruta: `${DS}/compositions/tooltip/tooltip.html`, fuente: '<syn-tooltip></syn-tooltip>' },
    ];
    const piezas = componentesDeclarados(COMPONENTES);
    expect(inalcanzablesDesdeProducto(piezas, conPlantillaPropia).inalcanzables).toContain('TooltipComponent');
  });
});

describe('repartoPorTier (#172)', () => {
  // La cifra por tier estaba escrita A MANO en la regla 39 y en el docstring de la lib —«9 de los
  // 12 patterns»— y eran 6. Estos tests existen para que la que se lea sea la que el runner
  // IMPRIME, derivada de lo que el descubrimiento ya calculó.

  it('cuenta por tier lo que el descubrimiento ya calculó, y lo imprime en una línea', () => {
    const piezas = componentesDeclarados(COMPONENTES);
    const r = inalcanzablesDesdeProducto(piezas, fuentesBase());
    const reparto = repartoPorTier(piezas, r.inalcanzables);

    expect(reparto).toEqual([
      { tier: 'compositions', total: 2, inalcanzables: 2 },
      { tier: 'primitives', total: 2, inalcanzables: 1 },
    ]);
    expect(formatearReparto(reparto)).toBe('compositions 2/2 (100 %) · primitives 1/2 (50 %)');
  });

  it('las partes suman el todo — si no, dos piezas se colapsaron en una clave', () => {
    // La forma del error de la primera medición del #78 (31 + 22 sobre 55, por clave de selector).
    const piezas = componentesDeclarados(COMPONENTES);
    const r = inalcanzablesDesdeProducto(piezas, fuentesBase());
    const reparto = repartoPorTier(piezas, r.inalcanzables);

    expect(reparto.reduce((s, t) => s + t.total, 0)).toBe(r.medidos);
    expect(reparto.reduce((s, t) => s + t.inalcanzables, 0)).toBe(r.inalcanzables.length);
  });

  it('un tier sin inalcanzables sale con su 0 — no desaparece', () => {
    // `states` es hoy 0 de 4. Un reparto que sólo recorriera las inalcanzables lo borraría, y un
    // tier que no se imprime se lee como uno que no existe.
    const conEstado = [...COMPONENTES, componente('states', 'empty', 'EmptyStateComponent', 'syn-empty-state')];
    const usaElEstado = { ruta: 'apps/elements/states/lista/src/lista.ts', fuente: '<syn-empty-state></syn-empty-state>' };
    const piezas = componentesDeclarados(conEstado);
    const r = inalcanzablesDesdeProducto(piezas, [...fuentesBase(), conEstado.at(-1), usaElEstado]);
    const reparto = repartoPorTier(piezas, r.inalcanzables);

    expect(reparto.find((t) => t.tier === 'states')).toEqual({ tier: 'states', total: 1, inalcanzables: 0 });
    expect(formatearReparto(reparto)).toContain('states 0/1 (0 %)');
  });

  it('el tier y el reparto salen iguales con rutas de Windows', () => {
    // El tier se saca partiendo la ruta por `/`. En Windows `path.relative` devuelve `\`, y sin
    // normalizar la carpeta sería la ruta entera y el tier, basura — el reparto impreso mentiría
    // en la máquina del arquitecto y no en CI (CMS#170, UI#79).
    const aWindows = (f) => ({ ...f, ruta: f.ruta.replace(/\//g, '\\') });
    const piezas = componentesDeclarados(COMPONENTES.map(aWindows));

    expect(piezas.find((p) => p.clase === 'ListComponent')).toMatchObject({
      tier: 'primitives',
      carpeta: `${DS}/primitives/list`,
    });

    const r = inalcanzablesDesdeProducto(piezas, fuentesBase().map(aWindows));
    expect(r.inalcanzables).toEqual(['ListComponent', 'PricingCardComponent', 'TooltipComponent']);
    expect(formatearReparto(repartoPorTier(piezas, r.inalcanzables))).toBe(
      'compositions 2/2 (100 %) · primitives 1/2 (50 %)',
    );
  });
});

describe('cruzarConLaLineaBase', () => {
  const BASE = ['ListComponent', 'PricingCardComponent', 'TooltipComponent'];

  it('en verde cuando la lista es exactamente la línea base', () => {
    const r = cruzarConLaLineaBase(BASE, BASE, 4);
    expect(r.fallos).toEqual([]);
  });

  it('rompe cuando aparece una nueva', () => {
    const r = cruzarConLaLineaBase([...BASE, 'ModalComponent'], BASE, 5);
    expect(r.nuevos).toEqual(['ModalComponent']);
    expect(r.fallos.join(' ')).toContain('ModalComponent');
  });

  it('rompe también cuando una de la línea base ya no corresponde', () => {
    // La mitad que hace que el commit que la retira baje la línea aquí mismo. Sin ella, la
    // línea base se queda afirmando una deuda que alguien ya pagó.
    const r = cruzarConLaLineaBase(['PricingCardComponent', 'TooltipComponent'], BASE, 4);
    expect(r.resueltos).toEqual(['ListComponent']);
    expect(r.fallos.join(' ')).toContain('ListComponent');
  });

  it('una lista vacía con la línea base vacía NO es un verde: es la red de seguridad', () => {
    const r = cruzarConLaLineaBase([], [], 0);
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toContain('no se descubrió');
  });
});

describe('revisarCobertura', () => {
  it('pasa cuando la plataforma medible rinde componentes y la declarada no', () => {
    const r = revisarCobertura([
      { framework: 'angular', fuentes: 55, componentes: 55 },
      { framework: 'preact', fuentes: 2, componentes: 0 },
    ]);
    expect(r.fallos).toEqual([]);
  });

  it('rompe con una plataforma que tiene fuentes, cero componentes y no está declarada', () => {
    // La regla 25: una dimensión de lo que se mide —cómo declara componentes la plataforma—
    // resuelta a una constante. Sin esto, sale `0 inalcanzables` y el gate informa verde.
    const r = revisarCobertura([{ framework: 'svelte', fuentes: 9, componentes: 0 }], {});
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toContain('svelte');
  });

  it('rompe cuando una plataforma declarada YA rinde componentes', () => {
    const r = revisarCobertura([{ framework: 'preact', fuentes: 9, componentes: 3 }]);
    expect(r.fallos.join(' ')).toContain('la excepción sobra');
  });

  it('rompe cuando una entrada del censo ya no es una plataforma con design system', () => {
    const r = revisarCobertura([{ framework: 'angular', fuentes: 55, componentes: 55 }]);
    expect(r.fallos.join(' ')).toContain('preact');
  });

  it('cada entrada del censo contesta «por qué NO se mide» y trae su disparador', () => {
    for (const [framework, entrada] of Object.entries(DESIGN_SYSTEM_NO_MEDIBLE)) {
      expect(entrada.razon, framework).toBeTruthy();
      expect(entrada.disparador, framework).toBeTruthy();
      expect(entrada.ticket, framework).toMatch(/#\d+$/);
    }
  });
});
