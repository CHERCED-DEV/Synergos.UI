import { describe, expect, it } from 'vitest';

import { COMPARADOS, MINIMO_DE_VECTORES, cruzarVectores } from './vectores-hipoteca.mjs';

/**
 * Seis vectores con la forma del fichero del CMS. Van seis porque la red de seguridad
 * exige ese mínimo: con menos, todo test de acá mediría el rechazo del mínimo en vez
 * de lo que dice medir.
 */
const vectores = () => [
  { nombre: 'a', price: 300_000_000, downPayment: 60_000_000, termMonths: 240, annualRatePercent: 12, monthly: 2_642_606.72, principal: 240_000_000, conLaUnidadMal: 1_012_098 },
  { nombre: 'b', price: 100_000_000, downPayment: 0, termMonths: 12, annualRatePercent: 12, monthly: 8_884_878.87, principal: 100_000_000, conLaUnidadMal: 8_338_750.99 },
  { nombre: 'c', price: 250_000_000, downPayment: 50_000_000, termMonths: 60, annualRatePercent: 10, monthly: 4_249_408.94, principal: 200_000_000, conLaUnidadMal: 3_341_812.5 },
  { nombre: 'cero', price: 120_000_000, downPayment: 0, termMonths: 120, annualRatePercent: 0, monthly: 1_000_000, principal: 120_000_000, conLaUnidadMal: 1_000_000 },
  { nombre: 'e', price: 300_000_000, downPayment: 60_000_000, termMonths: 180, annualRatePercent: 11, monthly: 2_727_832.64, principal: 240_000_000, conLaUnidadMal: 1_344_424.69 },
  { nombre: 'f', price: 450_000_000, downPayment: 90_000_000, termMonths: 300, annualRatePercent: 12.5, monthly: 3_925_274.89, principal: 360_000_000, conLaUnidadMal: 1_218_910.15 },
];

/** Una calculadora que contesta lo que el vector dice — el caso bueno. */
const buena = (vs) => (req) => {
  const v = vs.find(
    (x) =>
      x.price === req.price &&
      x.downPayment === req.downPayment &&
      x.termMonths === req.termMonths &&
      x.annualRatePercent === req.annualRatePercent,
  );
  return { monthly: v.monthly, principal: v.principal };
};

/** Y una que confunde la unidad, que es el defecto #76 tal cual. */
const conLaUnidadMal = (vs) => (req) => {
  const v = vs.find((x) => x.price === req.price && x.termMonths === req.termMonths);
  return { monthly: v.conLaUnidadMal, principal: v.principal };
};

describe('cruzarVectores', () => {
  it('no reporta nada cuando la calculadora da los números del vector (happy)', () => {
    const vs = vectores();
    expect(cruzarVectores(vs, buena(vs))).toEqual([]);
  });

  it('caza la unidad equivocada y nombra el vector (defecto #76)', () => {
    const vs = vectores();
    const fallos = cruzarVectores(vs, conLaUnidadMal(vs));

    // Cinco de los seis: el de tasa cero no puede distinguirse, y eso es el punto.
    expect(fallos.filter((f) => f.includes('UNIDAD EQUIVOCADA'))).toHaveLength(5);
    expect(fallos.some((f) => f.includes('«cero»'))).toBe(false);
  });

  it('el vector de tasa cero NO cuenta como cobertura de la unidad', () => {
    // Sólo el degenerado. Si el gate se contentara con él, una calculadora con la
    // unidad mal pasaría en verde — por eso existe el mínimo y por eso el mensaje lo
    // dice. Acá se comprueba que el caso se excluye por ser el de tasa cero y no por
    // una comparación aflojada.
    const soloCero = Array.from({ length: MINIMO_DE_VECTORES }, (_, i) => ({
      ...vectores()[3],
      nombre: `cero-${i}`,
    }));
    expect(cruzarVectores(soloCero, conLaUnidadMal(soloCero))).toEqual([]);
  });

  it('rechaza un vector que declara el mismo valor bien y mal SIN ser tasa cero', () => {
    const vs = vectores();
    vs[0] = { ...vs[0], conLaUnidadMal: vs[0].monthly };
    const fallos = cruzarVectores(vs, buena(vs));
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('está mal escrito');
  });

  it('caza una cuota que se desvía, no sólo la unidad (filtro)', () => {
    const vs = vectores();
    const unCentavo = (req) => {
      const base = buena(vs)(req);
      return { ...base, monthly: base.monthly + 0.01 };
    };
    const fallos = cruzarVectores(vs, unCentavo);
    expect(fallos).toHaveLength(6);
    expect(fallos.every((f) => f.includes('monthly esperado'))).toBe(true);
  });

  it('caza el `principal` que el borde no emitía (CMS#167)', () => {
    const vs = vectores();
    const sinCapital = (req) => ({ ...buena(vs)(req), principal: 0 });
    const fallos = cruzarVectores(vs, sinCapital);
    expect(fallos.every((f) => f.includes('principal esperado'))).toBe(true);
    expect(COMPARADOS).toContain('principal');
  });

  // ── la red de seguridad, que es lo que impide el verde sobre el vacío ──
  it.each([
    ['una lista vacía', []],
    ['menos vectores que el mínimo', vectores().slice(0, 3)],
    ['algo que no es una lista', null],
  ])('rechaza %s en vez de pasar en verde', (_, entrada) => {
    const fallos = cruzarVectores(entrada, () => ({ monthly: 0, principal: 0 }));
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('el lector dejó de ver');
  });

  it('reporta con nombre si la calculadora lanza en vez de tumbar el gate', () => {
    const vs = vectores();
    const fallos = cruzarVectores(vs, () => {
      throw new Error('NaN');
    });
    expect(fallos).toHaveLength(6);
    expect(fallos[0]).toContain('la calculadora lanzó');
  });
});
