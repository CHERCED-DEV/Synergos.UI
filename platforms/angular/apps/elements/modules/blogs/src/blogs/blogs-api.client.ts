import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  buildMockComments,
  buildMockFeed,
  buildMockNotifications,
  buildMockProfile,
  buildMockSaved,
  buildMockSearch,
  buildMockStudio,
  buildMockThread,
  buildMockThreads,
  buildMockTrending,
  reactionStateFor,
} from './blogs.mock';
import {
  type Author,
  type Comment,
  type CreatorTier,
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
  type ProfileStats,
  type ReactionCount,
  type ReactionState,
  type ReactionType,
  type SearchResult,
  type StudioPayload,
  type StudioPostStat,
  type StudioSeriesPoint,
  type TrendingTag,
} from './blogs.model';

/**
 * Thin HTTP client over the Blogs (red social) backend contract — provided by the
 * backend agent in parallel. Programs against the app-spec endpoints:
 *
 *  - `GET  /api/blogs/feed?scope=foryou|following&cursor=`  → `{ posts, nextCursor }`
 *  - `GET  /api/blogs/post/{id}`                            → `{ post, comments }`
 *  - `POST /api/blogs/post` `{ body, mediaUrl? }`           → `{ post }`
 *  - `POST /api/blogs/post/{id}/react` `{ type }`           → `{ reactions }`
 *  - `POST /api/blogs/follow/{authorId}`                    → `{ following }`
 *  - `GET  /api/blogs/profile/{handle}`                     → `{ author, posts, stats }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. A **core content** mock path
 * (feed/post/profile/search) flips the `degraded` flag so the shell surfaces a
 * "datos de ejemplo" notice. **Auxiliary** widgets (e.g. the trending sidebar)
 * degrade *silently* — their absence must not brand the whole shell as offline
 * while the primary content is real.
 *
 * **Lo del usuario NO degrada, y es deliberado.** La bandeja de mensajes, las
 * notificaciones, los guardados y el estudio son del member de la SESIÓN: su identidad
 * la resuelve el servidor desde la cookie, no un `?user=<handle>` que cualquiera podía
 * teclear (ese era el IDOR). Un 401 ahí no significa "el backend no está" — significa
 * "no hay sesión", y taparlo con mock le pintaría al anónimo una bandeja de DMs
 * SEMBRADA como si fuera la suya. Por eso viaja como {@link BlogsUnauthorizedError}
 * hasta la UI, que pide iniciar sesión. Un 403 en `/thread/{id}` (conversación ajena)
 * viaja como {@link BlogsForbiddenError}: mostrar OTRA conversación sería la mentira.
 *
 * La cookie viaja sola: `fetch` manda credenciales same-origin por defecto y la app se
 * monta dentro de la propia página del CMS. No se fuerza `credentials: 'include'`
 * —mandaría la cookie a orígenes ajenos si `apiBase` fuera absoluto.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */

/**
 * El backend exige sesión para esta ruta. NO es una degradación: es un hueco de
 * identidad, y la UI debe ofrecer iniciar sesión en vez de inventar datos del usuario.
 */
export class BlogsUnauthorizedError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 401 ${url}`);
    this.name = 'BlogsUnauthorizedError';
  }
}

/**
 * `instanceof` no es fiable cruzando bundles (la clase puede venir de otra copia del
 * módulo), así que se discrimina por `name` — el mismo motivo por el que el runtime
 * comparte `sg-core.js` en vez de duplicarlo.
 */
export function isBlogsUnauthorized(error: unknown): error is BlogsUnauthorizedError {
  return error instanceof Error && error.name === 'BlogsUnauthorizedError';
}

/**
 * El backend respondió 403: hay sesión, pero el recurso NO es del viewer — hoy solo lo
 * lanza `GET /thread/{id}` cuando la conversación es de otras dos personas. A diferencia
 * del 401, volver a iniciar sesión NO ayuda: no es un hueco de identidad, es que esa
 * conversación no le pertenece. Por eso viaja distinto y la UI lo dice con esas palabras.
 */
export class BlogsForbiddenError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 403 ${url}`);
    this.name = 'BlogsForbiddenError';
  }
}

/** Discriminado por `name`, no `instanceof` (no cruza bundles). */
export function isBlogsForbidden(error: unknown): error is BlogsForbiddenError {
  return error instanceof Error && error.name === 'BlogsForbiddenError';
}

