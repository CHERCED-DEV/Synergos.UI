import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RAIZ_DEL_DESIGN_SYSTEM } from './consumidores-del-design-system.mjs';
import {
  aliasDePaths,
  apuntaA,
  aristasDeMontaje,
  candidatosPorNombre,
  componentesDelArbol,
  evaluarGemelas,
  importsConNombre,
  piezasMontadas,
  raizDelElemento,
  resolverEspecificador,
} from './gemelas-del-design-system.mjs';
import { ROOT } from './synergos-config.mjs';

const DS = RAIZ_DEL_DESIGN_SYSTEM;

/** Los alias como los declara una plataforma: el barril del design system y la tienda. */
const ALIAS = aliasDePaths({
  '@synergos/shared': ['./libs/shared/src/index.ts'],
  '@synergos/shop': ['./libs/shop/src/index.ts'],
});

/** Una pieza del design system, con la forma con la que se declaran. */
const pieza = (tier, nombre, clase) => ({
  ruta: `${DS}/${tier}/${nombre}/${nombre}.ts`,
  fuente: `
import { Component } from '@x/core';
@Component({
  selector: 'syn-${nombre}',
  template: \`<span><ng-content /></span>\`,
})
export class ${clase} {}
`,
});

/**
 * Un elemento publicado: su `main`, su componente raíz y su plantilla.
 *
 * `imports` son los import ES del componente; `plantilla`, su `.html`.
 */
const elemento = (nombre, { imports = '', plantilla = '', clase = 'ElementoComponent', extra = '' } = {}) => {
  const dir = `apps/elements/modules/${nombre}/src`;
  return [
    {
      ruta: `${dir}/main.ts`,
      fuente: `
import { registrarElementoX } from '@synergos/core';
import { ${clase} } from './${nombre}/${nombre}';
registrarElementoX('synergos-${nombre}', ${clase});
`,
    },
    {
      ruta: `${dir}/${nombre}/${nombre}.ts`,
      fuente: `
import { Component } from '@x/core';
${imports}
${extra}
@Component({
  selector: 'sg-${nombre}',
  templateUrl: './${nombre}.html',
})
export class ${clase} {}
`,
    },
    { ruta: `${dir}/${nombre}/${nombre}.html`, fuente: plantilla },
  ];
};

const PIEZAS = [
  pieza('compositions', 'tooltip', 'TooltipComponent'),
  pieza('compositions', 'card', 'CardComponent'),
  pieza('compositions', 'carousel', 'CarouselComponent'),
];

/** Arma el grafo de un árbol de prueba y devuelve lo que alcanza la raíz de cada elemento. */
function medir(fuentes, nombres) {
  const { nodos, plantillasPerdidas } = componentesDelArbol(fuentes);
  const aristas = aristasDeMontaje(nodos, ALIAS);
  const esPieza = (n) => n.ruta.startsWith(`${DS}/`);
  const montadas = new Map();
  for (const nombre of nombres) {
    const main = fuentes.find((f) => f.ruta === `apps/elements/modules/${nombre}/src/main.ts`);
    const raiz = raizDelElemento(main, nodos, ALIAS);
    montadas.set(nombre, raiz?.nodo ? piezasMontadas(raiz.nodo, aristas, esPieza) : null);
  }
  return { montadas, plantillasPerdidas };
}

const IMPORTA_TOOLTIP = "import { TooltipComponent } from '@synergos/shared';";

