import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  maxAge,
  muestrasPorFramework,
  comprobacionesGlobales,
  comprobacionesDeFramework,
  runtimeDelImportMap,
  juzgar,
} from './cdn-smoke.mjs';
import { UN_ANO, CORTO, INDICE } from './cdn-cache-policy.mjs';

/**
 * El humo del CDN (issue #9).
 *
 * Estos tests NO prueban que el CDN funcione — eso no se puede probar sin el
 * CDN, y ese es justamente el punto del ticket. Prueban las dos cosas que sí
 * son código: cómo se lee una respuesta, y que el humo apunte hacia afuera.
 *
 * La segunda importa más que la primera:
 *
 *   > Un humo contra sí mismo PASA SIEMPRE, y el único síntoma es que nunca
 *   > falla. Es el fallo más fácil de escribir y el más difícil de notar.
 */

const HUMO = path.join(import.meta.dirname, '../humo-cdn.mjs');
const fuente = readFileSync(HUMO, 'utf8');

describe('el humo apunta hacia afuera', () => {
  it('no menciona localhost ni 127.0.0.1 en ninguna parte', () => {
    // Esta es la razón por la que el humo vive en su propio fichero y no dentro
    // del YAML del workflow: metido ahí, este gate tendría que leer YAML y
    // distinguir el humo del resto de pasos — o sea, no existiría.
    const codigo = fuente.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, ''); // sin comentarios
    expect(codigo).not.toMatch(/localhost/i);
    expect(codigo).not.toMatch(/127\.0\.0\.1/);
    expect(codigo).not.toMatch(/wrangler\s+dev/i);
  });

  it('la URL viene de fuera y NO tiene valor por defecto', () => {
    // Un default —aunque fuera el de producción— es la puerta por la que entra
    // el humo contra sí mismo: alguien lo corre sin argumento, pasa, y nadie se
    // entera de que no comprobó el despliegue que quería comprobar.
    expect(fuente).toMatch(/const BASE = process\.argv\[2\]/);
    expect(fuente).toMatch(/process\.exit\(2\)/); // sale mal sin argumento
  });

  it('ningún elemento va cableado: la muestra sale del registry', () => {
    // Un `badge` escrito a mano se pudre el día que alguien lo renombre.
    expect(fuente).toMatch(/muestrasPorFramework\(registry\)/);
  });

  it('ningún FRAMEWORK va cableado (issue #44)', () => {
    // Éste es el que importa más, y por una razón fea: un elemento cableado da
    // rojo el día que se renombra, y se nota. Un framework cableado da VERDE
    // sobre el framework equivocado, y no se nota nunca.
    const codigo = fuente.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, ''); // sin comentarios
    expect(codigo).not.toMatch(/['"`\/]angular[\/'"`]/);
    expect(codigo).not.toMatch(/ng-core\.js/);
  });
});

describe('maxAge', () => {
  it.each([
    ['public, max-age=60, must-revalidate', 60],
    ['public, max-age=31536000, immutable', UN_ANO],
    ['no-store', null],
    [undefined, null],
  ])('%s → %s', (cc, esperado) => {
    expect(maxAge(cc)).toBe(esperado);
  });
});