@Injectable()
export class BlogsApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Feed ──────────────────────────────────────────────────────────────────

  async feed(apiBase: string, scope: FeedScope, cursor: string | null): Promise<FeedPage> {
    const params = new URLSearchParams({ scope });
    if (cursor) {
      params.set('cursor', cursor);
    }
    const url = `${apiBase}/feed?${params.toString()}`;
    try {
      const data = await this.getJson(url);
      const page = normalizeFeed(data);
      if (page) {
        return page;
      }
      throw new Error('feed-shape');
    } catch (error) {
      this.markDegraded('GET /api/blogs/feed', error);
      return buildMockFeed(scope, cursor);
    }
  }

  // ─── Post detail (+ nested comments) ───────────────────────────────────────

  async post(apiBase: string, id: string): Promise<PostDetail> {
    const url = `${apiBase}/post/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(data);
      if (detail) {
        return detail;
      }
      throw new Error('post-shape');
    } catch (error) {
      this.markDegraded('GET /api/blogs/post/{id}', error);
      const feed = buildMockFeed('foryou', null).posts;
      const post = feed.find((entry) => entry.id === id) ?? feed[0];
      return { post, comments: buildMockComments(post.id) };
    }
  }

  // ─── Publish a post ─────────────────────────────────────────────────────────

  async publish(apiBase: string, draft: NewPost, author: Author): Promise<Post> {
    const url = `${apiBase}/post`;
    try {
      const data = await this.postJson(url, draft);
      const post = normalizePost(isRecord(data) && isRecord(data['post']) ? data['post'] : data);
      if (post) {
        return post;
      }
      throw new Error('publish-shape');
    } catch (error) {
      this.markDegraded('POST /api/blogs/post', error);
      return synthesizePost(draft, author);
    }
  }

  // ─── React (idempotent toggle) ──────────────────────────────────────────────

  async react(
    apiBase: string,
    postId: string,
    type: ReactionType,
    optimistic: ReactionState,
  ): Promise<ReactionState> {
    const url = `${apiBase}/post/${encodeURIComponent(postId)}/react`;
    try {
      const data = await this.postJson(url, { type });
      const reactions = normalizeReactions(
        isRecord(data) && data['reactions'] !== undefined ? data['reactions'] : data,
      );
      if (reactions) {
        return reactions;
      }
      throw new Error('react-shape');
    } catch (error) {
      this.markDegraded('POST /api/blogs/post/{id}/react', error);
      // The component already applied an optimistic state; echo it back.
      return optimistic;
    }
  }

  // ─── Follow / unfollow ──────────────────────────────────────────────────────

  async follow(apiBase: string, authorKey: string, optimistic: boolean): Promise<boolean> {
    const url = `${apiBase}/follow/${encodeURIComponent(authorKey)}`;
    try {
      const data = await this.postJson(url, {});
      if (isRecord(data) && typeof data['following'] === 'boolean') {
        return data['following'];
      }
      throw new Error('follow-shape');
    } catch (error) {
      this.markDegraded('POST /api/blogs/follow/{authorId}', error);
      return optimistic;
    }
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  async profile(apiBase: string, handle: string): Promise<ProfilePayload> {
    const url = `${apiBase}/profile/${encodeURIComponent(handle)}`;
    try {
      const data = await this.getJson(url);
      const payload = normalizeProfile(data);
      if (payload) {
        return payload;
      }
      throw new Error('profile-shape');
    } catch (error) {
      this.markDegraded('GET /api/blogs/profile/{handle}', error);
      return buildMockProfile(handle);
    }
  }

  // ─── Notifications (no contract endpoint yet — degrades to mock) ─────────────

  /**
   * La actividad del member de la SESIÓN.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async notifications(apiBase: string): Promise<readonly Notification[]> {
    const url = `${apiBase}/notifications`;
    try {
      const data = await this.getJson(url);
      const list = normalizeNotifications(data);
      if (list) {
        return list;
      }
      throw new Error('notifications-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/blogs/notifications', error);
      return buildMockNotifications();
    }
  }

  // ─── Search / explore (unified — degrades to mock) ──────────────────────────

  async search(apiBase: string, query: string): Promise<SearchResult> {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
    }
    const qs = params.toString();
    const url = `${apiBase}/search${qs ? `?${qs}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeSearch(data);
      if (result) {
        return result;
      }
      throw new Error('search-shape');
    } catch (error) {
      // TODO(backend): no `/search` endpoint in the OLA 3 contract yet.
      this.markDegraded('GET /api/blogs/search', error);
      return buildMockSearch(query);
    }
  }

  async trending(apiBase: string): Promise<readonly TrendingTag[]> {
    const url = `${apiBase}/trending`;
    try {
      const data = await this.getJson(url);
      const tags = normalizeTrending(data);
      if (tags) {
        return tags;
      }
      throw new Error('trending-shape');
    } catch (error) {
      // Trending is an auxiliary discovery widget — degrade it silently so a
      // still-unwired `/trending` never trips the shell-wide "datos de ejemplo"
      // banner while the feed (core content) is real.
      this.markDegraded('GET /api/blogs/trending', error, 'auxiliary');
      return buildMockTrending();
    }
  }

  /** `GET /api/blogs/explore?q=&tag=` — the SH-1 explore/search/hashtag provider. */
  async explore(apiBase: string, query: string, tag: string): Promise<SearchResult> {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
    }
    if (tag.trim()) {
      params.set('tag', tag.trim().replace(/^#/, ''));
    }
    const qs = params.toString();
    const url = `${apiBase}/explore${qs ? `?${qs}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeSearch(data);
      if (result) {
        return result;
      }
      throw new Error('explore-shape');
    } catch (error) {
      // TODO(backend): `/explore` is part of the new OLA 6 contract (in parallel).
      this.markDegraded('GET /api/blogs/explore', error);
      return buildMockSearch(tag.trim() ? `#${tag.trim()}` : query);
    }
  }

  // ─── Direct messages (SH-7 message-center) ──────────────────────────────────

  /**
   * `GET /api/blogs/messages` — la bandeja del member de la SESIÓN.
   *
   * Sin parámetro de identidad: el `?user=<handle>` era el IDOR (saber el handle de
   * alguien bastaba para leerle los mensajes directos) y el backend ya no lo mira.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async messages(apiBase: string): Promise<readonly MessageThread[]> {
    const url = `${apiBase}/messages`;
    try {
      const data = await this.getJson(url);
      const list = normalizeThreads(data);
      if (list) {
        return list;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/blogs/messages', error);
      return buildMockThreads();
    }
  }

  /**
   * `GET /api/blogs/thread/{id}` — the open conversation + materialised messages.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   * @throws {BlogsForbiddenError} si la conversación no es del viewer.
   */
  async thread(apiBase: string, threadId: string): Promise<MessageThread> {
    const url = `${apiBase}/thread/${encodeURIComponent(threadId)}`;
    try {
      const data = await this.getJson(url);
      const thread = normalizeThread(
        isRecord(data) && isRecord(data['thread']) ? data['thread'] : data,
      );
      if (thread) {
        return thread;
      }
      throw new Error('thread-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/blogs/thread/{id}', error);
      const seeded = buildMockThread(threadId);
      if (!seeded) {
        // Sin hilo sembrado con ESE id, se propaga: mejor "no se pudo abrir" que
        // abrir una conversación que no es la que se pidió.
        throw error;
      }
      return seeded;
    }
  }

  /**
   * `POST /api/blogs/message` `{ threadId, body }` → the persisted message.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   * @throws {BlogsForbiddenError} si la conversación no es del viewer.
   */
  async sendMessage(
    apiBase: string,
    draft: NewMessage,
    author: Author,
  ): Promise<DirectMessage> {
    const url = `${apiBase}/message`;
    try {
      const data = await this.postJson(url, draft);
      const message = normalizeMessage(
        isRecord(data) && isRecord(data['message']) ? data['message'] : data,
        draft.threadId,
      );
      if (message) {
        return message;
      }
      throw new Error('message-shape');
    } catch (error) {
      // Sin sesión el mensaje NO se envió: sintetizarlo dejaría la burbuja en pantalla
      // como si hubiera salido. Se re-lanza para que la UI retire el optimista.
      this.rethrowIfAuthError(error);
      this.markDegraded('POST /api/blogs/message', error);
      return synthesizeMessage(draft, author);
    }
  }

  // ─── Guardados / listas ──────────────────────────────────────────────────────

  /**
   * `GET /api/blogs/saved` — the viewer's bookmarked posts. Sin `?user=`: esa era la
   * misma llave que abría la lista de guardados de cualquiera.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async saved(apiBase: string): Promise<readonly Post[]> {
    const url = `${apiBase}/saved`;
    try {
      const data = await this.getJson(url);
      const rawPosts = Array.isArray(data)
        ? data
        : isRecord(data) && Array.isArray(data['posts'])
          ? data['posts']
          : null;
      if (rawPosts) {
        return rawPosts.map(normalizePost).filter((post): post is Post => post !== null);
      }
      throw new Error('saved-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/blogs/saved', error);
      return buildMockSaved();
    }
  }

  // ─── Long-form article (`/write`) ────────────────────────────────────────────

  /** `POST /api/blogs/article` — publish a long-form post (`objectKind='postPage'`). */
  async publishArticle(apiBase: string, draft: NewArticle, author: Author): Promise<Post> {
    const url = `${apiBase}/article`;
    try {
      const data = await this.postJson(url, draft);
      const post = normalizePost(isRecord(data) && isRecord(data['post']) ? data['post'] : data);
      if (post) {
        return post;
      }
      throw new Error('article-shape');
    } catch (error) {
      this.markDegraded('POST /api/blogs/article', error);
      return synthesizeArticle(draft, author);
    }
  }

  // ─── Creator studio (SH-5 analytics + monetización) ──────────────────────────

  /**
   * `GET /api/blogs/studio` — borradores y métricas del autor de la SESIÓN. Sin `?user=`:
   * con ese parámetro se leían los ingresos y el alcance de cualquier creador.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async studio(apiBase: string): Promise<StudioPayload> {
    const url = `${apiBase}/studio`;
    try {
      const data = await this.getJson(url);
      const payload = normalizeStudio(data);
      if (payload) {
        return payload;
      }
      throw new Error('studio-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/blogs/studio', error);
      return buildMockStudio();
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(url: string): Promise<unknown> {
    return this.request(url, { method: 'GET' });
  }

  private postJson(url: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request(url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) => {
      if (response.status === 401) {
        // Antes caía en el `catch` genérico y se degradaba a mock: el anónimo veía una
        // bandeja de DMs sembrada como si fuera la suya, en vez de un "inicia sesión".
        return Promise.reject(new BlogsUnauthorizedError(url));
      }
      if (response.status === 403) {
        // Autenticado, pero el recurso es de otro (conversación ajena). Taparlo con mock
        // le mostraría OTRA conversación — la mentira exacta que esto viene a cerrar.
        return Promise.reject(new BlogsForbiddenError(url));
      }
      return response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`));
    });
  }

  /**
   * Re-lanza un 401/403 (los que la UI trata como estado de sesión, no como caída).
   * Lo llaman SOLO las rutas del usuario; las públicas (feed/post/publicar/reaccionar/
   * seguir) siguen degradando a mock, que ahí no le miente a nadie.
   */
  private rethrowIfAuthError(error: unknown): void {
    if (isBlogsUnauthorized(error) || isBlogsForbidden(error)) {
      throw error;
    }
  }

  /**
   * Flag a mock fallback. `core` content flips the user-facing `degraded` banner;
   * `auxiliary` widgets (trending sidebar) only log, so a still-unwired auxiliary
   * endpoint never brands the shell as offline while the primary content is real.
   */
  private markDegraded(
    endpoint: string,
    error: unknown,
    severity: 'core' | 'auxiliary' = 'core',
  ): void {
    if (severity === 'core') {
      this.#degraded = true;
    }
    // TODO(backend): remove the mock fallback once the Blogs API responds.
    this.#logger.warn(`Blogs API "${endpoint}" unavailable — using mock data.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

const REACTION_TYPES: readonly ReactionType[] = ['like', 'love', 'celebrate', 'insightful'];

function readReactionType(value: unknown): ReactionType | null {
  const raw = readString(value).trim().toLowerCase();
  return REACTION_TYPES.includes(raw as ReactionType) ? (raw as ReactionType) : null;
}

function normalizeAuthor(value: unknown): Author | null {
  if (!isRecord(value)) {
    return null;
  }
  const handle = readString(value['handle']).trim().replace(/^@/, '');
  const actorKey = readString(value['actorKey']).trim() || readString(value['id']).trim() || handle;
  if (!handle && !actorKey) {
    return null;
  }
  return {
    actorKey: actorKey || handle,
    handle: handle || actorKey,
    displayName: readString(value['displayName']).trim() || readString(value['name']).trim() || handle,
    bio: readString(value['bio']).trim(),
    avatarUrl: readString(value['avatarUrl']).trim() || readString(value['avatar']).trim(),
    bannerUrl: readString(value['bannerUrl']).trim() || readString(value['banner']).trim(),
    verified: readBoolean(value['verified']),
    followersCount: Math.trunc(readNumber(value['followersCount'])),
    followingCount: Math.trunc(readNumber(value['followingCount'])),
    postsCount: Math.trunc(readNumber(value['postsCount'])),
  };
}

function normalizeReactions(value: unknown): ReactionState | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawCounts = Array.isArray(value['counts']) ? value['counts'] : [];
  const counts: ReactionCount[] = rawCounts
    .map((entry): ReactionCount | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const type = readReactionType(entry['type']);
      if (!type) {
        return null;
      }
      return { type, count: Math.trunc(readNumber(entry['count'])) };
    })
    .filter((entry): entry is ReactionCount => entry !== null);
  const total =
    value['total'] !== undefined
      ? Math.trunc(readNumber(value['total']))
      : counts.reduce((sum, entry) => sum + entry.count, 0);
  return { counts, mine: readReactionType(value['mine']), total };
}

