import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ORIGEN_POR_DEFECTO,
  configuracionDeConservar,
  lineaDeNoConservar,
  guardarAntesDeLimpiar,
  leerLibroVivo,
  bajarDelOrigen,
  restaurarDespuesDeLimpiar,
} from './conservar-runtime.mjs';
import {
  LIBRO,
  fusionarLibro,
  huellaDe,
  libroVacio,
  nombreConHuella,
  publicarRuntime,
  serializarLibro,
  sha256De,
} from './runtime-por-contenido.mjs';
import { FICHEROS_POR_FRAMEWORK } from './mapa-del-runtime.mjs';

/**
 * `build:cdn` conserva las generaciones del runtime ya publicadas (ADR 0140, CMS#201).
 *
 * `build:cdn` arma el CDN desde cero. Con el runtime publicado por contenido,
 * eso borraba la generación anterior en cada despliegue: un 404 para quien aún
 * tenga un mapa que la nombre. Lo de acá prueba que se recupera, que se
 * verifica cada byte y que, ante la duda, se PARA en vez de publicar sin ella.
 */

const bytes = (texto) => Buffer.from(texto, 'utf8');
const ORIGEN = 'https://cdn.example';

/** Una entrada del libro para unos bytes, en la versión dada. */
const entradaPara = (framework, version, fichero, b, desde = '2026-10-01T00:00:00.000Z') => ({
  fichero,
  url: `/synergos/runtime/${framework}/${version}/${nombreConHuella(fichero, huellaDe(b))}`,
  sha256: sha256De(b),
  bytes: b.length,
  desde,
});

/** Un `fetch` de mentira que sirve un árbol: ruta → { status, cuerpo } o un Error. */
function fetchDe(arbol, pedidas = []) {
  return async (url) => {
    pedidas.push(url);
    const ruta = new URL(url).pathname;
    const r = arbol[ruta] ?? { status: 404, cuerpo: '' };
    if (r instanceof Error) throw r;
    const cuerpo = typeof r.cuerpo === 'string' ? bytes(r.cuerpo) : r.cuerpo;
    return new Response(r.status === 404 || r.status >= 500 ? null : cuerpo, { status: r.status });
  };
}

const libroAngularCon = (...entradas) => serializarLibro(fusionarLibro(libroVacio('angular'), entradas));
const sinLibros = { '/synergos/runtime/preact/latest/huellas.json': { status: 404 } };

describe('de dónde se conserva', () => {
  it('sin decir nada, del CDN PÚBLICO del proyecto: no hace falta configurar nada para conservar', () => {
    expect(configuracionDeConservar([], {})).toEqual({
      conservar: true,
      origen: ORIGEN_POR_DEFECTO,
      deDonde: 'por defecto',
    });
    expect(ORIGEN_POR_DEFECTO).toBe('https://synergos-ui.synergos-labs.workers.dev');
  });

  it.each([
    [['--conservar-desde', 'https://otro.example/'], {}, 'https://otro.example', '--conservar-desde'],
    [['--conservar-desde=https://otro.example'], {}, 'https://otro.example', '--conservar-desde'],
    [[], { SYNERGOS_CDN_CONSERVAR_DESDE: 'https://var.example' }, 'https://var.example', 'SYNERGOS_CDN_CONSERVAR_DESDE'],
  ])('%j con %j lo sobrescribe → %s', (argv, env, origen, deDonde) => {
    expect(configuracionDeConservar(argv, env)).toEqual({ conservar: true, origen, deDonde });
  });

  it('--sin-conservar y SYNERGOS_CDN_CONSERVAR=no no lanzan, y la línea lo dice en voz alta', () => {
    const porBandera = configuracionDeConservar(['--sin-conservar'], {});
    const porVariable = configuracionDeConservar([], { SYNERGOS_CDN_CONSERVAR: 'no' });
    expect(porBandera).toEqual({ conservar: false, porque: '--sin-conservar' });
    expect(porVariable).toEqual({ conservar: false, porque: 'SYNERGOS_CDN_CONSERVAR=no' });
    expect(lineaDeNoConservar(porVariable.porque)).toMatch(/SYNERGOS_CDN_CONSERVAR=no.*NO se conservan.*no debe desplegarse/s);
  });

  it('lo que no se entiende es un error, no «conservá» ni «no conserves»', () => {
    expect(configuracionDeConservar([], { SYNERGOS_CDN_CONSERVAR: 'false' }).error).toMatch(/no se entiende/);
    expect(configuracionDeConservar(['--conservar-desde=public'], {}).error).toMatch(/no es una URL/);
  });
});

