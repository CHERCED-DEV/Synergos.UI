import { describe, expect, it } from 'vitest';

import { comisionEnMenores } from './eventos-comision';

/**
 * La regla de la comisión del carrito (ADR 0137 · CMS#194). El cruce contra los vectores de oro
 * del CMS lo hace `tools/vectores-comision.mjs` (G-12), que necesita el repo hermano; acá va el
 * comportamiento que se lee sin él.
 */
describe('comisionEnMenores', () => {
  it('cobra el porcentaje del subtotal: 12 % de 360.000 (happy)', () => {
    expect(comisionEnMenores(36_000_000, 12)).toBe(4_320_000);
  });

  it('no cobra nada sin subtotal o sin porcentaje (empty)', () => {
    expect(comisionEnMenores(0, 12)).toBe(0);
    expect(comisionEnMenores(36_000_000, 0)).toBe(0);
    expect(comisionEnMenores(Number.NaN, 12)).toBe(0);
  });

  it('redondea el medio centavo al par, no hacia arriba como Math.round (filter)', () => {
    expect(comisionEnMenores(5, 10)).toBe(0);
    expect(comisionEnMenores(15, 10)).toBe(2);
    expect(comisionEnMenores(25, 10)).toBe(2);
    expect(Math.round((25 * 10) / 100)).toBe(3);
  });

  it('es exacta con dos decimales en el porcentaje y montos grandes (idempotent)', () => {
    expect(comisionEnMenores(18_000_100, 12.5)).toBe(2_250_012);
    expect(comisionEnMenores(18_000_100, 12.5)).toBe(comisionEnMenores(18_000_100, 12.5));
  });
});