function normalizeMedia(value: unknown): Post['media'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const url = readString(entry['url']).trim();
      if (!url) {
        return null;
      }
      const kind = readString(entry['kind']).trim().toLowerCase() === 'video' ? 'video' : 'image';
      return { url, kind: kind as 'image' | 'video', alt: readString(entry['alt']).trim() };
    })
    .filter((entry): entry is Post['media'][number] => entry !== null);
}

function normalizePost(value: unknown): Post | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const author = normalizeAuthor(value['author']);
  if (!id || !author) {
    return null;
  }
  const kindRaw = readString(value['objectKind']).trim();
  const objectKind = kindRaw === 'postPage' || kindRaw === 'lesson' ? kindRaw : 'post';
  return {
    id,
    author,
    objectKind,
    body: readString(value['body']).trim(),
    media: normalizeMedia(value['media']),
    hashtags: readStringArray(value['hashtags']).map((tag) => tag.replace(/^#/, '')),
    mentions: readStringArray(value['mentions']).map((handle) => handle.replace(/^@/, '')),
    createdAtUtc: readString(value['createdAtUtc']).trim() || new Date().toISOString(),
    reactions: normalizeReactions(value['reactions']) ?? { counts: [], mine: null, total: 0 },
    commentCount: Math.trunc(readNumber(value['commentCount'])),
    repostCount: Math.trunc(readNumber(value['repostCount'])),
    reposted: readBoolean(value['reposted']),
  };
}

function normalizeFeed(value: unknown): FeedPage | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawPosts = Array.isArray(value['posts'])
    ? value['posts']
    : Array.isArray(value['items'])
      ? value['items']
      : null;
  if (!rawPosts) {
    return null;
  }
  return {
    posts: rawPosts.map(normalizePost).filter((post): post is Post => post !== null),
    nextCursor: typeof value['nextCursor'] === 'string' ? value['nextCursor'] : null,
  };
}

