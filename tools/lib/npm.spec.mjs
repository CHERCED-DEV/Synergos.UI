import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { invocacionDeNpm, ejecutarNpm, correrNpm, lanzarNpm } from './npm.mjs';
import { raicesEnDisco } from './frameworks.mjs';
import { ROOT } from './synergos-config.mjs';
import { sinComentarios } from './vitals-purity.mjs';

/**
 * El lanzador de `npm` (#79).
 *
 * Medido en Windows 11 con Node 20.19: `npm run setup` → `spawnSync npm ENOENT`. En Windows
 * `npm` es `npm.cmd` y desde Node 20.12 lanzar un `.cmd` exige `shell: true`. Ningún test lo
 * vio porque los cinco workflows corren en Linux y el gate del camino de entrada
 * (`setup-completo`) comprueba que `setup` NOMBRE cada plataforma, no que la llamada CORRA.
 *
 * Por eso aquí hay tests que lanzan `npm` DE VERDAD: son los que se ponen rojos en un job
 * `windows-latest` si alguien le quita el `shell` al lanzador.
 */

describe('cómo se lanza npm en cada sistema', () => {
  it('en Windows, con intérprete — sin él, un `.cmd` da ENOENT desde Node 20.12', () => {
    expect(invocacionDeNpm(['ci'], 'win32').opciones).toEqual({ shell: true });
  });

  it('fuera de Windows, SIN intérprete: npm es un ejecutable y no hace falta', () => {
    for (const plataforma of ['linux', 'darwin']) {
      expect(invocacionDeNpm(['ci'], plataforma).opciones, plataforma).toEqual({});
    }
  });

  it('los argumentos llegan tal cual, y en una COPIA', () => {
    const args = ['run', '--prefix', 'carpeta/de/una/plataforma', 'build:runtime'];
    const { comando, args: salida } = invocacionDeNpm(args, 'win32');
    expect(comando).toBe('npm');
    expect(salida).toEqual(args);
    expect(salida).not.toBe(args);
  });
});

describe('un argumento que el intérprete reinterpretaría se RECHAZA, en todos los sistemas', () => {
  // Con `shell: true` Node concatena los argumentos en una línea de cmd.exe SIN escaparlos: es
  // el agujero del CVE-2024-27980. Se rechaza también en Linux, donde no hay intérprete, porque
  // un argumento que en Linux pasa y en Windows se parte es la clase de defecto de este ticket.
  const peligrosos = ['dos palabras', 'a&b', 'a|b', '"comillas"', "'simples'", '%PATH%', 'a^b', 'a>b', 'a<b', 'a;b', 'a,b', ''];

  it.each(peligrosos)('%j', (arg) => {
    for (const plataforma of ['win32', 'linux']) {
      expect(() => invocacionDeNpm(['run', arg], plataforma), plataforma).toThrow(/reinterpretaría/);
    }
  });

  it('y un no-string también', () => {
    expect(() => invocacionDeNpm(['run', 42])).toThrow(/reinterpretaría/);
  });

  it('npm sin argumentos no es una llamada', () => {
    expect(() => invocacionDeNpm([])).toThrow(/sin argumentos/);
  });

  it('las formas que usa tools/ pasan — la regla no le cuesta nada a nadie hoy', () => {
    for (const args of [
      ['ci'],
      ['ci', '--no-audit', '--no-fund'],
      ['run', 'build:vitals'],
      ['run', 'build:runtime'],
      ['run', '--prefix', 'carpeta/de/una/plataforma', 'build:runtime'],
      ['run', 'test:contratos'],
    ]) {
      expect(() => invocacionDeNpm(args, 'win32'), args.join(' ')).not.toThrow();
    }
  });
});

