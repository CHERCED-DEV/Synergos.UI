/**
 * Seeded social graph for <c>&lt;synergos-blogs&gt;</c> — the visible degradation
 * data the API client falls back to so the demo lands on a *vivid living feed*
 * (app-spec §7 Fase 3) before the backend agent's endpoints respond.
 *
 * Pure data + builders, no Angular. Every public builder is deterministic so the
 * unit tests can assert on it.
 */

import {
  type Author,
  type Comment,
  type FeedPage,
  type FeedScope,
  type Notification,
  type Post,
  type ProfilePayload,
  type ReactionState,
  type ReactionType,
  type SearchResult,
  type TrendingTag,
} from './blogs.model';

/** Minutes-ago helper → ISO timestamp, so relative-time rendering looks alive. */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Compose a reaction aggregate from per-type counts + the viewer's own state. */
export function reactionStateFor(
  like: number,
  love: number,
  celebrate: number,
  insightful: number,
  mine: ReactionType | null,
): ReactionState {
  const counts = [
    { type: 'like' as const, count: like },
    { type: 'love' as const, count: love },
    { type: 'celebrate' as const, count: celebrate },
    { type: 'insightful' as const, count: insightful },
  ].filter((entry) => entry.count > 0);
  return { counts, mine, total: like + love + celebrate + insightful };
}

// ─── Seed actors ───────────────────────────────────────────────────────────────

const VIEWER: Author = {
  actorKey: 'me',
  handle: 'tu',
  displayName: 'Tú',
  bio: 'Explorando la red social de Synergos.',
  avatarUrl: '',
  bannerUrl: '',
  verified: false,
  followersCount: 84,
  followingCount: 132,
  postsCount: 12,
};

const ACTORS: readonly Author[] = [
  {
    actorKey: 'a-valeria',
    handle: 'valeria.code',
    displayName: 'Valeria Restrepo',
    bio: 'Ingeniera de plataforma · Angular & sistemas de diseño · Medellín 🇨🇴',
    avatarUrl: '',
    bannerUrl: '',
    verified: true,
    followersCount: 12_400,
    followingCount: 312,
    postsCount: 1_180,
  },
  {
    actorKey: 'a-mateo',
    handle: 'mateo.design',
    displayName: 'Mateo Ledesma',
    bio: 'Diseño de producto · grilla de 8pt o nada · escribo sobre craft.',
    avatarUrl: '',
    bannerUrl: '',
    verified: true,
    followersCount: 8_910,
    followingCount: 540,
    postsCount: 642,
  },
  {
    actorKey: 'a-synergos',
    handle: 'synergoslabs',
    displayName: 'SynergosLabs',
    bio: 'El hub. Construyendo cada dominio como una app real.',
    avatarUrl: '',
    bannerUrl: '',
    verified: true,
    followersCount: 41_200,
    followingCount: 28,
    postsCount: 96,
  },
  {
    actorKey: 'a-lucia',
    handle: 'lucia.dev',
    displayName: 'Lucía Marín',
    bio: 'Backend & arquitectura limpia · café ☕ · gatos 🐈',
    avatarUrl: '',
    bannerUrl: '',
    verified: false,
    followersCount: 2_310,
    followingCount: 880,
    postsCount: 430,
  },
];

function actor(key: string): Author {
  return ACTORS.find((entry) => entry.actorKey === key) ?? ACTORS[0];
}

/** The viewer's projected social identity (used for optimistic publishes). */
export function mockViewer(): Author {
  return VIEWER;
}

// ─── Seed posts ──────────────────────────────────────────────────────────────

function buildPosts(): readonly Post[] {
  return [
    {
      id: 'p-1',
      author: actor('a-synergos'),
      objectKind: 'post',
      body: 'Lanzamos el dominio Blogs como una red social real. Feed, perfiles, follow asimétrico, reacciones y comentarios anidados. Todo sobre el motor compartido. #SynergosLabs #ola3',
      media: [],
      hashtags: ['SynergosLabs', 'ola3'],
      mentions: [],
      createdAtUtc: ago(6),
      reactions: reactionStateFor(312, 88, 54, 41, null),
      commentCount: 27,
      repostCount: 64,
      reposted: false,
    },
    {
      id: 'p-2',
      author: actor('a-valeria'),
      objectKind: 'post',
      body: 'Recordatorio: un custom element zoneless con signals + OnPush no necesita Zone.js para hidratar. Menos JS, más control. ¿Quién más migró ya? @synergoslabs',
      media: [],
      hashtags: [],
      mentions: ['synergoslabs'],
      createdAtUtc: ago(34),
      reactions: reactionStateFor(540, 120, 30, 96, 'like'),
      commentCount: 41,
      repostCount: 88,
      reposted: true,
    },
    {
      id: 'p-3',
      author: actor('a-mateo'),
      objectKind: 'postPage',
      body: 'Escribí un post largo sobre por qué la grilla de 8pt no es estética, es presupuesto: cada decisión espacial se vuelve un múltiplo predecible y el ritmo vertical deja de ser opinión. #design #craft',
      media: [
        {
          url: 'https://images.unsplash.com/photo-1545235617-9465d2a55698?w=900&q=80',
          kind: 'image',
          alt: 'Maqueta de interfaz con una grilla de espaciado superpuesta',
        },
      ],
      hashtags: ['design', 'craft'],
      mentions: [],
      createdAtUtc: ago(120),
      reactions: reactionStateFor(210, 64, 12, 33, null),
      commentCount: 18,
      repostCount: 22,
      reposted: false,
    },
    {
      id: 'p-4',
      author: actor('a-lucia'),
      objectKind: 'post',
      body: 'Clean Architecture en una frase: las dependencias apuntan hacia adentro. Los controllers son thin, los seams son la frontera. El resto es ruido. #cleanarch',
      media: [],
      hashtags: ['cleanarch'],
      mentions: [],
      createdAtUtc: ago(260),
      reactions: reactionStateFor(180, 40, 8, 72, 'insightful'),
      commentCount: 12,
      repostCount: 15,
      reposted: false,
    },
    {
      id: 'p-5',
      author: actor('a-valeria'),
      objectKind: 'post',
      body: 'Demo en vivo: el feed que estás viendo corre con datos de ejemplo porque el backend todavía no responde. Cuando conecte, este mismo UI no cambia ni una línea. Esa es la idea. #degraded',
      media: [],
      hashtags: ['degraded'],
      mentions: [],
      createdAtUtc: ago(15),
      reactions: reactionStateFor(95, 22, 18, 14, null),
      commentCount: 6,
      repostCount: 9,
      reposted: false,
    },
  ];
}

