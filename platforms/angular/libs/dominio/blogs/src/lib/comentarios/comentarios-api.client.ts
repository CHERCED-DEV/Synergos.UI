import { Injectable, inject } from '@angular/core';
import { esRegistro as isRecord, leerNumero as readNumber } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { Comment } from '../comun/blogs.model';
import { normalizeComment } from '../contenido/contenido-api.client';

/** Los comentarios de una publicación y su «me gusta» (012-blogs-social, I0 e I2). */
@Injectable({ providedIn: 'root' })
export class ComentariosApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Comentar (012-blogs-social, I0) ───────────────────────────────────────

  /**
   * Comenta una publicación, o responde a un comentario. **Lanza si el borde no lo guardó** (UI#92): la app pintaba
   * el comentario en local y no lo mandaba a ninguna parte, así que al recargar no estaba.
   *
   * `approved: false` quiere decir que el comentario espera a un moderador: se guardó, pero no se ve en el hilo, y la
   * pantalla no lo pinta como publicado.
   */
  async comment(
    apiBase: string,
    postId: string,
    body: string,
    parentId: string | null,
  ): Promise<{ readonly comment: Comment | null; readonly approved: boolean }> {
    const url = `${apiBase}/post/${encodeURIComponent(postId)}/comments`;
    try {
      const data = await this.#borde.postJson(apiBase, url, { body, parentId });
      if (isRecord(data) && typeof data['approved'] === 'boolean') {
        return { comment: normalizeComment(data['comment'], postId), approved: data['approved'] };
      }
      throw new Error('comment-shape');
    } catch (error) {
      this.#borde.writeFailed('POST /api/blogs/post/{id}/comments', error);
    }
  }

  /**
   * Le da «me gusta» a un comentario y devuelve cuántos tiene, según el SERVIDOR. Suma uno, como en la página del
   * post: el almacén no recuerda quién lo dio. **Lanza si el borde no lo guardó.**
   */
  async likeComment(apiBase: string, postId: string, commentId: string): Promise<number> {
    const url = `${apiBase}/post/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`;
    try {
      const data = await this.#borde.postJson(apiBase, url, {});
      if (isRecord(data) && data['likeCount'] !== undefined) {
        return Math.trunc(readNumber(data['likeCount']));
      }
      throw new Error('comment-like-shape');
    } catch (error) {
      this.#borde.writeFailed('POST /api/blogs/post/{id}/comments/{commentId}/like', error);
    }
  }
}
