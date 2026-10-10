import { describe, it, expect } from 'vitest';
import path from 'node:path';

import { avisosDelCms, avisosDelUi, cruzarAvisos, leerRutaDelAviso } from './avisos-de-los-flujos.mjs';

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
      'eventos.compra: el CMS manda el enlace «/eventos/?compra={id}» y ningún participante declara qué parámetro lee (AVISOS_DE_LOS_FLUJOS).',
    ]);
    expect(cruzarAvisos({ cms: new Map(), ui: EVENTOS })).toEqual([
      'eventos.compra: el participante lee ?compra= y el CMS no manda ningún enlace de aviso para ese flujo.',
    ]);
  });
});
