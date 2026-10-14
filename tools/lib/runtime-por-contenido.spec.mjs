import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  LIBRO,
  huellaDe,
  sha256De,
  nombreConHuella,
  huellaDelNombre,
  planoDelNombre,
  rutaEnElRuntime,
  libroVacio,
  leerLibro,
  fusionarLibro,
  serializarLibro,
  planificarEscritura,
  escribirUnaVez,
  escribirAtomico,
  revisarPorContenido,
  leerModoDeUrls,
  publicarRuntime,
} from './runtime-por-contenido.mjs';
import { HUELLA_EN_NOMBRE } from './cdn-cache-policy.mjs';
import { FICHEROS_POR_FRAMEWORK, importsDelRuntime } from './mapa-del-runtime.mjs';

/**
 * El runtime publicado por contenido (ADR 0140, CMS#201).
 *
 * El defecto no rompía nada que un test viera: el import map nombraba
 * `runtime/angular/21.1.6/sg-shared.js`, la carpeta lleva la versión de
 * Angular y no la del contenido, y el navegador que ya tenía el fichero viejo
 * —servido `immutable` un año— no volvía a pedirlo. Lo de acá prueba los
 * dientes que impiden volver a eso: la URL nombra los bytes, un fichero con
 * huella se escribe una vez, el libro sólo crece y el gate lo comprueba.
 */

const bytes = (texto) => Buffer.from(texto, 'utf8');
const H = '0123456789abcdef';