describe('qué cuenta como montar: las DOS señales', () => {
  it('tag + clase importada del design system → monta', () => {
    const f = [...PIEZAS, ...elemento('tooltip', { imports: IMPORTA_TOOLTIP, plantilla: '<syn-tooltip text="x">y</syn-tooltip>' })];
    expect([...medir(f, ['tooltip']).montadas.get('tooltip')]).toEqual(['TooltipComponent']);
  });

  it('un prefijo de id NO es un montaje — la trampa de `syn-tooltip-${…}`', () => {
    // El elemento `tooltip` real compone `syn-tooltip-${…}` para el id de su burbuja, y un conteo
    // de menciones lo daba por montado. Con la clase importada y todo, sin el TAG no monta.
    const f = [
      ...PIEZAS,
      ...elemento('tooltip', { imports: IMPORTA_TOOLTIP, plantilla: '<span id="syn-tooltip-1" role="tooltip">x</span>' }),
    ];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').size).toBe(0);
  });

  it('un tag más largo con el mismo principio tampoco (`<syn-tooltip-x>`)', () => {
    const f = [...PIEZAS, ...elemento('tooltip', { imports: IMPORTA_TOOLTIP, plantilla: '<syn-tooltip-x></syn-tooltip-x>' })];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').size).toBe(0);
  });

  it('importar la clase sin usar el tag no pinta nada', () => {
    const f = [...PIEZAS, ...elemento('tooltip', { imports: IMPORTA_TOOLTIP, plantilla: '<span>x</span>' })];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').size).toBe(0);
  });

  it('el tag sin importar la clase tampoco: con un esquema de elementos desconocidos compila y no monta', () => {
    const f = [...PIEZAS, ...elemento('tooltip', { plantilla: '<syn-tooltip>x</syn-tooltip>' })];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').size).toBe(0);
  });

  it('una clase que SE LLAMA como la pieza no es la pieza — el `card` que se contaba a sí mismo', () => {
    // El `card` publicado se llama `CardComponent`, como la del design system, y la declara en
    // su propio fichero. Acá, además, importa un `CardComponent` LOCAL y usa `<syn-card>`: por
    // nombre de clase + tag salía montado. La clase se busca por dónde la RESUELVE el import.
    const f = [
      ...PIEZAS,
      ...elemento('card', {
        clase: 'CardComponent',
        imports: "import { CardComponent as Local } from './local-card';",
        plantilla: '<syn-card></syn-card>',
      }),
      {
        ruta: 'apps/elements/modules/card/src/card/local-card.ts',
        fuente: "@Component({ selector: 'syn-card', template: `<b></b>` })\nexport class CardComponent {}",
      },
    ];
    expect(medir(f, ['card']).montadas.get('card').has('CardComponent')).toBe(false);
  });

  it('una mención dentro de un comentario de plantilla no cuenta', () => {
    const f = [...PIEZAS, ...elemento('tooltip', { imports: IMPORTA_TOOLTIP, plantilla: '<!-- <syn-tooltip> -->' })];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').size).toBe(0);
  });

  it('un `import type` no trae la clase', () => {
    const f = [
      ...PIEZAS,
      ...elemento('tooltip', {
        imports: "import type { TooltipComponent } from '@synergos/shared';",
        plantilla: '<syn-tooltip></syn-tooltip>',
      }),
    ];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').size).toBe(0);
  });

  it('el alias con `as` sigue siendo la pieza', () => {
    const f = [
      ...PIEZAS,
      ...elemento('tooltip', {
        imports: "import { TooltipComponent as Globo } from '@synergos/shared';",
        plantilla: '<syn-tooltip/>',
      }),
    ];
    expect(medir(f, ['tooltip']).montadas.get('tooltip').has('TooltipComponent')).toBe(true);
  });
});

describe('el cierre transitivo', () => {
  it('si el elemento delega en un componente suyo que monta la pieza, la monta', () => {
    const f = [
      ...PIEZAS,
      ...elemento('carousel', {
        imports: "import { SlideShow } from './slide-show';",
        plantilla: '<sg-slide-show></sg-slide-show>',
      }),
      {
        ruta: 'apps/elements/modules/carousel/src/carousel/slide-show.ts',
        fuente: `
import { CarouselComponent } from '@synergos/shared';
@Component({ selector: 'sg-slide-show', template: \`<syn-carousel [slides]="s" />\` })
export class SlideShow {}
`,
      },
    ];
    expect([...medir(f, ['carousel']).montadas.get('carousel')]).toEqual(['CarouselComponent']);
  });

  it('pero cada paso necesita las dos señales: un eslabón roto corta la cadena', () => {
    const f = [
      ...PIEZAS,
      // El elemento usa el tag del intermedio SIN importarlo.
      ...elemento('carousel', { plantilla: '<sg-slide-show></sg-slide-show>' }),
      {
        ruta: 'apps/elements/modules/carousel/src/carousel/slide-show.ts',
        fuente: `
import { CarouselComponent } from '@synergos/shared';
@Component({ selector: 'sg-slide-show', template: \`<syn-carousel />\` })
export class SlideShow {}
`,
      },
    ];
    expect(medir(f, ['carousel']).montadas.get('carousel').size).toBe(0);
  });
});

