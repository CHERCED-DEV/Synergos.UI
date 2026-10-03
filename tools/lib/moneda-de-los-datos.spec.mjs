import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CASA, GENERICOS, MONEDAS, declaraGenerico, hallazgos, monedasFueraDeLosDatos } from './moneda-de-los-datos.mjs';
import { ficherosTs } from './normalizador-unico.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');

const reglas = (src) => hallazgos(src).map((h) => h.regla);

describe('las formas del defecto, cada una vista', () => {
  // Las cinco son copias literales de lo que había en el árbol antes de CMS#196.
  it('una moneda de respaldo con || o ??', () => {
    expect(reglas("currency: readString(value['currency']).trim() || 'COP',")).toEqual(['respaldo']);
    expect(reglas("const currency = this.items()[0]?.currency ?? 'COP';")).toEqual(['respaldo']);
  });

  it('una constante o un parámetro por defecto', () => {
    expect(reglas("const DEFAULT_CURRENCY = 'COP';")).toEqual(['respaldo']);
    expect(reglas("formatMinor(minorUnits: number, currency = 'COP'): string {")).toEqual(['respaldo']);
  });

  it('una moneda pasada como argumento de respaldo', () => {
    expect(reglas(".map((entry) => normalizeInstructorCourse(entry, 'COP'))")).toEqual(['respaldo']);
    expect(reglas("currency: readString(data, 'currency', 'COP'),")).toEqual(['respaldo']);
  });

  it('cualquier ISO-4217, no sólo el peso', () => {
    expect(reglas("const m = data.currency ?? 'USD';")).toEqual(['respaldo']);
  });

  it('una segunda casa del formato', () => {
    expect(reglas("new Intl.NumberFormat('es-CO', { style: 'currency', currency })")).toEqual(['formato']);
  });
});

describe('lo que NO es el defecto', () => {
  it('un literal que no es una moneda', () => {
    expect(reglas("const metodo = opciones.method ?? 'GET';")).toEqual([]);
  });

  it('un importe de muestra escrito en pesos', () => {
    expect(reglas("{ id: 'L-1', price: 850_000_000, currency: 'COP', status: 'active' },")).toEqual([]);
  });

  it('un comentario que explica el defecto', () => {
    expect(reglas("// antes: currency || 'COP' y style: 'currency' en cada vertical")).toEqual([]);
  });
});

describe('el repo de verdad', () => {
  it('la casa existe, las monedas salen de Intl y el genérico nombrado sigue declarado', () => {
    // La red: sin casa o sin monedas el cruce pasaría en verde sin mirar nada; un genérico que
    // ya no existe es una excepción que se pudrió.
    expect(existsSync(path.join(REPO, CASA, 'importe.ts'))).toBe(true);
    expect(MONEDAS.has('COP') && MONEDAS.has('USD') && MONEDAS.size > 100).toBe(true);
    const declaran = ficherosTs(REPO).filter((f) => declaraGenerico(readFileSync(f, 'utf8')));
    expect(declaran.length, `nadie declara ${GENERICOS.join(', ')}: la excepción se pudrió`).toBeGreaterThan(0);
  });

  it('ningún fuente compila una moneda ni formatea importes fuera de vitals/core/src/formato', () => {
    const fuera = monedasFueraDeLosDatos(REPO).map((h) => `${h.regla} ${h.fichero}:${h.linea} · ${h.texto}`);
    expect(fuera).toEqual([]);
  });
});
