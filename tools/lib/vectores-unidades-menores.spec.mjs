import { describe, expect, it } from 'vitest';

import { cruzarUnidadesMenores } from './vectores-unidades-menores.mjs';

const vectores = [
  { nombre: 'tasa en pesos', moneda: 'COP', importe: 189000, menores: 18900000 },
  { nombre: 'yenes', moneda: 'JPY', importe: 5000, menores: 5000 },
  { nombre: 'medio centavo', moneda: 'USD', importe: 0.125, menores: 12 },
];

const decimales = (m) => ({ JPY: 0 })[m] ?? 2;
const alPar = (x) => {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};
const aMenores = (i, m) => alPar(i * 10 ** decimales(m));
const desdeMenores = (n, m) => n / 10 ** decimales(m);

describe('cruzarUnidadesMenores', () => {
  it('no reporta nada cuando la regla da cada vector (happy)', () => {
    expect(cruzarUnidadesMenores(vectores, aMenores, desdeMenores)).toEqual([]);
  });

  it('reporta lo que «centavos para todas» no da (filter)', () => {
    const fallos = cruzarUnidadesMenores(vectores, (i) => alPar(i * 100), (n) => n / 100);
    expect(fallos.some((f) => f.includes('«yenes»'))).toBe(true);
  });

  it('reporta el medio centavo que una regla mitad-arriba no da (filter)', () => {
    const fallos = cruzarUnidadesMenores(vectores, (i, m) => Math.round(i * 10 ** decimales(m)), desdeMenores);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('«medio centavo»');
  });

  it('sale en rojo sin vectores: un cruce vacío no comprueba nada (empty)', () => {
    expect(cruzarUnidadesMenores([], aMenores, desdeMenores)).toHaveLength(1);
    expect(cruzarUnidadesMenores(undefined, aMenores, desdeMenores)).toHaveLength(1);
  });
});
