import { Injectable, inject } from '@angular/core';
import {
  esRegistro as isRecord,
  leerListadoDelCatalogo,
  leerNumero as readNumber,
  leerTexto as readString,
} from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { Author, Post, SearchResult, TrendingTag } from '../comun/blogs.model';
import { buildMockSearch, buildMockTrending } from '../comun/blogs.mock';
import { CAMPO_ETIQUETA, etiquetasDelListado, postDelCatalogo } from '../comun/lecturas-de-blogs';
import { normalizeAuthor, normalizePost } from '../contenido/contenido-api.client';

/** Explorar: la búsqueda, las etiquetas y las tendencias (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class ExplorarApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Search / explore (unified — degrades to mock) ──────────────────────────
  //
  // Acá vivía `search()`, que pedía `GET /api/blogs/search`. Se quitó en #76 y no es limpieza
  // cosmética: **ese endpoint no existe ni existió** —`BlogsController` declara `explore` y nada
  // más, y el propio TODO del método lo decía («no /search endpoint in the OLA 3 contract yet»)—
  // así que el método sólo sabía degradar al mock, el 100 % de las veces. `explore()`, abajo, lo
  // reemplazó con el MISMO `normalizeSearch` y el MISMO `buildMockSearch`, y es el que llama
  // `blogs.ts`. Su único llamador era un spec que probaba el filtro del mock, re-apuntado a
  // `explore` para no perder esa cobertura.

  async trending(apiBase: string): Promise<readonly TrendingTag[]> {
    const url = `${apiBase}/trending`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const tags = normalizeTrending(data);
      if (tags) {
        return tags;
      }
      throw new Error('trending-shape');
    } catch (error) {
      // Trending is an auxiliary discovery widget — degrade it silently so a
      // still-unwired `/trending` never trips the shell-wide "datos de ejemplo"
      // banner while the feed (core content) is real.
      this.#borde.markDegraded('GET /api/blogs/trending', error, 'auxiliary');
      return buildMockTrending();
    }
  }

  /**
   * La búsqueda de Explorar, por término o por etiqueta. Con `lecturasBase`, el catálogo de la red
   * (`GET {lecturasBase}/catalogo?texto=&filtro.etiqueta=`, 012-blogs-social, I4), con las etiquetas de lo encontrado;
   * sin ella, la interina `GET /api/blogs/explore?q=&tag=`.
   */
  async explore(apiBase: string, query: string, tag: string, lecturasBase = ''): Promise<SearchResult> {
    if (lecturasBase) {
      return this.#catalogo(lecturasBase, query, tag);
    }
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
    }
    if (tag.trim()) {
      params.set('tag', tag.trim().replace(/^#/, ''));
    }
    const qs = params.toString();
    const url = `${apiBase}/explore${qs ? `?${qs}` : ''}`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const result = normalizeSearch(data);
      if (result) {
        return result;
      }
      throw new Error('explore-shape');
    } catch (error) {
      // TODO(backend): `/explore` is part of the new OLA 6 contract (in parallel).
      this.#borde.markDegraded('GET /api/blogs/explore', error);
      return buildMockSearch(tag.trim() ? `#${tag.trim()}` : query);
    }
  }

  async #catalogo(lecturasBase: string, query: string, tag: string): Promise<SearchResult> {
    const params = new URLSearchParams({ porPagina: String(POR_PAGINA) });
    if (query.trim()) {
      params.set('texto', query.trim());
    }
    if (tag.trim()) {
      params.set(`filtro.${CAMPO_ETIQUETA}`, tag.trim().replace(/^#/, ''));
    }
    try {
      const listado = leerListadoDelCatalogo(
        await this.#borde.getJson(lecturasBase, `${lecturasBase}/catalogo?${params.toString()}`),
      );
      if (listado) {
        return {
          accounts: [],
          posts: listado.elementos.map(postDelCatalogo).filter((post): post is Post => post !== null),
          hashtags: etiquetasDelListado(listado.facetas),
        };
      }
      throw new Error('catalogo-shape');
    } catch (error) {
      this.#borde.markDegraded('GET /api/lecturas/{vertical}/catalogo', error);
      return buildMockSearch(tag.trim() ? `#${tag.trim()}` : query);
    }
  }
}

/** Cuántas publicaciones trae la búsqueda: las de la interina, que leía las cien primeras del feed. */
const POR_PAGINA = 100;

function normalizeTrending(value: unknown): readonly TrendingTag[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['hashtags'])
      ? value['hashtags']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): TrendingTag | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const tag = readString(entry['tag']).trim().replace(/^#/, '');
      if (!tag) {
        return null;
      }
      return { tag, postCount: Math.trunc(readNumber(entry['postCount'])) };
    })
    .filter((entry): entry is TrendingTag => entry !== null);
}

function normalizeSearch(value: unknown): SearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawAccounts = Array.isArray(value['accounts']) ? value['accounts'] : [];
  const rawPosts = Array.isArray(value['posts']) ? value['posts'] : [];
  return {
    accounts: rawAccounts.map(normalizeAuthor).filter((a): a is Author => a !== null),
    posts: rawPosts.map(normalizePost).filter((p): p is Post => p !== null),
    hashtags: normalizeTrending(value['hashtags']) ?? [],
  };
}
