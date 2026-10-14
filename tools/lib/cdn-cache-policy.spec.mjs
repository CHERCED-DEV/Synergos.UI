import { describe, it, expect } from 'vitest';
import {
  cacheControlFor,
  corsFor,
  decorarRespuesta,
  HUELLA_EN_NOMBRE,
  RUNTIME,
  UN_ANO,
  CORTO,
  INDICE,
} from './cdn-cache-policy.mjs';
import { CARPETA_RUNTIME } from './mapa-del-runtime.mjs';
import { RUNTIME as RUNTIME_DE_FRAMEWORKS } from './frameworks.mjs';
import worker from '../../worker/index.js';

/**
 * La política de caché del CDN.
 *
 * El defecto que estos tests existen para atrapar no se ve en un log ni rompe
 * un build:
 *
 *   > Poner `immutable` en una ruta que se mueve significa publicar una versión
 *   > nueva y que **nadie la vea durante un año**. Y no se arregla purgando la
 *   > caché — está en el navegador de cada visitante, y no la controlamos.
 *
 * Por eso hay más tests de lo que NO se cachea largo que de lo que sí.
 */
describe('cacheControlFor', () => {
  describe('lo que se mueve NUNCA es inmutable', () => {
    it.each([
      '/synergos/hero/angular/latest/main.js',
      '/synergos/hero/react/latest/manifest.json',
      '/synergos/quiz-flow/svelte/latest/meta.json',
      '/synergos/runtime/angular/latest/import-map.json',
    ])('%s', (ruta) => {
      const cc = cacheControlFor(ruta);
      expect(cc).not.toContain('immutable');
      expect(cc).toContain(`max-age=${CORTO}`);
    });

    it('un alias mayor tampoco: su sentido es seguir a la última compatible', () => {
      expect(cacheControlFor('/synergos/hero/angular/v0/main.js')).not.toContain('immutable');
      expect(cacheControlFor('/synergos/hero/angular/v12/main.js')).not.toContain('immutable');
    });

    it('y basta con que se mueva UN segmento, esté donde esté', () => {
      // Se mira la ruta entera y no una posición fija: la estructura del
      // runtime tiene otra profundidad que la de los elementos, y el día que
      // cambie de nuevo la regla sigue siendo cierta.
      expect(cacheControlFor('/synergos/latest/lo/que/sea/1.0.0/x.js')).not.toContain('immutable');
    });
  });

  describe('lo que no se mueve sí', () => {
    it.each([
      '/synergos/hero/angular/0.1.0/main.js',
      '/synergos/hero/react/1.4.2/styles.css',
      '/synergos/card/vanilla/2.0.0-rc.1/main.js',
      '/synergos/eventos/angular/0.1.10/main.js',
    ])('%s', (ruta) => {
      const cc = cacheControlFor(ruta);
      expect(cc).toContain('immutable');
      expect(cc).toContain(`max-age=${UN_ANO}`);
    });
  });

  // ── El runtime compartido (ADR 0140, CMS#201) ──────────────────────────────
  //
  // Es la MISMA tabla que `PoliticaDeCacheDelCdnLocalTests` del CMS: las dos
  // políticas tienen que prometer `immutable` exactamente a lo mismo.
  //
  // `/synergos/runtime/angular/21.1.6/import-map.json` estaba arriba, en «lo que
  // no se mueve», y AFIRMABA el defecto: la carpeta lleva la versión de Angular,
  // no la de su contenido, y `publish:runtime` la reescribe cada vez que cambia
  // `libs/shared`. Quien ya tenía el `sg-shared.js` viejo se quedaba con él un año.
  describe('el runtime sin huella se revalida', () => {
    it.each([
      '/synergos/runtime/angular/21.1.6/import-map.json',
      '/synergos/runtime/angular/21.1.6/sg-shared.js',
      '/synergos/runtime/preact/10.29.8/preact.js',
      '/synergos/runtime/preact/10.29.8/sg-preact-core.js',
      '/synergos/runtime/angular/latest/huellas.json',
      '/synergos/runtime/angular/latest/import-map.json',
      // En `latest/` ni con huella: lo que se mueve gana, esté donde esté.
      '/synergos/runtime/angular/latest/sg-shared.18a9decbae7fffb0.js',
    ])('%s', (ruta) => {
      const cc = cacheControlFor(ruta);
      expect(cc).not.toContain('immutable');
      expect(cc).toContain(`max-age=${CORTO}`);
    });

    it.each([
      ['15 hex', '/synergos/runtime/angular/21.1.6/sg-shared.18a9decbae7fffb.js'],
      ['hex en mayúsculas', '/synergos/runtime/angular/21.1.6/sg-shared.18A9DECBAE7FFFB0.js'],
      ['otra extensión', '/synergos/runtime/angular/21.1.6/x.0123456789abcdef.css'],
      ['17 hex', '/synergos/runtime/angular/21.1.6/sg-shared.18a9decbae7fffb01.js'],
    ])('lo que PARECE una huella y no lo es (%s) tampoco promete nada', (_caso, ruta) => {
      expect(cacheControlFor(ruta)).toBe(`public, max-age=${CORTO}, must-revalidate`);
    });
  });

  describe('el runtime con huella, un año', () => {
    it.each([
      '/synergos/runtime/angular/21.1.6/sg-shared.18a9decbae7fffb0.js',
      '/synergos/runtime/preact/10.29.8/sg-preact-core.0123456789abcdef.js',
      '/synergos/runtime/angular/21.1.6/ng-core.0123456789abcdef.mjs',
    ])('%s', (ruta) => {
      expect(cacheControlFor(ruta)).toBe(`public, max-age=${UN_ANO}, immutable`);
    });

    it('la regex de la huella es la que casa con ese nombre, y no con el plano', () => {
      expect(HUELLA_EN_NOMBRE.test('sg-shared.18a9decbae7fffb0.js')).toBe(true);
      expect(HUELLA_EN_NOMBRE.test('sg-shared.js')).toBe(false);
      expect(HUELLA_EN_NOMBRE.test('import-map.json')).toBe(false);
    });

    it('la carpeta del runtime es UNA: la misma en la política, en el mapa y en el censo', () => {
      // La política la repite para que el Worker no cargue las otras tablas; el
      // cruce es lo que impide que una se renombre sin la otra.
      expect(RUNTIME).toBe(CARPETA_RUNTIME);
      expect(RUNTIME).toBe(RUNTIME_DE_FRAMEWORKS);
    });
  });

  describe('el índice', () => {
    it('se cachea corto: es lo que hay que releer para saber que salió algo', () => {
      // Cachear el registry mucho es lo mismo que no publicar — el CMS lo relee
      // para enterarse de qué versiones existen.
      const cc = cacheControlFor('/synergos/registry.json');
      expect(cc).toContain(`max-age=${INDICE}`);
      expect(cc).not.toContain('immutable');
    });
  });

  describe('ante la duda, corto', () => {
    it.each([
      '/',
      '/index.html',
      '/synergos/algo-sin-version/main.js',
      '/synergos/hero/angular/rama-rara/main.js',
    ])('%s no promete nada', (ruta) => {
      // El default es el conservador a propósito: una caché corta de más cuesta
      // ancho de banda; una larga de más cuesta el producto.
      expect(cacheControlFor(ruta)).not.toContain('immutable');
    });
  });
});

