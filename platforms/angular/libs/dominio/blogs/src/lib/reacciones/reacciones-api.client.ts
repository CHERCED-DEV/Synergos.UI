import { Injectable, inject } from '@angular/core';
import { esRegistro as isRecord } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { ReactionState, ReactionType } from '../comun/blogs.model';
import { normalizeReactions } from '../contenido/contenido-api.client';

/** Reaccionar a una publicación (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class ReaccionesApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── React (idempotent toggle) ──────────────────────────────────────────────

  /**
   * Reacciona y devuelve el estado AUTORITATIVO. **Lanza si el borde no lo guardó**
   * (UI#92). Recibía `optimistic` —el estado que la pantalla acababa de calcular— y lo
   * devolvía cuando el `POST` no llegaba: la regla 19, el llamador decidía el resultado y el
   * servidor era decoración. Sin el parámetro, el respaldo no se puede escribir.
   */
  async react(apiBase: string, postId: string, type: ReactionType): Promise<ReactionState> {
    const url = `${apiBase}/post/${encodeURIComponent(postId)}/react`;
    try {
      const data = await this.#borde.postJson(apiBase, url, { type });
      const reactions = normalizeReactions(
        isRecord(data) && data['reactions'] !== undefined ? data['reactions'] : data,
      );
      if (reactions) {
        return reactions;
      }
      throw new Error('react-shape');
    } catch (error) {
      this.#borde.writeFailed('POST /api/blogs/post/{id}/react', error);
    }
  }
}
