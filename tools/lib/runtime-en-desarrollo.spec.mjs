import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MAPA_DEL_RUNTIME,
  arrancarRuntimeDeDesarrollo,
  huellaDeEntradas,
  runtimeCompleto,
} from './runtime-en-desarrollo.mjs';
import { ROOT } from './synergos-config.mjs';
import { sinComentarios } from './vitals-purity.mjs';

/**
 * `dev:cdn` en un árbol sin `dist/` (#88).
 *
 * Medido en un worktree recién creado, con `npm run setup` hecho: `dev:cdn` anunciaba
 * «el runtime no está compilado — construyéndolo (una vez)…» y moría a los 2 s con
 * «sg-core.js not found», porque construía el runtime ANTES del build que deja sus
 * entradas. La segunda corrida no moría: `build-runtime` había dejado la carpeta de la
 * versión VACÍA, `dev-cdn` preguntaba si la carpeta existía, y servía un runtime que
 * contestaba 404.
 *
 * Estos specs arrancan desde un árbol SIN `dist/` en disco, con un build y un
 * `build-runtime` de mentira que se portan como los reales: el segundo crea su carpeta
 * antes de mirar sus entradas y falla si no están.
 */

const FICHEROS = ['ng-core.js', 'sg-core.js', 'sg-shared.js'];
const VERSION = '9.9.9';

let raiz;
let dist;
let libs;
let entradas;
let dirRuntime;
let llamadas;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'q2-runtime-'));
  dist = join(raiz, 'build-de-los-elementos', 'dist');
  libs = join(dist, 'libs');
  entradas = [join(libs, 'sg-core.js'), join(libs, 'sg-shared.js')];
  dirRuntime = join(raiz, 'dist', 'runtime', 'x', VERSION);
  llamadas = [];
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

const io = { existe: existsSync, leer: (p) => readFileSync(p), unir: join };

/** Lo que deja el build de los elementos: sus dos libs y un bundle. */
function escribirBuild(contenido) {
  mkdirSync(libs, { recursive: true });
  mkdirSync(join(dist, 'badge', 'browser'), { recursive: true });
  writeFileSync(join(libs, 'sg-core.js'), `core ${contenido}`);
  writeFileSync(join(libs, 'sg-shared.js'), `shared ${contenido}`);
  writeFileSync(join(dist, 'badge', 'browser', 'main.js'), 'badge');
}

/**
 * Un `build-runtime` con la forma del real: crea la carpeta de la versión ANTES de
 * mirar sus entradas (así deja la carpeta vacía cuando falla) y copia las libs.
 */
function buildRuntimeFalso({ espera = null } = {}) {
  return async () => {
    const habiaEntradas = entradas.every((e) => existsSync(e));
    llamadas.push({ habiaEntradas });
    mkdirSync(dirRuntime, { recursive: true });
    if (!habiaEntradas) return false;
    // Lee sus entradas AL EMPEZAR: lo que un build escriba mientras tanto no entra en
    // ESTE runtime, que es lo que obliga a rehacerlo.
    const [core, shared] = entradas.map((e) => readFileSync(e));
    if (espera) await espera;
    writeFileSync(join(dirRuntime, 'ng-core.js'), 'ng');
    writeFileSync(join(dirRuntime, 'sg-core.js'), core);
    writeFileSync(join(dirRuntime, 'sg-shared.js'), shared);
    writeFileSync(join(dirRuntime, MAPA_DEL_RUNTIME), '{"imports":{}}');
    return true;
  };
}

const completo = () => runtimeCompleto({ dir: dirRuntime, ficheros: FICHEROS, ...io });
const huella = () => huellaDeEntradas(entradas, io);

/** Arranca con un build de mentira que termina de forma asíncrona, como el real. */
function arrancar(construir) {
  let primerBuild;
  const arranque = arrancarRuntimeDeDesarrollo({
    lanzarBuild: (trasUnBuild) => {
      primerBuild = (async () => {
        await Promise.resolve();
        escribirBuild('v1');
        return trasUnBuild();
      })();
    },
    estaCompleto: completo,
    huellaDeLasEntradas: huella,
    construir,
  });
  return { ...arranque, primerBuild: () => primerBuild };
}

describe('dev:cdn arranca desde un árbol sin dist/', () => {
  it('el fixture empieza de verdad sin dist/ — si no, lo de abajo prueba otro árbol', () => {
    expect(existsSync(dist)).toBe(false);
    expect(existsSync(join(raiz, 'dist'))).toBe(false);
  });

  it('el runtime se construye DESPUÉS del primer build, y queda entero', async () => {
    const { primerBuild } = arrancar(buildRuntimeFalso());

    expect(await primerBuild()).toBe('construido');
    expect(completo()).toBe(true);
    expect(llamadas).toEqual([{ habiaEntradas: true }]);
  });

  it('nunca se construye sin sus entradas — que es como moría', async () => {
    const { primerBuild } = arrancar(buildRuntimeFalso());
    await primerBuild();

    expect(llamadas.length).toBeGreaterThan(0);
    expect(llamadas.every((l) => l.habiaEntradas)).toBe(true);
  });
});

