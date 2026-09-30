import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { PLATAFORMAS } from './element-sources.mjs';
import {
  DUENO_DE_LAS_REGIONES_POR_CODIGO,
  PISOS,
  cruzarConLaLineaBase,
  extraerPlantillas,
  regionesPorCodigo,
  regionesVivas,
  revisarCobertura,
} from './regiones-vivas.mjs';

/**
 * El gate de las regiones vivas que nacen con su mensaje (#82), visto fallar con fixtures.
 *
 * El parser es el de verdad —`@angular/compiler`, resuelto desde la plataforma que lo declara, sin
 * cablear su ruta (censo de `frameworks.spec.mjs`)—: un gate de plantillas probado contra un parser
 * de mentira no dice nada de las plantillas.
 */
const RAIZ = resolve(import.meta.dirname, '../..');
const base = PLATAFORMAS.map((p) => resolve(RAIZ, p.apps, '..')).find((b) => {
  try {
    return Boolean(JSON.parse(readFileSync(join(b, 'package.json'), 'utf8')).dependencies?.['@angular/compiler']);
  } catch {
    return false;
  }
});
const ng = await import(pathToFileURL(createRequire(join(base, 'package.json')).resolve('@angular/compiler')).href);

/** Las regiones de UNA plantilla html escrita en el test. */
const de = (html, ruta = 'apps/x/x.html') =>
  regionesVivas([{ ruta, origen: 'html', texto: html, lineaBase: 1 }], ng).nodos;

describe('regionesVivas — qué cuenta como región, y cuándo está dentro de un bloque', () => {
  it('LA MUTACIÓN DEL TICKET: el reloj con su región dentro de un @else queda marcado', () => {
    // Es la plantilla de `countdown-clock` antes de #82, recortada: la frase del tiempo, polite,
    // dentro de la rama «todavía no empezó».
    const nodos = de(`
      @if (hasTarget()) {
        <div role="timer" [attr.aria-label]="ariaSummary()">
          @if (hasStarted()) {
            <p aria-live="polite">{{ startedLabel() }}</p>
          } @else {
            <p class="countdown-clock__sr" aria-live="polite">{{ ariaSummary() }}</p>
          }
        </div>
      }
    `);
    expect(nodos.map((n) => [n.bloque, n.enBloque])).toEqual([
      ['@if(hasStarted())', true],
      ['@else', true],
    ]);
  });

  it('fuera de todo bloque NO se marca: es la región persistente, la forma buena', () => {
    const [nodo] = de(`<p role="status">{{ resultado() }}</p> @if (x) { <b>x</b> }`);
    expect(nodo.enBloque).toBe(false);
    expect(nodo.clave).toContain('(sin bloque)');
  });

  it.each([
    ['@if', `@if (a) { <p role="status">{{ a }}</p> }`, '@if(a)'],
    ['@else', `@if (a) { <i></i> } @else { <p role="alert">b</p> }`, '@else'],
    ['@else if', `@if (a) { <i></i> } @else if (b) { <p role="alert">b</p> }`, '@if(b)'],
    ['@switch/@case', `@switch (v) { @case ('x') { <p role="log">x</p> } }`, "@case('x')"],
    ['@for', `@for (t of ts; track t) { <li role="status">{{ t }}</li> }`, '@for(t of ts)'],
    ['@empty', `@for (t of ts; track t) { <i></i> } @empty { <p role="status">nada</p> }`, '@empty'],
    ['@defer', `@defer { <p aria-live="polite">x</p> }`, '@defer'],
    ['@placeholder', `@defer { <i></i> } @placeholder { <p role="status">…</p> }`, '@placeholder'],
    ['*ngIf', `<p *ngIf="aviso" role="status">{{ aviso }}</p>`, '*ngIf(aviso)'],
    ['*ngFor', `<li *ngFor="let t of ts" role="alert">{{ t }}</li>`, '*ngFor'],
    ['ng-template', `<ng-template><p aria-live="assertive">x</p></ng-template>`, 'ng-template'],
  ])('%s cuenta como bloque', (_, html, bloque) => {
    const [nodo] = de(html);
    expect(nodo.enBloque).toBe(true);
    expect(nodo.bloque.startsWith(bloque)).toBe(true);
  });

  it('las ataduras cuentan: [attr.role], [attr.aria-live] y [ariaLive]', () => {
    const nodos = de(`
      @if (a) { <p [attr.role]="error() ? 'alert' : 'status'">{{ a }}</p> }
      @if (b) { <p [attr.aria-live]="cortesia">{{ b }}</p> }
      @if (c) { <p [ariaLive]="'polite'">{{ c }}</p> }
    `);
    expect(nodos).toHaveLength(3);
  });

  it('NO son regiones: role=timer (calla por definición), aria-live=off, y un rol cualquiera', () => {
    expect(de(`@if (a) { <p role="timer">{{ a }}</p> <p aria-live="off">b</p> <p role="note">c</p> }`)).toEqual([]);
  });

  it('la clave no lleva número de línea y no cambia al re-indentar la guarda', () => {
    const a = de(`@if (aviso(); as texto) { <p role="status">{{ texto }}</p> }`);
    const b = de(`\n\n\n@if (   aviso();   as texto  ) {\n  <p   role="status">{{ texto }}</p>\n}`);
    expect(a[0].clave).toBe(b[0].clave);
    expect(a[0].clave).toBe('apps/x/x.html · @if(aviso(); as texto) · p[role=status]');
    expect(b[0].linea).toBe(5);
  });

  it('una plantilla que no parsea se acusa, no se salta', () => {
    const r = regionesVivas([{ ruta: 'apps/rota.html', texto: '@if (a) { <p>', lineaBase: 1 }], ng);
    expect(r.errores).toHaveLength(1);
  });
});