describe('muestrasPorFramework', () => {
  const con = (name, impls) => ({
    name,
    implementations: Object.fromEntries(
      Object.entries(impls).map(([fw, latest]) => [fw, { latest }]),
    ),
  });

  it('toma el primero que tenga bundle publicado', () => {
    const r = { elements: [con('academy', { angular: '0.1.0' }), con('badge', { angular: '0.1.0' })] };
    expect(muestrasPorFramework(r)).toEqual([
      { framework: 'angular', nombre: 'academy', version: '0.1.0' },
    ]);
  });

  it('se salta los que sólo están declarados y no publicados', () => {
    // Que el registry traiga entradas sin implementación es legítimo: el CMS
    // declara tipos antes de que exista el web component. Pero con esas no hay
    // nada que pedirle al CDN, y pedirlas daría un 404 que no significa nada.
    const r = { elements: [{ name: 'fantasma', implementations: {} }, con('badge', { angular: '0.1.0' })] };
    expect(muestrasPorFramework(r)[0].nombre).toBe('badge');
  });

  it('DOS frameworks publicados dan DOS muestras — el defecto del issue #44', () => {
    // Con `angular` cableado, el humo comprobaba una y daba el despliegue por
    // bueno. El fixture tiene que llevar un elemento que SÓLO exista en el
    // segundo framework: si los dos publicaran los mismos elementos, tomar el
    // primero de cada uno daría el mismo nombre y no se distinguiría «miré los
    // dos» de «miré uno».
    const r = {
      elements: [con('badge', { angular: '0.1.0' }), con('solo-react', { react: '9.9.9' })],
    };
    expect(muestrasPorFramework(r)).toEqual([
      { framework: 'angular', nombre: 'badge', version: '0.1.0' },
      { framework: 'react', nombre: 'solo-react', version: '9.9.9' },
    ]);
  });

  it('un registry vacío es un despliegue vacío, y se dice así', () => {
    // Un despliegue vacío es peor que uno fallido: responde 200 a la portada y
    // 404 a todo lo demás, sin que nada se haya puesto rojo.
    expect(() => muestrasPorFramework({ elements: [] })).toThrow(/vacío/);
  });

  it('elementos declarados y NINGUNO publicado también se dice', () => {
    // No se cae a pedir `/angular/`: eso daría un 404 que se lee como CDN roto
    // cuando lo que pasa es que no hay nada publicado.
    expect(() => muestrasPorFramework({ elements: [{ name: 'x', implementations: {} }] })).toThrow(
      /ninguno con implementación publicada/,
    );
  });
});

describe('runtimeDelImportMap', () => {
  const mapa = (fw, ver) => ({
    imports: { '@angular/core': `/synergos/runtime/${fw}/${ver}/ng-core.js` },
  });

  it('la versión y la ruta salen del propio mapa, no de una constante', () => {
    expect(runtimeDelImportMap(mapa('angular', '21.1.6'), 'angular')).toEqual({
      version: '21.1.6',
      ruta: '/synergos/runtime/angular/21.1.6/ng-core.js',
    });
  });

  it('y eso vale para un framework cuyo asset NO se llama ng-core.js', () => {
    const r = { imports: { react: '/synergos/runtime/react/19.2.0/react-runtime.js' } };
    expect(runtimeDelImportMap(r, 'react')).toEqual({
      version: '19.2.0',
      ruta: '/synergos/runtime/react/19.2.0/react-runtime.js',
    });
  });

  it('un mapa del framework EQUIVOCADO no se da por bueno', () => {
    // El regex viejo era `/runtime\/angular\/([^/]+)\//` sobre el primer
    // import cualquiera: pedirle el mapa de react y leerlo con ese patrón daba
    // `undefined` y el humo decía «no dice qué versión sirve», sin nombrar al
    // framework. Acá falla y lo nombra.
    expect(() => runtimeDelImportMap(mapa('angular', '21.1.6'), 'react')).toThrow(/react/);
  });
});

const RUNTIME_NG = { version: '21.1.6', ruta: '/synergos/runtime/angular/21.1.6/ng-core.js' };
const MUESTRA = { nombre: 'badge', version: '0.1.0', framework: 'angular' };

