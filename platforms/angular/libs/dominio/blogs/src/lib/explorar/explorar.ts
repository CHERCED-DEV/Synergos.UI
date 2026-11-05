import { Injectable, computed, inject, signal } from '@angular/core';
import type { Post, SearchResult, SearchTab, TrendingTag } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ExplorarApi } from './explorar-api.client';

/** Las pestañas de Explorar, en orden. Sus etiquetas las pone la app. */
export const PESTANAS_DE_EXPLORAR: readonly SearchTab[] = ['top', 'accounts', 'posts', 'hashtags'];

/** Lo que pide la búsqueda: el término, las facetas elegidas, el orden y la página (la forma de SH-1). */
export interface CriteriosDeExplorar {
  readonly term: string;
  readonly facets: Readonly<Record<string, readonly string[]>>;
  readonly sort: string;
  readonly page: number;
}

/** Explorar (012-blogs-social, I2): la búsqueda por término o por etiqueta, sus pestañas y las tendencias. */
@Injectable()
export class ExplorarDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(ExplorarApi);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly searchTerm = signal('');
  readonly searchTag = signal('');
  readonly searchResult = signal<SearchResult | null>(null);
  readonly searchTab = signal<SearchTab>('top');
  readonly searchCriteria = signal<CriteriosDeExplorar>({ term: '', facets: {}, sort: 'top', page: 1 });
  readonly trending = signal<readonly TrendingTag[]>([]);
  readonly searching = signal(false);

  /** The posts SH-1 renders as its result grid — derived from the active tab. */
  readonly searchItems = computed<readonly Post[]>(() => {
    const result = this.searchResult();
    if (!result) {
      return [];
    }
    return this.searchTab() === 'accounts' || this.searchTab() === 'hashtags' ? [] : result.posts;
  });

  constructor() {
    this.#red.alParchear((id, patch) => {
      const result = this.searchResult();
      if (result) {
        this.searchResult.set({ ...result, posts: result.posts.map((post) => (post.id === id ? patch(post) : post)) });
      }
    });
  }

  onSearchCriteria(criteria: CriteriosDeExplorar): void {
    this.searchCriteria.set(criteria);
    this.searchTerm.set(criteria.term);
    const tab = (criteria.facets['tab'] ?? [])[0];
    if (tab && (PESTANAS_DE_EXPLORAR as readonly string[]).includes(tab)) {
      this.searchTab.set(tab as SearchTab);
    }
    const tag = (criteria.facets['hashtag'] ?? [])[0] ?? '';
    this.searchTag.set(tag);
    void this.runSearch();
  }

  setSearchTab(tab: SearchTab): void {
    this.searchTab.set(tab);
  }

  searchHashtag(tag: string): void {
    this.searchTerm.set('');
    this.searchTag.set(tag);
    this.searchTab.set('posts');
    this.searchCriteria.set({ term: '', facets: { hashtag: [tag] }, sort: 'top', page: 1 });
    this.#red.navegacion?.aplicar('search');
    this.#red.navegacion?.escribirRuta('search');
    void this.runSearch();
  }

  async runSearch(): Promise<void> {
    this.searching.set(true);
    this.#red.errorMessage.set('');
    try {
      const result = await this.#api.explore(this.#red.apiBase(), this.searchTerm(), this.searchTag());
      this.searchResult.set(result);
    } catch (error) {
      this.#red.errorMessage.set(this.#textos.busquedaFallo);
      void error;
    } finally {
      this.searching.set(false);
    }
  }

  async loadTrending(): Promise<void> {
    try {
      this.trending.set(await this.#api.trending(this.#red.apiBase()));
    } catch (error) {
      void error;
    }
  }
}
