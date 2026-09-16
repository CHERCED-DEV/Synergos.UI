import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sitiosAInstalar, sitiosSinInstalar, plataformasCableadas } from './setup-completo.mjs';
import { CARPETA_PLATAFORMAS, frameworksConstruibles } from './frameworks.mjs';
import { ROOT } from './synergos-config.mjs';

/**
 * Que el camino de entrada deje de olvidarse una plataforma (#70).
 *
 * Medido en un clon limpio el 2026-09-16: `npm ci` + `npm test` muere con
 * `Cannot find module 'sass'`. El `setup` que existía decía
 * `npm install && npm install --prefix platforms/angular` — una lista a mano que
 * olvidó `preact` el día que #64 lo creó.
 *
 * Ningún test lo veía porque **ninguno mide el camino de entrada**: todos corren
 * dentro de un árbol ya instalado.
 */

// ── Doble de disco, con la forma del de `frameworks.spec.mjs` ────────────────
function discoDe(rutas) {
  const todas = new Set(rutas);
  return {
    raiz: 'repo',
    carpetaPlataformas: CARPETA_PLATAFORMAS,
    listarDirs: (dir) => {
      const hijos = new Set();
      for (const r of todas) {
        if (!r.startsWith(`${dir}/`)) continue;
        const [primero, ...cola] = r.slice(dir.length + 1).split('/');
        if (cola.length > 0) hijos.add(primero);
      }
      return [...hijos];
    },
    existe: (r) => todas.has(r) || [...todas].some((x) => x.startsWith(`${r}/`)),
    unir: (...p) => p.join('/'),
  };
}

describe('qué hay que instalar', () => {
  it('son la raíz y CADA plataforma construible, derivadas del disco', () => {
    const io = discoDe([
      'repo/package.json',
      'repo/platforms/angular/package.json',
      'repo/platforms/preact/package.json',
      'repo/platforms/svelte/README.md', // sin package.json: no es una plataforma
    ]);

    expect(sitiosAInstalar(io, frameworksConstruibles).map((s) => s.etiqueta))
      .toEqual(['raíz', 'angular', 'preact']);
  });

  it('una plataforma NUEVA entra sola — que es lo que el setup a mano no hacía', () => {
    const io = discoDe([
      'repo/package.json',
      'repo/platforms/angular/package.json',
      'repo/platforms/preact/package.json',
      'repo/platforms/react/package.json',
    ]);

    expect(sitiosAInstalar(io, frameworksConstruibles).map((s) => s.etiqueta))
      .toContain('react');
  });
});

describe('qué falta por instalar', () => {
  // El fixture tiene que llevar una plataforma INSTALADA y otra que no: con todas
  // sin instalar, «devuelve todas» y «devuelve las que faltan» dan lo mismo y el
  // defecto pasaría en verde (regla 7).
  const rutas = [
    'repo/package.json',
    'repo/node_modules/vitest/package.json',
    'repo/platforms/angular/package.json',
    'repo/platforms/angular/node_modules/sass/package.json',
    'repo/platforms/preact/package.json',
  ];

  it('nombra sólo la que le falta', () => {
    const io = discoDe(rutas);
    const sitios = sitiosAInstalar(io, frameworksConstruibles);
    expect(sitiosSinInstalar(sitios, io)).toEqual(['preact']);
  });

  it('con todo instalado no dice nada', () => {
    const io = discoDe([...rutas, 'repo/platforms/preact/node_modules/preact/package.json']);
    const sitios = sitiosAInstalar(io, frameworksConstruibles);
    expect(sitiosSinInstalar(sitios, io)).toEqual([]);
  });

  it('el clon recién clonado los nombra TODOS', () => {
    const io = discoDe([
      'repo/package.json',
      'repo/platforms/angular/package.json',
      'repo/platforms/preact/package.json',
    ]);
    const sitios = sitiosAInstalar(io, frameworksConstruibles);
    expect(sitiosSinInstalar(sitios, io)).toEqual(['raíz', 'angular', 'preact']);
  });
});

describe('el setup no nombra plataformas a mano', () => {
  it('lo rechaza aunque venga de un `--prefix`', () => {
    const fuente = "execFileSync('npm', ['install', '--prefix', 'platforms/angular']);";
    expect(plataformasCableadas(fuente, CARPETA_PLATAFORMAS)).toEqual(['angular']);
  });

  it('NO se engaña con la prosa que explica el defecto', () => {
    // Este fichero y `tools/setup.mjs` nombran `platforms/preact` para contar qué
    // pasó. Un corte que no quitara los comentarios mediría la explicación —
    // `feedback_a_gate_that_parses_source_needs_its_own_mutations`.
    const fuente = [
      '/* el setup viejo decía platforms/angular y olvidó platforms/preact */',
      '// ver platforms/svelte el día que exista',
      'const sitios = sitiosAInstalar(io, frameworksConstruibles);',
    ].join('\n');
    expect(plataformasCableadas(fuente, CARPETA_PLATAFORMAS)).toEqual([]);
  });

  it('tools/setup.mjs, el de verdad, no cablea ninguna', () => {
    const fuente = readFileSync(join(ROOT, 'tools', 'setup.mjs'), 'utf8');
    expect(plataformasCableadas(fuente, CARPETA_PLATAFORMAS)).toEqual([]);
  });

  it('el script `setup` del package.json tampoco', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(plataformasCableadas(pkg.scripts.setup, CARPETA_PLATAFORMAS)).toEqual([]);
  });
});

describe('el camino de entrada está cableado', () => {
  // Un `setup` correcto que nadie invoque deja el MODULE_NOT_FOUND puesto: lo que
  // hay que comprobar no es que el script exista, es que `npm test` y
  // `npm run build` pasen por él (el addendum #14 del repo hermano, medir que la
  // pieza esté ENCHUFADA y no que exista).
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  it.each(['pretest', 'prebuild'])('%s verifica antes de arrancar', (gancho) => {
    expect(pkg.scripts[gancho]).toContain('tools/setup.mjs');
    expect(pkg.scripts[gancho]).toContain('--verificar');
  });

  it('y el propio repo está completo', () => {
    // Red de seguridad: si el descubrimiento deja de ver, todo lo de arriba pasa
    // en verde sobre un árbol vacío.
    const io = {
      raiz: ROOT,
      carpetaPlataformas: CARPETA_PLATAFORMAS,
      listarDirs: (d) =>
        existsSync(d)
          ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
          : [],
      existe: existsSync,
      unir: join,
    };
    const sitios = sitiosAInstalar(io, frameworksConstruibles);
    expect(sitios.length).toBeGreaterThanOrEqual(2);
  });
});