describe('el libro del CDN vivo', () => {
  it('404 es «el origen contesta y no tiene libro»: primera vez, se sigue', async () => {
    expect(await leerLibroVivo({ origen: ORIGEN, framework: 'angular', fetch: fetchDe({}) })).toBeNull();
  });

  it('sin red LANZA: no saber no es «no hay»', async () => {
    const fetch = fetchDe({ '/synergos/runtime/angular/latest/huellas.json': new TypeError('fetch failed') });
    await expect(leerLibroVivo({ origen: ORIGEN, framework: 'angular', fetch })).rejects.toThrow(/no contesta/);
  });

  it.each([500, 503, 403])('un %s LANZA', async (status) => {
    const fetch = fetchDe({ '/synergos/runtime/angular/latest/huellas.json': { status, cuerpo: 'x' } });
    await expect(leerLibroVivo({ origen: ORIGEN, framework: 'angular', fetch })).rejects.toThrow(
      new RegExp(`contesta ${status}`),
    );
  });

  it('un 200 da el libro, y uno con una entrada cuyo nombre no es su huella LANZA', async () => {
    const b = bytes('sg-shared de ayer');
    const buena = entradaPara('angular', '21.1.6', 'sg-shared.js', b);
    const ok = fetchDe({ '/synergos/runtime/angular/latest/huellas.json': { status: 200, cuerpo: libroAngularCon(buena) } });
    expect((await leerLibroVivo({ origen: ORIGEN, framework: 'angular', fetch: ok })).entradas).toEqual([buena]);

    const mentirosa = { ...buena, sha256: sha256De(bytes('otra cosa')) };
    const texto = JSON.stringify({ framework: 'angular', entradas: [mentirosa] });
    const mal = fetchDe({ '/synergos/runtime/angular/latest/huellas.json': { status: 200, cuerpo: texto } });
    await expect(leerLibroVivo({ origen: ORIGEN, framework: 'angular', fetch: mal })).rejects.toThrow(/huella/);
  });
});

