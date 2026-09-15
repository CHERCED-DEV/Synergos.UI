import { describe, it, expect } from 'vitest';
import { resolverImportMap, atributosDeMuestra, paginaDelBanco } from './banco-de-pruebas.mjs';
import { resolverRuta } from './dev-cdn-routes.mjs';

describe('el import map del banco', () => {
  it('sustituye el marcador que deja el BUILD', () => {
    // El fixture lleva `__BASE_URL__` a propósito: es lo que hay en `dist/`, que
    // es de donde lee el servidor de desarrollo. El mapa de `public/` ya viene
    // sustituido por `publish-runtime`, así que un fixture copiado de ahí
    // pasaría en verde con el defecto puesto — que es exactamente cómo escribí
    // este módulo la primera vez.
    const mapa = resolverImportMap({
      imports: { '@angular/core': '__BASE_URL__/runtime/angular/21.1.6/ng-core.js' },
    });
    expect(mapa.imports['@angular/core']).toBe('/synergos/runtime/angular/21.1.6/ng-core.js');
  });

  it('devuelve null si algo quedó sin resolver', () => {
    // Media hidratación es peor que ninguna: parece que el elemento está roto y
    // no el mapa. Un marcador distinto no se adivina — se rechaza el mapa entero.
    expect(resolverImportMap({
      imports: {
        '@angular/core': '__BASE_URL__/a.js',
        rxjs: '__OTRA_COSA__/b.js',
      },
    }, '/synergos')).toBeNull();
  });

  it('devuelve null con un mapa sin forma de mapa', () => {
    expect(resolverImportMap(null)).toBeNull();
    expect(resolverImportMap({})).toBeNull();
    expect(resolverImportMap({ imports: {} })).toBeNull();
  });
});

describe('la página del banco', () => {
  const mapaBueno = { imports: { '@angular/core': '__BASE_URL__/ng-core.js' } };
  const inputs = [
    { name: 'config', type: 'json' },
    { name: 'text', type: 'string', default: '' },
    { name: 'tone', type: 'string', default: 'neutral' },
    { name: 'veces', type: 'number' },
  ];

  it('emite el import map, el módulo y el tag — las tres cosas', () => {
    // Las tres hacen falta y ninguna sola sirve: sin mapa el módulo no resuelve,
    // sin módulo no se registra el custom element, sin tag no hay qué montar.
    const html = paginaDelBanco({
      elemento: 'badge', tag: 'synergos-badge', framework: 'angular',
      importMap: mapaBueno, inputs,
    });
    expect(html).toContain('type="importmap"');
    expect(html).toContain('/synergos/badge/angular/latest/main.js');
    expect(html).toContain('<synergos-badge ');
    expect(html).not.toContain('__BASE_URL__');
  });

  it('sin runtime NO emite un mapa roto: lo dice', () => {
    // El modo de fallo que este banco viene a cerrar es el del defecto #126 del
    // CMS: un import map que no resuelve no da error, deja el elemento sin
    // hidratar en silencio. Así que o se emite uno bueno o se explica.
    const html = paginaDelBanco({
      elemento: 'badge', tag: 'synergos-badge', framework: 'angular',
      importMap: null, inputs,
    });
    expect(html).not.toContain('type="importmap"');
    expect(html).not.toContain('type="module" src');
    expect(html).toContain('No hay runtime compilado');
  });

  it('el `config` json NO se rellena de muestra', () => {
    // Inventarse un `config` sería inventarse la forma del contenido, que es
    // distinta en cada elemento — y un banco que enseña una forma equivocada es
    // peor que uno vacío.
    expect(atributosDeMuestra(inputs).map((a) => a.nombre)).toEqual(['text', 'tone', 'veces']);
  });

  it('el default gana sobre la muestra cuando lo hay', () => {
    const porNombre = Object.fromEntries(atributosDeMuestra(inputs).map((a) => [a.nombre, a.valor]));
    expect(porNombre.tone).toBe('neutral');      // default declarado
    expect(porNombre.text).toContain('muestra'); // default vacío → muestra
    expect(porNombre.veces).toBe('1');           // sin default, por tipo
  });

  it('dice que es un banco y no una vista previa', () => {
    // Un banco que se confunde con la realidad hace que alguien apruebe un
    // diseño contra un fondo que no existe: acá no hay tema del CMS.
    const html = paginaDelBanco({
      elemento: 'badge', tag: 'synergos-badge', framework: 'angular',
      importMap: mapaBueno, inputs: [],
    });
    expect(html).toContain('Banco de desarrollo');
    expect(html).toContain('MUESTRA');
  });
});

describe('la ruta del banco', () => {
  it('vive FUERA de /synergos/, que es el layout que se imita', () => {
    // Meter una ruta de desarrollo dentro de ese prefijo ensuciaría justo el
    // contrato que el gate `dev-cdn-routes` protege.
    expect(resolverRuta('/probar/badge', 'angular')).toEqual({ tipo: 'banco', elemento: 'badge' });
    expect(resolverRuta('/probar', 'angular')).toEqual({ tipo: 'banco', elemento: null });
    expect(resolverRuta('/synergos/registry.json', 'angular').tipo).toBe('registry');
  });

  it('no acepta rutas anidadas', () => {
    // No hay nada que anidar, y aceptarlas invita a colarle un path traversal.
    expect(resolverRuta('/probar/a/b', 'angular')).toEqual({ tipo: 'nada' });
    expect(resolverRuta('/probar/../etc/passwd', 'angular')).toEqual({ tipo: 'nada' });
  });
});
