import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OBLIGACIONES,
  FUERA_DE_ALCANCE,
  revisarPlataforma,
  revisarContratoDePlataformas,
} from './platform-contract.mjs';
import { frameworksConstruibles } from './frameworks.mjs';
import { todasLasFuentes } from './element-sources.mjs';
import { ALL_FRAMEWORKS } from './synergos-config.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

const listarDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

/** El disco de verdad, para el cruce que importa: que Angular cumpla. */
const discoReal = {
  raiz: ROOT,
  declaradas: ALL_FRAMEWORKS,
  existe: (r) => existsSync(resolve(ROOT, r)),
  leerJson: (r) => JSON.parse(readFileSync(resolve(ROOT, r), 'utf8')),
  leer: (r) => readFileSync(resolve(ROOT, r), 'utf8'),
  fuentesDe: (dir) => {
    const abs = resolve(ROOT, dir);
    if (!existsSync(abs)) return [];
    const salida = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) {
          if (/^(node_modules|dist|\.cdn-out|\.test-out)$/.test(e.name)) continue;
          walk(full);
        } else if (/\.(ts|mjs|js)$/.test(e.name) && !e.name.endsWith('.spec.ts')) {
          salida.push(full);
        }
      }
    };
    walk(abs);
    return salida;
  },
  fuentes: (framework) =>
    todasLasFuentes({
      listar: (dir) => listarDirs(resolve(ROOT, dir)),
      existe: (r) => existsSync(resolve(ROOT, r)),
      plataformas: [{ framework, apps: `platforms/${framework}/apps` }],
    }).length,
  unir: join,
};

/** Un árbol de mentira: el conjunto de rutas que existen, y qué contiene cada una. */
const discoFalso = (contenido, { declaradas = [], fuentes = () => 0, fuentesDe } = {}) => ({
  raiz: '',
  declaradas,
  existe: (r) => Object.hasOwn(contenido, r),
  leerJson: (r) => JSON.parse(contenido[r]),
  leer: (r) => contenido[r],
  fuentes,
  // Por defecto: los ficheros del árbol de mentira que cuelgan del directorio.
  fuentesDe: fuentesDe ?? ((dir) => Object.keys(contenido).filter((k) => k.startsWith(`${dir}/`))),
  unir: (...p) => p.filter(Boolean).join('/'),
});

