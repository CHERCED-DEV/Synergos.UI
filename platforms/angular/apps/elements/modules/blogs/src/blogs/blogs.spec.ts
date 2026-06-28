import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlogsApiClient } from './blogs-api.client';
import { BlogsElementComponent } from './blogs';
import type { Author, Post } from './blogs.model';

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

const AUTHOR: Author = {
  actorKey: 'a-1',
  handle: 'valeria.code',
  displayName: 'Valeria',
  bio: '',
  avatarUrl: '',
  bannerUrl: '',
  verified: true,
  followersCount: 100,
  followingCount: 20,
  postsCount: 5,
};

describe('BlogsElementComponent', () => {
  let fixture: ComponentFixture<BlogsElementComponent>;
  let component: BlogsElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BlogsElementComponent],
      providers: [provideZonelessChangeDetection(), BlogsApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(BlogsElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Initial feed load runs in the constructor; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine shell, feed view, mock fallback flagged ──────────────────
  it('lands on the feed with a populated demo timeline and flags degradation (empty case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('feed');
    expect(component.feedScope()).toBe('foryou');
    // Mock catalogue loaded → posts present, degradation surfaced.
    expect(component.posts().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: publish a post → optimistic insert at the top of the feed ─────────
  it('publishes a post and inserts it optimistically at the top (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.posts().length;
    component.draftBody.set('Mi primer post en Synergos Social #hola');
    expect(component.draftValid()).toBe(true);

    component.publish();
    await flushMicrotasks();

    expect(component.posts().length).toBe(before + 1);
    expect(component.posts()[0].body).toContain('Mi primer post');
    expect(component.posts()[0].hashtags).toContain('hola');
    expect(component.draftBody()).toBe('');
  });

  // ── filter: "Siguiendo" scope narrows the feed to followed authors ───────────
  it('narrows the feed to followed authors on the Siguiendo scope (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const forYouCount = component.posts().length;
    component.setFeedScope('following');
    await flushMicrotasks();

    expect(component.feedScope()).toBe('following');
    // Following is a subset of For-you (the demo graph excludes some authors).
    expect(component.posts().length).toBeLessThanOrEqual(forYouCount);
    expect(component.posts().length).toBeGreaterThan(0);
  });

  // ── idempotent: reacting twice with the same type toggles off, net zero ──────
  it('toggles a reaction off when applied twice with the same type (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const post = component.posts().find((p) => p.reactions.mine === null) ?? component.posts()[0];
    const baseline = component.reactionCount(post, 'like');

    component.react(post, 'like');
    await flushMicrotasks();
    let current = component.posts().find((p) => p.id === post.id)!;
    expect(component.isReacted(current, 'like')).toBe(true);
    expect(component.reactionCount(current, 'like')).toBe(baseline + 1);

    // Same type again → removed (idempotent toggle, back to baseline).
    component.react(current, 'like');
    await flushMicrotasks();
    current = component.posts().find((p) => p.id === post.id)!;
    expect(component.isReacted(current, 'like')).toBe(false);
    expect(component.reactionCount(current, 'like')).toBe(baseline);
  });

  // ── reaction switch: love replaces like (one active reaction per user) ────────
  it('switches the active reaction without double-counting', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const post = component.posts().find((p) => p.reactions.mine === null) ?? component.posts()[0];
    component.react(post, 'like');
    await flushMicrotasks();
    let current = component.posts().find((p) => p.id === post.id)!;
    component.react(current, 'love');
    await flushMicrotasks();
    current = component.posts().find((p) => p.id === post.id)!;

    expect(component.isReacted(current, 'like')).toBe(false);
    expect(component.isReacted(current, 'love')).toBe(true);
  });

  // ── follow: optimistic toggle + follower count recalc on the profile ─────────
  it('follows an author optimistically and bumps the follower count', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openProfile('valeria.code');
    await flushMicrotasks();

    const profile = component.profile()!;
    const before = profile.followersCount;
    const wasFollowing = component.profileViewerFollows();

    component.toggleFollow(profile);
    await flushMicrotasks();

    expect(component.profileViewerFollows()).toBe(!wasFollowing);
    expect(component.profile()!.followersCount).toBe(before + (wasFollowing ? -1 : 1));
  });

  // ── thread: open a post, add a top-level comment optimistically ──────────────
  it('opens a post thread and appends a comment optimistically', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const post = component.posts()[0];
    component.openPost(post);
    await flushMicrotasks();

    expect(component.view()).toBe('post');
    expect(component.comments().length).toBeGreaterThan(0);

    const before = component.comments().length;
    component.commentDraft.set('¡Excelente!');
    component.submitComment();

    expect(component.comments().length).toBe(before + 1);
    expect(component.comments()[component.comments().length - 1].body).toBe('¡Excelente!');
    expect(component.commentDraft()).toBe('');
  });

  // ── search: hashtag search routes to the search view with results ────────────
  it('runs a hashtag search and returns matching posts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.searchHashtag('design');
    await flushMicrotasks();

    expect(component.view()).toBe('search');
    expect(component.searchResult()).not.toBeNull();
    expect(component.searchResult()!.posts.length).toBeGreaterThan(0);
  });

  // ── composer a11y gate: media without alt text blocks publishing ─────────────
  it('blocks publishing media without alt text (a11y gate)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.draftBody.set('Mira esta foto');
    component.draftMediaUrl.set('https://example.com/x.jpg');
    expect(component.draftValid()).toBe(false);

    component.draftMediaAlt.set('Una foto de ejemplo');
    expect(component.draftValid()).toBe(true);
  });
});

describe('BlogsApiClient', () => {
  function createClient(): BlogsApiClient {
    TestBed.configureTestingModule({ providers: [BlogsApiClient] });
    return TestBed.inject(BlogsApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live feed response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              posts: [
                {
                  id: 'X1',
                  author: AUTHOR,
                  body: 'Hola mundo',
                  createdAtUtc: '2026-06-28T00:00:00Z',
                  reactions: { counts: [{ type: 'like', count: 3 }], mine: 'like', total: 3 },
                  commentCount: 1,
                },
              ],
              nextCursor: 'c2',
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const page = await client.feed('/api/blogs', 'foryou', null);

    expect(page.posts).toHaveLength(1);
    expect(page.posts[0].id).toBe('X1');
    expect(page.posts[0].reactions.mine).toBe('like');
    expect(page.nextCursor).toBe('c2');
    expect(client.degraded).toBe(false);
  });

  it('degrades to a mock feed when the endpoint is unavailable (empty case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const page = await client.feed('/api/blogs', 'foryou', null);
    expect(page.posts.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });

  it('returns following=true from a live follow response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ following: true }),
        } as Response),
      ),
    );
    const client = createClient();
    const following = await client.follow('/api/blogs', 'a-1', false);
    expect(following).toBe(true);
    expect(client.degraded).toBe(false);
  });

  it('echoes the optimistic reaction state when the react endpoint is down (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const optimistic = { counts: [{ type: 'like' as const, count: 1 }], mine: 'like' as const, total: 1 };
    const result = await client.react('/api/blogs', 'X1', 'like', optimistic);
    expect(result).toEqual(optimistic);
    expect(client.degraded).toBe(true);
  });

  it('filters the mock search by hashtag when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.search('/api/blogs', '#design');
    expect(client.degraded).toBe(true);
    expect(result.posts.length).toBeGreaterThan(0);
    expect(
      result.posts.every((post: Post) =>
        post.body.toLowerCase().includes('design') ||
        post.hashtags.some((tag) => tag.toLowerCase().includes('design')),
      ),
    ).toBe(true);
  });
});