describe('un runtime está si están TODOS sus ficheros', () => {
  it('una carpeta de versión VACÍA no es un runtime', () => {
    mkdirSync(dirRuntime, { recursive: true });
    expect(existsSync(dirRuntime)).toBe(true);
    expect(completo()).toBe(false);
  });

  it('sin el import map tampoco: build-runtime lo escribe el último', () => {
    mkdirSync(dirRuntime, { recursive: true });
    for (const f of FICHEROS) writeFileSync(join(dirRuntime, f), 'x');
    expect(completo()).toBe(false);
    writeFileSync(join(dirRuntime, MAPA_DEL_RUNTIME), '{}');
    expect(completo()).toBe(true);
  });

  it('sin carpeta, o sin lista de ficheros, no hay runtime que dar por bueno', () => {
    expect(runtimeCompleto({ dir: null, ficheros: FICHEROS, ...io })).toBe(false);
    expect(() => runtimeCompleto({ dir: dirRuntime, ficheros: [], ...io })).toThrow(/sin ficheros/);
  });

  it('un build-runtime que dice «ok» y no lo dejó entero no se da por construido', async () => {
    const mentiroso = async () => {
      mkdirSync(dirRuntime, { recursive: true });
      return true;
    };
    const { primerBuild } = arrancar(mentiroso);
    expect(await primerBuild()).toBe('fallo');
  });
});

describe('cuándo se REHACE el runtime', () => {
  it('un build que no cambió las libs no lo rehace — esbuild las reescribe en cada guardado', async () => {
    const { primerBuild, trasUnBuild } = arrancar(buildRuntimeFalso());
    await primerBuild();

    escribirBuild('v1');
    expect(await trasUnBuild()).toBe('al-dia');
    expect(llamadas).toHaveLength(1);
  });

  it('un build que cambió una lib sí lo rehace, con la lib nueva', async () => {
    const { primerBuild, trasUnBuild } = arrancar(buildRuntimeFalso());
    await primerBuild();

    escribirBuild('v2');
    expect(await trasUnBuild()).toBe('construido');
    expect(readFileSync(join(dirRuntime, 'sg-shared.js'), 'utf8')).toBe('shared v2');
  });

  it('un build que llega MIENTRAS se construye no se pierde: se rehace con lo último', async () => {
    let soltar;
    const espera = new Promise((r) => (soltar = r));
    const { primerBuild, trasUnBuild } = arrancar(buildRuntimeFalso({ espera }));

    // El primer build está construyendo el runtime con v1 y se queda esperando…
    await Promise.resolve();
    await Promise.resolve();
    // …y mientras tanto termina otro build con una lib distinta.
    escribirBuild('v2');
    expect(await trasUnBuild()).toBe('en-curso');

    soltar();
    expect(await primerBuild()).toBe('construido');
    expect(llamadas).toHaveLength(2);
    expect(readFileSync(join(dirRuntime, 'sg-shared.js'), 'utf8')).toBe('shared v2');
  });

  it('si el build terminó sin dejar las entradas, lo dice y no construye', async () => {
    const avisos = [];
    const { trasUnBuild } = arrancarRuntimeDeDesarrollo({
      lanzarBuild: () => {},
      estaCompleto: completo,
      huellaDeLasEntradas: huella,
      construir: buildRuntimeFalso(),
      avisar: (m) => avisos.push(m),
    });
    expect(await trasUnBuild()).toBe('sin-entradas');
    expect(llamadas).toHaveLength(0);
    expect(avisos.join('\n')).toMatch(/sin dejar las entradas/);
  });
});

describe('la huella es de CONTENIDO', () => {
  it('falta una entrada → null; mismo contenido → misma huella; otro → otra', () => {
    expect(huella()).toBeNull();
    escribirBuild('v1');
    const una = huella();
    expect(una).toMatch(/^[0-9a-f]{64}$/);
    escribirBuild('v1');
    expect(huella()).toBe(una);
    escribirBuild('v2');
    expect(huella()).not.toBe(una);
  });
});

describe('dev-cdn está ENCHUFADO al arranque', () => {
  // La otra mitad: que la lib decida bien no dice que dev-cdn la use. Sin esto, volver a
  // escribir el `ejecutarNpm(['run', 'build:runtime'])` de antes del build dejaría todo
  // lo de arriba en verde.
  const fuente = sinComentarios(readFileSync(join(ROOT, 'tools', 'dev-cdn.mjs'), 'utf8'));

  it('arranca por arrancarRuntimeDeDesarrollo', () => {
    expect(fuente).toMatch(/from '\.\/lib\/runtime-en-desarrollo\.mjs'/);
    expect(fuente).toMatch(/\barrancarRuntimeDeDesarrollo\(/);
  });

  it('y no construye el runtime por su cuenta antes de lanzar el build', () => {
    expect(fuente).not.toMatch(/ejecutarNpm\(\s*\[\s*'run'\s*,\s*'build:runtime'/);
  });
});
