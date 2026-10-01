import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  TOPES_DECLARADOS,
  configsDeVitest,
  revisarEsperas,
  specsDelRepo,
  topesExplicitos,
  topesGlobales,
  vueltasEnBucle,
} from './esperas-de-los-specs.mjs';

/**
 * Cuánto puede tardar un test y quién lo decide (#84). La cabecera de
 * `esperas-de-los-specs.mjs` cuenta el censo que lo decidió; acá se ve fallar cada
 * mitad por separado.
 */

const REPO = path.resolve(import.meta.dirname, '../..');

describe('las esperas de los specs, contra el árbol de verdad (#84)', () => {
  const resultado = revisarEsperas(REPO);

  it('hay specs y configuraciones que mirar — sin sujeto, lo de abajo pasa en verde sin mirar', () => {
    // 242 de Angular + los de tools/ + vitals/ + preact. Medido el 2026-10-01: 287.
    expect(specsDelRepo(REPO).length).toBeGreaterThanOrEqual(280);
    // La de la raíz y la de cada plataforma.
    expect(configsDeVitest(REPO).length).toBeGreaterThanOrEqual(3);
  });

  it('ninguna configuración de vitest sube el tope de TODOS los tests', () => {
    expect(
      resultado.globales,
      'Subir el testTimeout global esconde el próximo test lento, y uno colgado falla igual, ' +
        'sólo que más tarde. Si un fichero necesita más, lo declara él, con su razón (#84):\n  ' +
        resultado.globales.join('\n  '),
    ).toEqual([]);
  });

  it('todo tope explícito está en TOPES_DECLARADOS con su razón — y ninguna entrada sobra', () => {
    expect(
      resultado.sinDeclarar,
      'Un tope propio sin razón escrita es subir el global a escondidas. Declaralo en ' +
        'TOPES_DECLARADOS (tools/lib/esperas-de-los-specs.mjs) diciendo QUÉ cuesta el tiempo, ' +
        'medido:\n  ' + resultado.sinDeclarar.join('\n  '),
    ).toEqual([]);
    expect(resultado.sobrantes, 'una excepción que sobra deja de leerse').toEqual([]);
  });

  it.each(Object.entries(TOPES_DECLARADOS))('%s dice por qué', (_, { razon }) => {
    expect(razon.length).toBeGreaterThan(60);
  });

  it('ningún spec da vueltas de setTimeout(0) en un bucle propio: usa `asentar`', () => {
    expect(
      resultado.bucles,
      'Cada vuelta de setTimeout(0) cuesta un tick del sistema en Windows (~15,6 ms): 186 ' +
        'vueltas eran 2,8 s del ciclo de matrícula de academy. La vuelta barata con la misma ' +
        'semántica es `asentar`, en las tools/ de la plataforma (#84):\n  ' +
        resultado.bucles.join('\n  '),
    ).toEqual([]);
  });
});

describe('el detector de topes', () => {
  it('caza el tope de un describe, de un it con opciones y del número detrás de la función', () => {
    const fuente = [
      "describe('grupo', { timeout: 15_000 }, () => {",
      "  it('uno', { timeout: 9000 }, async () => {});",
      "  it('dos', async () => {}, 7000);",
      '});',
    ].join('\n');
    expect(topesExplicitos(fuente).map((t) => t.tope)).toEqual([15000, 9000, 7000]);
  });

  it('caza las variantes encadenadas: describe.each(...)(…) e it.concurrent', () => {
    const fuente = [
      "describe.each([1, 2])('n=%s', { timeout: 1234 }, () => {",
      "  it.concurrent('x', { timeout: 4321 }, async () => {});",
      '});',
    ].join('\n');
    expect(topesExplicitos(fuente).map((t) => t.tope)).toEqual([1234, 4321]);
  });

  it('caza vi.setConfig con testTimeout o hookTimeout', () => {
    expect(topesExplicitos('vi.setConfig({ testTimeout: 30000 });').map((t) => t.tope)).toEqual([30000]);
    expect(topesExplicitos('vi.setConfig({ hookTimeout: 20000 });').map((t) => t.tope)).toEqual([20000]);
  });

  it('NO confunde la espera de una condición con el tope de un test', () => {
    // `vi.waitFor` espera hasta que algo pase; el `timeout` es suyo, no del test. Por
    // texto se ven iguales: por eso el detector lee el AST.
    const fuente = [
      "it('espera', async () => {",
      '  await vi.waitFor(() => expect(1).toBe(1), { timeout: 2000, interval: 20 });',
      '  await new Promise((r) => setTimeout(r, 160));',
      '});',
    ].join('\n');
    expect(topesExplicitos(fuente)).toEqual([]);
  });
});