describe('la raíz del elemento', () => {
  it('es la clase que registra su `main`, resuelta por su import', () => {
    const f = [...PIEZAS, ...elemento('tooltip', { clase: 'TooltipElement' })];
    const { nodos } = componentesDelArbol(f);
    const raiz = raizDelElemento(f.find((x) => x.ruta.endsWith('main.ts')), nodos, ALIAS);
    expect(raiz).toMatchObject({ tag: 'synergos-tooltip', clase: 'TooltipElement' });
    expect(raiz.nodo.ruta).toBe('apps/elements/modules/tooltip/src/tooltip/tooltip.ts');
  });

  it('un `main` que no registra nada devuelve null (y el gate lo dice, no lo salta)', () => {
    const { nodos } = componentesDelArbol(PIEZAS);
    expect(raizDelElemento({ ruta: 'apps/x/src/main.ts', fuente: 'console.log(1);' }, nodos, ALIAS)).toBeNull();
  });

  it('una plantilla que no existe se informa en vez de medirse vacía', () => {
    const f = [...PIEZAS, ...elemento('tooltip')].filter((x) => !x.ruta.endsWith('.html'));
    const { plantillasPerdidas } = componentesDelArbol(f);
    expect(plantillasPerdidas).toEqual(['apps/elements/modules/tooltip/src/tooltip/tooltip.ts → ./tooltip.html']);
  });
});

describe('imports y alias', () => {
  it('importsConNombre: nombres, `as` y `type`', () => {
    const m = importsConNombre(`
import { A, B as C, type D } from '@x/y';
import type { E } from './e';
`);
    expect([...m.keys()]).toEqual(['A', 'C']);
    expect(m.get('C')).toEqual({ original: 'B', especificador: '@x/y' });
  });

  it('la tabla de alias casa la clave más larga primero (regla 30)', () => {
    const alias = aliasDePaths({ '@v/core': ['../v/core/index.ts'], '@v/core/inputs': ['../v/core/inputs/index.ts'] });
    expect(alias.map((a) => a.prefijo)).toEqual(['@v/core/inputs', '@v/core']);
    expect(resolverEspecificador('apps/a.ts', '@v/core/inputs', alias)).toBe('../v/core/inputs/index.ts');
  });

  it('un alias con comodín resuelve el resto del camino', () => {
    const alias = aliasDePaths({ '@libs/*': ['libs/*'] }, '');
    expect(resolverEspecificador('apps/a.ts', '@libs/shop/src/x', alias)).toBe('libs/shop/src/x');
  });

  it('los destinos se resuelven contra la base declarada', () => {
    const alias = aliasDePaths({ '@x': ['./libs/x/index.ts'] }, '..\\..');
    expect(alias[0].destino).toBe('../../libs/x/index.ts');
  });

  it('un paquete de npm no apunta a nada de este árbol', () => {
    expect(resolverEspecificador('apps/a.ts', '@x/core', ALIAS)).toBeNull();
  });

  it('apuntaA: el fichero, o un barril/carpeta que lo contiene — y nada más', () => {
    expect(apuntaA('libs/shared/src/index.ts', `${DS}/compositions/card/card.ts`)).toBe(true);
    expect(apuntaA('apps/el/src/card/card', 'apps/el/src/card/card.ts')).toBe(true);
    expect(apuntaA('apps/el/src/card', 'apps/el/src/card/card.ts')).toBe(true);
    expect(apuntaA('libs/shop/src/index.ts', `${DS}/compositions/card/card.ts`)).toBe(false);
    expect(apuntaA('apps/el/src/car', 'apps/el/src/card/card.ts')).toBe(false);
  });
});

