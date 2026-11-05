import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject } from '@angular/core';
import { PublicacionDeBlogs, RedDeBlogs, type Comment } from '@synergos/dominio/blogs';
import { ButtonComponent, TextareaComponent } from '@synergos/shared';
import { CommentThreadComponent, type CommentThreadConfig, type CommentThreadEntry } from '@synergos/shells';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsTarjetaComponent } from '../../piezas/tarjeta/tarjeta';

/** Una publicación abierta: su tarjeta, comentar y el hilo de comentarios (SH-15 `syn-comment-thread`). */
@Component({
  selector: 'sg-blogs-publicacion',
  standalone: true,
  imports: [ButtonComponent, TextareaComponent, CommentThreadComponent, BlogsTarjetaComponent],
  templateUrl: './publicacion.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
  // Embedded published custom element (<synergos-comments-widget>).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BlogsPublicacionComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly publicacion = inject(PublicacionDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  /** Los textos del hilo son de la red, no de la pieza. */
  readonly hiloConfig: CommentThreadConfig = {
    replyLabel: 'Responder',
    replyPlaceholder: 'Responder…',
    loadingMessage: 'Cargando comentarios…',
    emptyMessage: 'Sé el primero en comentar.',
  };

  /** El hilo, dicho como lo dice la red —quién, cuándo, cuántos «me gusta»—: la pieza no formatea. */
  readonly hilo = computed<readonly CommentThreadEntry[]>(() =>
    this.publicacion.comments().map((comment) => this.#entrada(comment)),
  );

  meGusta(entrada: CommentThreadEntry): void {
    const comment = this.#buscar(entrada.id, this.publicacion.comments());
    if (comment) {
      void this.publicacion.likeComment(comment);
    }
  }

  responder(entrada: CommentThreadEntry): void {
    const comment = this.#buscar(entrada.id, this.publicacion.comments());
    if (comment) {
      void this.publicacion.submitReply(comment);
    }
  }

  abrirAutor(entrada: CommentThreadEntry): void {
    const comment = this.#buscar(entrada.id, this.publicacion.comments());
    if (comment) {
      this.navegacion.openProfile(comment.author.handle);
    }
  }

  #entrada(comment: Comment): CommentThreadEntry {
    return {
      id: comment.id,
      author: comment.author.displayName,
      handle: comment.author.handle,
      initials: this.presentacion.initials(comment.author),
      body: comment.body,
      time: this.presentacion.relativeTime(comment.createdAtUtc),
      likes: this.presentacion.formatCount(comment.likeCount),
      liked: comment.liked,
      replies: comment.replies.map((reply) => this.#entrada(reply)),
    };
  }

  /** El comentario de la red detrás de una entrada del hilo, a cualquier profundidad. */
  #buscar(id: string, entre: readonly Comment[]): Comment | undefined {
    for (const comment of entre) {
      if (comment.id === id) {
        return comment;
      }
      const respuesta = this.#buscar(id, comment.replies);
      if (respuesta) {
        return respuesta;
      }
    }
    return undefined;
  }
}
