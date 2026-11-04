import { Injectable, inject } from '@angular/core';
import type { Author } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { PerfilDeBlogs } from '../perfil/perfil';
import { SeguidoresApi } from './seguidores-api.client';

/** Seguir y dejar de seguir (012-blogs-social, I2): optimista, con el contador del perfil, y vuelve atrás si falla. */
@Injectable()
export class SeguidoresDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(SeguidoresApi);
  readonly #perfil = inject(PerfilDeBlogs);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  isFollowing(actorKey: string): boolean {
    return this.#red.isFollowing(actorKey);
  }

  toggleFollow(author: Author): void {
    const isFollowing = this.#red.following().has(author.actorKey);
    const next = !isFollowing;
    const perfil = this.#perfil;
    const profileBefore = perfil.profile()?.actorKey === author.actorKey ? perfil.profile() : null;
    this.#red.setFollowing(author.actorKey, next);

    if (profileBefore) {
      perfil.profile.update((current) =>
        current ? { ...current, followersCount: Math.max(0, current.followersCount + (next ? 1 : -1)) } : current,
      );
      perfil.profileFollowing.set(next);
    }

    this.#api
      .follow(this.#red.apiBase(), author.actorKey)
      .then((confirmed) => {
        if (confirmed !== next) {
          this.#red.setFollowing(author.actorKey, confirmed);
          if (perfil.profile()?.actorKey === author.actorKey) {
            perfil.profileFollowing.set(confirmed);
          }
        }
        // Se anuncia lo que el SERVIDOR dejó (UI#92), no lo que se pintó.
        this.#red.eventos.authorfollowed({ actorKey: author.actorKey, following: confirmed });
      })
      .catch((error: unknown) => {
        // No se guardó (UI#92): el botón y el contador vuelven a como estaban, y se dice.
        this.#red.setFollowing(author.actorKey, isFollowing);
        if (profileBefore && perfil.profile()?.actorKey === author.actorKey) {
          perfil.profile.update((current) =>
            current ? { ...current, followersCount: profileBefore.followersCount } : current,
          );
          perfil.profileFollowing.set(isFollowing);
        }
        this.#red.errorMessage.set(this.#textos.seguirNoGuardado);
        void error;
      });
  }
}
