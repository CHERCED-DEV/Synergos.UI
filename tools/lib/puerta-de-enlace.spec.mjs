import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

import { ficherosDelMapa, revisarEnlace } from './puerta-de-enlace.mjs';

/**
 * La puerta de enlace de `publish.mjs` (ADR 0140, revisión de D1, CMS#201): un elemento que importa
 * del runtime algo que el runtime publicado no exporta no se publica. Contra esbuild de verdad,
 * sobre un CDN de mentira en disco: es esbuild quien dice «No matching export», como el navegador.
 */

const MAPA = '/synergos/runtime/angular/latest/import-map.json';

describe('la puerta de enlace', { timeout: 30_000 }, () => {
  let raiz;
  const escribir = (relativa, texto) => {
    const ruta = path.join(raiz, ...relativa.split('/'));
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, texto);
    return ruta;
  };
  const imports = {
    '@synergos/shared': '/synergos/runtime/angular/21.1.6/sg-shared.1111111111111111.js',
    '@angular/core': '/synergos/runtime/angular/21.1.6/ng-core.js',
  };

  beforeEach(() => {
    raiz = mkdtempSync(path.join(tmpdir(), 'puerta-de-enlace-'));
    escribir(
      'synergos/runtime/angular/21.1.6/sg-shared.1111111111111111.js',
      // Lo que importa el runtime no se mira: ni está en el mapa ni exporta «inventado».
      'import { inventado } from "@angular/otra";\nexport const viejo = 1;\nexport { inventado };\n',
    );
    escribir('synergos/runtime/angular/21.1.6/ng-core.js', 'export function signal() {}\n');
  });
  afterEach(() => rmSync(raiz, { recursive: true, force: true }));

  const revisar = (elementos) => revisarEnlace({ elementos, imports, raizCdn: raiz, rutaDelMapa: MAPA, build });

  it('lo que el runtime publicado exporta enlaza: ningún error', async () => {
    const ruta = escribir('dist/badge/main.js', 'import{viejo as a}from"@synergos/shared";import{signal as s}from"@angular/core";console.log(a,s);\n');

    expect(await revisar([{ nombre: 'badge', ruta }])).toEqual([]);
  });

  it('un export que el sg-shared publicado no tiene NO enlaza: se dice qué elemento, qué nombre y de dónde', async () => {
    // El caso de la revisión: release-cdn --scope=elements publica el main.js nuevo, que importa un
    // export que sólo trae el sg-shared nuevo, y el mapa sigue nombrando el viejo.
    const nuevo = escribir('dist/eventos/main.js', 'import{viejo as a,exportNuevo as b}from"@synergos/shared";console.log(a,b);\n');
    const bueno = escribir('dist/badge/main.js', 'import{viejo as a}from"@synergos/shared";console.log(a);\n');

    const errores = await revisar([
      { nombre: 'eventos', ruta: nuevo },
      { nombre: 'badge', ruta: bueno },
    ]);

    expect(errores).toEqual([
      'eventos: importa «exportNuevo» de «@synergos/shared», y el runtime publicado (sg-shared.1111111111111111.js) no lo exporta.',
    ]);
  });

  it('un nombre del runtime que el mapa no tiene tampoco enlaza', async () => {
    const ruta = escribir('dist/chip/main.js', 'import{x}from"@synergos/otra-cosa";console.log(x);\n');

    expect(await revisar([{ nombre: 'chip', ruta }])).toEqual([
      'chip: importa «@synergos/otra-cosa», que el import map no nombra.',
    ]);
  });

  it('sin elementos no se llama a esbuild', async () => {
    let llamadas = 0;
    const errores = await revisarEnlace({ elementos: [], imports, raizCdn: raiz, rutaDelMapa: MAPA, build: async () => { llamadas += 1; } });
    expect([errores, llamadas]).toEqual([[], 0]);
  });

  it('el mapa se resuelve como lo resuelve el navegador: relativo a su sitio, y una URL con origen por su ruta', () => {
    const f = ficherosDelMapa(
      {
        a: '/synergos/runtime/angular/21.1.6/a.js',
        b: '../21.1.6/b.js',
        c: 'https://synergos-static-local/synergos/runtime/angular/21.1.6/c.js',
      },
      '/cdn',
      MAPA,
    );
    expect(f).toEqual({
      a: path.join('/cdn', 'synergos', 'runtime', 'angular', '21.1.6', 'a.js'),
      b: path.join('/cdn', 'synergos', 'runtime', 'angular', '21.1.6', 'b.js'),
      c: path.join('/cdn', 'synergos', 'runtime', 'angular', '21.1.6', 'c.js'),
    });
  });
});

describe('cableado de la puerta de enlace en publish.mjs', () => {
  it('enlaza contra el import map PUBLICADO de cada framework antes de copiar un solo main.js, y para con 1', async () => {
    const { readFileSync } = await import('node:fs');
    const publish = readFileSync(path.resolve(import.meta.dirname, '..', 'publish.mjs'), 'utf8');
    const puerta = publish.indexOf('await revisarEnlace({');
    expect(puerta).toBeGreaterThan(0);
    expect(puerta).toBeLessThan(publish.indexOf("copyFileSync(bundlePath, join(dir, 'main.js'))"));
    expect(publish.slice(puerta, puerta + 600)).toMatch(/if \(errores\.length > 0\) \{[\s\S]*process\.exit\(1\);/);
    expect(publish).toMatch(/join\(CDN_SYNERGOS, 'runtime', framework, 'latest', 'import-map\.json'\)/);
  });
});