// Estos tres arrancan un npm DE VERDAD, así que no pueden tener el tope de 5 s de un test en
// memoria: arrancar npm en Windows con la máquina cargada pasó de 5 s en la corrida integrada
// (`correrNpm` en rojo por tiempo, 26/26 en verde corrido solo). El tope largo no afloja lo que
// prueban: un ENOENT o un estado distinto de 0 fallan igual, y enseguida.
describe('npm CORRE en este sistema — la llamada, no la lista', { timeout: 60_000 }, () => {
  // Estos tres son los que el job `windows-latest` pone en rojo si el lanzador pierde el
  // `shell`: en Linux pasan con o sin él, en Windows dan ENOENT sin él.

  it('ejecutarNpm espera y devuelve el estado', () => {
    const r = ejecutarNpm(['--version'], { stdio: 'pipe', encoding: 'utf8' });
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('correrNpm LANZA si npm sale distinto de 0 — setup y build-cdn cuentan con eso', () => {
    // Un `npm ci` que falla tiene que parar el setup, no dejarlo seguir con la plataforma
    // siguiente y anunciar «listo».
    expect(() =>
      correrNpm(['run', 'este-script-no-existe'], { cwd: ROOT, stdio: 'pipe' }),
    ).toThrow(/salió con/);
  });

  it('lanzarNpm arranca el proceso — la forma de dev:cdn al rehacer el runtime', async () => {
    const hijo = lanzarNpm(['--version'], { stdio: 'pipe' });
    const codigo = await new Promise((ok, mal) => {
      hijo.on('error', mal);
      hijo.on('exit', ok);
    });
    expect(codigo).toBe(0);
  });
});

describe('NADIE más lanza npm por su cuenta', () => {
  // El barrido que decidió el arreglo tuvo que hacerse DOS veces. Por la forma
  // —`execFileSync('npm'`, `spawn('npm'`— salían tres llamadas; por el literal `'npm'` en
  // cualquier posición, ocho: cinco pasaban por un helper de `build-cdn.mjs`
  // (`correr('npm', …)`) cuyo cuerpo no nombraba a npm. Así que el censo mira el LITERAL, que
  // ve también la llamada indirecta. `npx` entra por la misma razón: también es un `.cmd`.
  //
  // Se barren `tools/` y el `tools/` de CADA plataforma, derivadas del disco.
  const carpetas = [join(ROOT, 'tools'), join(ROOT, 'tools', 'lib'), ...raicesEnDisco(ROOT).map((r) => join(r, 'tools'))];
  const ficheros = carpetas
    .filter((c) => existsSync(c))
    .flatMap((c) =>
      readdirSync(c)
        .filter((f) => f.endsWith('.mjs') && !f.endsWith('.spec.mjs'))
        .map((f) => join(c, f)),
    );
  const porTi = (f) => relative(ROOT, f).split('\\').join('/');

  it('hay herramientas que barrer — sin sujeto, lo de abajo pasa en verde sin mirar', () => {
    expect(ficheros.length).toBeGreaterThan(40);
    expect(ficheros.map(porTi)).toContain('tools/setup.mjs');
  });

  it('el único literal `npm`/`npx` fuera de los comentarios está en lib/npm.mjs', () => {
    const conLiteral = ficheros
      .filter((f) => /(['"`])np[mx]\1/.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map(porTi);
    expect(conLiteral, 'lanza npm sin el lanzador: en Windows eso es ENOENT (#79)').toEqual(['tools/lib/npm.mjs']);
  });

  it.each(['tools/setup.mjs', 'tools/build-cdn.mjs', 'tools/dev-cdn.mjs'])(
    '%s está ENCHUFADO al lanzador',
    (fichero) => {
      // La otra mitad: que no lance npm por su cuenta no dice que lo lance por aquí. Sin esto,
      // borrar la llamada entera también dejaría el censo en verde.
      const src = sinComentarios(readFileSync(join(ROOT, fichero), 'utf8'));
      expect(src).toMatch(/from '\.\/lib\/npm\.mjs'/);
      expect(src).toMatch(/\b(correrNpm|ejecutarNpm|lanzarNpm)\(/);
    },
  );
});