describe('candidatosPorNombre', () => {
  const piezas = [
    { clase: 'StepperComponent', selector: 'syn-stepper' },
    { clase: 'ProgressComponent', selector: 'syn-progress' },
    { clase: 'SkeletonComponent', selector: 'syn-skeleton' },
    { clase: 'SynSkeletonComponent', selector: 'syn-skeleton' },
    { clase: 'CardComponent', selector: 'syn-card' },
  ];

  it('nombre exacto, raíz al principio o al final — y la clave es la CLASE', () => {
    const c = candidatosPorNombre(['stepper', 'progress-bar', 'kpi-card', 'skeleton', 'hero'], piezas);
    expect([...c.keys()]).toEqual(['stepper', 'progress-bar', 'kpi-card', 'skeleton']);
    expect(c.get('stepper').via).toBe('nombre');
    expect(c.get('progress-bar').via).toBe('raíz «progress»');
    // `syn-skeleton` está declarado dos veces: las dos clases cuentan.
    expect(c.get('skeleton').clases).toEqual(['SkeletonComponent', 'SynSkeletonComponent']);
  });

  it('una raíz en MEDIO del nombre no cuenta, ni un prefijo sin guion', () => {
    const c = candidatosPorNombre(['x-card-y', 'cards', 'stepperx'], piezas);
    expect(c.size).toBe(0);
  });
});

