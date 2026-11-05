import { Injectable, computed, inject, signal } from '@angular/core';
import { OrchestratorService } from '@synergos/transaction-engine';
import type { Comment, Post } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ContenidoApi } from '../contenido/contenido-api.client';
import { ComentariosApi } from './comentarios-api.client';

/**
 * Una publicación abierta con su hilo de comentarios (012-blogs-social, I0 e I2).
 *
 * El comentario se pintaba en local y no se mandaba a ninguna parte: al recargar, no estaba. Ahora va al hilo de la
 * publicación —el de su página, si es un artículo del CMS— y se pinta lo que el SERVIDOR guardó, no lo que se tecleó.
 * Si queda esperando a un moderador, se dice y no se pinta como publicado; si no llegó, el borrador se queda para
 * reintentarlo.
 */
@Injectable()
export class PublicacionDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #contenido = inject(ContenidoApi);
  readonly #comentarios = inject(ComentariosApi);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly activePost = signal<Post | null>(null);
  readonly comments = signal<readonly Comment[]>([]);
  readonly commentDraft = signal('');
  /** Si un comentario va camino del servidor: no se manda otro encima. */
  readonly commentSending = signal(false);
  /** Lo que se le dice a quien comentó cuando su comentario quedó en revisión. */
  readonly commentNotice = signal('');
  readonly commentDrafts = signal<Readonly<Record<string, string>>>({});
  readonly commentValid = computed(() => this.commentDraft().trim().length > 0);

  constructor() {
    this.#red.alParchear((id, patch) => {
      const active = this.activePost();
      if (active?.id === id) {
        this.activePost.set(patch(active));
      }
    });
  }

  /** La publicación que se abre, mientras llega su hilo. */
  preparar(post: Post | null): void {
    this.activePost.set(post);
    this.comments.set([]);
  }

  async loadPost(id: string): Promise<void> {
    this.#red.loading.set(true);
    try {
      const detail = await this.#orchestrator.callApi(`post:${id}`, () => this.#contenido.post(this.#red.apiBase(), id));
      this.activePost.set(detail.post);
      this.comments.set(detail.comments);
    } catch (error) {
      this.#red.errorMessage.set(this.#textos.publicacionNoAbrio);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }

  setCommentDraft(parentId: string, value: string): void {
    this.commentDrafts.update((current) => ({ ...current, [parentId]: value }));
  }

  setCommentDraftBound(parentId: string): (value: string) => void {
    return (value: string) => this.setCommentDraft(parentId, value);
  }

  commentDraftFor(parentId: string): string {
    return this.commentDrafts()[parentId] ?? '';
  }

  async submitComment(): Promise<void> {
    const post = this.activePost();
    const body = this.commentDraft().trim();
    if (!post || !body || this.commentSending()) {
      return;
    }
    const sent = await this.sendComment(post, body, null);
    if (sent) {
      this.commentDraft.set('');
    }
  }

  async submitReply(parent: Comment): Promise<void> {
    const post = this.activePost();
    const body = this.commentDraftFor(parent.id).trim();
    if (!post || !body || this.commentSending()) {
      return;
    }
    const sent = await this.sendComment(post, body, parent);
    if (sent) {
      this.setCommentDraft(parent.id, '');
    }
  }

  /** Manda el comentario y pinta el del servidor. `true` si el servidor lo guardó. */
  private async sendComment(post: Post, body: string, parent: Comment | null): Promise<boolean> {
    this.commentSending.set(true);
    this.commentNotice.set('');
    this.#red.errorMessage.set('');
    try {
      const { comment, approved } = await this.#comentarios.comment(this.#red.apiBase(), post.id, body, parent?.id ?? null);
      if (!approved || !comment) {
        // Lo que se ve y lo que se anuncia es lo mismo.
        const enRevision = this.#textos.comentarioEnRevision;
        this.commentNotice.set(enRevision);
        this.#red.anunciar(enRevision);
        return true;
      }
      this.comments.update((current) =>
        parent
          ? current.map((entry) => (entry.id === parent.id ? { ...entry, replies: [...entry.replies, comment] } : entry))
          : [...current, comment],
      );
      this.#red.patchPost(post.id, (current) => ({ ...current, commentCount: current.commentCount + 1 }));
      return true;
    } catch (error) {
      if (!this.#red.handleUnauthenticated(error, this.#textos.comentarioSinSesion)) {
        this.#red.errorMessage.set(this.#textos.comentarioNoPublicado);
      }
      return false;
    } finally {
      this.commentSending.set(false);
    }
  }

  /**
   * «Me gusta» a un comentario. Suma uno en el servidor, como en la página del post, y no se
   * deshace: el almacén no recuerda quién lo dio, así que un «ya no me gusta» sería pintar un
   * número que el servidor no tiene. Una reacción por persona llega con Engagement (I5).
   */
  async likeComment(comment: Comment): Promise<void> {
    const post = this.activePost();
    if (!post || comment.liked) {
      return;
    }
    this.#red.errorMessage.set('');
    try {
      const likeCount = await this.#comentarios.likeComment(this.#red.apiBase(), post.id, comment.id);
      const apply = (entry: Comment): Comment =>
        entry.id === comment.id ? { ...entry, liked: true, likeCount } : { ...entry, replies: entry.replies.map(apply) };
      this.comments.update((current) => current.map(apply));
    } catch (error) {
      if (!this.#red.handleUnauthenticated(error, this.#textos.meGustaSinSesion)) {
        this.#red.errorMessage.set(this.#textos.meGustaNoGuardado);
      }
    }
  }
}
