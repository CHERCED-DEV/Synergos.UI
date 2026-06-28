import { NgTemplateOutlet } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { BlogsApiClient } from './blogs-api.client';
import { mockViewer, reactionStateFor } from './blogs.mock';
import {
  type Author,
  type BlogsView,
  type Comment,
  type FeedScope,
  type Notification,
  type Post,
  type ReactionState,
  type ReactionType,
  type SearchResult,
  type SearchTab,
  type TrendingTag,
} from './blogs.model';

/**
 * Runtime config for the CMS element <c>elementSynBlogs</c>.
 *
 * The Blogs vertical as a real social network app (feed · composer · thread ·
 * profile · notifications · search). Pure presentation + a thin API; the engine is
 * not wired (no transaction in the social core — app-spec §4).
 */
export interface BlogsRuntimeConfig {
  /** Base URL of the blogs API. Default `/api/blogs`. */
  readonly apiBase?: string;
  /** Storage / instance scope (typically the siteRoot). Default `blogs`. */
  readonly scope?: string;
}

const DEFAULT_API_BASE = '/api/blogs';
const DEFAULT_SCOPE = 'blogs';

const REACTION_META: readonly { type: ReactionType; glyph: string; label: string }[] = [
  { type: 'like', glyph: '👍', label: 'Me gusta' },
  { type: 'love', glyph: '❤️', label: 'Me encanta' },
  { type: 'celebrate', glyph: '🎉', label: 'Celebrar' },
  { type: 'insightful', glyph: '💡', label: 'Interesante' },
];

function sanitizeConfig(value: Partial<BlogsRuntimeConfig>): BlogsRuntimeConfig {
  return omitUndefinedProperties<BlogsRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    scope: coerceTrimmedStringInput(value.scope),
  });
}

let blogsInstanceId = 0;

