import { describe, expect, it } from 'vitest';

import { RECHAZOS_DE_LOS_FLUJOS } from './rechazos-de-los-flujos';
import { RECHAZOS_GENERICOS, clasificarRechazo } from './rechazos';
import type { RechazoDelFlujo } from './transporte';

const rechazo = (code: string): RechazoDelFlujo => ({ code, status: 503, transient: false, detail: '', origen: 'servidor', extra: {} });

describe('los rechazos de cada flujo, declarados por flujo (núcleo N3)', () => {
  it('la clasificación genérica sólo nombra códigos de la puerta y del cliente', () => {
    for (const code of [...RECHAZOS_GENERICOS.sesion, ...RECHAZOS_GENERICOS.noDisponible]) {
      expect(code, code).toMatch(/^(puerta|cliente)\./);
    }
  });

  it('cada código de un flujo va con el espacio de su vertical, y clasifica como antes', () => {
    const declarados = Object.entries(RECHAZOS_DE_LOS_FLUJOS);
    expect(declarados.length).toBeGreaterThan(0);
    for (const [flujo, rechazos] of declarados) {
      const vertical = flujo.split('.')[0];
      for (const code of rechazos.noDisponible) {
        expect(code, `${flujo}: ${code}`).toMatch(new RegExp(`^${vertical}\\.`));
        expect(clasificarRechazo(rechazo(code)), code).toBe('no_disponible');
      }
    }
  });

  it('un código de un vertical que no está declarado sigue siendo «el negocio dijo que no»', () => {
    expect(clasificarRechazo(rechazo('eventos.agotado'))).toBe('negado');
  });
});
