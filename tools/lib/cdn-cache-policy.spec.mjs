import { describe, it, expect } from 'vitest';
import { cacheControlFor, corsFor, UN_ANO, CORTO, INDICE } from './cdn-cache-policy.mjs';

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
      '/synergos/runtime/angular/21.1.6/import-map.json',
      '/synergos/card/vanilla/2.0.0-rc.1/main.js',
    ])('%s', (ruta) => {
      const cc = cacheControlFor(ruta);
      expect(cc).toContain('immutable');
      expect(cc).toContain(`max-age=${UN_ANO}`);
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
