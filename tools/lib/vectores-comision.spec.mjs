import { describe, expect, it } from 'vitest';

import { cruzarComision } from './vectores-comision.mjs';

const vectores = [
  { nombre: 'dos generales', subtotal: 360000, feePercent: 12, fee: 43200 },
  { nombre: 'medio centavo', subtotal: 0.25, feePercent: 10, fee: 0.02 },
];

describe('cruzarComision', () => {
  it('no reporta nada cuando la regla da cada vector (happy)', () => {
    const alPar = (s, p) => {
      const n = s * Math.round(p * 100);
      const q = Math.floor(n / 10000);
      const doble = (n - q * 10000) * 2;
      return doble === 10000 ? (q % 2 === 0 ? q : q + 1) : doble > 10000 ? q + 1 : q;
    };
    expect(cruzarComision(vectores, alPar)).toEqual([]);
  });

  it('reporta el vector que una regla mitad-arriba no da (filter)', () => {
    const fallos = cruzarComision(vectores, (s, p) => Math.round((s * p) / 100));
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('«medio centavo»');
  });

  it('sale en rojo sin vectores: un cruce vacío no comprueba nada (empty)', () => {
    expect(cruzarComision([], () => 0)).toHaveLength(1);
    expect(cruzarComision(undefined, () => 0)).toHaveLength(1);
  });
});
