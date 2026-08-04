import { describe, it, expect } from 'vitest';
import {
  resolverRuta, cabecerasDev, tipoDe, registryDeDesarrollo,
} from './dev-cdn-routes.mjs';
import { cacheControlFor } from './cdn-cache-policy.mjs';

/**
 * El mapeo de rutas del dev-cdn (issue #2).
 *
 * Lo que estos tests vigilan es que el servidor de desarrollo **imite el layout
 * del CDN publicado**. Si se desvía, el CMS resuelve distinto en desarrollo que
 * en producción — y entonces el ciclo rápido deja de probar lo que se va a
 * publicar, que es todo su valor.
 */

describe('resolverRuta — el layout que produce publish.mjs', () => {
  it.each([
    ['/synergos/badge/angular/latest/main.js', 'badge'],
    ['/synergos/badge/angular/v0/main.js', 'badge'],
    ['/synergos/badge/angular/0.1.0/main.js', 'badge'],
    ['/synergos/travel-shell/angular/1.4.2-rc.1/main.js', 'travel-shell'],
  ])('%s → el bundle de %s', (ruta, elemento) => {
    // Los TRES slots apuntan al mismo fichero: en desarrollo no hay versionado,
    // hay lo último que compilaste.
    expect(resolverRuta(ruta)).toEqual({ tipo: 'elemento', elemento, fichero: 'main.js' });
  });

  it('el runtime tiene otra profundidad y se resuelve aparte', () => {
    expect(resolverRuta('/synergos/runtime/angular/21.1.6/ng-core.js')).toEqual({
      tipo: 'runtime',
      fichero: 'ng-core.js',
    });
    expect(resolverRuta('/synergos/runtime/angular/latest/import-map.json')).toEqual({
      tipo: 'runtime',
      fichero: 'import-map.json',
    });
  });

  it.each([
    ['/', 'catalogo'],
    ['/index.html', 'catalogo'],
    ['/synergos/registry.json', 'registry'],
    ['/synergos/contracts.json', 'contratos'],
    ['/synergos/__dev.json', 'senal'],
  ])('%s → %s', (ruta, tipo) => {
    expect(resolverRuta(ruta).tipo).toBe(tipo);
  });

  describe('lo que NO se sirve', () => {
    it.each([
      ['/synergos/badge/react/latest/main.js', 'un framework que no existe'],
      ['/synergos/badge/angular/rama-rara/main.js', 'un slot que no es versión ni alias'],
      ['/synergos/badge/angular/latest', 'sin fichero'],
      ['/otra-cosa/badge/angular/latest/main.js', 'fuera de /synergos'],
      ['/synergos/runtime/angular/latest', 'runtime sin fichero'],
    ])('%s — %s', (ruta) => {
      expect(resolverRuta(ruta).tipo).toBe('nada');
    });

    it('no se puede salir de dist/ con un ..', () => {
      // Es un servidor de desarrollo, pero escucha en un puerto: lo que se
      // escribe acá se lee como permiso, así que mejor que no lo sea.
      expect(resolverRuta('/synergos/badge/angular/latest/../../../../etc/passwd').tipo).toBe('nada');
      expect(resolverRuta('/synergos/../../secreto/angular/latest/main.js').tipo).toBe('nada');
    });
  });
});

describe('cabecerasDev', () => {
  it('CORS abierto: sin esto el CMS no puede ejecutar el bundle', () => {
    // El CMS corre en otro origen (synergos.local:5000). Es el mismo fallo que
    // ya mordió en producción, y en desarrollo rompe el ciclo entero.
    expect(cabecerasDev('text/javascript')['Access-Control-Allow-Origin']).toBe('*');
  });

  it('NADA se cachea, y eso se aparta de producción a propósito', () => {
    // En producción esta misma ruta va con `immutable` y un año. Servir eso acá
    // significaría recompilar, recargar, y ver el bundle de hace media hora —
    // justo el ciclo que este servidor existe para eliminar.
    const dev = cabecerasDev('text/javascript')['Cache-Control'];
    expect(dev).toContain('no-store');
    expect(dev).not.toContain('immutable');

    // La divergencia es deliberada, y se deja demostrada: en producción, sí.
    expect(cacheControlFor('/synergos/badge/angular/0.1.0/main.js')).toContain('immutable');
  });
});