function normalizeComment(value: unknown, postId: string): Comment | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const author = normalizeAuthor(value['author']);
  if (!id || !author) {
    return null;
  }
  const rawReplies = Array.isArray(value['replies']) ? value['replies'] : [];
  return {
    id,
    postId,
    author,
    body: readString(value['body']).trim(),
    parentId: typeof value['parentId'] === 'string' ? value['parentId'] : null,
    createdAtUtc: readString(value['createdAtUtc']).trim() || new Date().toISOString(),
    likeCount: Math.trunc(readNumber(value['likeCount'])),
    liked: readBoolean(value['liked']),
    replies: rawReplies
      .map((reply) => normalizeComment(reply, postId))
      .filter((reply): reply is Comment => reply !== null),
  };
}

function normalizeDetail(value: unknown): PostDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const post = normalizePost(value['post'] ?? value);
  if (!post) {
    return null;
  }
  const rawComments = Array.isArray(value['comments']) ? value['comments'] : [];
  return {
    post,
    comments: rawComments
      .map((comment) => normalizeComment(comment, post.id))
      .filter((comment): comment is Comment => comment !== null),
  };
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

function normalizeNotifications(value: unknown): readonly Notification[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['notifications'])
      ? value['notifications']
      : null;
  if (!list) {
    return null;
  }
  const verbs: readonly Notification['verb'][] = ['follow', 'react', 'mention', 'reply', 'repost'];
  return list
    .map((entry): Notification | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const actor = normalizeAuthor(entry['actor']);
      if (!id || !actor) {
        return null;
      }
      const verbRaw = readString(entry['verb']).trim().toLowerCase();
      const verb = verbs.includes(verbRaw as Notification['verb'])
        ? (verbRaw as Notification['verb'])
        : 'mention';
      return {
        id,
        verb,
        actor,
        summary: readString(entry['summary']).trim(),
        postId: typeof entry['postId'] === 'string' ? entry['postId'] : null,
        createdAtUtc: readString(entry['createdAtUtc']).trim() || new Date().toISOString(),
        read: readBoolean(entry['read']),
      };
    })
    .filter((entry): entry is Notification => entry !== null);
}

