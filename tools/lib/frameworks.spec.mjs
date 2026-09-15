import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  frameworksConstruibles,
  revisarPlataformas,
  recorrerPublicado,
  frameworksDelRegistry,
} from './frameworks.mjs';
import { PLATFORMS, ALL_FRAMEWORKS, ROOT } from './synergos-config.mjs';

/**
 * Que el pipeline deje de cablear `angular` (issue #44).
 *
 * De los dos gates que este ticket arregla, el del tamaño es el que más duele y
 * el que menos se ve: pedía `<elemento>/angular/latest/main.js` y hacía
 * `if (!existsSync(bundle)) continue;`. Un bundle de React no es que se pasara
 * del techo — es que **nadie lo medía**, y el gate salía verde sobre los de
 * Angular.
 *
 *   > Un gate que apunta al sitio equivocado se lee como cobertura. Es la
 *   > misma figura de `cdn-smoke` (#9), y es la razón por la que esta HU va
 *   > ANTES del wrapper de React (#37): parametrizar después significa que el
 *   > segundo framework existe un rato sin presupuesto ni humo.
 */

// ── Dobles de disco ──────────────────────────────────────────────────────────
//
// El árbol se describe como un conjunto de rutas y el doble contesta sobre él.
// Es lo que permite montar un CDN con dos frameworks sin que exista el segundo.
function discoDe(rutas) {
  const todas = new Set(rutas);
  const listarDirs = (dir) => {
    const hijos = new Set();
    for (const r of todas) {
      if (!r.startsWith(`${dir}/`)) continue;
      const resto = r.slice(dir.length + 1);
      const [primero, ...cola] = resto.split('/');
      if (cola.length > 0) hijos.add(primero); // sólo es directorio si tiene algo debajo
    }
    return [...hijos];
  };
  return { listarDirs, existe: (r) => todas.has(r), unir: (...p) => p.join('/') };
}

describe('frameworksConstruibles', () => {
  it('una carpeta bajo platforms/ con package.json es una plataforma', () => {
    const io = discoDe([
      'r/platforms/angular/package.json',
      'r/platforms/react/package.json',
      'r/platforms/angular/apps/badge/src/main.ts',
    ]);
    expect(frameworksConstruibles({ raiz: 'r', ...io })).toEqual(['angular', 'react']);
  });

  it('una carpeta SIN package.json no lo es — no se puede construir', () => {
    // Es lo que distingue una plataforma de una carpeta que alguien dejó ahí.
    const io = discoDe([
      'r/platforms/angular/package.json',
      'r/platforms/notas/LEEME.md',
    ]);
    expect(frameworksConstruibles({ raiz: 'r', ...io })).toEqual(['angular']);
  });

  it('sin ninguna plataforma devuelve vacío, NO "angular"', () => {
    // La decisión que el ticket pide en voz alta: nunca un default silencioso.
    // Quien la consume decide qué hacer con el vacío — los dos gates se paran.
    expect(frameworksConstruibles({ raiz: 'r', ...discoDe([]) })).toEqual([]);
  });
});

describe('revisarPlataformas', () => {
  it('cuadran y no dice nada', () => {
    expect(revisarPlataformas(['angular'], ['angular'])).toEqual([]);
  });

  it('una carpeta que PLATFORMS no declara: el pipeline entero la ignoraría', () => {
    const [error] = revisarPlataformas(['angular', 'react'], ['angular']);
    expect(error).toContain('platforms/react/');
    expect(error).toContain('PLATFORMS');
  });

  it('una entrada de PLATFORMS sin carpeta: se publicaría lo que nadie construye', () => {
    const [error] = revisarPlataformas(['angular'], ['angular', 'svelte']);
    expect(error).toContain('svelte');
  });
});