describe('juzgar', () => {
  const cabeceras = (o) => new Map(Object.entries(o));
  const rutas = () => [...comprobacionesGlobales(), ...comprobacionesDeFramework(MUESTRA, RUNTIME_NG)];
  const buscar = (frag) => rutas().find((c) => c.ruta.includes(frag));

  it('un bundle versionado, servido bien, pasa', () => {
    const fallos = juzgar(buscar('/0.1.0/'), {
      estado: 200,
      cabeceras: cabeceras({
        'cache-control': `public, max-age=${UN_ANO}, immutable`,
        'access-control-allow-origin': '*',
      }),
    });
    expect(fallos).toEqual([]);
  });

  it('SIN CORS falla, y el motivo nombra al CMS', () => {
    // Es el fallo que ya mordió. El síntoma en el navegador no menciona el CDN,
    // así que el mensaje tiene que hacerlo.
    const fallos = juzgar(buscar('/0.1.0/'), {
      estado: 200,
      cabeceras: cabeceras({ 'cache-control': `public, max-age=${UN_ANO}, immutable` }),
    });
    expect(fallos.join(' ')).toContain('access-control-allow-origin');
    expect(fallos.join(' ')).toContain('CMS');
  });

  it('`immutable` sobre una ruta que se mueve es el fallo más caro, y se dice', () => {
    const fallos = juzgar(buscar('/latest/main.js'), {
      estado: 200,
      cabeceras: cabeceras({
        'cache-control': `public, max-age=${UN_ANO}, immutable`,
        'access-control-allow-origin': '*',
      }),
    });
    expect(fallos.join(' ')).toContain('SE MUEVE');
    expect(fallos.join(' ')).toContain('un año');
  });

  it('lo que ya mordió de verdad: max-age=0 y sin CORS, o sea el Worker sin correr', () => {
    // El estado EXACTO del CDN el día que se estrenó, con `run_worker_first`
    // sin poner. Los 17 tests de política de caché estaban en verde.
    const fallos = juzgar(buscar('/registry.json'), {
      estado: 200,
      cabeceras: cabeceras({ 'cache-control': 'public, max-age=0, must-revalidate' }),
    });
    expect(fallos.length).toBe(2); // el max-age y el CORS
  });

  it('un 404 con caché larga falla: es un bundle nuevo que no existe para alguien', () => {
    const fallos = juzgar(buscar('no-existe'), {
      estado: 404,
      cabeceras: cabeceras({ 'cache-control': `public, max-age=${UN_ANO}, immutable` }),
    });
    expect(fallos.length).toBe(2); // cacheó un "no existe" + immutable
  });

  it('un 404 sin cabeceras de caché pasa', () => {
    expect(juzgar(buscar('no-existe'), { estado: 404, cabeceras: cabeceras({}) })).toEqual([]);
  });

  it('un estado equivocado corta el informe ahí', () => {
    // Comparar cabeceras de un 404 de Cloudflare contra lo que se esperaba de
    // un 200 sólo añade ruido: el fallo es uno y es el estado.
    const fallos = juzgar(buscar('/registry.json'), { estado: 500, cabeceras: cabeceras({}) });
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('500');
  });
});

describe('las comprobaciones cubren lo que sólo se ve en vivo', () => {
  const todas = [...comprobacionesGlobales(), ...comprobacionesDeFramework(MUESTRA, RUNTIME_NG)];

  it('las seis rutas del ticket: dos del despliegue y cuatro por framework', () => {
    expect(comprobacionesGlobales()).toHaveLength(2);
    expect(comprobacionesDeFramework(MUESTRA, RUNTIME_NG)).toHaveLength(4);
    expect(todas).toHaveLength(6);
  });

  it('incluyen las tres políticas de caché distintas', () => {
    const edades = todas.map((c) => c.maxAge).filter((e) => e !== undefined);
    expect(edades).toContain(UN_ANO); // versión exacta
    expect(edades).toContain(CORTO); //  latest
    expect(edades).toContain(INDICE); // registry
  });

  it('y el runtime, que es lo que se olvidó en el CDN del CMS', () => {
    expect(todas.some((c) => c.ruta.includes('/runtime/angular/'))).toBe(true);
  });

  it('un SEGUNDO framework pide sus cuatro rutas bajo SU segmento (issue #44)', () => {
    // Con el literal cableado, éstas cuatro se pedían bajo `/angular/`: cuatro
    // 404 si el elemento no existe ahí, o —peor— cuatro 200 del bundle de otra
    // plataforma dando el despliegue de React por bueno.
    const react = comprobacionesDeFramework(
      { nombre: 'card', version: '2.0.0', framework: 'react' },
      { version: '19.2.0', ruta: '/synergos/runtime/react/19.2.0/react-runtime.js' },
    );
    expect(react.every((c) => c.ruta.includes('/react/'))).toBe(true);
    expect(react.some((c) => c.ruta.includes('/angular/'))).toBe(false);
    expect(react.map((c) => c.ruta)).toContain('/synergos/card/react/latest/main.js');
    expect(react.map((c) => c.ruta)).toContain('/synergos/runtime/react/19.2.0/react-runtime.js');
  });

  it('una muestra sin framework NO cae a angular: se para', () => {
    expect(() => comprobacionesDeFramework({ nombre: 'x', version: '1' }, RUNTIME_NG)).toThrow(
      /de qué framework/,
    );
  });
});
