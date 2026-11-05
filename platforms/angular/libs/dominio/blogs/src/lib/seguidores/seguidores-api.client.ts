import { Injectable, inject } from '@angular/core';
import { esRegistro as isRecord } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';

/** Seguir y dejar de seguir a una persona (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class SeguidoresApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Follow / unfollow ──────────────────────────────────────────────────────

  /**
   * Alterna seguir y devuelve si se sigue, según el SERVIDOR (el borde alterna: «si ya
   * sigue, deja de seguir»). **Lanza si el borde no contestó** (UI#92): con `optimistic`
   * en la firma devolvía lo que la pantalla quería que fuera, la misma regla 19.
   */
  async follow(apiBase: string, authorKey: string): Promise<boolean> {
    const url = `${apiBase}/follow/${encodeURIComponent(authorKey)}`;
    try {
      const data = await this.#borde.postJson(apiBase, url, {});
      if (isRecord(data) && typeof data['following'] === 'boolean') {
        return data['following'];
      }
      throw new Error('follow-shape');
    } catch (error) {
      this.#borde.writeFailed('POST /api/blogs/follow/{authorId}', error);
    }
  }
}
