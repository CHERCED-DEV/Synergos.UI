/**
 * Domain model for the Blogs vertical's <c>&lt;synergos-blogs&gt;</c> — a real social
 * network app (feed · composer · thread · profile · notifications · search),
 * the cross of X/Twitter (timeline + reactions), Instagram/Threads (rich profiles,
 * media-first, asymmetric follow) and Medium/Dev.to (long editorial posts + quality
 * comments).
 *
 * The model follows the **ActivityStreams 2.0 / ActivityPub** Actor-Verb-Object
 * shape called out in the app-spec §1/§6: a `Post` is an `Object` of a `Create`,
 * a notification is a directed activity, and a comment is a `Reply`. Keeping this
 * abstraction is what lets Educación reuse the feed by polymorphism later
 * (`objectKind = 'lesson'`) without copying Blogs.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised and unit-tested.
 */

/** Feed scope the timeline is derived from. Maps 1:1 to the API `scope` param. */
export type FeedScope = 'foryou' | 'following';

/**
 * The high-level view / internal route the SPA is in — the hash router
 * (`#/blogs/...`) deep-links each one. **v2** grows the v1 set (feed · post ·
 * profile · notifications · search) with the DMs (SH-7), the long-form editor,
 * guardados/listas, the creator studio (SH-5) and the monetization checkout
 * (SH-3), turning the single-view v1 shell into the full red-social SPA.
 */
export type BlogsView =
  | 'feed'
  | 'post' // post detail + nested comment thread
  | 'profile'
  | 'notifications'
  | 'search' // explore / search / hashtag (SH-1)
  | 'messages' // DMs — SH-7 message-center (inbox + thread + composer)
  | 'saved' // guardados / listas
  | 'write' // long-form article editor (composer extendido)
  | 'studio' // creator studio — SH-5 console (analytics + monetización)
  | 'subscribe'; // suscripción / tip — SH-3 checkout over the engine (opcional)

/** Reaction verbs the UI surfaces. `IReactionService` keys idempotently on this. */
export type ReactionType = 'like' | 'love' | 'celebrate' | 'insightful';

/** What kind of object an activity item wraps — the polymorphism seam. */
export type ObjectKind = 'post' | 'postPage' | 'lesson';

// ─── Actor (profile) ──────────────────────────────────────────────────────────

/**
 * A social identity — a projection of a Member (handle, bio, avatar, banner) plus
 * aggregates, NOT a parallel account store (app-spec §4/§6). `actorKey` is decoupled
 * from `memberKey` (like patientKey in healthcare) to allow editable handles / RTBF.
 */
export interface Author {
  readonly actorKey: string;
  /** Unique @handle (without the leading `@`). */
  readonly handle: string;
  readonly displayName: string;
  readonly bio: string;
  readonly avatarUrl: string;
  readonly bannerUrl: string;
  readonly verified: boolean;
  readonly followersCount: number;
  readonly followingCount: number;
  readonly postsCount: number;
}

/** Aggregates shown on the profile header. */
export interface ProfileStats {
  readonly followers: number;
  readonly following: number;
  readonly posts: number;
}

/** `GET /api/blogs/profile/{handle}` response. */
export interface ProfilePayload {
  readonly author: Author;
  readonly posts: readonly Post[];
  readonly stats: ProfileStats;
  /** Whether the viewer currently follows this author. */
  readonly following: boolean;
}

// ─── Post (Object of a Create) ────────────────────────────────────────────────

/** A media attachment on a post (image or video) with required alt text. */
export interface MediaAttachment {
  readonly url: string;
  readonly kind: 'image' | 'video';
  /** Accessible alt text — never empty for images (a11y, app-spec). */
  readonly alt: string;
}

/** Per-type reaction counter (the contador the UI renders). */
export interface ReactionCount {
  readonly type: ReactionType;
  readonly count: number;
}

/**
 * The reaction aggregate for one object: per-type counts + the viewer's own state
 * (`mine`). Idempotent by (actor, object, type) on the service side.
 */
export interface ReactionState {
  readonly counts: readonly ReactionCount[];
  /** The viewer's active reaction, or `null` if none. */
  readonly mine: ReactionType | null;
  readonly total: number;
}

/**
 * One feed item / post. `objectKind` keeps the activity polymorphic so a long
 * editorial post (`postPage`) or a published lesson (`lesson`) flow through the
 * same card.
 */
export interface Post {
  readonly id: string;
  readonly author: Author;
  readonly objectKind: ObjectKind;
  readonly body: string;
  readonly media: readonly MediaAttachment[];
  /** Hashtags (without the leading `#`) extracted from the body. */
  readonly hashtags: readonly string[];
  /** Mentioned handles (without the leading `@`). */
  readonly mentions: readonly string[];
  /** ISO-8601 UTC timestamp the post was created. */
  readonly createdAtUtc: string;
  readonly reactions: ReactionState;
  readonly commentCount: number;
  readonly repostCount: number;
  /** Whether the viewer has reposted this. */
  readonly reposted: boolean;
}

/** `GET /api/blogs/feed?scope=&cursor=` response. */
export interface FeedPage {
  readonly posts: readonly Post[];
  /** Opaque cursor for the next page, or `null` when exhausted. */
  readonly nextCursor: string | null;
}

/** Body for `POST /api/blogs/post`. */
export interface NewPost {
  readonly body: string;
  readonly mediaUrl?: string;
  readonly mediaAlt?: string;
}

// ─── Comments (nested thread) ─────────────────────────────────────────────────

