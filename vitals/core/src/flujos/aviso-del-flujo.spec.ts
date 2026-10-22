import { describe, expect, it } from 'vitest';

import { avisoDelFlujo } from './aviso-del-flujo';
import { AVISOS_DE_LOS_FLUJOS } from './avisos';
import { AVISOS_GENERADOS } from './generados/avisos';

describe('el aviso de un flujo (núcleo N3, FR-032)', () => {
  it('sale de la tabla generada de las rutas del CMS, y la de antes dice lo mismo', () => {
    expect(avisoDelFlujo('eventos.compra')).toEqual({ parametro: 'compra', marcador: 'id' });
    expect(avisoDelFlujo('eventos.compra')).toBe(AVISOS_GENERADOS['eventos.compra']);
    expect(AVISOS_DE_LOS_FLUJOS['eventos.compra']).toEqual(AVISOS_GENERADOS['eventos.compra']);
  });
});