describe('tipoDe', () => {
  it.each([
    ['main.js', 'text/javascript; charset=utf-8'],
    ['registry.json', 'application/json; charset=utf-8'],
    ['catalog.html', 'text/html; charset=utf-8'],
    ['main.js.map', 'application/json; charset=utf-8'],
  ])('%s → %s', (f, tipo) => {
    expect(tipoDe(f)).toBe(tipo);
  });

  it('un .js mal servido como octet-stream no lo ejecuta el navegador', () => {
    // El síntoma es un error de sintaxis incomprensible en la consola del
    // consumidor, que no menciona el Content-Type por ningún lado.
    expect(tipoDe('main.js')).toContain('javascript');
  });
});

describe('registryDeDesarrollo', () => {
  const REGISTRO = [
    { name: 'badge', alias: 'elementBadge', tag: 'synergos-badge', tier: 'primitive' },
    { name: 'hero', alias: 'elementHero', tag: 'synergos-hero', tier: 'module' },
    { name: 'card', alias: 'elementCard', tag: 'synergos-card', tier: 'composition' },
  ];

  it('sólo anuncia lo que está COMPILADO', () => {
    // Anunciar un elemento que no está en dist/ es mentirle al CMS: lo pide y
    // se lleva un 404. Con --solo=badge,hero el registry tiene que decir dos,
    // o el CMS intenta hidratar los otros 137 y la página se llena de errores
    // que no son el que buscás.
    const r = registryDeDesarrollo(REGISTRO, (n) => n !== 'card', '0.1.0');

    expect(r.elements.map((e) => e.name)).toEqual(['badge', 'hero']);
  });

  it('conserva alias, tag y tier — el CMS resuelve por ahí', () => {
    const r = registryDeDesarrollo(REGISTRO, () => true, '0.1.0');
    expect(r.elements[0]).toMatchObject({
      name: 'badge',
      alias: 'elementBadge',
      tag: 'synergos-badge',
      tier: 'primitive',
    });
  });

  it('trae baseUrl y los slots que el cliente del CMS espera', () => {
    const r = registryDeDesarrollo(REGISTRO, () => true, '0.1.0');
    expect(r.baseUrl).toBe('/synergos');
    expect(r.elements[0].implementations.angular).toEqual({ latest: '0.1.0', v0: '0.1.0' });
  });

  it('nada compilado → registry vacío, no un registry a medias', () => {
    const r = registryDeDesarrollo(REGISTRO, () => false, '0.1.0');
    expect(r.elements).toEqual([]);
  });

  it('deduplica por nombre, igual que publish.mjs', () => {
    // El registry FUENTE trae 153 entradas con 147 nombres únicos: seis nombres
    // repetidos con alias distintos (elementCompAccordion / elementSynAccordion)
    // — varios tipos del CMS que comparten implementación. `publish.mjs` los
    // colapsa en un Map, y el registry publicado tiene 139. Si acá no se
    // colapsaran, desarrollo anunciaría más elementos que producción y el CMS
    // resolvería distinto en cada uno.
    const conDuplicados = [
      { name: 'accordion', alias: 'elementCompAccordion', tag: 'synergos-accordion', tier: 'composition' },
      { name: 'accordion', alias: 'elementSynAccordion', tag: 'synergos-accordion', tier: 'composition' },
    ];
    const r = registryDeDesarrollo(conDuplicados, () => true, '0.1.0');

    expect(r.elements).toHaveLength(1);
    expect(r.elements[0].alias).toBe('elementCompAccordion'); // gana la primera
  });

  it('lo que NO se está sirviendo no se anuncia, aunque el fichero exista', () => {
    // El defecto que esto atrapa lo encontré levantando el servidor: `dist/`
    // conserva lo de builds anteriores, asi que con --solo=badge,hero el
    // registry anunciaba los 139. El CMS habria hidratado 137 bundles de
    // antiguedad desconocida — codigo viejo con cara de nuevo, que es PEOR que
    // un 404 porque no se investiga.
    const enDisco = new Set(['badge', 'hero', 'card']);
    const soloEstos = new Set(['badge', 'hero']);
    const seSirve = (n) => soloEstos.has(n) && enDisco.has(n);

    const r = registryDeDesarrollo(REGISTRO, seSirve, '0.1.0');
    expect(r.elements.map((e) => e.name)).toEqual(['badge', 'hero']);
  });
});