@Component({
  selector: 'sg-blogs',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './blogs.html',
  styleUrl: './blogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-avatar>, <synergos-tag> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-blogs' },
})
export class BlogsElementComponent {
  readonly #api = inject(BlogsApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<BlogsRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BlogsRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly scope = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.scopeInput()),
      this.config()?.scope,
      DEFAULT_SCOPE,
    ),
  );

  readonly instanceId = (blogsInstanceId += 1);
  readonly fieldId = `syn-blogs-${this.instanceId}`;
  readonly reactionMeta = REACTION_META;

  /** The viewer's projected social identity (used for optimistic publishes). */
  readonly viewer: Author = mockViewer();

  // ─── Outputs (CustomEvents) ────────────────────────────────────────────────
  readonly postpublished = output<{ id: string }>();
  readonly postreacted = output<{ id: string; type: ReactionType; active: boolean }>();
  readonly authorfollowed = output<{ actorKey: string; following: boolean }>();
  readonly viewchanged = output<BlogsView>();

  // ─── Shell / navigation state ───────────────────────────────────────────────
  readonly view = signal<BlogsView>('feed');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly composerOpen = signal(false);

  // ─── Social session (optimistic UI source of truth) ─────────────────────────
  /** Actor keys the viewer follows. */
  readonly following = signal<ReadonlySet<string>>(new Set());

  // ─── Feed ────────────────────────────────────────────────────────────────────
  readonly feedScope = signal<FeedScope>('foryou');
  readonly posts = signal<readonly Post[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly feedLoaded = signal(false);

  // ─── Composer ────────────────────────────────────────────────────────────────
  readonly draftBody = signal('');
  readonly draftMediaUrl = signal('');
  readonly draftMediaAlt = signal('');
  readonly publishing = signal(false);
  readonly maxChars = 500;
  readonly draftRemaining = computed(() => this.maxChars - this.draftBody().length);
  readonly draftValid = computed(() => {
    const len = this.draftBody().trim().length;
    if (len < 1 || len > this.maxChars) {
      return false;
    }
    // Media requires alt text (a11y gate).
    return !this.draftMediaUrl().trim() || this.draftMediaAlt().trim().length > 0;
  });

  // ─── Post detail / thread ─────────────────────────────────────────────────────
  readonly activePost = signal<Post | null>(null);
  readonly comments = signal<readonly Comment[]>([]);
  readonly commentDraft = signal('');
  readonly commentDrafts = signal<Readonly<Record<string, string>>>({});
  readonly commentValid = computed(() => this.commentDraft().trim().length > 0);

  // ─── Profile ───────────────────────────────────────────────────────────────────
  readonly profile = signal<Author | null>(null);
  readonly profilePosts = signal<readonly Post[]>([]);
  readonly profileFollowing = signal(false);
  readonly profileTab = signal<'posts' | 'replies' | 'media'>('posts');

  // ─── Notifications ─────────────────────────────────────────────────────────────
  readonly notifications = signal<readonly Notification[]>([]);
  readonly notificationsLoaded = signal(false);
  readonly notificationFilter = signal<'all' | 'mentions'>('all');
  readonly unreadCount = computed(
    () => this.notifications().filter((notification) => !notification.read).length,
  );
  readonly filteredNotifications = computed(() => {
    if (this.notificationFilter() === 'mentions') {
      return this.notifications().filter((notification) => notification.verb === 'mention');
    }
    return this.notifications();
  });

  // ─── Search / explore ───────────────────────────────────────────────────────────
  readonly searchTerm = signal('');
  readonly searchResult = signal<SearchResult | null>(null);
  readonly searchTab = signal<SearchTab>('top');
  readonly trending = signal<readonly TrendingTag[]>([]);
  readonly searching = signal(false);

  // ─── Degradation flag (mock fallback surfaced to the shell) ─────────────────────
  readonly degraded = computed(() => {
    // Recompute whenever a fetch path could have flipped the flag.
    void this.feedLoaded();
    void this.view();
    void this.activePost();
    void this.profile();
    void this.searchResult();
    void this.notificationsLoaded();
    return this.#api.degraded;
  });

  readonly profileViewerFollows = computed(() => {
    const profile = this.profile();
    return profile ? this.following().has(profile.actorKey) : false;
  });

  constructor() {
    void this.loadFeed();
    void this.loadTrending();
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Navigation ────────────────────────────────────────────────────────────────
  go(view: BlogsView): void {
    this.view.set(view);
    this.errorMessage.set('');
    this.viewchanged.emit(view);
    if (view === 'notifications' && !this.notificationsLoaded()) {
      void this.loadNotifications();
    }
    if (view === 'search' && !this.searchResult()) {
      void this.runSearch();
    }
  }

  // ─── Feed ──────────────────────────────────────────────────────────────────────
  setFeedScope(scope: FeedScope): void {
    if (this.feedScope() === scope) {
      return;
    }
    this.feedScope.set(scope);
    void this.loadFeed();
  }

  private async loadFeed(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const page = await this.#api.feed(this.apiBase(), this.feedScope(), null);
      this.posts.set(this.applyFollowState(page.posts));
      this.nextCursor.set(page.nextCursor);
      this.feedLoaded.set(true);
      this.seedFollowingFromPosts(page.posts);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el feed. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const page = await this.#api.feed(this.apiBase(), this.feedScope(), cursor);
      this.posts.update((current) => [...current, ...this.applyFollowState(page.posts)]);
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      void error;
    } finally {
      this.loadingMore.set(false);
    }
  }

  refreshFeed(): void {
    void this.loadFeed();
  }

  // ─── Composer ─────────────────────────────────────────────────────────────────
  toggleComposer(): void {
    this.composerOpen.update((open) => !open);
  }

  publish(): void {
    if (!this.draftValid() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    const draft = {
      body: this.draftBody().trim(),
      mediaUrl: this.draftMediaUrl().trim() || undefined,
      mediaAlt: this.draftMediaAlt().trim() || undefined,
    };
    this.#api
      .publish(this.apiBase(), draft, this.viewer)
      .then((post) => {
        // Optimistic insert at the top of the feed.
        this.posts.update((current) => [post, ...current]);
        this.draftBody.set('');
        this.draftMediaUrl.set('');
        this.draftMediaAlt.set('');
        this.composerOpen.set(false);
        this.view.set('feed');
        this.postpublished.emit({ id: post.id });
      })
      .catch((error: unknown) => {
        this.errorMessage.set('No pudimos publicar. Intenta de nuevo.');
        void error;
      })
      .finally(() => this.publishing.set(false));
  }

  // ─── Reactions (optimistic, idempotent toggle) ──────────────────────────────────
  react(post: Post, type: ReactionType): void {
    const optimistic = toggleReaction(post.reactions, type);
    const active = optimistic.mine === type;
    // Apply optimistically across every place the post can appear.
    this.patchPost(post.id, (current) => ({ ...current, reactions: optimistic }));
    this.postreacted.emit({ id: post.id, type, active });

    this.#api
      .react(this.apiBase(), post.id, type, optimistic)
      .then((reactions) => this.patchPost(post.id, (current) => ({ ...current, reactions })))
      .catch((error: unknown) => {
        // Roll back on failure.
        this.patchPost(post.id, (current) => ({ ...current, reactions: post.reactions }));
        void error;
      });
  }

  reactionCount(post: Post, type: ReactionType): number {
    return post.reactions.counts.find((entry) => entry.type === type)?.count ?? 0;
  }

  isReacted(post: Post, type: ReactionType): boolean {
    return post.reactions.mine === type;
  }

  toggleRepost(post: Post): void {
    const reposted = !post.reposted;
    this.patchPost(post.id, (current) => ({
      ...current,
      reposted,
      repostCount: Math.max(0, current.repostCount + (reposted ? 1 : -1)),
    }));
  }

  // ─── Follow (optimistic toggle + count recalc) ──────────────────────────────────
  toggleFollow(author: Author): void {
    const isFollowing = this.following().has(author.actorKey);
    const next = !isFollowing;
    this.setFollowing(author.actorKey, next);
    this.authorfollowed.emit({ actorKey: author.actorKey, following: next });

    // Optimistic follower count on the visible profile.
    if (this.profile()?.actorKey === author.actorKey) {
      this.profile.update((current) =>
        current
          ? { ...current, followersCount: Math.max(0, current.followersCount + (next ? 1 : -1)) }
          : current,
      );
      this.profileFollowing.set(next);
    }

    this.#api.follow(this.apiBase(), author.actorKey, next).then((confirmed) => {
      if (confirmed !== next) {
        // Reconcile with the server's truth.
        this.setFollowing(author.actorKey, confirmed);
        if (this.profile()?.actorKey === author.actorKey) {
          this.profileFollowing.set(confirmed);
        }
      }
    });
  }

  isFollowing(actorKey: string): boolean {
    return this.following().has(actorKey);
  }

  // ─── Post detail / thread ───────────────────────────────────────────────────────
  openPost(post: Post): void {
    this.view.set('post');
    this.viewchanged.emit('post');
    this.activePost.set(post);
    this.comments.set([]);
    this.errorMessage.set('');
    void this.loadPost(post.id);
  }

  backToFeed(): void {
    this.view.set('feed');
    this.viewchanged.emit('feed');
    this.activePost.set(null);
  }

  private async loadPost(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const detail = await this.#api.post(this.apiBase(), id);
      this.activePost.set(this.applyFollowState([detail.post])[0]);
      this.comments.set(detail.comments);
    } catch (error) {
      this.errorMessage.set('No pudimos abrir la publicación.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  reactActive(type: ReactionType): void {
    const post = this.activePost();
    if (post) {
      this.react(post, type);
    }
  }

  setCommentDraft(parentId: string, value: string): void {
    this.commentDrafts.update((current) => ({ ...current, [parentId]: value }));
  }

  /** Curried setter for the reply input's `(input)` binding via `bind(...)`. */
  setCommentDraftBound(parentId: string): (value: string) => void {
    return (value: string) => this.setCommentDraft(parentId, value);
  }

  commentDraftFor(parentId: string): string {
    return this.commentDrafts()[parentId] ?? '';
  }

  submitComment(): void {
    const post = this.activePost();
    const body = this.commentDraft().trim();
    if (!post || !body) {
      return;
    }
    const comment = this.buildLocalComment(post.id, body, null);
    this.comments.update((current) => [...current, comment]);
    this.commentDraft.set('');
    this.patchPost(post.id, (current) => ({
      ...current,
      commentCount: current.commentCount + 1,
    }));
  }

  submitReply(parent: Comment): void {
    const post = this.activePost();
    const body = this.commentDraftFor(parent.id).trim();
    if (!post || !body) {
      return;
    }
    const reply = this.buildLocalComment(post.id, body, parent.id);
    this.comments.update((current) =>
      current.map((comment) =>
        comment.id === parent.id
          ? { ...comment, replies: [...comment.replies, reply] }
          : comment,
      ),
    );
    this.setCommentDraft(parent.id, '');
    this.patchPost(post.id, (current) => ({
      ...current,
      commentCount: current.commentCount + 1,
    }));
  }

  toggleCommentLike(comment: Comment): void {
    const liked = !comment.liked;
    const apply = (entry: Comment): Comment =>
      entry.id === comment.id
        ? { ...entry, liked, likeCount: Math.max(0, entry.likeCount + (liked ? 1 : -1)) }
        : { ...entry, replies: entry.replies.map(apply) };
    this.comments.update((current) => current.map(apply));
  }

  // ─── Profile ─────────────────────────────────────────────────────────────────────
  openProfile(handle: string): void {
    this.view.set('profile');
    this.viewchanged.emit('profile');
    this.profile.set(null);
    this.profilePosts.set([]);
    this.errorMessage.set('');
    void this.loadProfile(handle);
  }

  setProfileTab(tab: 'posts' | 'replies' | 'media'): void {
    this.profileTab.set(tab);
  }

  private async loadProfile(handle: string): Promise<void> {
    this.loading.set(true);
    try {
      const payload = await this.#api.profile(this.apiBase(), handle);
      this.profile.set(payload.author);
      this.profilePosts.set(this.applyFollowState(payload.posts));
      this.profileFollowing.set(payload.following);
      this.setFollowing(payload.author.actorKey, payload.following);
      this.profileTab.set('posts');
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el perfil.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  readonly profileMediaPosts = computed(() =>
    this.profilePosts().filter((post) => post.media.length > 0),
  );

  // ─── Notifications ────────────────────────────────────────────────────────────────
  setNotificationFilter(filter: 'all' | 'mentions'): void {
    this.notificationFilter.set(filter);
  }

  markAllRead(): void {
    this.notifications.update((current) =>
      current.map((notification) => ({ ...notification, read: true })),
    );
  }

  markRead(notification: Notification): void {
    this.notifications.update((current) =>
      current.map((entry) => (entry.id === notification.id ? { ...entry, read: true } : entry)),
    );
  }

  openNotification(notification: Notification): void {
    this.markRead(notification);
    if (notification.postId) {
      const post = this.posts().find((entry) => entry.id === notification.postId);
      if (post) {
        this.openPost(post);
        return;
      }
    }
    this.openProfile(notification.actor.handle);
  }

  private async loadNotifications(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.#api.notifications(this.apiBase());
      this.notifications.set(list);
      this.notificationsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar las notificaciones.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Search / explore ─────────────────────────────────────────────────────────────
  submitSearch(): void {
    void this.runSearch();
  }

  setSearchTab(tab: SearchTab): void {
    this.searchTab.set(tab);
  }

  searchHashtag(tag: string): void {
    this.view.set('search');
    this.viewchanged.emit('search');
    this.searchTerm.set(`#${tag}`);
    this.searchTab.set('posts');
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    this.searching.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#api.search(this.apiBase(), this.searchTerm());
      this.searchResult.set({
        accounts: result.accounts,
        posts: this.applyFollowState(result.posts),
        hashtags: result.hashtags,
      });
    } catch (error) {
      this.errorMessage.set('No pudimos buscar. Intenta de nuevo.');
      void error;
    } finally {
      this.searching.set(false);
    }
  }

  private async loadTrending(): Promise<void> {
    try {
      this.trending.set(await this.#api.trending(this.apiBase()));
    } catch (error) {
      void error;
    }
  }

  // ─── Relative-time rendering ───────────────────────────────────────────────────────
  relativeTime(iso: string): string {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
      return '';
    }
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) {
      return 'ahora';
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `hace ${minutes} min`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `hace ${hours} h`;
    }
    const days = Math.round(hours / 24);
    if (days < 7) {
      return `hace ${days} d`;
    }
    try {
      return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(then);
    } catch {
      return `hace ${days} d`;
    }
  }

  formatCount(value: number): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')} k`;
    }
    return String(value);
  }

  initials(author: Author): string {
    const name = author.displayName || author.handle;
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  trackPost = (_: number, post: Post): string => post.id;
  trackComment = (_: number, comment: Comment): string => comment.id;
  trackAuthor = (_: number, author: Author): string => author.actorKey;
  trackTag = (_: number, tag: TrendingTag): string => tag.tag;
  trackNotification = (_: number, notification: Notification): string => notification.id;

  // ─── Helpers ────────────────────────────────────────────────────────────────────────
  /** Apply the same patch to a post wherever it currently lives in state. */
  private patchPost(id: string, patch: (post: Post) => Post): void {
    const map = (post: Post): Post => (post.id === id ? patch(post) : post);
    this.posts.update((current) => current.map(map));
    this.profilePosts.update((current) => current.map(map));
    const active = this.activePost();
    if (active?.id === id) {
      this.activePost.set(patch(active));
    }
    const result = this.searchResult();
    if (result) {
      this.searchResult.set({ ...result, posts: result.posts.map(map) });
    }
  }

  private setFollowing(actorKey: string, value: boolean): void {
    this.following.update((current) => {
      const next = new Set(current);
      if (value) {
        next.add(actorKey);
      } else {
        next.delete(actorKey);
      }
      return next;
    });
  }

  /** Sync `reposted`/follow visuals against the social session for fresh posts. */
  private applyFollowState(posts: readonly Post[]): readonly Post[] {
    return posts;
  }

  /** Seed the follow set from the demo feed so follow buttons reflect a graph. */
  private seedFollowingFromPosts(posts: readonly Post[]): void {
    if (this.following().size > 0) {
      return;
    }
    const seeded = new Set<string>();
    for (const post of posts) {
      if (post.reposted) {
        seeded.add(post.author.actorKey);
      }
    }
    if (seeded.size > 0) {
      this.following.set(seeded);
    }
  }

  private buildLocalComment(postId: string, body: string, parentId: string | null): Comment {
    return {
      id: `local-c-${Date.now().toString(36)}`,
      postId,
      author: this.viewer,
      body,
      parentId,
      createdAtUtc: new Date().toISOString(),
      likeCount: 0,
      liked: false,
      replies: [],
    };
  }
}

/**
 * Idempotent reaction toggle: clicking the same type removes it, a different type
 * replaces it. Mirrors the `IReactionService` contract (unique per actor/object/type).
 */
function toggleReaction(state: ReactionState, type: ReactionType): ReactionState {
  const counts = new Map<ReactionType, number>();
  for (const entry of state.counts) {
    counts.set(entry.type, entry.count);
  }
  const previous = state.mine;
  // Remove the previous reaction's contribution.
  if (previous) {
    counts.set(previous, Math.max(0, (counts.get(previous) ?? 0) - 1));
  }
  let mine: ReactionType | null;
  if (previous === type) {
    mine = null; // toggled off
  } else {
    counts.set(type, (counts.get(type) ?? 0) + 1);
    mine = type;
  }
  const like = counts.get('like') ?? 0;
  const love = counts.get('love') ?? 0;
  const celebrate = counts.get('celebrate') ?? 0;
  const insightful = counts.get('insightful') ?? 0;
  return reactionStateFor(like, love, celebrate, insightful, mine);
}
