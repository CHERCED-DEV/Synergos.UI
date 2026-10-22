import { describe, it, expect } from 'vitest';
import path from 'node:path';

import {
  avisosDelCms,
  avisosDelUi,
  cruzarAvisos,
  cruzarDeclarados,
  derivarAviso,
  generarAvisos,
  leerRutaDelAviso,
} from './avisos-de-los-flujos.mjs';

/**
 * El enlace del aviso y su participante dicen el mismo parámetro (ADR 0140 F4, G-15). El cruce con el
 * CMS de verdad corre en `contracts:validate` y en `design-gates-ui.yml`; acá, su lógica y la tabla
 * del UI leída como la lee el gate.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const EVENTOS = { 'eventos.compra': { parametro: 'compra', marcador: 'id' } };
const conRuta = (ruta) => ({ Synergos: { Puerta: { Flujos: { 'eventos.compra': { Acceso: 'Miembro', Aviso: { Ruta: ruta } } } } } });

describe('el cruce del enlace del aviso (G-15)', () => {
  it('la tabla del UI se lee como la compila el participante, y declara la compra de Eventos', async () => {
    const ui = await avisosDelUi(path.join(REPO, 'vitals/core/src/flujos/avisos.ts'));
    expect(Object.keys(ui)).toContain('eventos.compra');
    expect(ui['eventos.compra']).toEqual({ parametro: expect.any(String), marcador: expect.any(String) });
  });

  it('lee las rutas de aviso del appsettings del CMS, sólo las que tienen una', () => {
    const cms = avisosDelCms({
      Synergos: { Puerta: { Flujos: { 'eventos.compra': { Aviso: { Ruta: '/eventos/?compra={id}' } }, 'otro.flujo': { Acceso: 'Miembro' } } } },
    });
    expect([...cms]).toEqual([['eventos.compra', '/eventos/?compra={id}']]);
    expect(leerRutaDelAviso('/eventos/?compra={id}')).toEqual({ camino: '/eventos/', consulta: new Map([['compra', '{id}']]) });
  });

  it('la ruta de hoy cruza', () => {
    expect(cruzarAvisos({ cms: avisosDelCms(conRuta('/eventos/?compra={id}')), ui: EVENTOS })).toEqual([]);
  });

  it('un parámetro renombrado, una ruta sin consulta o un marcador cambiado no cruzan', () => {
    for (const ruta of ['/?id={id}', '/compras/{id}', '/eventos/?compra={saga}', '/eventos/?pedido={id}']) {
      expect(cruzarAvisos({ cms: avisosDelCms(conRuta(ruta)), ui: EVENTOS }), ruta).toEqual([
        `eventos.compra: el participante lee ?compra={id} y la ruta del CMS es «${ruta}».`,
      ]);
    }
  });

  it('en los dos sentidos: un aviso que nadie lee, y un parámetro que nadie manda', () => {
    expect(cruzarAvisos({ cms: avisosDelCms(conRuta('/eventos/?compra={id}')), ui: {} })).toEqual([
      'eventos.compra: el CMS manda el enlace «/eventos/?compra={id}» y la tabla del UI no dice qué parámetro lee (regenerar con contrato-http).',
    ]);
    expect(cruzarAvisos({ cms: new Map(), ui: EVENTOS })).toEqual([
      'eventos.compra: el participante lee ?compra= y el CMS no manda ningún enlace de aviso para ese flujo.',
    ]);
  });
});

describe('la tabla del UI derivada del CMS (núcleo N3, FR-032)', () => {
  it('el aviso es el ÚNICO parámetro de la consulta que lleva un marcador', () => {
    expect(derivarAviso('/eventos/?compra={id}')).toEqual({ parametro: 'compra', marcador: 'id' });
    expect(derivarAviso('/?id={id}')).toEqual({ parametro: 'id', marcador: 'id' });
    expect(derivarAviso('/citas/?vista=lista&cita={numero}')).toEqual({ parametro: 'cita', marcador: 'numero' });
    // Sin consulta, sin marcador, o con dos: no se adivina.
    expect(derivarAviso('/compras/{id}')).toBeNull();
    expect(derivarAviso('/eventos/?compra=1')).toBeNull();
    expect(derivarAviso('/x/?a={id}&b={numero}')).toBeNull();
  });

  it('la tabla generada sale en orden y determinista, y una ruta sin aviso es un error', () => {
    const cms = new Map([['salud.cita', '/salud/?cita={id}'], ['eventos.compra', '/eventos/?compra={id}']]);
    const { errores, texto } = generarAvisos(cms);
    expect(errores).toEqual([]);
    expect(texto).toContain(
      [
        'export const AVISOS_GENERADOS = {',
        '  "eventos.compra": { parametro: "compra", marcador: "id" },',
        '  "salud.cita": { parametro: "cita", marcador: "id" },',
        '} as const satisfies Readonly<Partial<Record<Flujo, AvisoDelFlujo>>>;',
      ].join('\n'),
    );
    expect(generarAvisos(new Map([...cms].reverse())).texto).toBe(texto);
    expect(generarAvisos(new Map([['eventos.compra', '/eventos/{id}']])).errores).toHaveLength(1);
  });

  it('la tabla a mano dice lo mismo que la generada, o es rojo', () => {
    const generados = { 'eventos.compra': { parametro: 'compra', marcador: 'id' } };
    expect(cruzarDeclarados({ generados, declarados: EVENTOS })).toEqual([]);
    expect(cruzarDeclarados({ generados, declarados: { 'eventos.compra': { parametro: 'pedido', marcador: 'id' } } })).toEqual([
      'eventos.compra: AVISOS_DE_LOS_FLUJOS dice ?pedido={id} y el CMS, ?compra={id}.',
    ]);
    expect(cruzarDeclarados({ generados: {}, declarados: EVENTOS })).toEqual([
      'eventos.compra: AVISOS_DE_LOS_FLUJOS lo declara y no sale de ninguna ruta del CMS (AVISOS_GENERADOS).',
    ]);
  });

  it('en el repo: la tabla generada se lee como la compila el participante y la a mano coincide con ella', async () => {
    const generados = await avisosDelUi(path.join(REPO, 'vitals/core/src/flujos/generados/avisos.ts'), 'AVISOS_GENERADOS');
    const declarados = await avisosDelUi(path.join(REPO, 'vitals/core/src/flujos/avisos.ts'));
    expect(Object.keys(generados)).toContain('eventos.compra');
    expect(cruzarDeclarados({ generados, declarados })).toEqual([]);
  });
});
