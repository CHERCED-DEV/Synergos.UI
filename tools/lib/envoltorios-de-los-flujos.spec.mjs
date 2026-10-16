import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ENVOLTORIOS_A_MANO, flujosDeLaTabla, revisarEnvoltorios } from './envoltorios-de-los-flujos.mjs';
import { raicesEnDisco } from './frameworks.mjs';

/**
 * Gana el generado (núcleo N3, FR-030 · SC-006). La razón está en la cabecera de
 * `envoltorios-de-los-flujos.mjs`.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const FLUJOS = path.join(REPO, 'vitals/core/src/flujos');
const GENERADOS = path.join(FLUJOS, 'generados');
const CONTRATOS = path.join(REPO, 'vitals/contracts/src/http');

const esFuente = (f) => /\.tsx?$/.test(f) && !/\.(spec|d)\.tsx?$/.test(f);

function arbol(dir, salida = new Map(), base = dir) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|\..*)$/.test(e.name)) arbol(full, salida, base);
    } else if (esFuente(e.name)) {
      salida.set(path.relative(base, full).replaceAll('\\', '/'), readFileSync(full, 'utf8'));
    }
  }
  return salida;
}

const generado = (flujo, funciones) =>
  [
    `export const FLUJO = "${flujo}";`,
    ...funciones.map((f) => `export function ${f}(desde, args) {\n  return pedirAlFlujo(desde, FLUJO, "x", args);\n}`),
  ].join('\n');

/** Un front sintético que cumple: un flujo, su generado, el coordinador y el envoltorio declarado. */
const sano = () => ({
  flujos: ['eventos.compra'],
  generados: new Map([['eventos.compra.ts', generado('eventos.compra', ['abrirEventosCompra'])]]),
  nucleo: new Map([
    ['coordinador.ts', 'export function pedirAlFlujo(desde, flujo, op, args) { return null; }'],
    ['eventos-compra.ts', 'export async function abrirCompraDeEventos(d, c, l) { return abrirEventosCompra(d, { cuerpo: c, llave: l }); }'],
  ]),
  resto: new Map([['elementos/eventos/compra.ts', 'import { abrirEventosCompra } from "@synergos/vitals-core";\nabrirEventosCompra(el, a);']]),
});

describe('gana el generado: el transporte de un flujo sale de su envoltorio generado (núcleo N3)', () => {
  it('el control: un front que cumple no da nada', () => {
    expect(revisarEnvoltorios(sano())).toEqual([]);
  });

  it('un flujo que la puerta expone sin su envoltorio generado es rojo', () => {
    const f = sano();
    f.flujos.push('salud.cita');
    expect(revisarEnvoltorios(f)).toEqual([
      '«salud.cita» lo expone la puerta y no tiene envoltorio generado (generados/salud.cita.ts): regenerar con contrato-http',
    ]);
  });

  it('llamar a pedirAlFlujo fuera de lo generado es rojo, en el núcleo y en un elemento; un comentario no cuenta', () => {
    const f = sano();
    f.nucleo.set('salud-cita.ts', 'export function abrirSalud(d, a) { return pedirAlFlujo(d, "salud.cita", "abrir", a); }');
    f.resto.set('elementos/salud/cita.ts', 'pedirAlFlujo<"salud.cita", "abrir">(el, "salud.cita", "abrir", a);');
    f.resto.set('elementos/salud/nota.ts', '// antes se llamaba a pedirAlFlujo(el, …) aquí');
    expect(revisarEnvoltorios(f)).toEqual([
      'salud-cita.ts llama a pedirAlFlujo: el transporte de un flujo sale de su envoltorio generado',
      'elementos/salud/cita.ts llama a pedirAlFlujo: el transporte de un flujo sale de su envoltorio generado',
    ]);
  });

  it('un envoltorio a mano NUEVO sobre el generado es rojo; el declarado no', () => {
    const f = sano();
    f.nucleo.set('compra-eventos-v2.ts', 'export const abrir = (d, a) => abrirEventosCompra(d, a);');
    expect(revisarEnvoltorios(f)).toEqual([
      'compra-eventos-v2.ts envuelve a mano a uno generado (abrirEventosCompra): un flujo nuevo usa el generado, sin escribir otro',
    ]);
  });

  it('un declarado que ya no existe, o sin generado en el que apoyarse, es rojo', () => {
    const sinFichero = sano();
    sinFichero.nucleo.delete('eventos-compra.ts');
    expect(revisarEnvoltorios(sinFichero)).toEqual([
      'eventos-compra.ts está declarado como envoltorio a mano de «eventos.compra» y no existe: sale de ENVOLTORIOS_A_MANO',
    ]);

    const sinGenerado = sano();
    sinGenerado.flujos = [];
    sinGenerado.generados = new Map();
    expect(revisarEnvoltorios(sinGenerado)).toEqual([
      'eventos-compra.ts envuelve «eventos.compra», que no tiene envoltorio generado en el que apoyarse',
    ]);
  });

  it('los flujos de la puerta se leen de la tabla de ejecución del contrato generado', () => {
    const tabla = [
      'export const OPERACIONES_DE_LA_PUERTA = {',
      '  "eventos.compra": {',
      '    abrir: { metodo: "POST", llave: "requerida", consulta: [] },',
      '  },',
      '  "salud.cita": {',
      '  },',
      '} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;',
    ].join('\n');
    expect(flujosDeLaTabla(tabla)).toEqual(['eventos.compra', 'salud.cita']);
    expect(flujosDeLaTabla('export const OPERACIONES_DE_LA_PUERTA = {} as const satisfies X;')).toEqual([]);
  });
});

describe('gana el generado, en el repo', () => {
  const flujos = [...arbol(CONTRATOS)].filter(([f]) => f.endsWith('.contract.ts')).flatMap(([, fuente]) => flujosDeLaTabla(fuente));
  const generados = arbol(GENERADOS);
  const nucleo = new Map([...arbol(FLUJOS)].filter(([f]) => !f.startsWith('generados/')));
  // Las plataformas como las ve el resto de los gates (`raicesEnDisco`), y `vitals` fuera de los flujos.
  const resto = new Map(
    [...raicesEnDisco(REPO), path.join(REPO, 'vitals')]
      .flatMap((d) => [...arbol(d, new Map(), REPO)])
      .filter(([f]) => !f.startsWith('vitals/core/src/flujos/') && !f.startsWith('vitals/contracts/')),
  );

  it('hay sujeto: la puerta expone flujos, cada uno con su generado, y el resto del front se leyó', () => {
    expect(flujos).toContain('eventos.compra');
    expect([...generados.keys()]).toEqual(expect.arrayContaining(['index.ts', 'eventos.compra.ts']));
    expect(Object.keys(ENVOLTORIOS_A_MANO)).toEqual(['eventos-compra.ts']);
    expect(resto.size).toBeGreaterThan(50);
  });

  it('se cumple: ningún transporte a mano, y el de Eventos se apoya en el generado', () => {
    expect(revisarEnvoltorios({ flujos, generados, nucleo, resto })).toEqual([]);
  });
});