describe('el detector de vueltas en bucle', () => {
  it('caza el helper de antes, el que cada vertical copiaba', () => {
    const helper = [
      'async function flushMicrotasks(times = 12) {',
      '  for (let i = 0; i < times; i += 1) {',
      '    await new Promise((resolve) => setTimeout(resolve, 0));',
      '    await Promise.resolve();',
      '  }',
      '}',
    ].join('\n');
    expect(vueltasEnBucle(helper)).toEqual([3]);
  });

  it('y el setTimeout SIN plazo, que también es una vuelta', () => {
    expect(vueltasEnBucle('while (x) { await new Promise((r) => setTimeout(r)); }')).toEqual([1]);
  });

  it('una vuelta suelta no cuenta, y un plazo en un bucle tampoco: no es una vuelta', () => {
    expect(vueltasEnBucle('await new Promise((r) => setTimeout(r, 0));')).toEqual([]);
    expect(vueltasEnBucle('for (const x of xs) { await new Promise((r) => setTimeout(r, 160)); }')).toEqual([]);
  });
});

describe('el detector de topes globales', () => {
  it('caza testTimeout y hookTimeout en una configuración de vitest', () => {
    const config = "export default defineConfig({ test: { testTimeout: 20000, hookTimeout: 30000 } });";
    expect(topesGlobales(config).map((t) => t.clave)).toEqual(['testTimeout', 'hookTimeout']);
  });
});

/**
 * El CRUCE, sobre un árbol en disco (regla 28: un censo es un dato; lo que se prueba es
 * la función que lo consume). La plataforma se llama por variable: el censo de
 * `frameworks.spec.mjs` no admite `platforms/<literal>` en un spec de `tools/lib`.
 */
describe('el cruce, sobre un árbol con la forma del repo', () => {
  let raiz;
  afterEach(() => raiz && rmSync(raiz, { recursive: true, force: true }));

  const PLATAFORMA = 'demo';
  /** La ruta relativa del spec del fixture, armada sin literal de plataforma. */
  const SPEC = ['platforms', PLATAFORMA, 'apps', 'x', 'x.spec.ts'].join('/');

  function arbol({ spec, config = 'export default {};' }) {
    raiz = mkdtempSync(path.join(tmpdir(), 'esperas-'));
    const dir = path.join(raiz, 'platforms', PLATAFORMA);
    mkdirSync(path.join(dir, 'apps', 'x'), { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{}');
    writeFileSync(path.join(dir, 'vitest.config.ts'), config);
    writeFileSync(path.join(dir, 'apps', 'x', 'x.spec.ts'), spec);
    return raiz;
  }

  it('un tope sin declarar rompe, y declarado con la misma cifra pasa', () => {
    const r = arbol({ spec: "describe('v', { timeout: 15000 }, () => {});" });
    expect(revisarEsperas(r, {}).sinDeclarar).toHaveLength(1);
    const declarados = { [SPEC]: { tope: 15000, razon: 'r' } };
    expect(revisarEsperas(r, declarados).sinDeclarar).toEqual([]);
    expect(revisarEsperas(r, declarados).sobrantes).toEqual([]);
  });

  it('declarado con OTRA cifra no pasa: el censo dice cuánto, no sólo quién', () => {
    const r = arbol({ spec: "describe('v', { timeout: 30000 }, () => {});" });
    expect(revisarEsperas(r, { [SPEC]: { tope: 15000, razon: 'r' } }).sinDeclarar).toHaveLength(1);
  });

  it('una entrada cuyo fichero ya no declara el tope sobra', () => {
    const r = arbol({ spec: "describe('v', () => {});" });
    expect(revisarEsperas(r, { [SPEC]: { tope: 15000, razon: 'r' } }).sobrantes).toHaveLength(1);
  });

  it('la configuración de la PLATAFORMA también cuenta, no sólo la de la raíz', () => {
    const r = arbol({ spec: '', config: 'export default { test: { testTimeout: 20000 } };' });
    expect(revisarEsperas(r, {}).globales).toHaveLength(1);
  });

  it('el helper de vueltas en un spec de la plataforma se ve', () => {
    const r = arbol({ spec: 'for (;;) { await new Promise((r) => setTimeout(r, 0)); }' });
    expect(revisarEsperas(r, {}).bucles).toEqual([`${SPEC}:1`]);
  });
});
