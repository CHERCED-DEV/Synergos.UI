import { Injectable, computed, inject, signal } from '@angular/core';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ContenidoApi } from './contenido-api.client';
import { InicioDeBlogs } from './inicio';

/** El largo máximo de una nota. */
export const MAXIMO_DE_UNA_NOTA = 500;

/** El compositor de una nota (012-blogs-social, I2): el borrador, su validez y publicarla. */
@Injectable()
export class CompositorDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(ContenidoApi);
  readonly #inicio = inject(InicioDeBlogs);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly draftBody = signal('');
  readonly draftMediaUrl = signal('');
  readonly draftMediaAlt = signal('');
  readonly maxChars = MAXIMO_DE_UNA_NOTA;
  readonly draftRemaining = computed(() => this.maxChars - this.draftBody().length);
  readonly draftValid = computed(() => {
    const len = this.draftBody().trim().length;
    if (len < 1 || len > this.maxChars) {
      return false;
    }
    // Media requires alt text (a11y gate).
    return !this.draftMediaUrl().trim() || this.draftMediaAlt().trim().length > 0;
  });

  publish(): void {
    if (!this.draftValid() || this.#red.publishing()) {
      return;
    }
    this.#red.publishing.set(true);
    const draft = {
      body: this.draftBody().trim(),
      mediaUrl: this.draftMediaUrl().trim() || undefined,
      mediaAlt: this.draftMediaAlt().trim() || undefined,
    };
    this.#api
      .publish(this.#red.apiBase(), draft, this.#red.autorLocal())
      .then(({ post, persisted }) => {
        // Mismo criterio que el artículo (#26): un post que el servidor no aceptó
        // no se mete en el feed ni vacía el compositor.
        if (!persisted) {
          this.#red.errorMessage.set(this.#textos.publicarNoGuardado);
          return;
        }
        this.#inicio.publicado(post);
        this.draftBody.set('');
        this.draftMediaUrl.set('');
        this.draftMediaAlt.set('');
        this.#inicio.composerOpen.set(false);
        this.#red.navegacion?.go('feed');
        this.#red.eventos.postpublished({ id: post.id });
      })
      .catch((error: unknown) => {
        this.#red.errorMessage.set(this.#textos.publicarFallo);
        void error;
      })
      .finally(() => this.#red.publishing.set(false));
  }
}
