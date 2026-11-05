import { Injectable, computed, inject, signal } from '@angular/core';
import { OrchestratorService } from '@synergos/transaction-engine';
import type { Author, Post } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { PerfilApi } from './perfil-api.client';

/** El perfil de una persona (012-blogs-social, I2): su cabecera, lo que publicó y si quien lee la sigue. */
@Injectable()
export class PerfilDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(PerfilApi);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly profile = signal<Author | null>(null);
  readonly profilePosts = signal<readonly Post[]>([]);
  readonly profileFollowing = signal(false);
  readonly profileTab = signal<'posts' | 'replies' | 'media'>('posts');
  readonly profileMediaPosts = computed(() => this.profilePosts().filter((post) => post.media.length > 0));
  readonly profileViewerFollows = computed(() => {
    const profile = this.profile();
    return profile ? this.#red.following().has(profile.actorKey) : false;
  });

  constructor() {
    this.#red.alParchear((id, patch) =>
      this.profilePosts.update((current) => current.map((post) => (post.id === id ? patch(post) : post))),
    );
  }

  /** El perfil que se abre, mientras llega. */
  reset(): void {
    this.profile.set(null);
    this.profilePosts.set([]);
  }

  setProfileTab(tab: 'posts' | 'replies' | 'media'): void {
    this.profileTab.set(tab);
  }

  async loadProfile(handle: string): Promise<void> {
    this.#red.loading.set(true);
    try {
      const payload = await this.#orchestrator.callApi(`profile:${handle}`, () =>
        this.#api.profile(this.#red.apiBase(), handle),
      );
      this.profile.set(payload.author);
      this.profilePosts.set(payload.posts);
      this.profileFollowing.set(payload.following);
      this.#red.setFollowing(payload.author.actorKey, payload.following);
      this.profileTab.set('posts');
    } catch (error) {
      this.#red.errorMessage.set(this.#textos.perfilNoCargo);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }
}