describe('evaluarGemelas', () => {
  const piezas = [
    { clase: 'TooltipComponent', selector: 'syn-tooltip' },
    { clase: 'CarouselComponent', selector: 'syn-carousel' },
    { clase: 'StepperComponent', selector: 'syn-stepper' },
    { clase: 'ModalComponent', selector: 'syn-modal' },
  ];
  const tabla = () => ({
    gemelas: {
      tooltip: { piezas: ['TooltipComponent'], razon: 'mismo concepto' },
      carousel: { piezas: ['CarouselComponent'], razon: 'mismo concepto' },
      drawer: { piezas: ['ModalComponent'], razon: 'declarado por concepto' },
    },
    noGemelas: { stepper: { razon: 'dos conceptos', disparador: 'renombrar' } },
    incumplen: ['drawer', 'tooltip'],
  });
  const nombres = ['tooltip', 'carousel', 'drawer', 'stepper', 'hero'];
  const hoy = () =>
    new Map([
      ['tooltip', new Set()],
      ['carousel', new Set(['CarouselComponent'])],
      ['drawer', new Set()],
      ['stepper', new Set()],
      ['hero', new Set(['TooltipComponent'])],
    ]);

  it('en verde cuando los incumplimientos son exactamente la línea base', () => {
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas: hoy() });
    expect(r.fallos).toEqual([]);
    expect(r.pares).toHaveLength(3);
    expect(r.cumplen).toEqual(['carousel']);
    expect(r.incumplen).toEqual(['drawer', 'tooltip']);
  });

  it('rompe con un incumplimiento NUEVO — y el mensaje dice qué hacer sin nombrar un framework', () => {
    const montadas = hoy();
    montadas.set('carousel', new Set());
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas });
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toMatch(/^NUEVO incumplimiento: «carousel»/);
    expect(r.fallos[0]).toContain('importá su clase y usá su tag');
    expect(r.fallos[0]).not.toMatch(/angular|preact|react/i);
  });

  it('rompe cuando uno de la línea base ya monta su pieza: se baja en el mismo commit', () => {
    const montadas = hoy();
    montadas.set('tooltip', new Set(['TooltipComponent']));
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas });
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toMatch(/^RESUELTO: «tooltip»/);
  });

  it('rompe cuando la línea base nombra algo que ya no es un par', () => {
    const t = tabla();
    t.incumplen.push('hero');
    const r = evaluarGemelas({ tabla: t, piezas, nombresDelRegistry: nombres, montadas: hoy() });
    expect(r.fallos.join(' ')).toContain('RESUELTO: «hero»');
  });

  it('rompe con un candidato por nombre sin clasificar', () => {
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: [...nombres, 'modal-trigger'], montadas: hoy() });
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toMatch(/^sin clasificar: «modal-trigger» se llama como ModalComponent \(raíz «modal»\)/);
  });

  it('rompe con una excepción que sobra: un `noGemelas` que ya no se llama como ninguna pieza', () => {
    const r = evaluarGemelas({ tabla: tabla(), piezas: piezas.filter((p) => p.clase !== 'StepperComponent'), nombresDelRegistry: nombres, montadas: hoy() });
    expect(r.fallos.join(' ')).toContain('sobra: `noGemelas.stepper`');
  });

  it('rompe con una entrada cuyo elemento o cuya pieza ya no existen', () => {
    const t = tabla();
    t.gemelas.tooltip.piezas = ['GloboComponent'];
    const r = evaluarGemelas({ tabla: t, piezas, nombresDelRegistry: nombres.filter((n) => n !== 'drawer'), montadas: hoy() });
    const todo = r.fallos.join(' ');
    expect(todo).toContain('sobra: `gemelas.drawer`');
    expect(todo).toContain('apunta a GloboComponent');
  });

  it('rompe con un par sin razón, o una excepción sin disparador', () => {
    const t = tabla();
    t.gemelas.drawer.razon = ' ';
    t.noGemelas.stepper.disparador = '';
    const r = evaluarGemelas({ tabla: t, piezas, nombresDelRegistry: nombres, montadas: hoy() });
    const todo = r.fallos.join(' ');
    expect(todo).toContain('`gemelas.drawer` no tiene `razon`');
    expect(todo).toContain('`noGemelas.stepper` necesita');
  });

  it('rompe con un elemento en las dos listas, y con la línea base repetida', () => {
    const t = tabla();
    t.noGemelas.tooltip = { razon: 'x', disparador: 'y' };
    t.incumplen.push('drawer');
    const r = evaluarGemelas({ tabla: t, piezas, nombresDelRegistry: nombres, montadas: hoy() });
    const todo = r.fallos.join(' ');
    expect(todo).toContain('«tooltip» está en `gemelas` Y en `noGemelas`');
    expect(todo).toContain('`incumplen` repite drawer');
  });

  it('un par cuya raíz no se resolvió NO se salta: es la red de seguridad', () => {
    const montadas = hoy();
    montadas.set('drawer', null);
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas });
    expect(r.fallos.join(' ')).toContain('sin raíz: no se pudo leer qué registra el elemento «drawer»');
  });

  it('…y un elemento que NO es par tampoco: es como se ve que la lectura se rompió', () => {
    // Con el regex de comentarios de antes (H5), `dropzone` y `file-uploader` perdían su
    // `@Component` y el gate seguía verde, porque no son pares. Mutado sobre el árbol real.
    const montadas = hoy();
    montadas.set('hero', null);
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas });
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toContain('sin raíz: no se pudo leer qué registra el elemento «hero»');
  });

  it('un par sin fuente en ninguna plataforma medible se dice, no se salta', () => {
    const montadas = hoy();
    montadas.delete('drawer');
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas });
    expect(r.fallos.join(' ')).toContain('sin fuente: «drawer»');
  });

  it.each([
    ['sin piezas', { piezas: [] }, 'ninguna pieza'],
    ['sin registry', { nombresDelRegistry: [] }, 'el registry no tiene'],
    ['sin raíces', { montadas: new Map([['tooltip', null]]) }, 'raíz de ningún elemento'],
    ['nadie monta nada', { montadas: new Map([['tooltip', new Set()], ['carousel', new Set()]]) }, 'ningún elemento monta'],
  ])('VACÍO %s: un cruce sobre nada no es un verde', (_caso, cambio, texto) => {
    const r = evaluarGemelas({ tabla: tabla(), piezas, nombresDelRegistry: nombres, montadas: hoy(), ...cambio });
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0]).toMatch(/^VACÍO/);
    expect(r.fallos[0]).toContain(texto);
  });
});

describe('la tabla del disco', () => {
  // Lo que el gate no puede juzgar sin el disco entero lo juzga él; esto sólo exige la FORMA de
  // lo que escribe una persona, para que un JSON mal armado no se lea como «cero pares».
  const tabla = JSON.parse(readFileSync(resolve(ROOT, 'tools', 'gemelas-del-design-system.json'), 'utf8'));

  it('trae las tres listas, y la línea base es una lista de nombres, no una cifra', () => {
    expect(Object.keys(tabla.gemelas).length).toBeGreaterThan(0);
    expect(Object.keys(tabla.noGemelas).length).toBeGreaterThan(0);
    expect(Array.isArray(tabla.incumplen)).toBe(true);
    for (const n of tabla.incumplen) expect(tabla.gemelas, n).toHaveProperty(n);
  });

  it('la línea base va ordenada, para que su diff diga qué entró y qué salió', () => {
    expect(tabla.incumplen).toEqual([...tabla.incumplen].sort());
  });
});