function normalizeTrending(value: unknown): readonly TrendingTag[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['hashtags'])
      ? value['hashtags']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): TrendingTag | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const tag = readString(entry['tag']).trim().replace(/^#/, '');
      if (!tag) {
        return null;
      }
      return { tag, postCount: Math.trunc(readNumber(entry['postCount'])) };
    })
    .filter((entry): entry is TrendingTag => entry !== null);
}

function normalizeSearch(value: unknown): SearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawAccounts = Array.isArray(value['accounts']) ? value['accounts'] : [];
  const rawPosts = Array.isArray(value['posts']) ? value['posts'] : [];
  return {
    accounts: rawAccounts.map(normalizeAuthor).filter((a): a is Author => a !== null),
    posts: rawPosts.map(normalizePost).filter((p): p is Post => p !== null),
    hashtags: normalizeTrending(value['hashtags']) ?? [],
  };
}

// ─── DM normalisers ─────────────────────────────────────────────────────────────

function normalizeMessage(value: unknown, threadId: string): DirectMessage | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const author = normalizeAuthor(value['author']);
  if (!id || !author) {
    return null;
  }
  return {
    id,
    threadId: readString(value['threadId']).trim() || threadId,
    author,
    body: readString(value['body']).trim(),
    createdAtUtc: readString(value['createdAtUtc']).trim() || new Date().toISOString(),
    outgoing: readBoolean(value['outgoing']),
  };
}