describe('la huella', () => {
  it('los mismos bytes dan el mismo nombre, y un byte distinto da otro', () => {
    const a = nombreConHuella('sg-shared.js', huellaDe(bytes('export const x = 1;')));
    const b = nombreConHuella('sg-shared.js', huellaDe(bytes('export const x = 1;')));
    const c = nombreConHuella('sg-shared.js', huellaDe(bytes('export const x = 2;')));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('es el prefijo del sha256, medido de dos maneras: el hex y el integrity del mapa', () => {
    const contenido = bytes('lo que publique el runtime');
    const hex = createHash('sha256').update(contenido).digest('hex');
    const integrity = `sha256-${createHash('sha256').update(contenido).digest('base64')}`;
    const desdeIntegrity = Buffer.from(integrity.slice('sha256-'.length), 'base64').toString('hex');

    expect(huellaDe(contenido)).toBe(hex.slice(0, 16));
    expect(huellaDe(contenido)).toBe(desdeIntegrity.slice(0, 16));
    expect(sha256De(contenido)).toBe(hex);
  });

  it('nombreConHuella y huellaDelNombre son inversas, y un plano no tiene huella', () => {
    const nombre = nombreConHuella('sg-shared.js', H);
    expect(nombre).toBe(`sg-shared.${H}.js`);
    expect(huellaDelNombre(nombre)).toBe(H);
    expect(planoDelNombre(nombre)).toBe('sg-shared.js');
    expect(huellaDelNombre('sg-shared.js')).toBeNull();
    expect(planoDelNombre('sg-shared.js')).toBe('sg-shared.js');
    expect(nombreConHuella('m.mjs', H)).toBe(`m.${H}.mjs`);
  });

  it('un nombre que la política no reconocería como huella no se fabrica: lanza', () => {
    expect(() => nombreConHuella('sg-shared.js', 'ABCDEF0123456789')).toThrow(/no da un nombre con huella/);
    expect(() => nombreConHuella('estilos.css', H)).toThrow(/no da un nombre con huella/);
  });

  it.each(Object.entries(FICHEROS_POR_FRAMEWORK))(
    'EL CRUCE (%s): cada fichero del runtime con huella casa con la regex de la política, y su plano no',
    (_framework, ficheros) => {
      for (const fichero of ficheros) {
        expect(HUELLA_EN_NOMBRE.test(nombreConHuella(fichero, H)), fichero).toBe(true);
        expect(HUELLA_EN_NOMBRE.test(fichero), fichero).toBe(false);
      }
    },
  );

  it('la URL se traduce a su sitio dentro de runtime/<framework>/', () => {
    expect(rutaEnElRuntime(`/synergos/runtime/angular/21.1.6/sg-shared.${H}.js`, 'angular')).toEqual({
      version: '21.1.6',
      nombre: `sg-shared.${H}.js`,
      relativa: `21.1.6/sg-shared.${H}.js`,
    });
    expect(rutaEnElRuntime('https://otro/synergos/runtime/preact/10.29.8/preact.js', 'angular')).toBeNull();
  });
});

// ── Escribir una sola vez ───────────────────────────────────────────────────

const carpetaTemporal = () => mkdtempSync(path.join(tmpdir(), 'runtime-por-contenido-'));

describe('un fichero con huella se escribe UNA vez', () => {
  it('ausente → escribir; mismos bytes → nada; OTROS bytes → lanza', () => {
    expect(planificarEscritura({ existe: false })).toBe('escribir');
    expect(planificarEscritura({ existe: true, sha256Existente: 'a', sha256Nuevo: 'a' })).toBe('nada');
    expect(() => planificarEscritura({ existe: true, sha256Existente: 'a', sha256Nuevo: 'b' })).toThrow(
      /se escribe una sola vez/,
    );
  });

  it('sobre un disco de verdad: la 2.ª vez no toca el fichero, y con otros bytes lanza y lo deja intacto', async () => {
    const dir = carpetaTemporal();
    try {
      const ruta = path.join(dir, '21.1.6', `sg-shared.${H}.js`);
      expect(await escribirUnaVez(fsp, ruta, bytes('uno'))).toBe('escrito');
      const antes = statSync(ruta).mtimeMs;

      expect(await escribirUnaVez(fsp, ruta, bytes('uno'))).toBe('nada');
      expect(statSync(ruta).mtimeMs).toBe(antes);

      await expect(escribirUnaVez(fsp, ruta, bytes('otro'))).rejects.toThrow(/se escribe una sola vez/);
      expect(readFileSync(ruta, 'utf8')).toBe('uno');
      expect(statSync(ruta).mtimeMs).toBe(antes);
      expect(readdirSync(path.dirname(ruta))).toEqual([`sg-shared.${H}.js`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('se escribe por temporal + rename: quien lee a la vez lee el anterior entero', async () => {
    const llamadas = [];
    const fs = {
      mkdir: async () => {},
      writeFile: async (r) => llamadas.push(['writeFile', r]),
      rename: async (de, a) => llamadas.push(['rename', de, a]),
      rm: async () => {},
    };
    await escribirAtomico(fs, '/cdn/latest/import-map.json', bytes('{}'));

    expect(llamadas).toHaveLength(2);
    const [[, temporal], [, de, a]] = llamadas;
    expect(temporal).not.toBe('/cdn/latest/import-map.json');
    expect(path.dirname(temporal)).toBe('/cdn/latest');
    expect(de).toBe(temporal);
    expect(a).toBe('/cdn/latest/import-map.json');
  });

  it('el rename que choca con un lector (EPERM en Windows) se reintenta', async () => {
    let fallos = 2;
    const fs = {
      mkdir: async () => {},
      writeFile: async () => {},
      rename: vi.fn(async () => {
        if (fallos-- > 0) throw Object.assign(new Error('ocupado'), { code: 'EPERM' });
      }),
      rm: vi.fn(async () => {}),
    };
    await escribirAtomico(fs, '/x/import-map.json', bytes('{}'), { esperar: async () => {} });
    expect(fs.rename).toHaveBeenCalledTimes(3);
    expect(fs.rm).not.toHaveBeenCalled();
  });

  it('agotados los intentos LANZA y limpia el temporal; el fichero anterior no se toca', async () => {
    const dir = carpetaTemporal();
    try {
      const ruta = path.join(dir, 'import-map.json');
      writeFileSync(ruta, 'anterior');
      const fs = {
        ...fsp,
        rename: async () => {
          throw Object.assign(new Error('ocupado'), { code: 'EBUSY' });
        },
      };
      await expect(escribirAtomico(fs, ruta, bytes('nuevo'), { intentos: 3, esperar: async () => {} })).rejects.toThrow(
        /ocupado/,
      );
      expect(readFileSync(ruta, 'utf8')).toBe('anterior');
      expect(readdirSync(dir)).toEqual(['import-map.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── El libro ────────────────────────────────────────────────────────────────

const entrada = (fichero, contenido, desde = '2026-10-13T00:00:00.000Z', version = '21.1.6') => {
  const b = bytes(contenido);
  return {
    fichero,
    url: `/synergos/runtime/angular/${version}/${nombreConHuella(fichero, huellaDe(b))}`,
    sha256: sha256De(b),
    bytes: b.length,
    desde,
  };
};

describe('el libro latest/huellas.json', () => {
  it('se llama como dice el contrato del CMS', () => {
    expect(LIBRO).toBe('huellas.json');
  });

  it('SÓLO AÑADE: lo que estaba sigue, con su «desde»', () => {
    const viejo = entrada('sg-shared.js', 'v1', '2026-10-01T00:00:00.000Z');
    const nuevo = entrada('sg-shared.js', 'v2', '2026-10-13T00:00:00.000Z');
    const libro = fusionarLibro(fusionarLibro(libroVacio('angular'), [viejo]), [nuevo]);

    expect(libro.entradas).toHaveLength(2);
    expect(libro.entradas.find((e) => e.sha256 === viejo.sha256)).toEqual(viejo);

    // Republicar lo mismo más tarde no mueve «desde»: es cuándo existió por primera vez.
    const otraVez = fusionarLibro(libro, [{ ...viejo, desde: '2026-12-01T00:00:00.000Z' }]);
    expect(otraVez.entradas.find((e) => e.sha256 === viejo.sha256).desde).toBe('2026-10-01T00:00:00.000Z');
  });

  it('es idempotente byte a byte y no depende del orden en que se fusiona', () => {
    const a = entrada('sg-shared.js', 'a');
    const b = entrada('sg-core.js', 'b');
    const c = entrada('ng-core.js', 'c');

    const una = serializarLibro(fusionarLibro(libroVacio('angular'), [a, b, c]));
    const dos = serializarLibro(fusionarLibro(fusionarLibro(libroVacio('angular'), [c]), [b, a]));
    const tres = serializarLibro(fusionarLibro(leerLibro(una, 'angular'), [a, b, c]));
    expect(dos).toBe(una);
    expect(tres).toBe(una);
  });

  it('la misma URL con OTRO contenido no se fusiona: lanza', () => {
    const a = entrada('sg-shared.js', 'a');
    expect(() => fusionarLibro(libroVacio('angular'), [a, { ...a, sha256: 'f'.repeat(64) }])).toThrow();
  });

  it('una entrada cuyo nombre no lleva la huella de su sha256 no entra', () => {
    const a = entrada('sg-shared.js', 'a');
    expect(() => fusionarLibro(libroVacio('angular'), [{ ...a, sha256: sha256De(bytes('otro')) }])).toThrow(
      /no lleva la huella/,
    );
  });

  it('un libro ilegible LANZA: reemplazarlo por uno vacío perdería las generaciones', () => {
    expect(() => leerLibro('{ esto no', 'angular')).toThrow(/no es JSON legible/);
    expect(() => leerLibro('[]', 'angular')).toThrow(/forma/);
    expect(() => leerLibro(serializarLibro(libroVacio('preact')), 'angular')).toThrow(/dice ser de/);
  });
});

// ── El gate ─────────────────────────────────────────────────────────────────

/**
 * Un runtime publicado por contenido, en un disco de mentira: lo que dejaría
 * `publicarRuntime`, con dos generaciones de `sg-shared` si se pide.
 */
function cdnPublicado(framework, version, { generacionAnterior = false } = {}) {
  const base = `/synergos/runtime/${framework}/${version}`;
  const disco = new Map();
  const contenido = Object.fromEntries(
    FICHEROS_POR_FRAMEWORK[framework].map((f) => [f, bytes(`// ${framework} ${f}`)]),
  );
  const entradas = [];
  const publicar = (fichero, b) => {
    const nombre = nombreConHuella(fichero, huellaDe(b));
    disco.set(`${version}/${nombre}`, b);
    entradas.push({ fichero, url: `${base}/${nombre}`, sha256: sha256De(b), bytes: b.length, desde: '2026-10-13T00:00:00.000Z' });
    return nombre;
  };

  if (generacionAnterior) publicar(FICHEROS_POR_FRAMEWORK[framework].at(-1), bytes('// la generación anterior'));

  const nombres = {};
  for (const [fichero, b] of Object.entries(contenido)) {
    nombres[fichero] = publicar(fichero, b);
    disco.set(`${version}/${fichero}`, b);
    disco.set(`latest/${fichero}`, b);
  }

  const mapa = { imports: importsDelRuntime(framework, base, (f) => nombres[f]) };
  const libro = fusionarLibro(libroVacio(framework), entradas);
  return {
    framework,
    mapa,
    libro,
    disco,
    existe: (r) => disco.has(r),
    leerBytes: (r) => {
      if (!disco.has(r)) throw new Error(`no existe ${r}`);
      return disco.get(r);
    },
  };
}

describe('revisarPorContenido — el gate', () => {
  it.each([['angular', '21.1.6'], ['preact', '10.29.8']])('acepta lo que publica %s por contenido', (fw, ver) => {
    expect(revisarPorContenido(cdnPublicado(fw, ver, { generacionAnterior: true }))).toEqual([]);
  });

  it('DIENTE 1 — un plano en el mapa: la carpeta lleva la versión del framework, no la del contenido', () => {
    const cdn = cdnPublicado('angular', '21.1.6');
    cdn.mapa.imports['@angular/core'] = '/synergos/runtime/angular/21.1.6/ng-core.js';
    const errores = revisarPorContenido(cdn);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('SIN huella');
  });

  it('…salvo con --urls=por-nombre, que es la vuelta atrás declarada', () => {
    const cdn = cdnPublicado('angular', '21.1.6');
    cdn.mapa.imports = importsDelRuntime('angular', '/synergos/runtime/angular/21.1.6');
    expect(revisarPorContenido({ ...cdn, modo: 'por-nombre' })).toEqual([]);
  });

  it('DIENTE 2 — el fichero con huella que nombra el mapa no está: 404 en el navegador', () => {
    const cdn = cdnPublicado('angular', '21.1.6');
    const nombre = cdn.mapa.imports['@angular/core'].split('/').at(-1);
    cdn.disco.delete(`21.1.6/${nombre}`);
    const errores = revisarPorContenido(cdn);
    expect(errores.some((e) => e.includes('NO existe'))).toBe(true);
  });

  it('DIENTE 3 — los bytes no casan con su nombre: alguien sobrescribió un inmutable', () => {
    const cdn = cdnPublicado('angular', '21.1.6');
    const nombre = cdn.mapa.imports['@angular/core'].split('/').at(-1);
    cdn.disco.set(`21.1.6/${nombre}`, bytes('otra cosa'));
    const errores = revisarPorContenido(cdn);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('no casan con su nombre');
  });

  it('DIENTE 4 — una entrada del libro sin su fichero: una generación perdida', () => {
    const cdn = cdnPublicado('angular', '21.1.6', { generacionAnterior: true });
    const anterior = cdn.libro.entradas.find((e) => !Object.values(cdn.mapa.imports).includes(e.url));
    cdn.disco.delete(rutaEnElRuntime(anterior.url, 'angular').relativa);
    const errores = revisarPorContenido(cdn);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('NO está publicado');
  });

  it('…y un fichero que el mapa nombra y el libro no declara: el próximo build:cdn no lo conservaría', () => {
    const cdn = cdnPublicado('angular', '21.1.6');
    cdn.libro = { ...cdn.libro, entradas: cdn.libro.entradas.filter((e) => !e.url.includes('/ng-core.')) };
    const errores = revisarPorContenido(cdn);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('no lo declara');
  });

  it('DIENTE 5 — latest/<plano> en otra generación que la que nombra el mapa', () => {
    const cdn = cdnPublicado('angular', '21.1.6');
    cdn.disco.set('latest/sg-shared.js', bytes('// la de ayer'));
    const errores = revisarPorContenido(cdn);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('latest/sg-shared.js');
  });

  it('DIENTE 6 — el alias heredado separado de su gemelo: el CMS ya no deduplica', () => {
    const cdn = cdnPublicado('angular', '21.1.6', { generacionAnterior: true });
    const anterior = cdn.libro.entradas.find((e) => !Object.values(cdn.mapa.imports).includes(e.url));
    cdn.mapa.imports['@synergos/shared'] = anterior.url;
    const errores = revisarPorContenido(cdn);
    expect(errores.some((e) => e.includes('no comparten URL'))).toBe(true);
  });
});

describe('leerModoDeUrls', () => {
  it.each([
    [['--urls', 'por-nombre'], {}, 'por-nombre', '--urls'],
    [['--urls=por-nombre'], {}, 'por-nombre', '--urls'],
    [[], { SYNERGOS_RUNTIME_URLS: 'por-nombre' }, 'por-nombre', 'SYNERGOS_RUNTIME_URLS'],
    [['--urls=por-contenido'], { SYNERGOS_RUNTIME_URLS: 'por-nombre' }, 'por-contenido', '--urls'],
    [[], {}, 'por-contenido', 'por defecto'],
  ])('%j con %j → %s (%s)', (argv, env, modo, origen) => {
    expect(leerModoDeUrls(argv, env)).toEqual({ modo, origen });
  });

  it('un valor que no se entiende es un error, no «el de siempre»', () => {
    expect(leerModoDeUrls(['--urls=por-hash'], {}).error).toMatch(/por-hash.*por-contenido \| por-nombre/);
    expect(leerModoDeUrls([], { SYNERGOS_RUNTIME_URLS: 'plano' }).error).toMatch(/SYNERGOS_RUNTIME_URLS=plano/);
  });
});

// ── Publicar ────────────────────────────────────────────────────────────────

/**
 * Un `dist/runtime/<framework>/<versión>/` de mentira en un disco de verdad,
 * con los ficheros que declara la tabla y un contenido que se puede cambiar.
 */
function distFalso(raiz, framework, version, cambios = {}) {
  const dir = path.join(raiz, 'dist', framework, version);
  mkdirSync(dir, { recursive: true });
  for (const fichero of FICHEROS_POR_FRAMEWORK[framework]) {
    writeFileSync(path.join(dir, fichero), cambios[fichero] ?? `// ${framework} ${version} ${fichero}\n`);
  }
  return dir;
}

/** `node:fs/promises` con las escrituras espiadas, en orden. */
function fsEspiado() {
  const escrituras = [];
  const fs = {
    readFile: fsp.readFile,
    rm: fsp.rm,
    mkdir: async (...args) => {
      escrituras.push(['mkdir', args[0]]);
      return fsp.mkdir(...args);
    },
    writeFile: async (...args) => {
      escrituras.push(['writeFile', args[0]]);
      return fsp.writeFile(...args);
    },
    rename: async (de, a) => {
      escrituras.push(['rename', a]);
      return fsp.rename(de, a);
    },
  };
  return { fs, escrituras };
}

describe('publicarRuntime — el runtime por contenido, sobre un disco de verdad', { timeout: 30_000 }, () => {
  const VER = '21.1.6';
  const BASE = `/synergos/runtime/angular/${VER}`;
  let raiz;
  let cdn;
  let rt;

  beforeEach(() => {
    raiz = carpetaTemporal();
    cdn = path.join(raiz, 'cdn');
    rt = path.join(cdn, 'synergos', 'runtime', 'angular');
  });
  afterEach(() => rmSync(raiz, { recursive: true, force: true }));

  const publicar = (dist, extra = {}) =>
    publicarRuntime({ framework: 'angular', version: VER, dist, cdn, base: BASE, fs: fsp, ...extra });
  const leerJson = (...p) => JSON.parse(readFileSync(path.join(rt, ...p), 'utf8'));

  it('la 1.ª publicación deja los planos, los ficheros con huella, el libro y los dos mapas', async () => {
    const dist = distFalso(raiz, 'angular', VER);
    const { errores, nombres } = await publicar(dist, { ahora: () => '2026-10-13T00:00:00.000Z' });

    expect(errores).toEqual([]);
    for (const fichero of FICHEROS_POR_FRAMEWORK.angular) {
      expect(readdirSync(path.join(rt, VER))).toContain(fichero);
      expect(readdirSync(path.join(rt, VER))).toContain(nombres[fichero]);
      expect(readdirSync(path.join(rt, 'latest'))).toContain(fichero);
      expect(nombres[fichero]).toBe(nombreConHuella(fichero, huellaDe(readFileSync(path.join(dist, fichero)))));
    }

    const mapa = leerJson('latest', 'import-map.json');
    expect(mapa).toEqual(leerJson(VER, 'import-map.json'));
    expect(mapa.imports['@synergos/shared']).toBe(`${BASE}/${nombres['sg-shared.js']}`);
    expect(mapa.imports['@synergos/angular-shared']).toBe(mapa.imports['@synergos/shared']);
    // «integrity» sigue por nombre de fichero, como siempre.
    expect(Object.keys(mapa.integrity).sort()).toEqual([...FICHEROS_POR_FRAMEWORK.angular].sort());

    const libro = leerJson('latest', LIBRO);
    expect(libro.entradas).toHaveLength(FICHEROS_POR_FRAMEWORK.angular.length);
    expect(libro.entradas.every((e) => e.desde === '2026-10-13T00:00:00.000Z')).toBe(true);
  });

  it('la 2.ª, con sg-shared cambiado, añade el fichero nuevo y deja el anterior INTACTO', async () => {
    const primera = await publicar(distFalso(raiz, 'angular', VER));
    const anterior = path.join(rt, VER, primera.nombres['sg-shared.js']);
    const { mtimeMs } = statSync(anterior);
    const shaAnterior = sha256De(readFileSync(anterior));

    const segunda = await publicar(distFalso(raiz, 'angular', VER, { 'sg-shared.js': '// libs/shared cambió\n' }));

    expect(segunda.errores).toEqual([]);
    expect(segunda.nombres['sg-shared.js']).not.toBe(primera.nombres['sg-shared.js']);
    expect(statSync(anterior).mtimeMs).toBe(mtimeMs);
    expect(sha256De(readFileSync(anterior))).toBe(shaAnterior);
    // Lo único que cambia de nombre es lo que cambió de bytes.
    expect(segunda.nombres['ng-core.js']).toBe(primera.nombres['ng-core.js']);

    const mapa = leerJson('latest', 'import-map.json');
    expect(mapa.imports['@synergos/shared']).toBe(`${BASE}/${segunda.nombres['sg-shared.js']}`);
    expect(readFileSync(path.join(rt, 'latest', 'sg-shared.js'), 'utf8')).toBe('// libs/shared cambió\n');

    const urls = leerJson('latest', LIBRO).entradas.map((e) => e.url);
    expect(urls).toContain(`${BASE}/${primera.nombres['sg-shared.js']}`);
    expect(urls).toContain(`${BASE}/${segunda.nombres['sg-shared.js']}`);
  });

  it('la 3.ª, idéntica, no escribe NADA: ni ficheros, ni planos, ni libro, ni mapas', async () => {
    const dist = distFalso(raiz, 'angular', VER);
    await publicar(dist, { ahora: () => '2026-10-13T00:00:00.000Z' });
    await publicar(dist, { ahora: () => '2026-10-14T00:00:00.000Z' });

    const { fs, escrituras } = fsEspiado();
    const tercera = await publicar(dist, { fs, ahora: () => '2026-10-15T00:00:00.000Z' });

    expect(tercera.errores).toEqual([]);
    expect(tercera.escritos).toEqual([]);
    expect(escrituras).toEqual([]);
  });

  it('latest/import-map.json es la ÚLTIMA escritura: es el volteo', async () => {
    await publicar(distFalso(raiz, 'angular', VER));
    const { fs, escrituras } = fsEspiado();
    await publicar(distFalso(raiz, 'angular', VER, { 'sg-shared.js': '// otra generación\n' }), { fs });

    const destinos = escrituras.filter(([op]) => op === 'rename').map(([, a]) => path.relative(rt, a));
    expect(destinos.length).toBeGreaterThan(3);
    expect(destinos.at(-1)).toBe(path.join('latest', 'import-map.json'));
    expect(destinos.indexOf(path.join('latest', LIBRO))).toBeLessThan(destinos.length - 1);
    expect(destinos.some((d) => HUELLA_EN_NOMBRE.test(path.basename(d)))).toBe(true);
  });

  it('--urls=por-nombre da el mapa de antes; los ficheros con huella y el libro se publican igual', async () => {
    const { errores } = await publicar(distFalso(raiz, 'angular', VER), { modo: 'por-nombre' });

    expect(errores).toEqual([]);
    expect(leerJson('latest', 'import-map.json').imports).toEqual(importsDelRuntime('angular', BASE));
    expect(leerJson('latest', LIBRO).entradas).toHaveLength(FICHEROS_POR_FRAMEWORK.angular.length);
  });

  it('--dry-run no escribe nada, y dice lo que escribiría', async () => {
    const { fs, escrituras } = fsEspiado();
    const { escritos } = await publicar(distFalso(raiz, 'angular', VER), { fs, dryRun: true });

    expect(escrituras).toEqual([]);
    expect(escritos.map((r) => path.relative(rt, r))).toContain(path.join('latest', 'import-map.json'));
    expect(escritos.length).toBe(2 * FICHEROS_POR_FRAMEWORK.angular.length + FICHEROS_POR_FRAMEWORK.angular.length + 3);
  });

  it('Preact se publica igual, por su tabla y no por la de Angular', async () => {
    const { errores, nombres } = await publicarRuntime({
      framework: 'preact',
      version: '10.29.8',
      dist: distFalso(raiz, 'preact', '10.29.8'),
      cdn,
      base: '/synergos/runtime/preact/10.29.8',
      fs: fsp,
    });
    expect(errores).toEqual([]);
    expect(Object.keys(nombres).sort()).toEqual([...FICHEROS_POR_FRAMEWORK.preact].sort());
  });

  it('una base que no es la del runtime se rechaza antes de escribir nada', async () => {
    await expect(publicar(distFalso(raiz, 'angular', VER), { base: '/synergos/otra-cosa' })).rejects.toThrow(
      /tiene que terminar en \/runtime\/angular\/21\.1\.6/,
    );
    expect(() => statSync(rt)).toThrow();
  });

  it('un fichero que la tabla declara y el build no produjo se rechaza, no se salta', async () => {
    const dist = distFalso(raiz, 'angular', VER);
    rmSync(path.join(dist, 'sg-core.js'));
    await expect(publicar(dist)).rejects.toThrow(/la tabla declara sg-core\.js/);
    expect(() => statSync(rt)).toThrow();
  });
});
