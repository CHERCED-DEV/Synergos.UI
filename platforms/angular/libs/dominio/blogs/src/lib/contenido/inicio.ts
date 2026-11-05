import { Injectable, inject, signal } from '@angular/core';
import { OrchestratorService } from '@synergos/transaction-engine';
import type { FeedScope, Post } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ContenidoApi } from './contenido-api.client';

/** El inicio de la red (012-blogs-social, I2): el feed «Para ti» o «Siguiendo», por páginas. */
@Injectable()
export class InicioDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(ContenidoApi);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly feedScope = signal<FeedScope>('foryou');
  readonly posts = signal<readonly Post[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly feedLoaded = signal(false);
  /** Si el compositor de una nota está abierto, arriba del inicio. */
  readonly composerOpen = signal(false);

  constructor() {
    this.#red.alParchear((id, patch) =>
      this.posts.update((current) => current.map((post) => (post.id === id ? patch(post) : post))),
    );
  }

  setFeedScope(scope: FeedScope): void {
    if (this.feedScope() === scope) {
      return;
    }
    this.feedScope.set(scope);
    void this.loadFeed();
  }

  async loadFeed(): Promise<void> {
    this.#red.loading.set(true);
    this.#red.errorMessage.set('');
    try {
      const page = await this.#orchestrator.callApi(`feed:${this.feedScope()}`, () =>
        this.#api.feed(this.#red.apiBase(), this.feedScope(), null),
      );
      this.posts.set(page.posts);
      this.nextCursor.set(page.nextCursor);
      this.feedLoaded.set(true);
      this.#red.seedFollowingFromPosts(page.posts);
    } catch (error) {
      this.#red.errorMessage.set(this.#textos.feedNoCargo);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const page = await this.#api.feed(this.#red.apiBase(), this.feedScope(), cursor);
      this.posts.update((current) => [...current, ...page.posts]);
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      void error;
    } finally {
      this.loadingMore.set(false);
    }
  }

  refreshFeed(): void {
    void this.loadFeed();
  }

  toggleComposer(): void {
    this.composerOpen.update((open) => !open);
  }

  /** Lo que se acaba de publicar, arriba del inicio (optimistic insert at the top of the feed). */
  publicado(post: Post): void {
    this.posts.update((current) => [post, ...current]);
  }
}