function normalizeThread(value: unknown): MessageThread | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const participant = normalizeAuthor(value['participant'] ?? value['author']);
  if (!id || !participant) {
    return null;
  }
  const rawMessages = Array.isArray(value['messages']) ? value['messages'] : [];
  const messages = rawMessages
    .map((entry) => normalizeMessage(entry, id))
    .filter((entry): entry is DirectMessage => entry !== null);
  const last = messages[messages.length - 1];
  return {
    id,
    participant,
    lastMessage: readString(value['lastMessage']).trim() || last?.body || '',
    lastAtUtc: readString(value['lastAtUtc']).trim() || last?.createdAtUtc || new Date().toISOString(),
    unread: Math.trunc(readNumber(value['unread'])),
    messages,
  };
}

function normalizeThreads(value: unknown): readonly MessageThread[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['threads'])
      ? value['threads']
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeThread).filter((entry): entry is MessageThread => entry !== null);
}

// ─── Studio normalisers ─────────────────────────────────────────────────────────

function normalizeSeries(value: unknown): readonly StudioSeriesPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): StudioSeriesPoint | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }
      return { label, value: readNumber(entry['value']) };
    })
    .filter((entry): entry is StudioSeriesPoint => entry !== null);
}

function normalizeTopPosts(value: unknown): readonly StudioPostStat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): StudioPostStat | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const postId = readString(entry['postId']).trim();
      if (!postId) {
        return null;
      }
      return {
        postId,
        excerpt: readString(entry['excerpt']).trim(),
        impressions: Math.trunc(readNumber(entry['impressions'])),
        engagements: Math.trunc(readNumber(entry['engagements'])),
        reactions: Math.trunc(readNumber(entry['reactions'])),
        comments: Math.trunc(readNumber(entry['comments'])),
      };
    })
    .filter((entry): entry is StudioPostStat => entry !== null);
}

