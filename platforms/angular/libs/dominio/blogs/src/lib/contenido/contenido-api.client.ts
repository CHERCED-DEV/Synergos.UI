import { Injectable, inject } from '@angular/core';
import {
  esRegistro as isRecord,
  leerBooleano as readBoolean,
  leerNumero as readNumber,
  leerTexto as readString,
  leerTextos as readStringArray,
} from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { PublishOutcome } from '../comun/errores';
import type {
  Author,
  Comment,
  FeedPage,
  FeedScope,
  NewArticle,
  NewPost,
  Post,
  PostDetail,
  ReactionCount,
  ReactionState,
  ReactionType,
} from '../comun/blogs.model';
import { buildMockComments, buildMockFeed, reactionStateFor } from '../comun/blogs.mock';

/**
 * El contenido de la red (012-blogs-social, I2): el inicio, una publicación con su hilo, y publicar una nota o un
 * artículo. Aquí viven también los lectores de lo que comparte toda la red —el autor, las reacciones, la
 * publicación y el comentario—, que usan los demás adaptadores.
 */
@Injectable({ providedIn: 'root' })
export class ContenidoApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Feed ──────────────────────────────────────────────────────────────────

  async feed(apiBase: string, scope: FeedScope, cursor: string | null): Promise<FeedPage> {
    const params = new URLSearchParams({ scope });
    if (cursor) {
      params.set('cursor', cursor);
    }
    const url = `${apiBase}/feed?${params.toString()}`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const page = normalizeFeed(data);
      if (page) {
        return page;
      }
      throw new Error('feed-shape');
    } catch (error) {
      this.#borde.markDegraded('GET /api/blogs/feed', error);
      return buildMockFeed(scope, cursor);
    }
  }

  // ─── Post detail (+ nested comments) ───────────────────────────────────────

  async post(apiBase: string, id: string): Promise<PostDetail> {
    const url = `${apiBase}/post/${encodeURIComponent(id)}`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const detail = normalizeDetail(data);
      if (detail) {
        return detail;
      }
      throw new Error('post-shape');
    } catch (error) {
      this.#borde.markDegraded('GET /api/blogs/post/{id}', error);
      const feed = buildMockFeed('foryou', null).posts;
      const post = feed.find((entry) => entry.id === id) ?? feed[0];
      return { post, comments: buildMockComments(post.id) };
    }
  }

  // ─── Publish a post ─────────────────────────────────────────────────────────

  /** Dice si se GUARDÓ — misma razón que `publishArticle` (#26). */
  async publish(apiBase: string, draft: NewPost, author: Author): Promise<PublishOutcome> {
    const url = `${apiBase}/post`;
    try {
      const data = await this.#borde.postJson(apiBase, url, draft);
      const post = normalizePost(isRecord(data) && isRecord(data['post']) ? data['post'] : data);
      if (post) {
        return { post, persisted: true };
      }
      throw new Error('publish-shape');
    } catch (error) {
      this.#borde.markDegraded('POST /api/blogs/post', error);
      return { post: synthesizePost(draft, author), persisted: false };
    }
  }

  // ─── Long-form article (`/write`) ────────────────────────────────────────────

  /**
   * `POST /api/blogs/article` — publish a long-form post (`objectKind='postPage'`).
   *
   * **Dice si se GUARDÓ, no sólo qué post salió** (#26). Antes devolvía un `Post`
   * a secas y el fallo se disfrazaba de éxito: el llamador vaciaba el editor,
   * mandaba al feed y emitía `articlepublished` con un id inventado, así que un
   * backend caído BORRABA el artículo y enseñaba la pantalla de publicado.
   */
  async publishArticle(apiBase: string, draft: NewArticle, author: Author): Promise<PublishOutcome> {
    const url = `${apiBase}/article`;
    try {
      const data = await this.#borde.postJson(apiBase, url, draft);
      const post = normalizePost(isRecord(data) && isRecord(data['post']) ? data['post'] : data);
      if (post) {
        return { post, persisted: true };
      }
      throw new Error('article-shape');
    } catch (error) {
      this.#borde.markDegraded('POST /api/blogs/article', error);
      // Se sigue devolviendo un post para que el modo demo tenga algo que
      // mostrar, pero marcado: quien llama decide, y ya no puede confundirlos.
      return { post: synthesizeArticle(draft, author), persisted: false };
    }
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

const REACTION_TYPES: readonly ReactionType[] = ['like', 'love', 'celebrate', 'insightful'];

function readReactionType(value: unknown): ReactionType | null {
  const raw = readString(value).trim().toLowerCase();
  return REACTION_TYPES.includes(raw as ReactionType) ? (raw as ReactionType) : null;
}

export function normalizeAuthor(value: unknown): Author | null {
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

export function normalizeReactions(value: unknown): ReactionState | null {
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

export function normalizePost(value: unknown): Post | null {
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

export function normalizeComment(value: unknown, postId: string): Comment | null {
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

// ─── Optimistic / synthesized fallbacks ────────────────────────────────────────

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
