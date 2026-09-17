import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  nombresDelIndice,
  nombresPublicados,
  anunciadosFueraDelRegistry,
  anunciadosSinMarcaNiBundle,
} from './indice-publicado.mjs';

const RAIZ = resolve(fileURLToPath(import.meta.url), '../../..');

const listarDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

/** Un índice de mentira con la forma del de verdad. */
const indice = (...nombres) =>
  nombres.map((n) => `<article class="card" data-tier="module" data-name="${n}" data-text="${n}">`).join('\n');

describe('el índice publicado', () => {
  it('no deja pasar un nombre que el registry ya no conoce', () => {
    // El defecto #48 exacto: el índice era una copia del 2026-08-04 y seguía
    // nombrando elementos de las plataformas que ese mismo commit borró.
    const html = indice('badge', 'hero', 'quiz-flow', 'rating-widget');
    expect(anunciadosFueraDelRegistry(html, ['badge', 'hero', 'stat-counter']))
      .toEqual(['quiz-flow', 'rating-widget']);
  });

  it('SÍ acepta un declarado y todavía sin construir, si lleva su marca', () => {
    // El fixture que EXIGE el criterio: `stat-counter` está en el registry y no
    // tiene bundle. Con el criterio anterior —«todo lo anunciado tiene que tener
    // bundle»— éste salía rojo, y no debe: el catálogo no enlaza a ningún
    // bundle y lo marca «Not published». Sin este caso, el gate pediría que el
    // catálogo enseñe menos de lo que el editor puede colocar.
    const html = indice('badge', 'stat-counter');
    expect(anunciadosFueraDelRegistry(html, ['badge', 'stat-counter'])).toEqual([]);
    expect(anunciadosSinMarcaNiBundle(html + '<span class="fw-inactive">', ['badge'])).toEqual([]);
  });

  it('pero NO si perdió la marca', () => {
    // La otra mitad: sin insignia, la página promete que se puede cargar.
    const html = '<article class="card" data-name="stat-counter"><span class="fw-badge fw-active">angular</span></article>';
    expect(anunciadosSinMarcaNiBundle(html, [])).toEqual(['stat-counter']);
  });

  it('lee los nombres del atributo y no del texto', () => {
    // El texto de la tarjeta lleva también el tag y el alias. Contar por texto
    // daría de más, y un gate que cuenta de más se relaja hasta que no sirve.
    const html = '<article class="card" data-name="badge" data-text="badge synergos-badge elementSynBadge">';
    expect(nombresDelIndice(html)).toEqual(['badge']);
  });

  it('un elemento cuya carpeta existe SIN main.js no cuenta como publicado', () => {
    // Es el `continue` de #44 con otra cara: una carpeta a medias se leía como
    // publicada, así que un publish truncado dejaba el índice anunciando lo que
    // no se puede cargar.
    const arbol = {
      badge: { angular: { latest: true } },
      roto: { angular: { latest: false } },
    };
    const publicados = nombresPublicados({
      raizSynergos: '/x',
      listarDirs: (d) => {
        const partes = d.split('/').filter(Boolean).slice(1);
        if (partes.length === 0) return Object.keys(arbol);
        if (partes.length === 1) return Object.keys(arbol[partes[0]] ?? {});
        if (partes.length === 2) return Object.keys(arbol[partes[0]]?.[partes[1]] ?? {});
        return [];
      },
      existe: (p) => {
        const partes = p.split('/').filter(Boolean).slice(1);
        return arbol[partes[0]]?.[partes[1]]?.[partes[2]] === true;
      },
      unir: (...xs) => xs.join('/'),
    });
    expect(publicados).toEqual(['badge']);
  });

  it('`runtime/` no es un elemento', () => {
    const publicados = nombresPublicados({
      raizSynergos: '/x',
      listarDirs: (d) => (d === '/x' ? ['runtime', 'badge'] : d.includes('badge') ? ['angular'] : []),
      existe: () => true,
      unir: (...xs) => xs.join('/'),
    });
    expect(publicados).toEqual(['badge']);
  });
});

describe('contra el árbol de verdad', () => {
  const publico = join(RAIZ, 'public', 'synergos');
  const indiceHtml = join(RAIZ, 'public', 'index.html');

  it.runIf(existsSync(publico) && existsSync(indiceHtml))(
    'el index.html publicado sale del registry de hoy, y marca lo no construido',
    () => {
      const html = readFileSync(indiceHtml, 'utf-8');
      const anunciados = nombresDelIndice(html);

      // Red de seguridad: si el descubrimiento deja de ver, las dos listas salen
      // vacías y el cruce pasaría en verde sin mirar nada.
      expect(anunciados.length).toBeGreaterThan(50);

      const publicados = nombresPublicados({
        raizSynergos: publico, listarDirs, existe: existsSync, unir: join,
      });
      expect(publicados.length).toBeGreaterThan(50);

      const registry = JSON.parse(
        readFileSync(join(RAIZ, 'vitals/contracts/src/element-registry.json'), 'utf-8'));
      const declarados = (registry.elements ?? registry).map((e) => e.name);
      expect(declarados.length).toBeGreaterThan(50);

      expect(anunciadosFueraDelRegistry(html, declarados)).toEqual([]);
      expect(anunciadosSinMarcaNiBundle(html, publicados)).toEqual([]);
    });
});
