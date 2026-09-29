import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { tramosDeTest, elegirTramos, correrTramos, resumen } from './tramos-de-test.mjs';
import { ROOT } from './synergos-config.mjs';

/**
 * `npm test` corre TODOS los tramos y agrega (#79).
 *
 * Con `test:a && test:b && …`, el primer rojo era el único rojo: en Windows, 4 rojos de separador
 * en `test:tools` dejaban sin correr 1.601 tests. El caso que importa es el del medio: un tramo
 * en rojo NO puede esconder a los que vienen detrás.
 */

const CINCO = ['test:uno', 'test:dos', 'test:tres', 'test:cuatro', 'test:cinco'];

describe('los tramos salen del package.json', () => {
  it('son los `test:*`, en el orden declarado — y las claves de comentario no cuentan', () => {
    const scripts = {
      build: 'x',
      pretest: 'node tools/setup.mjs --verificar',
      test: 'node tools/test-todo.mjs',
      'test:b': 'y',
      '// test:c — un comentario con forma de tramo': '',
      'test:a': 'z',
      lint: 'w',
    };
    expect(tramosDeTest(scripts)).toEqual(['test:b', 'test:a']);
  });

  it('sin scripts no hay tramos, y ELEGIR sobre cero es un error, no un verde', () => {
    expect(tramosDeTest(undefined)).toEqual([]);
    expect(() => elegirTramos([])).toThrow(/ningún script/);
  });
});

describe('--solo elige, y un nombre que no existe NO se ignora', () => {
  it('sin --solo, todos', () => {
    expect(elegirTramos(CINCO)).toEqual(CINCO);
  });

  it('con --solo, esos, en el orden DECLARADO y no en el pedido', () => {
    expect(elegirTramos(CINCO, 'test:cuatro, test:dos')).toEqual(['test:dos', 'test:cuatro']);
  });

  it('un nombre mal escrito es un error: correr cero tramos saldría 0 y se leería verde', () => {
    expect(() => elegirTramos(CINCO, 'test:dos,test:sies')).toThrow(/test:sies/);
  });

  it('un --solo vacío también', () => {
    expect(() => elegirTramos(CINCO, '')).toThrow(/vacío/);
  });
});

describe('un tramo en rojo NO esconde a los siguientes', () => {
  it('EL CASO: el segundo falla y los cinco corren', () => {
    const corridos = [];
    const resultados = correrTramos(CINCO, (t) => {
      corridos.push(t);
      return t === 'test:dos' ? 1 : 0;
    });

    expect(corridos).toEqual(CINCO);
    expect(resultados.map((r) => [r.tramo, r.codigo])).toEqual([
      ['test:uno', 0], ['test:dos', 1], ['test:tres', 0], ['test:cuatro', 0], ['test:cinco', 0],
    ]);
  });

  it('un tramo que LANZA (no pudo ni arrancar) cuenta como rojo, y tampoco para la fila', () => {
    const corridos = [];
    const resultados = correrTramos(CINCO, (t) => {
      corridos.push(t);
      if (t === 'test:uno') throw new Error('spawn npm ENOENT');
      return 0;
    });
    expect(corridos).toEqual(CINCO);
    expect(resultados[0].codigo).toBe(1);
  });

  it('un código que no es entero (proceso matado por señal: status null) es rojo', () => {
    const [r] = correrTramos(['test:uno'], () => null);
    expect(r.codigo).toBe(1);
  });

  it('mide cuánto tarda cada uno, con el reloj que le den', () => {
    let t = 0;
    const [r] = correrTramos(['test:uno'], () => { t += 2500; return 0; }, () => t);
    expect(r.ms).toBe(2500);
  });
});

describe('el resumen dice cada tramo y sale 1 si alguno falló', () => {
  const verdes = CINCO.map((tramo) => ({ tramo, codigo: 0, ms: 1000 }));

  it('todos en verde → 0', () => {
    const { lineas, codigo } = resumen(verdes);
    expect(codigo).toBe(0);
    expect(lineas.at(-1)).toMatch(/5 de 5 tramos en verde/);
  });

  it('uno en rojo en el MEDIO → 1, lo nombra, y los de detrás siguen en el resumen', () => {
    const conRojo = verdes.map((r) => (r.tramo === 'test:dos' ? { ...r, codigo: 1 } : r));
    const { lineas, codigo } = resumen(conRojo);
    expect(codigo).toBe(1);
    expect(lineas.at(-1)).toMatch(/1 de 5 tramos en rojo: test:dos\./);
    for (const tramo of CINCO) expect(lineas.some((l) => l.includes(tramo)), tramo).toBe(true);
    expect(lineas.find((l) => l.includes('test:dos'))).toMatch(/✗.*salió 1/);
  });

  it('cero resultados es un FALLO, no «todo verde»', () => {
    expect(resumen([]).codigo).toBe(1);
  });
});

describe('npm test está ENCHUFADO al runner — sobre el package.json de verdad', () => {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  it('`test` lanza el runner y ya no encadena con &&', () => {
    expect(scripts.test).toMatch(/tools\/test-todo\.mjs/);
    expect(scripts.test).not.toContain('&&');
  });

  it('hay tramos que correr — sin sujeto, lo de arriba pasa en verde sin mirar', () => {
    expect(tramosDeTest(scripts).length).toBeGreaterThanOrEqual(5);
    expect(tramosDeTest(scripts)).toContain('test:tools');
  });

  it('ningún tramo vuelve a llamar a `npm test`: sería una recursión sin fondo', () => {
    const recursivos = tramosDeTest(scripts).filter((t) => /\bnpm (run )?test\b(?!:)|test-todo/.test(scripts[t]));
    expect(recursivos).toEqual([]);
  });
});