/** Posts whose authors the viewer "follows" (drives the Siguiendo scope). */
const FOLLOWED_KEYS = new Set(['a-valeria', 'a-mateo', 'a-synergos']);

export function buildMockFeed(scope: FeedScope, cursor: string | null): FeedPage {
  const all = buildPosts();
  const scoped =
    scope === 'following' ? all.filter((post) => FOLLOWED_KEYS.has(post.author.actorKey)) : all;
  // Single demo page — exhaust the cursor so infinite-scroll stops cleanly.
  if (cursor) {
    return { posts: [], nextCursor: null };
  }
  return { posts: scoped, nextCursor: null };
}

// ─── Seed nested comments ──────────────────────────────────────────────────────

export function buildMockComments(postId: string): readonly Comment[] {
  return [
    {
      id: `${postId}-c1`,
      postId,
      author: actor('a-valeria'),
      body: 'Esto es justo lo que necesitábamos. El follow asimétrico cambia todo el modelo del feed.',
      parentId: null,
      createdAtUtc: ago(4),
      likeCount: 24,
      liked: false,
      replies: [
        {
          id: `${postId}-c1-r1`,
          postId,
          author: actor('a-lucia'),
          body: '100%. Y reusar ICommentRepository para los hilos evita reinventar la moderación.',
          parentId: `${postId}-c1`,
          createdAtUtc: ago(2),
          likeCount: 9,
          liked: true,
          replies: [],
        },
      ],
    },
    {
      id: `${postId}-c2`,
      postId,
      author: actor('a-mateo'),
      body: '¿La capa de notificaciones ya está cableada o llega después? 👀',
      parentId: null,
      createdAtUtc: ago(1),
      likeCount: 5,
      liked: false,
      replies: [],
    },
  ];
}

// ─── Seed notifications ────────────────────────────────────────────────────────

export function buildMockNotifications(): readonly Notification[] {
  return [
    {
      id: 'n-1',
      verb: 'follow',
      actor: actor('a-valeria'),
      summary: 'te empezó a seguir',
      postId: null,
      createdAtUtc: ago(8),
      read: false,
    },
    {
      id: 'n-2',
      verb: 'react',
      actor: actor('a-mateo'),
      summary: 'reaccionó a tu publicación',
      postId: 'p-2',
      createdAtUtc: ago(22),
      read: false,
    },
    {
      id: 'n-3',
      verb: 'reply',
      actor: actor('a-lucia'),
      summary: 'respondió a tu comentario',
      postId: 'p-4',
      createdAtUtc: ago(96),
      read: true,
    },
    {
      id: 'n-4',
      verb: 'mention',
      actor: actor('a-synergos'),
      summary: 'te mencionó en una publicación',
      postId: 'p-1',
      createdAtUtc: ago(180),
      read: true,
    },
  ];
}

// ─── Seed profile ──────────────────────────────────────────────────────────────

export function buildMockProfile(handle: string): ProfilePayload {
  const cleaned = handle.replace(/^@/, '').toLowerCase();
  const found = ACTORS.find((entry) => entry.handle.toLowerCase() === cleaned) ?? actor('a-valeria');
  const posts = buildPosts().filter((post) => post.author.actorKey === found.actorKey);
  return {
    author: found,
    posts: posts.length > 0 ? posts : buildPosts().slice(0, 2),
    stats: {
      followers: found.followersCount,
      following: found.followingCount,
      posts: found.postsCount,
    },
    following: FOLLOWED_KEYS.has(found.actorKey),
  };
}

// ─── Seed search / trending ────────────────────────────────────────────────────

export function buildMockTrending(): readonly TrendingTag[] {
  return [
    { tag: 'SynergosLabs', postCount: 1_204 },
    { tag: 'ola3', postCount: 318 },
    { tag: 'design', postCount: 892 },
    { tag: 'cleanarch', postCount: 410 },
    { tag: 'craft', postCount: 256 },
  ];
}

export function buildMockSearch(query: string): SearchResult {
  const term = query.trim().toLowerCase().replace(/^[#@]/, '');
  const all = buildPosts();
  if (!term) {
    return { accounts: ACTORS, posts: all, hashtags: buildMockTrending() };
  }
  return {
    accounts: ACTORS.filter(
      (entry) =>
        entry.handle.toLowerCase().includes(term) ||
        entry.displayName.toLowerCase().includes(term),
    ),
    posts: all.filter(
      (post) =>
        post.body.toLowerCase().includes(term) ||
        post.hashtags.some((tag) => tag.toLowerCase().includes(term)),
    ),
    hashtags: buildMockTrending().filter((tag) => tag.tag.toLowerCase().includes(term)),
  };
}