describe('el disco y PLATFORMS dicen lo mismo — sobre el repo de verdad', () => {
  // Con dobles se prueba la regla; acá se prueba el REPO. Es lo que hace que
  // `platforms/react/` recién creado rompa el build en vez de existir sin que
  // ningún gate lo mire.
  const listarDirs = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [];

  const enDisco = frameworksConstruibles({ raiz: ROOT, listarDirs, existe: existsSync, unir: join });

  it('hay al menos una plataforma', () => {
    // Una lista vacía haría pasar todo lo de abajo sin mirar nada: es el modo
    // de fallo silencioso de un gate que deriva del disco.
    expect(enDisco.length).toBeGreaterThan(0);
  });

  it('las dos listas nombran a los mismos', () => {
    expect(revisarPlataformas(enDisco, PLATFORMS.map((p) => p.name))).toEqual([]);
    expect([...ALL_FRAMEWORKS].sort()).toEqual(enDisco);
  });
});

describe('recorrerPublicado', () => {
  const cdnCon = (rutas) => discoDe(rutas.map((r) => `cdn/${r}`));

  it('encuentra el bundle de CADA framework, no sólo el de angular', () => {
    // ÉSTE es el defecto del ticket. Antes se preguntaba por la ruta de Angular
    // y el resto ni se contaba.
    const io = cdnCon([
      'badge/angular/latest/main.js',
      'badge/react/latest/main.js',
      'runtime/angular/latest/import-map.json',
    ]);
    const { bundles, frameworks, errores } = recorrerPublicado({
      raizCdn: 'cdn',
      construibles: ['angular', 'react'],
      ...io,
    });
    expect(errores).toEqual([]);
    expect(frameworks).toEqual(['angular', 'react']);
    expect(bundles.map((b) => `${b.elemento}/${b.framework}`)).toEqual(['badge/angular', 'badge/react']);
  });

  it('`runtime/` no es un elemento y no se mide', () => {
    const io = cdnCon(['badge/angular/latest/main.js', 'runtime/angular/21.1.6/ng-core.js']);
    const { bundles, errores } = recorrerPublicado({ raizCdn: 'cdn', construibles: ['angular'], ...io });
    expect(errores).toEqual([]);
    expect(bundles).toHaveLength(1);
  });

  it('un elemento SIN ningún bundle falla — antes lo saltaba un `continue`', () => {
    // Una carpeta de elemento vacía en el CDN es un publish a medias: 404 en la
    // cara del visitante, y el gate contando un elemento menos sin decirlo.
    const io = cdnCon(['badge/angular/latest/main.js', 'card/angular/latest/meta.json']);
    const { errores } = recorrerPublicado({ raizCdn: 'cdn', construibles: ['angular'], ...io });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('card');
    expect(errores[0]).toContain('publish a medias');
  });

  it('un framework publicado que nadie construye falla, y se NOMBRA', () => {
    const io = cdnCon(['badge/angular/latest/main.js', 'badge/svelte/latest/main.js']);
    const { errores } = recorrerPublicado({ raizCdn: 'cdn', construibles: ['angular'], ...io });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('svelte');
    expect(errores[0]).toContain('huérfano');
  });

  it('un CDN vacío no da bundles ni inventa frameworks', () => {
    const { bundles, frameworks, errores } = recorrerPublicado({
      raizCdn: 'cdn',
      construibles: ['angular'],
      ...cdnCon([]),
    });
    expect(bundles).toEqual([]);
    expect(frameworks).toEqual([]);
    expect(errores).toEqual([]);
  });
});

describe('frameworksDelRegistry', () => {
  it('sale de las implementaciones declaradas, no de una lista', () => {
    const r = {
      elements: [
        { name: 'badge', implementations: { angular: { latest: '0.1.0' } } },
        { name: 'card', implementations: { react: { latest: '2.0.0' }, angular: { latest: '0.1.0' } } },
      ],
    };
    expect(frameworksDelRegistry(r)).toEqual(['angular', 'react']);
  });

  it('una implementación sin `latest` no cuenta: no hay nada que pedir', () => {
    const r = { elements: [{ name: 'x', implementations: { react: {} } }] };
    expect(frameworksDelRegistry(r)).toEqual([]);
  });

  it('un registry vacío da lista vacía, NO `["angular"]`', () => {
    expect(frameworksDelRegistry({ elements: [] })).toEqual([]);
    expect(frameworksDelRegistry(null)).toEqual([]);
  });
});