describe('extraerPlantillas — .html y `template:` inline', () => {
  const componente = (template) => `
import { Component } from '@angular/core';
@Component({
  selector: 'x-y',
  template: ${template},
})
export class X {}
`;

  it('toma el .html entero y el `template:` literal, con su línea real', () => {
    const { plantillas } = extraerPlantillas(
      [
        { ruta: 'apps/a/a.html', fuente: '<p role="status">a</p>' },
        { ruta: 'libs/b/b.ts', fuente: componente('`\n  @if (x) { <p role="alert">b</p> }\n`') },
      ],
      ts,
    );
    expect(plantillas.map((p) => p.origen)).toEqual(['html', 'inline']);
    const [nodo] = regionesVivas([plantillas[1]], ng).nodos;
    expect(nodo.linea).toBe(6);
    expect(nodo.enBloque).toBe(true);
  });

  it('un spec no es una plantilla del producto', () => {
    const { plantillas } = extraerPlantillas(
      [{ ruta: 'libs/b/b.spec.ts', fuente: componente('`@if (x) { <p role="alert">b</p> }`') }],
      ts,
    );
    expect(plantillas).toEqual([]);
  });

  it('un `template:` que no es literal se devuelve para acusarlo, no se salta en silencio', () => {
    const { plantillas, noLiterales } = extraerPlantillas(
      [{ ruta: 'libs/b/b.ts', fuente: componente('`<p>${algo}</p>`') }],
      ts,
    );
    expect(plantillas).toEqual([]);
    expect(noLiterales).toEqual(['libs/b/b.ts:5']);
  });
});

describe('cruzarConLaLineaBase — la LISTA vigilada en los dos sentidos', () => {
  const RAZON = 'Nace con su vista y después vive: su texto cambia con la vista abierta.';

  it('una marca que no está en la deuda ni en el censo rompe', () => {
    const r = cruzarConLaLineaBase(['a', 'b'], { deuda: ['a'], censo: [] });
    expect(r.nuevas).toEqual(['b']);
    expect(r.fallos).toHaveLength(1);
  });

  it('una entrada de la deuda que ya no está rompe: bajar la deuda es explícito', () => {
    const r = cruzarConLaLineaBase(['a'], { deuda: ['a', 'arreglada'], censo: [] });
    expect(r.arregladas).toEqual(['arreglada']);
    expect(r.fallos[0]).toContain('bajala de la línea base');
  });

  it('cuenta repeticiones: dos regiones iguales con una sola en la deuda es una NUEVA', () => {
    // Con un Set la segunda pasaría en verde: es la regla 39 (una lista, no una cifra) un nivel abajo.
    const r = cruzarConLaLineaBase(['a', 'a'], { deuda: ['a'], censo: [] });
    expect(r.nuevas).toEqual(['a']);
  });

  it('el censo cubre con su razón, y `veces` cuenta', () => {
    const r = cruzarConLaLineaBase(['c', 'c'], { deuda: [], censo: [{ clave: 'c', veces: 2, razon: RAZON }] });
    expect(r.fallos).toEqual([]);
  });

  it('un censo que sobra, uno sin razón y uno que también es deuda: los tres rompen', () => {
    const r = cruzarConLaLineaBase(['d', 'e'], {
      deuda: ['d'],
      censo: [
        { clave: 'fantasma', razon: RAZON },
        { clave: 'e', razon: 'vive' },
        { clave: 'd', razon: RAZON },
      ],
    });
    expect(r.censoSobrante).toEqual(['fantasma']);
    expect(r.censoSinRazon).toEqual(['e']);
    expect(r.enLasDos).toEqual(['d']);
  });
});

describe('revisarCobertura — descubrir CERO no es verde', () => {
  const sano = { plantillas: 300, inline: 60, nodosVivos: 180, errores: [], noLiterales: [] };

  it('el árbol de hoy pasa', () => {
    expect(revisarCobertura(sano).fallos).toEqual([]);
  });

  it.each([
    ['plantillas', { plantillas: 0 }],
    ['inline', { inline: 0 }],
    ['nodosVivos', { nodosVivos: 0 }],
  ])('%s bajo el piso rompe', (campo, cambio) => {
    expect(revisarCobertura({ ...sano, ...cambio }).fallos[0]).toContain(`piso ${PISOS[campo]}`);
  });

  it('un error de parseo o un `template:` no literal rompen: son plantillas que no se miraron', () => {
    expect(revisarCobertura({ ...sano, errores: ['x'], noLiterales: ['y'] }).fallos).toHaveLength(2);
  });
});

describe('regionesPorCodigo — sólo el anunciador crea regiones desde código (trinquete)', () => {
  it('fuera del anunciador, setAttribute de aria-live o de un rol vivo rompe', () => {
    expect(
      regionesPorCodigo([
        { ruta: 'libs/x/x.ts', fuente: "el.setAttribute('aria-live', 'polite');" },
        { ruta: 'libs/y/y.ts', fuente: "el.setAttribute('role', 'alert');" },
        { ruta: 'libs/z/z.ts', fuente: "el.setAttribute('role', 'dialog');\n// el.setAttribute('aria-live', 'x')" },
      ]),
    ).toEqual(['libs/x/x.ts:1', 'libs/y/y.ts:1']);
  });

  it('el anunciador puede', () => {
    expect(
      regionesPorCodigo([
        { ruta: `arbol/${DUENO_DE_LAS_REGIONES_POR_CODIGO}`, fuente: "r.setAttribute('aria-live', p);" },
      ]),
    ).toEqual([]);
  });
});