function normalizeTiers(value: unknown): readonly CreatorTier[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): CreatorTier | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const name = readString(entry['name']).trim();
      if (!id || !name) {
        return null;
      }
      return {
        id,
        name,
        priceMinor: Math.trunc(readNumber(entry['priceMinor'])),
        currency: readString(entry['currency']).trim() || 'COP',
        perks: readStringArray(entry['perks']),
        subscribers: Math.trunc(readNumber(entry['subscribers'])),
      };
    })
    .filter((entry): entry is CreatorTier => entry !== null);
}

function normalizeStudio(value: unknown): StudioPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  // A studio payload must carry at least a followers figure to be considered valid.
  if (value['followers'] === undefined && value['reach'] === undefined) {
    return null;
  }
  return {
    followers: Math.trunc(readNumber(value['followers'])),
    followersDelta: Math.trunc(readNumber(value['followersDelta'])),
    reach: Math.trunc(readNumber(value['reach'])),
    reachDelta: Math.trunc(readNumber(value['reachDelta'])),
    engagementRate: readNumber(value['engagementRate']),
    monthlyRevenueMinor: Math.trunc(readNumber(value['monthlyRevenueMinor'])),
    currency: readString(value['currency']).trim() || 'COP',
    audience: normalizeSeries(value['audience']),
    topPosts: normalizeTopPosts(value['topPosts']),
    tiers: normalizeTiers(value['tiers']),
  };
}

// ─── Optimistic / synthesized fallbacks ────────────────────────────────────────

/** Build a DM locally for the optimistic append when the message endpoint is down. */
function synthesizeMessage(draft: NewMessage, author: Author): DirectMessage {
  return {
    id: `local-m-${Date.now().toString(36)}`,
    threadId: draft.threadId,
    author,
    body: draft.body.trim(),
    createdAtUtc: new Date().toISOString(),
    outgoing: true,
  };
}

/** Build a long-form Post locally for the optimistic insert when `/article` is down. */
function synthesizeArticle(draft: NewArticle, author: Author): Post {
  const body = draft.body.trim();
  const hashtags = draft.hashtags && draft.hashtags.length > 0
    ? [...draft.hashtags]
    : Array.from(body.matchAll(/#(\w+)/g)).map((match) => match[1]);
  const media = draft.coverUrl
    ? [{ url: draft.coverUrl, kind: 'image' as const, alt: draft.coverAlt?.trim() || draft.title }]
    : [];
  return {
    id: `local-art-${Date.now().toString(36)}`,
    author,
    objectKind: 'postPage',
    body: draft.title.trim() ? `${draft.title.trim()}\n\n${body}` : body,
    media,
    hashtags,
    mentions: Array.from(body.matchAll(/@(\w+)/g)).map((match) => match[1]),
    createdAtUtc: new Date().toISOString(),
    reactions: reactionStateFor(0, 0, 0, 0, null),
    commentCount: 0,
    repostCount: 0,
    reposted: false,
  };
}

/** Build a Post locally for the optimistic insert when the publish endpoint is down. */
function synthesizePost(draft: NewPost, author: Author): Post {
  const body = draft.body.trim();
  const hashtags = Array.from(body.matchAll(/#(\w+)/g)).map((match) => match[1]);
  const mentions = Array.from(body.matchAll(/@(\w+)/g)).map((match) => match[1]);
  const media = draft.mediaUrl
    ? [{ url: draft.mediaUrl, kind: 'image' as const, alt: draft.mediaAlt?.trim() || 'Imagen adjunta' }]
    : [];
  return {
    id: `local-${Date.now().toString(36)}`,
    author,
    objectKind: 'post',
    body,
    media,
    hashtags,
    mentions,
    createdAtUtc: new Date().toISOString(),
    reactions: reactionStateFor(0, 0, 0, 0, null),
    commentCount: 0,
    repostCount: 0,
    reposted: false,
  };
}