describe('corsFor', () => {
  it('el CDN se consume desde OTRO origen — sin esto el navegador descarga y se niega a ejecutar', () => {
    expect(corsFor('/synergos/hero/angular/0.1.0/main.js')).toBe('*');
    expect(corsFor('/synergos/registry.json')).toBe('*');
  });

  it('la vitrina no lo necesita: se visita, no se consume', () => {
    expect(corsFor('/index.html')).toBeNull();
  });
});

/**
 * El 304 (ADR 0140, CMS#201). Es la respuesta a una revalidación —la de
 * `latest/import-map.json` en cada página— y salía SIN la política y sin CORS,
 * porque el Worker devolvía todo lo que no fuera `ok` tal cual.
 */
describe('decorarRespuesta', () => {
  const RUTA = '/synergos/runtime/angular/latest/import-map.json';

  it.each([200, 304])('un %s lleva la política y el CORS', (status) => {
    expect(decorarRespuesta(status, RUTA)).toEqual({
      'Cache-Control': `public, max-age=${CORTO}, must-revalidate`,
      'Access-Control-Allow-Origin': '*',
    });
  });

  it.each([404, 500])('un %s no lleva ninguna: cachear un «no existe» es un bundle que no existe para alguien', (status) => {
    expect(decorarRespuesta(status, RUTA)).toBeNull();
  });

  it('la vitrina lleva la política y no el CORS', () => {
    expect(decorarRespuesta(200, '/index.html')).toEqual({
      'Cache-Control': `public, max-age=${CORTO}, must-revalidate`,
    });
  });
});

describe('el Worker', () => {
  // `env.ASSETS` falso: contesta lo que se le diga, como el binding de Cloudflare.
  const conAssets = (status, cabeceras = {}) => ({
    ASSETS: { fetch: async () => new Response(null, { status, headers: cabeceras }) },
  });
  const pedir = (ruta, env) => worker.fetch(new Request(`https://cdn.example${ruta}`), env);

  it('el 304 sale con la misma política y el mismo CORS que el 200', async () => {
    const ruta = '/synergos/runtime/angular/21.1.6/sg-shared.18a9decbae7fffb0.js';
    const respuesta = await pedir(ruta, conAssets(304, { etag: '"x"' }));

    expect(respuesta.status).toBe(304);
    expect(respuesta.headers.get('cache-control')).toBe(`public, max-age=${UN_ANO}, immutable`);
    expect(respuesta.headers.get('access-control-allow-origin')).toBe('*');
    expect(respuesta.headers.get('etag')).toBe('"x"');
  });

  it('el 200 sigue igual', async () => {
    const respuesta = await pedir('/synergos/hero/angular/0.1.0/main.js', conAssets(200));
    expect(respuesta.headers.get('cache-control')).toBe(`public, max-age=${UN_ANO}, immutable`);
    expect(respuesta.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('el 404 sale intacto: sin caché y sin CORS', async () => {
    const assets = conAssets(404);
    const original = await assets.ASSETS.fetch();
    const env = { ASSETS: { fetch: async () => original } };

    const respuesta = await pedir('/synergos/no-existe/angular/latest/main.js', env);
    expect(respuesta).toBe(original);
    expect(respuesta.headers.get('cache-control')).toBeNull();
    expect(respuesta.headers.get('access-control-allow-origin')).toBeNull();
  });
});
