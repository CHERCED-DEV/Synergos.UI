import { Injectable, inject } from '@angular/core';
import { esRegistro as isRecord, leerBooleano as readBoolean, leerNumero as readNumber } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { Author, Post, ProfilePayload, ProfileStats } from '../comun/blogs.model';
import { buildMockProfile } from '../comun/blogs.mock';
import { normalizeAuthor, normalizePost } from '../contenido/contenido-api.client';

/** El perfil de una persona y la cara pública de quien lee (012-blogs-social, I0 e I2). */
@Injectable({ providedIn: 'root' })
export class PerfilApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Quién soy en la red (012-blogs-social, I0) ────────────────────────────

  /**
   * La cara pública de quien lee: la misma con que sale en lo que publica. La app la usa para reconocer lo suyo —no
   * ofrecerse «Seguir» a sí misma— sin saber su correo, que antes hacía de llave y salía a la vista de todos.
   *
   * `null` si no hay sesión o el borde no contesta: no se degrada a nadie de ejemplo, porque sería decirle a quien lee
   * que es otra persona.
   */
  async me(apiBase: string): Promise<Author | null> {
    const url = `${apiBase}/me`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      return isRecord(data) ? normalizeAuthor(data['author']) : null;
    } catch (error) {
      this.#borde.warn('Blogs API "GET /api/blogs/me" unavailable — the viewer has no public key yet.', error);
      return null;
    }
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  async profile(apiBase: string, handle: string): Promise<ProfilePayload> {
    const url = `${apiBase}/profile/${encodeURIComponent(handle)}`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const payload = normalizeProfile(data);
      if (payload) {
        return payload;
      }
      throw new Error('profile-shape');
    } catch (error) {
      this.#borde.markDegraded('GET /api/blogs/profile/{handle}', error);
      return buildMockProfile(handle);
    }
  }
}

function normalizeProfile(value: unknown): ProfilePayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const author = normalizeAuthor(value['author']);
  if (!author) {
    return null;
  }
  const rawPosts = Array.isArray(value['posts']) ? value['posts'] : [];
  const statsRaw = isRecord(value['stats']) ? value['stats'] : {};
  const stats: ProfileStats = {
    followers: Math.trunc(readNumber(statsRaw['followers'] ?? author.followersCount)),
    following: Math.trunc(readNumber(statsRaw['following'] ?? author.followingCount)),
    posts: Math.trunc(readNumber(statsRaw['posts'] ?? author.postsCount)),
  };
  return {
    author,
    posts: rawPosts.map(normalizePost).filter((post): post is Post => post !== null),
    stats,
    following: readBoolean(value['following']),
  };
}