describe('guardar, bajar y restaurar — sobre un disco de verdad', { timeout: 30_000 }, () => {
  let raiz;
  let salida;
  let tmp;
  const VER = '21.1.6';

  beforeEach(() => {
    raiz = mkdtempSync(path.join(tmpdir(), 'conservar-runtime-'));
    salida = path.join(raiz, 'public');
    tmp = path.join(raiz, 'tmp');
  });
  afterEach(() => rmSync(raiz, { recursive: true, force: true }));

  /** Publica un runtime de mentira en `salida` con el publicador de verdad. */
  async function publicarEnSalida(framework, version, cambios = {}) {
    const dist = path.join(raiz, 'dist', framework, version);
    mkdirSync(dist, { recursive: true });
    for (const f of FICHEROS_POR_FRAMEWORK[framework]) {
      writeFileSync(path.join(dist, f), cambios[f] ?? `// ${framework} ${f}\n`);
    }
    const r = await publicarRuntime({
      framework,
      version,
      dist,
      cdn: salida,
      base: `/synergos/runtime/${framework}/${version}`,
      fs: fsp,
    });
    expect(r.errores).toEqual([]);
    return r.nombres;
  }
  const rt = (...p) => path.join(salida, 'synergos', 'runtime', 'angular', ...p);

  it('restaura SIN RED desde la salida anterior: lo que había vuelve, byte a byte', async () => {
    const primera = await publicarEnSalida('angular', VER);
    const segunda = await publicarEnSalida('angular', VER, { 'sg-shared.js': '// generación 2\n' });
    const libroAntes = readFileSync(rt('latest', LIBRO), 'utf8');

    await guardarAntesDeLimpiar({ salida, tmp, fs: fsp });
    rmSync(salida, { recursive: true, force: true });
    await restaurarDespuesDeLimpiar({ salida, tmp, fs: fsp });

    expect(readFileSync(rt('latest', LIBRO), 'utf8')).toBe(libroAntes);
    for (const nombre of [primera['sg-shared.js'], segunda['sg-shared.js'], primera['ng-core.js']]) {
      expect(readdirSync(rt(VER))).toContain(nombre);
    }
    expect(readFileSync(rt(VER, segunda['sg-shared.js']), 'utf8')).toBe('// generación 2\n');
  });

  it('NUNCA BORRA: tras restaurar, todo lo conservado sigue en su sitio', async () => {
    await publicarEnSalida('angular', VER);
    await guardarAntesDeLimpiar({ salida, tmp, fs: fsp });
    const antes = readdirSync(path.join(tmp, 'angular', VER)).sort();

    rmSync(salida, { recursive: true, force: true });
    await restaurarDespuesDeLimpiar({ salida, tmp, fs: fsp });

    expect(readdirSync(path.join(tmp, 'angular', VER)).sort()).toEqual(antes);
    expect(antes).toHaveLength(FICHEROS_POR_FRAMEWORK.angular.length);
  });

  it('el origen sin libro (404) es la primera vez: avisa, no baja nada y sigue', async () => {
    await publicarEnSalida('angular', VER);
    await guardarAntesDeLimpiar({ salida, tmp, fs: fsp });
    const avisos = [];
    const pedidas = [];

    const resumen = await bajarDelOrigen({ tmp, origen: ORIGEN, fetch: fetchDe({}, pedidas), fs: fsp, log: (l) => avisos.push(l) });

    expect(resumen.angular).toMatchObject({ vivo: false, bajados: 0 });
    expect(avisos.join('\n')).toMatch(/⚠ angular: .*no tiene latest\/huellas\.json \(404\).*primer despliegue/);
    expect(pedidas).toEqual([
      `${ORIGEN}/synergos/runtime/angular/latest/huellas.json`,
      `${ORIGEN}/synergos/runtime/preact/latest/huellas.json`,
    ]);
  });

  it('con libro vivo, baja lo que falta, VERIFICADO, y lo deja listo para restaurar', async () => {
    const viejo = bytes('// la generación que sólo está en el CDN vivo\n');
    const entrada = entradaPara('angular', VER, 'sg-shared.js', viejo);
    const arbol = {
      ...sinLibros,
      '/synergos/runtime/angular/latest/huellas.json': { status: 200, cuerpo: libroAngularCon(entrada) },
      [new URL(entrada.url, ORIGEN).pathname]: { status: 200, cuerpo: viejo },
    };

    const resumen = await bajarDelOrigen({ tmp, origen: ORIGEN, fetch: fetchDe(arbol), fs: fsp });
    expect(resumen.angular).toMatchObject({ vivo: true, entradas: 1, bajados: 1 });

    await restaurarDespuesDeLimpiar({ salida, tmp, fs: fsp });
    expect(readFileSync(rt(VER, entrada.url.split('/').at(-1)))).toEqual(viejo);
    expect(JSON.parse(readFileSync(rt('latest', LIBRO), 'utf8')).entradas).toEqual([entrada]);
  });

  it('un fichero del origen cuyo sha256 NO casa con el libro PARA, y no se conserva', async () => {
    const viejo = bytes('// lo que se publicó\n');
    const entrada = entradaPara('angular', VER, 'sg-shared.js', viejo);
    const arbol = {
      ...sinLibros,
      '/synergos/runtime/angular/latest/huellas.json': { status: 200, cuerpo: libroAngularCon(entrada) },
      [new URL(entrada.url, ORIGEN).pathname]: { status: 200, cuerpo: bytes('// otra cosa\n') },
    };

    await expect(bajarDelOrigen({ tmp, origen: ORIGEN, fetch: fetchDe(arbol), fs: fsp })).rejects.toThrow(
      /su sha256 es .* y el libro dice/,
    );
    expect(() => statSync(path.join(tmp, 'angular', VER))).toThrow();
  });

  it('una generación que el libro declara y el origen ya no tiene PARA: no se da por perdida en silencio', async () => {
    const entrada = entradaPara('angular', VER, 'sg-shared.js', bytes('// perdida\n'));
    const arbol = {
      ...sinLibros,
      '/synergos/runtime/angular/latest/huellas.json': { status: 200, cuerpo: libroAngularCon(entrada) },
    };
    await expect(bajarDelOrigen({ tmp, origen: ORIGEN, fetch: fetchDe(arbol), fs: fsp })).rejects.toThrow(
      /contesta 404/,
    );
  });

  it('el origen caído PARA antes de tocar la salida', async () => {
    await publicarEnSalida('angular', VER);
    await guardarAntesDeLimpiar({ salida, tmp, fs: fsp });
    const caido = fetchDe({ '/synergos/runtime/angular/latest/huellas.json': new TypeError('fetch failed') });

    await expect(bajarDelOrigen({ tmp, origen: ORIGEN, fetch: caido, fs: fsp })).rejects.toThrow(/no contesta/);
    expect(readdirSync(rt(VER)).length).toBeGreaterThan(0);
  });

  it('la salida anterior con un fichero adulterado PARA al guardar', async () => {
    const nombres = await publicarEnSalida('angular', VER);
    writeFileSync(rt(VER, nombres['ng-core.js']), '// alguien lo tocó\n');
    await expect(guardarAntesDeLimpiar({ salida, tmp, fs: fsp })).rejects.toThrow(/su sha256 es/);
  });
});