describe('el contrato de una plataforma (#62)', () => {
  it('EL CRUCE QUE IMPORTA: `platforms/angular/` cumple las siete, sin excepciones', () => {
    // Es la prueba de que el contrato se derivó de lo que HAY y no de un ideal.
    // Si hiciera falta escribirle una excepción a la única plataforma viva, el
    // contrato estaría mal derivado — lo dice el ticket con todas las letras, y
    // es lo que obligó a dejar la obligación 6 fuera de alcance en vez de
    // exigirle a Angular un `platforms/angular/tools/build-runtime.mjs` que no
    // tiene (su constructor de runtime vive en la raíz).
    expect(revisarPlataforma({ ...discoReal, framework: 'angular' })).toEqual([]);
  });

  it('…y todas las construibles del disco, que hoy es esa una', () => {
    const frameworks = frameworksConstruibles({
      raiz: ROOT, listarDirs, existe: existsSync, unir: join,
    });
    // Red de seguridad: sin esto, un descubrimiento que deja de ver haría pasar
    // el cruce de arriba sobre cero plataformas.
    expect(frameworks.length).toBeGreaterThan(0);
    expect(revisarContratoDePlataformas({ ...discoReal, frameworks })).toEqual([]);
  });

  it('MUTACIÓN — una plataforma con SÓLO el package.json y su entrada en PLATFORMS', () => {
    // El fixture del ticket, con el aviso de la regla 25(d) atendido: la entrada
    // en PLATFORMS está puesta para que la obligación 2 no sea la que hable y el
    // rechazo que se lee sea el de las piezas que faltan.
    const faltan = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"name":"react-platform"}' },
        { declaradas: ['angular', 'react'] },
      ),
      framework: 'react',
    });

    // Las cuatro comprobables que faltan: apps, build, cdn.config y sync:tokens.
    expect(faltan.map((f) => f.n)).toEqual([3, 4, 5, 7, 8]);
    // Y cada una con su ruta esperada, no un «falta algo».
    expect(faltan.find((f) => f.n === 5).detalle).toContain('platforms/react/cdn.config.mjs');
    expect(faltan.find((f) => f.n === 3).detalle).toContain('platforms/react/apps');
  });

  it('…y el informe las lista UNA POR UNA, con su número', () => {
    const errores = revisarContratoDePlataformas({
      ...discoFalso(
        { 'platforms/react/package.json': '{"name":"react-platform"}' },
        { declaradas: ['react'] },
      ),
      frameworks: ['react'],
    });

    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('no cumple 5 de las 8');
    for (const n of [3, 4, 5, 7, 8]) expect(errores[0]).toContain(`(${n})`);
  });

  it('una carpeta SIN package.json falla por la 1, que es la que la hace plataforma', () => {
    const faltan = revisarPlataforma({
      ...discoFalso({ 'platforms/notas/apuntes.md': '' }),
      framework: 'notas',
    });
    expect(faltan.map((f) => f.n)).toContain(1);
  });

  it('`apps/` presente y VACÍA falla distinto que `apps/` ausente', () => {
    // No es lo mismo «no hay dónde buscar» que «hay dónde y no hay nada»: lo
    // segundo es casi siempre la extensión del fichero de entrada, y el mensaje
    // lo dice para que nadie vaya a mirar el registry (es el hallazgo de #59).
    const conApps = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/cdn.config.mjs': 'export const EXTERNALS = [];' },
        { declaradas: ['react'] },
      ),
      framework: 'react',
    });

    expect(conApps.map((f) => f.n)).toContain(3);
    expect(conApps.find((f) => f.n === 3)).toBeDefined();
    expect(conApps[0].detalle).toContain('main.ts');
  });

  it('un cdn.config.mjs que no exporta EXTERNALS no vale por existir', () => {
    // La clave que el build lee. Un fichero presente y mudo deja a cada elemento
    // empaquetando su framework entero, sin que nada falle.
    const faltan = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/cdn.config.mjs': '// todavía nada' },
        { declaradas: ['react'], fuentes: () => 3 },
      ),
      framework: 'react',
    });

    expect(faltan.map((f) => f.n)).toContain(5);
    expect(faltan.find((f) => f.n === 5).detalle).toContain('no exporta EXTERNALS');
  });

  it('OBLIGACIÓN 8 — sin adaptador que implemente ElementProtocol, rojo (#62)', () => {
    // La interfaz vive en vitals/core y dice ser la que «every framework must
    // implement to register a Web Component». Sin nadie que la implemente es un
    // comentario con sintaxis — la regla 24, y en la capa agnóstica, que es
    // donde la lee quien escriba la segunda plataforma.
    const faltan = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/cdn.config.mjs': 'export const EXTERNALS = [];',
          'platforms/react/libs/montar.ts': 'export class X { mount() {} }' },
        { declaradas: ['react'], fuentes: () => 3 },
      ),
      framework: 'react',
    });

    expect(faltan.map((f) => f.n)).toEqual([8]);
    expect(faltan[0].detalle).toContain('ElementProtocol');
  });

  it('…y con el adaptador, verde', () => {
    const faltan = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/cdn.config.mjs': 'export const EXTERNALS = [];',
          'platforms/react/libs/montar.ts': 'export class R implements ElementProtocol { }' },
        { declaradas: ['react'], fuentes: () => 3 },
      ),
      framework: 'react',
    });

    expect(faltan).toEqual([]);
  });

  it('EL SEGUNDO DIENTE — un elemento que registra por su cuenta deja el adaptador de adorno', () => {
    // Es la forma en que un contrato honrado vuelve a ser decorativo sin que
    // nada falle: el adaptador existe, y 127 elementos siguen llamando a
    // `customElements.define` como antes.
    const faltan = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/apps/badge/src/main.ts': "customElements.define('synergos-badge', X);",
          'platforms/react/cdn.config.mjs': 'export const EXTERNALS = [];',
          'platforms/react/libs/montar.ts': 'export class R implements ElementProtocol { }' },
        { declaradas: ['react'], fuentes: () => 3 },
      ),
      framework: 'react',
    });

    expect(faltan.map((f) => f.n)).toEqual([8]);
    expect(faltan[0].detalle).toContain('por su cuenta');
  });

  it('…y no lo engaña un comentario que lo mencione', () => {
    // Un gate que mide su propia explicación no mide nada. Acá: el adaptador
    // sólo NOMBRADO en prosa no cuenta, y un `define` comentado tampoco rompe.
    const soloProsa = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/cdn.config.mjs': 'export const EXTERNALS = [];',
          'platforms/react/libs/montar.ts': '// algún día: implements ElementProtocol' },
        { declaradas: ['react'], fuentes: () => 3 },
      ),
      framework: 'react',
    });
    expect(soloProsa.map((f) => f.n)).toEqual([8]);

    const defineComentado = revisarPlataforma({
      ...discoFalso(
        { 'platforms/react/package.json': '{"scripts":{"build":"x","sync:tokens:check":"y"}}',
          'platforms/react/apps': '',
          'platforms/react/apps/badge/src/main.ts': "/* antes: customElements.define('x', X); */",
          'platforms/react/cdn.config.mjs': 'export const EXTERNALS = [];',
          'platforms/react/libs/montar.ts': 'export class R implements ElementProtocol { }' },
        { declaradas: ['react'], fuentes: () => 3 },
      ),
      framework: 'react',
    });
    expect(defineComentado).toEqual([]);
  });

  it('el gate DICE qué no mide, en vez de contarlo como cubierto', () => {
    // La mitad honesta. Un gate que se cree más listo de lo que es es peor que
    // no tenerlo: alguien deja de mirar confiando en él.
    expect(OBLIGACIONES).toHaveLength(8);
    expect([...FUERA_DE_ALCANCE.keys()].sort()).toEqual([4, 6]);
    for (const razon of FUERA_DE_ALCANCE.values()) {
      // Y la razón nombra a quién SÍ la mide — sin eso es un «no lo hacemos».
      expect(razon.length).toBeGreaterThan(60);
    }
    expect(FUERA_DE_ALCANCE.get(6)).toContain('cdn-runtime-check');
    expect(FUERA_DE_ALCANCE.get(4)).toContain('publish.mjs');
  });
});
