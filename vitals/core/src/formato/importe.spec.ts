import { describe, expect, it } from 'vitest';
import { aMenores, decimalesDeMoneda, desdeMenores, formatearImporte } from './importe';

// Intl separa el símbolo con un espacio duro (U+00A0); se compara el texto que se lee.
const leido = (texto: string) => texto.replace(/\s/g, ' ');

describe('formatearImporte', () => {
  it('pinta el importe con la moneda que llegó con él, en es-CO y sin decimales', () => {
    expect(leido(formatearImporte(49000, 'COP'))).toBe('$ 49.000');
    expect(leido(formatearImporte(1234567.4, 'COP'))).toBe('$ 1.234.567');
  });

  it('respeta la moneda del dato aunque no sea la del sitio', () => {
    expect(leido(formatearImporte(120, 'USD'))).toBe('US$ 120');
    expect(leido(formatearImporte(120, 'EUR'))).toBe('EUR 120');
  });

  // El defecto que esto cierra: diez copias, y las que no tenían moneda la inventaban ('COP').
  it('sin moneda pinta el número solo, sin inventar una', () => {
    expect(formatearImporte(49000)).toBe('49.000');
    expect(formatearImporte(49000, '')).toBe('49.000');
    expect(formatearImporte(49000, '   ')).toBe('49.000');
    expect(formatearImporte(49000, null)).toBe('49.000');
  });

  it('con decimales pinta los centavos que se cobran, y no rellena los que no hay', () => {
    expect(leido(formatearImporte(22500.12, 'COP', { decimales: 2 }))).toBe('$ 22.500,12');
    expect(leido(formatearImporte(22500, 'COP', { decimales: 2 }))).toBe('$ 22.500');
    expect(formatearImporte(22500.5, '', { decimales: 2 })).toBe('22.500,5');
  });

  it('una moneda que Intl no conoce se pinta como código y número, sin romper la pantalla', () => {
    expect(formatearImporte(1500, 'PUNTOS')).toBe('PUNTOS 1.500');
  });

  it('un importe que no es un número finito no se pinta', () => {
    expect(formatearImporte(Number.NaN, 'COP')).toBe('');
    expect(formatearImporte(Number.POSITIVE_INFINITY, 'COP')).toBe('');
  });

  it('acepta otro locale', () => {
    expect(leido(formatearImporte(1234.5, 'USD', { locale: 'en-US', decimales: 2 }))).toBe('$1,234.5');
  });
});

// Las unidades menores son las de la moneda (ISO-4217), no «centavos para todas»: el servidor
// emite los `*Minor` con la misma tabla (CMS#196). Antes gov y la facturación de ehr mandaban
// pesos con el nombre `*Minor` y la UI dividía por 100: una tasa de 189.000 salía $ 1.890.
describe('unidades menores', () => {
  it('cada moneda con sus decimales', () => {
    expect(decimalesDeMoneda('COP')).toBe(2);
    expect(decimalesDeMoneda('usd')).toBe(2);
    expect(decimalesDeMoneda('JPY')).toBe(0);
    expect(decimalesDeMoneda('CLP')).toBe(0);
    expect(decimalesDeMoneda('KWD')).toBe(3);
  });

  it('sin moneda, o una que Intl no conoce, dos decimales', () => {
    expect(decimalesDeMoneda('')).toBe(2);
    expect(decimalesDeMoneda(null)).toBe(2);
    expect(decimalesDeMoneda('PUNTOS')).toBe(2);
  });

  it('de menores a mayores y de vuelta, según la moneda', () => {
    expect(desdeMenores(18_900_000, 'COP')).toBe(189_000);
    expect(desdeMenores(5_000, 'CLP')).toBe(5_000);
    expect(aMenores(189_000, 'COP')).toBe(18_900_000);
    expect(aMenores(22_500.12, 'COP')).toBe(2_250_012);
    expect(aMenores(5_000, 'JPY')).toBe(5_000);
  });
});

describe('formatearImporte con otro locale', () => {
  it('acepta otro locale', () => {
    expect(leido(formatearImporte(1234.5, 'USD', { locale: 'en-US', decimales: 2 }))).toBe('$1,234.5');
  });
});
