import { Injectable, inject } from '@angular/core';
import {
  BordeDeBlogs,
  ComentariosApi,
  ContenidoApi,
  EstudioApi,
  ExplorarApi,
  GuardadosApi,
  MensajesApi,
  NotificacionesApi,
  PerfilApi,
  ReaccionesApi,
  SeguidoresApi,
  type Author,
  type Comment,
  type DirectMessage,
  type FeedPage,
  type FeedScope,
  type MessageThread,
  type NewArticle,
  type NewMessage,
  type NewPost,
  type Notification,
  type Post,
  type PostDetail,
  type ProfilePayload,
  type PublishOutcome,
  type ReactionState,
  type ReactionType,
  type SearchResult,
  type StudioPayload,
  type TrendingTag,
} from '@synergos/dominio/blogs';

export {
  BlogsForbiddenError,
  BlogsUnauthorizedError,
  BlogsWriteFailedError,
  isBlogsForbidden,
  isBlogsUnauthorized,
  type PublishOutcome,
} from '@synergos/dominio/blogs';

/**
 * El cliente de la app sobre los adaptadores de `@synergos/dominio/blogs`, uno por capacidad (012-blogs-social, I2,
 * T014). El transporte, la degradación de las lecturas y los errores tipados viven en la lib; aquí sólo queda a quién le
 * toca cada llamada. Se queda mientras la app pasa a sus vistas (T015): cada vista habla con su adaptador.
 */
@Injectable()
export class BlogsApiClient {
  readonly #borde = inject(BordeDeBlogs);
  readonly #contenido = inject(ContenidoApi);
  readonly #comentarios = inject(ComentariosApi);
  readonly #reacciones = inject(ReaccionesApi);
  readonly #seguidores = inject(SeguidoresApi);
  readonly #perfil = inject(PerfilApi);
  readonly #notificaciones = inject(NotificacionesApi);
  readonly #explorar = inject(ExplorarApi);
  readonly #mensajes = inject(MensajesApi);
  readonly #guardados = inject(GuardadosApi);
  readonly #estudio = inject(EstudioApi);

  /** `true` after any mock fallback so the UI can flag example data. */
  get degraded(): boolean {
    return this.#borde.degraded;
  }

  feed(apiBase: string, scope: FeedScope, cursor: string | null): Promise<FeedPage> {
    return this.#contenido.feed(apiBase, scope, cursor);
  }

  post(apiBase: string, id: string): Promise<PostDetail> {
    return this.#contenido.post(apiBase, id);
  }

  publish(apiBase: string, draft: NewPost, author: Author): Promise<PublishOutcome> {
    return this.#contenido.publish(apiBase, draft, author);
  }

  publishArticle(apiBase: string, draft: NewArticle, author: Author): Promise<PublishOutcome> {
    return this.#contenido.publishArticle(apiBase, draft, author);
  }

  comment(
    apiBase: string,
    postId: string,
    body: string,
    parentId: string | null,
  ): Promise<{ readonly comment: Comment | null; readonly approved: boolean }> {
    return this.#comentarios.comment(apiBase, postId, body, parentId);
  }

  likeComment(apiBase: string, postId: string, commentId: string): Promise<number> {
    return this.#comentarios.likeComment(apiBase, postId, commentId);
  }

  react(apiBase: string, postId: string, type: ReactionType): Promise<ReactionState> {
    return this.#reacciones.react(apiBase, postId, type);
  }

  follow(apiBase: string, authorKey: string): Promise<boolean> {
    return this.#seguidores.follow(apiBase, authorKey);
  }

  me(apiBase: string): Promise<Author | null> {
    return this.#perfil.me(apiBase);
  }

  profile(apiBase: string, handle: string): Promise<ProfilePayload> {
    return this.#perfil.profile(apiBase, handle);
  }

  notifications(apiBase: string): Promise<readonly Notification[]> {
    return this.#notificaciones.notifications(apiBase);
  }

  trending(apiBase: string): Promise<readonly TrendingTag[]> {
    return this.#explorar.trending(apiBase);
  }

  explore(apiBase: string, query: string, tag: string): Promise<SearchResult> {
    return this.#explorar.explore(apiBase, query, tag);
  }

  messages(apiBase: string): Promise<readonly MessageThread[]> {
    return this.#mensajes.messages(apiBase);
  }

  thread(apiBase: string, threadId: string): Promise<MessageThread> {
    return this.#mensajes.thread(apiBase, threadId);
  }

  sendMessage(apiBase: string, draft: NewMessage): Promise<DirectMessage> {
    return this.#mensajes.sendMessage(apiBase, draft);
  }

  saved(apiBase: string): Promise<readonly Post[]> {
    return this.#guardados.saved(apiBase);
  }

  setSaved(apiBase: string, postId: string, saved: boolean): Promise<void> {
    return this.#guardados.setSaved(apiBase, postId, saved);
  }

  studio(apiBase: string): Promise<StudioPayload> {
    return this.#estudio.studio(apiBase);
  }
}