/**
 * A comment in a post's thread. Self-referential `parentId` gives the nested
 * (2-level visible) thread the spec reuses from `ICommentRepository`. `replies`
 * holds the materialised children for the visible depth.
 */
export interface Comment {
  readonly id: string;
  readonly postId: string;
  readonly author: Author;
  readonly body: string;
  /** Parent comment id, or `null` for a top-level reply. */
  readonly parentId: string | null;
  readonly createdAtUtc: string;
  readonly likeCount: number;
  readonly liked: boolean;
  readonly replies: readonly Comment[];
}

/** `GET /api/blogs/post/{id}` response. */
export interface PostDetail {
  readonly post: Post;
  readonly comments: readonly Comment[];
}

// ─── Notifications (directed activity) ────────────────────────────────────────

/** The verb of a directed notification. */
export type NotificationVerb = 'follow' | 'react' | 'mention' | 'reply' | 'repost';

/** A notification = an ActivityItem directed at the viewer (app-spec §1/§6). */
export interface Notification {
  readonly id: string;
  readonly verb: NotificationVerb;
  /** The actor who triggered it. */
  readonly actor: Author;
  /** Human summary, e.g. "te empezó a seguir". */
  readonly summary: string;
  /** Related post id when the verb targets a post. */
  readonly postId: string | null;
  readonly createdAtUtc: string;
  readonly read: boolean;
}

// ─── Search / explore ─────────────────────────────────────────────────────────

/** A trending hashtag with its post volume. */
export interface TrendingTag {
  readonly tag: string;
  readonly postCount: number;
}

/**
 * Unified search result (accounts + posts + hashtags), per `ISocialSearchQuery`.
 * `GET` against the search endpoint; trending is returned for the empty query.
 */
export interface SearchResult {
  readonly accounts: readonly Author[];
  readonly posts: readonly Post[];
  readonly hashtags: readonly TrendingTag[];
}

/** The active tab on the search/explore view. */
export type SearchTab = 'top' | 'accounts' | 'posts' | 'hashtags';

// ─── Direct messages (SH-7 message-center) ─────────────────────────────────────

/**
 * One message inside a DM thread. `outgoing` marks the viewer's own messages so
 * the thread pane can align/side them without a parallel identity store.
 */
export interface DirectMessage {
  readonly id: string;
  readonly threadId: string;
  readonly author: Author;
  readonly body: string;
  readonly createdAtUtc: string;
  /** `true` when the viewer is the sender (right-aligned bubble). */
  readonly outgoing: boolean;
}

/**
 * A DM conversation shown in the SH-7 conversation-list. `unread` drives the
 * inbox badge; `lastMessage`/`lastAtUtc` render the list-row preview. Threads
 * are opaque `TThread`s to the shell — this is the blogs-shaped `TThread`.
 */
export interface MessageThread {
  readonly id: string;
  /** The other participant (a DM is 1:1 in v2). */
  readonly participant: Author;
  readonly lastMessage: string;
  readonly lastAtUtc: string;
  readonly unread: number;
  /** Materialised messages for the open thread (empty in the list payload). */
  readonly messages: readonly DirectMessage[];
}

/** `GET /api/blogs/messages?user=` response. */
export interface InboxPayload {
  readonly threads: readonly MessageThread[];
}

/** `GET /api/blogs/thread/{id}` response. */
export interface ThreadPayload {
  readonly thread: MessageThread;
}

/** Body for `POST /api/blogs/message`. */
export interface NewMessage {
  readonly threadId: string;
  readonly body: string;
}

// ─── Long-form article (`/write`) ───────────────────────────────────────────────

/** Body for `POST /api/blogs/article` — the long-form editor's publish payload. */
export interface NewArticle {
  readonly title: string;
  readonly body: string;
  readonly coverUrl?: string;
  readonly coverAlt?: string;
  readonly hashtags?: readonly string[];
}

// ─── Guardados / listas ─────────────────────────────────────────────────────────

/** `GET /api/blogs/saved?user=` response — the viewer's bookmarked posts. */
export interface SavedPayload {
  readonly posts: readonly Post[];
}

// ─── Creator studio (SH-5 console — analytics + monetización) ────────────────────

/** One point of a small time series (audience growth / reach over time). */
export interface StudioSeriesPoint {
  readonly label: string;
  readonly value: number;
}

/** A monetization tier the creator offers (drives SH-3 subscribe). */
export interface CreatorTier {
  readonly id: string;
  readonly name: string;
  /** Monthly price in **minor units** (engine convention). */
  readonly priceMinor: number;
  readonly currency: string;
  readonly perks: readonly string[];
  readonly subscribers: number;
}

/** One row of the studio's top-content table. */
export interface StudioPostStat {
  readonly postId: string;
  readonly excerpt: string;
  readonly impressions: number;
  readonly engagements: number;
  readonly reactions: number;
  readonly comments: number;
}

/**
 * `GET /api/blogs/studio?user=` aggregate — the creator-studio dashboard
 * (seguidores, alcance, engagement) + monetización (tiers + ingresos).
 */
export interface StudioPayload {
  readonly followers: number;
  readonly followersDelta: number;
  readonly reach: number;
  readonly reachDelta: number;
  readonly engagementRate: number;
  readonly monthlyRevenueMinor: number;
  readonly currency: string;
  readonly audience: readonly StudioSeriesPoint[];
  readonly topPosts: readonly StudioPostStat[];
  readonly tiers: readonly CreatorTier[];
}

/** The addressable sections inside the SH-5 creator studio. */
export type StudioSection = 'overview' | 'content' | 'audience' | 'monetization';
