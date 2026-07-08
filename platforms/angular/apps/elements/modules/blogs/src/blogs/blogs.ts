import { NgTemplateOutlet } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  CheckoutWizardComponent,
  ConsoleShellComponent,
  DiscoveryShellComponent,
  MessageCenterComponent,
  type AccountShellConfig,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type DiscoverySortOption,
  type MessageCenterConfig,
} from '@synergos/shells';
import {
  TabsComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { BlogsApiClient } from './blogs-api.client';
import { BLOGS_FLOW } from './blogs-fulfillment.strategy';
import { mockViewer, reactionStateFor } from './blogs.mock';
import {
  type Author,
  type BlogsView,
  type Comment,
  type CreatorTier,
  type DirectMessage,
  type FeedScope,
  type MessageThread,
  type Notification,
  type Post,
  type ReactionState,
  type ReactionType,
  type SearchResult,
  type SearchTab,
  type StudioPayload,
  type StudioPostStat,
  type StudioSection,
  type TrendingTag,
} from './blogs.model';

/**
 * Runtime config for the CMS element <c>elementSynBlogs</c>.
 *
 * Blogs **v2** — the red social multi-página (X + Instagram + Medium + LinkedIn,
 * doc 21 §2.3 + `deep-research/blogs.md`) rebuilt as a **hash-routed SPA**
 * (`#/blogs/...`) and the Ola-6 consumer of the reusable shell catalogue
 * `@synergos/shells`:
 *
 *  - **Feed** (Para ti / Siguiendo) con composer inline + reacciones/comentarios
 *    optimistas · **Post/hilo** con comentarios anidados · **Perfil** rico
 *    (header+banner+stats, seguir/dejar de seguir) · **Explore/Search/Hashtag**
 *    con **SH-1 `syn-discovery-shell`** (facetas tema/tab) · **DMs** con
 *    **SH-7 `syn-message-center`** (inbox + hilo + composer — la pieza nueva
 *    grande) · **Notificaciones** · **Guardados/listas** con **SH-4** · **Creator
 *    Studio** con **SH-5 `syn-console-shell`** (analytics + monetización) ·
 *    **Long-form** editor (`/write`) · **Suscripción/tip** con **SH-3
 *    `syn-checkout-wizard`** sobre el motor (opcional).
 *
 * 100% composable: no business is hardcoded; every knob comes from CMS props
 * (`apiBase`/`scope`/`config` JSON, patrón createConfigInputTransform/
 * resolveConfigValue) and the data always comes from the API with visible mock
 * degradation. The shells stay domain-free (contrato D3) — the module only feeds
 * data, templates and its `BlogsFulfillmentStrategy` (monetización).
 */
export interface BlogsRuntimeConfig {
  /** Base URL of the blogs API. Default `/api/blogs`. */
  readonly apiBase?: string;
  /** Storage / instance scope (typically the siteRoot). Default `blogs`. */
  readonly scope?: string;
  /** The viewer handle used to scope inbox/saved/studio queries. Default `me`. */
  readonly user?: string;
  /** The current viewer's public @handle (nav identity). Default `tu`. */
  readonly viewerHandle?: string;
  /** The current viewer's display name (nav identity). Default `Tú`. */
  readonly viewerName?: string;
  /** Initial view. Default `feed`. */
  readonly view?: BlogsView;
}

/** Typed event map for the transaction bus (blogs ↔ monetización). */
interface BlogsBus extends Record<string, unknown> {
  readonly subscribed: { readonly creatorKey: string; readonly tierId: string };
}

const DEFAULT_API_BASE = '/api/blogs';
const DEFAULT_SCOPE = 'blogs';
const DEFAULT_USER = 'me';
const DEFAULT_VIEW: BlogsView = 'feed';
const SESSION_TTL_MS = 30 * 60 * 1000;

const REACTION_META: readonly { type: ReactionType; glyph: string; label: string }[] = [
  { type: 'like', glyph: '👍', label: 'Me gusta' },
  { type: 'love', glyph: '❤️', label: 'Me encanta' },
  { type: 'celebrate', glyph: '🎉', label: 'Celebrar' },
  { type: 'insightful', glyph: '💡', label: 'Interesante' },
];

const SEARCH_SORT: readonly DiscoverySortOption[] = [
  { key: 'top', label: 'Top' },
  { key: 'recent', label: 'Recientes' },
];

const SEARCH_TABS: readonly { key: SearchTab; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'accounts', label: 'Cuentas' },
  { key: 'posts', label: 'Publicaciones' },
  { key: 'hashtags', label: 'Hashtags' },
];

/** The addressable sections inside the SH-5 creator studio (order = sidebar). */
const STUDIO_SECTIONS: readonly StudioSection[] = ['overview', 'content', 'audience', 'monetization'];

const VALID_VIEWS: readonly BlogsView[] = [
  'feed',
  'post',
  'profile',
  'notifications',
  'search',
  'messages',
  'saved',
  'write',
  'studio',
  'subscribe',
];

function sanitizeConfig(value: Partial<BlogsRuntimeConfig>): BlogsRuntimeConfig {
  return omitUndefinedProperties<BlogsRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    scope: coerceTrimmedStringInput(value.scope),
    user: coerceTrimmedStringInput(value.user),
    viewerHandle: coerceTrimmedStringInput(value.viewerHandle),
    viewerName: coerceTrimmedStringInput(value.viewerName),
    view: coerceView(value.view),
  });
}

function coerceView(value: unknown): BlogsView | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw && (VALID_VIEWS as readonly string[]).includes(raw) ? (raw as BlogsView) : undefined;
}

let blogsInstanceId = 0;

@Component({
  selector: 'sg-blogs',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    DiscoveryShellComponent,
    MessageCenterComponent,
    AccountShellComponent,
    ConsoleShellComponent,
    CheckoutWizardComponent,
    TabsComponent,
  ],
  templateUrl: './blogs.html',
  styleUrl: './blogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-avatar>, <synergos-comments-widget>,
  // <synergos-notification-center>, <synergos-tag> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-blogs' },
})
export class BlogsElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<BlogsBus>>(TransactionEventBusService);
  readonly #api = inject(BlogsApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<BlogsRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BlogsRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly userInput = input<string | undefined>(undefined, { alias: 'user' });
  readonly viewerHandleInput = input<string | undefined>(undefined, { alias: 'viewerHandle' });
  readonly viewerNameInput = input<string | undefined>(undefined, { alias: 'viewerName' });
  readonly viewInput = input<string | undefined>(undefined, { alias: 'view' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), this.config()?.scope, DEFAULT_SCOPE),
  );
  readonly user = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.userInput()), this.config()?.user, DEFAULT_USER),
  );
  readonly initialView = computed<BlogsView>(() =>
    resolveConfigValue(coerceView(this.viewInput()), this.config()?.view, DEFAULT_VIEW),
  );

  readonly instanceId = (blogsInstanceId += 1);
  readonly fieldId = `syn-blogs-${this.instanceId}`;
  readonly reactionMeta = REACTION_META;
  readonly searchTabs = SEARCH_TABS;
  readonly searchSort = SEARCH_SORT;

  /**
   * Content-tab descriptors fed to the shared `syn-tabs` primitive. We consume it as
   * the accessible tablist only (roving tabindex + Arrow/Home/End + focus come for
   * free); each view keeps its own rich content below, so `content` is intentionally
   * empty and the primitive's own text panel is hidden in the SCSS.
   */
  readonly feedTabs: readonly { readonly id: FeedScope; readonly label: string; readonly content: string }[] = [
    { id: 'foryou', label: 'Para ti', content: '' },
    { id: 'following', label: 'Siguiendo', content: '' },
  ];
  readonly profileTabs: readonly { readonly id: 'posts' | 'replies' | 'media'; readonly label: string; readonly content: string }[] = [
    { id: 'posts', label: 'Publicaciones', content: '' },
    { id: 'replies', label: 'Respuestas', content: '' },
    { id: 'media', label: 'Media', content: '' },
  ];
  readonly notificationTabs: readonly { readonly id: 'all' | 'mentions'; readonly label: string; readonly content: string }[] = [
    { id: 'all', label: 'Todas', content: '' },
    { id: 'mentions', label: 'Menciones', content: '' },
  ];

  /**
   * The viewer's projected social identity (nav "me" card + optimistic publishes).
   * Composable from CMS props (`viewerHandle`/`viewerName`) — falls back to the mock
   * identity so the shell is complete before a real session/member is wired. Never a
   * fetch, so it can never trip the `degraded` banner.
   */
  readonly #viewerHandle = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.viewerHandleInput()),
      this.config()?.viewerHandle,
      mockViewer().handle,
    ),
  );
  readonly #viewerName = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.viewerNameInput()),
      this.config()?.viewerName,
      mockViewer().displayName,
    ),
  );
  get viewer(): Author {
    return { ...mockViewer(), handle: this.#viewerHandle(), displayName: this.#viewerName() };
  }

  // ─── Outputs (CustomEvents) ────────────────────────────────────────────────
  readonly postpublished = output<{ id: string }>();
  readonly postreacted = output<{ id: string; type: ReactionType; active: boolean }>();
  readonly authorfollowed = output<{ actorKey: string; following: boolean }>();
  readonly messagesent = output<{ threadId: string }>();
  readonly articlepublished = output<{ id: string }>();
  readonly subscribed = output<{ creatorKey: string; tierId: string }>();
  readonly viewchanged = output<BlogsView>();

  // ─── Shell / navigation state ───────────────────────────────────────────────
  readonly view = signal<BlogsView>('feed');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly composerOpen = signal(false);
  readonly liveConflict = this.#store.liveSessionConflict;
  #suppressedHash = '';

  // ─── Social session (optimistic UI source of truth) ─────────────────────────
  /** Actor keys the viewer follows. */
  readonly following = signal<ReadonlySet<string>>(new Set());
  /** Post ids the viewer bookmarked (guardados). */
  readonly savedIds = signal<ReadonlySet<string>>(new Set());

  // ─── Feed ────────────────────────────────────────────────────────────────────
  readonly feedScope = signal<FeedScope>('foryou');
  readonly posts = signal<readonly Post[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly feedLoaded = signal(false);

  // ─── Composer (inline short post) ──────────────────────────────────────────────
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

  // ─── Long-form editor (`/write`) ─────────────────────────────────────────────────
  readonly articleTitle = signal('');
  readonly articleBody = signal('');
  readonly articleCover = signal('');
  readonly articleCoverAlt = signal('');
  readonly articleValid = computed(() => {
    const titleOk = this.articleTitle().trim().length >= 3;
    const bodyOk = this.articleBody().trim().length >= 20;
    const coverOk = !this.articleCover().trim() || this.articleCoverAlt().trim().length > 0;
    return titleOk && bodyOk && coverOk;
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
  readonly profileMediaPosts = computed(() =>
    this.profilePosts().filter((post) => post.media.length > 0),
  );
  readonly profileViewerFollows = computed(() => {
    const profile = this.profile();
    return profile ? this.following().has(profile.actorKey) : false;
  });

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

  // ─── Explore / search / hashtag (SH-1) ────────────────────────────────────────────
  readonly searchTerm = signal('');
  readonly searchTag = signal('');
  readonly searchResult = signal<SearchResult | null>(null);
  readonly searchTab = signal<SearchTab>('top');
  readonly searchCriteria = signal<DiscoveryCriteria>({ term: '', facets: {}, sort: 'top', page: 1 });
  readonly trending = signal<readonly TrendingTag[]>([]);
  readonly searching = signal(false);

  /** SH-1 facets: the tab (top/accounts/posts/hashtags) + trending hashtags. */
  readonly discoveryFacets = computed<readonly DiscoveryFacet[]>(() => [
    {
      key: 'tab',
      label: 'Mostrar',
      values: SEARCH_TABS.map((tab) => ({ value: tab.key, label: tab.label })),
    },
    {
      key: 'hashtag',
      label: 'Tendencias',
      values: this.trending().map((tag) => ({
        value: tag.tag,
        label: `#${tag.tag}`,
        count: tag.postCount,
      })),
    },
  ]);

  /** The posts SH-1 renders as its result grid — derived from the active tab. */
  readonly searchItems = computed<readonly Post[]>(() => {
    const result = this.searchResult();
    if (!result) {
      return [];
    }
    return this.searchTab() === 'accounts' || this.searchTab() === 'hashtags' ? [] : result.posts;
  });

  // ─── DMs (SH-7 message-center) ────────────────────────────────────────────────
  readonly threads = signal<readonly MessageThread[]>([]);
  readonly activeThread = signal<MessageThread | null>(null);
  readonly threadsLoaded = signal(false);
  readonly sendingMessage = signal(false);
  readonly inboxUnread = computed(() =>
    this.threads().reduce((sum, thread) => sum + thread.unread, 0),
  );

  // ─── Guardados / listas (SH-4) ──────────────────────────────────────────────────
  readonly savedPosts = signal<readonly Post[]>([]);
  readonly savedLoaded = signal(false);
  readonly savedSection = signal<'saved' | 'lists'>('saved');

  // ─── Creator studio (SH-5) ────────────────────────────────────────────────────
  readonly studio = signal<StudioPayload | null>(null);
  readonly studioLoaded = signal(false);
  readonly studioSection = signal<StudioSection>('overview');

  // ─── Monetization (SH-3 subscribe/tip over the engine) ─────────────────────────
  readonly subscribeTier = signal<CreatorTier | null>(null);
  readonly subscribeCreator = signal<Author | null>(null);
  readonly confirmedMembership = signal<string>('');

  // ─── Degradation flag (mock fallback surfaced to the shell) ─────────────────────
  readonly degraded = computed(() => {
    // Recompute whenever a fetch path could have flipped the flag.
    void this.feedLoaded();
    void this.view();
    void this.activePost();
    void this.profile();
    void this.searchResult();
    void this.notificationsLoaded();
    void this.threadsLoaded();
    void this.savedLoaded();
    void this.studioLoaded();
    return this.#api.degraded;
  });

  // ─── Shell configs (SH-1/4/5/7/3) ─────────────────────────────────────────────
  readonly searchConfig = computed(() => ({
    searchPlaceholder: 'Busca personas, publicaciones o #hashtags',
    searchButtonLabel: 'Buscar',
    filtersHeading: 'Explorar',
    clearLabel: 'Limpiar',
    sortLabel: 'Ordenar',
    layout: 'list' as const,
    emptyMessage: 'No encontramos resultados. Prueba otro término o #hashtag.',
    loadingMessage: 'Buscando…',
    resultsNoun: { one: 'publicación', many: 'publicaciones' },
    showSearch: true,
  }));

  readonly messageConfig: MessageCenterConfig = {
    heading: 'Mensajes',
    listLabel: 'Conversaciones',
    emptyMessage: 'No tienes conversaciones todavía.',
    loadingMessage: 'Cargando conversaciones…',
    detailPlaceholder: 'Selecciona una conversación para ver el hilo.',
    composerPlaceholder: 'Escribe un mensaje…',
    sendLabel: 'Enviar',
    sendingLabel: 'Enviando…',
  };

  readonly savedConfig = computed<AccountShellConfig>(() => ({
    heading: 'Guardados',
    navLabel: 'Secciones de guardados',
    inboxEmptyMessage: 'Aún no has guardado publicaciones.',
    inboxLoadingMessage: 'Cargando tus guardados…',
    detailPlaceholder: 'Selecciona una publicación guardada para verla.',
    sections: [
      { id: 'saved', label: 'Guardados', kind: 'inbox', badge: this.savedPosts().length || undefined },
      { id: 'lists', label: 'Listas' },
    ],
  }));

  readonly studioConfig = computed<ConsoleShellConfig>(() => {
    const studio = this.studio();
    return {
      heading: 'Creator Studio',
      navLabel: 'Secciones del estudio',
      kpisLabel: 'Indicadores del creador',
      filtersLabel: 'Filtros',
      actionsLabel: 'Acciones',
      emptyMessage: 'No hay datos en esta sección.',
      loadingMessage: 'Cargando analítica…',
      sections: [
        { id: 'overview', label: 'Resumen', kind: 'custom' },
        { id: 'content', label: 'Contenido', kind: 'table', badge: studio?.topPosts.length || undefined },
        { id: 'audience', label: 'Audiencia', kind: 'custom' },
        { id: 'monetization', label: 'Monetización', kind: 'custom', badge: studio?.tiers.length || undefined },
      ],
    };
  });

  readonly studioKpis = computed<readonly ConsoleKpi[]>(() => {
    const studio = this.studio();
    if (!studio) {
      return [];
    }
    return [
      {
        id: 'followers',
        label: 'Seguidores',
        value: this.formatCount(studio.followers),
        trend: studio.followersDelta >= 0 ? 'up' : 'down',
        delta: `${studio.followersDelta >= 0 ? '+' : ''}${this.formatCount(studio.followersDelta)}`,
      },
      {
        id: 'reach',
        label: 'Alcance (30 d)',
        value: this.formatCount(studio.reach),
        trend: studio.reachDelta >= 0 ? 'up' : 'down',
        delta: `${studio.reachDelta >= 0 ? '+' : ''}${this.formatCount(studio.reachDelta)}`,
      },
      {
        id: 'engagement',
        label: 'Engagement',
        value: `${studio.engagementRate.toFixed(1)}%`,
        hint: 'reacciones + comentarios / alcance',
      },
      {
        id: 'revenue',
        label: 'Ingresos del mes',
        value: this.formatMinor(studio.monthlyRevenueMinor, studio.currency),
        hint: `${this.subscriberTotal()} suscriptores`,
      },
    ];
  });

  readonly subscriberTotal = computed(() =>
    (this.studio()?.tiers ?? []).reduce((sum, tier) => sum + tier.subscribers, 0),
  );

  readonly studioColumns: readonly ConsoleColumn[] = [
    { key: 'excerpt', label: 'Publicación' },
    { key: 'impressions', label: 'Impresiones', align: 'end' },
    { key: 'engagements', label: 'Interacciones', align: 'end' },
    { key: 'reactions', label: 'Reacciones', align: 'end' },
    { key: 'comments', label: 'Comentarios', align: 'end' },
  ];

  readonly studioActions: readonly ConsoleRowAction[] = [{ id: 'open', label: 'Ver', kind: 'default' }];

  readonly studioRows = computed<readonly StudioPostStat[]>(() => this.studio()?.topPosts ?? []);

  readonly audienceMax = computed(() => {
    const points = this.studio()?.audience ?? [];
    return points.reduce((max, point) => Math.max(max, point.value), 1);
  });

  // ─── Subscribe checkout (SH-3 over engine — monetización) ──────────────────────
  readonly subscribeConfig: CheckoutWizardConfig = {
    steps: [
      { id: 'plan', label: 'Plan' },
      { id: 'pago', label: 'Pago' },
      { id: 'revisar', label: 'Confirmar' },
    ],
    stepsLabel: 'Pasos de la suscripción',
    summaryHeading: 'Tu membresía',
    submitLabel: 'Suscribirme',
    processingLabel: 'Procesando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
    totalLabel: 'Total mensual',
  };

  readonly subscribeValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    plan: this.subscribeTier() !== null,
    pago: true,
    revisar: this.subscribeTier() !== null,
  }));

  readonly subscribeInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    provider: 'blogs-subscription',
    creatorKey: this.subscribeCreator()?.actorKey ?? '',
    tierId: this.subscribeTier()?.id ?? '',
  }));

  constructor() {
    this.view.set(this.initialView());
    this.feedScope.set('foryou');

    // Bind the unified session (subscription cart) to this origin and rehydrate.
    this.#store.init({
      scope: `blogs.${this.instanceId}`,
      flow: BLOGS_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: 'COP',
    });
    this.#bus.scope(`blogs-${this.instanceId}`);

    const widget = this.#orchestrator.register('blogs-feed', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/post/<id>, #/<scope>/mensajes…).
    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });

    void this.loadFeed();
    void this.loadTrending();
    this.applyHash();
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Navigation (signals + hash deep-links) ──────────────────────────────────
  go(view: BlogsView): void {
    this.applyRoute(view, '');
    this.writeHash(view, '');
  }

  private applyRoute(view: BlogsView, param: string): void {
    this.view.set(view);
    this.errorMessage.set('');
    this.viewchanged.emit(view);
    switch (view) {
      case 'notifications':
        if (!this.notificationsLoaded()) {
          void this.loadNotifications();
        }
        return;
      case 'search':
        if (!this.searchResult()) {
          void this.runSearch();
        }
        return;
      case 'messages':
        if (!this.threadsLoaded()) {
          void this.loadThreads();
        }
        if (param) {
          void this.openThread(param);
        }
        return;
      case 'saved':
        if (!this.savedLoaded()) {
          void this.loadSaved();
        }
        return;
      case 'studio':
        if (!this.studioLoaded()) {
          void this.loadStudio();
        }
        return;
      case 'profile':
        if (param) {
          void this.loadProfile(param);
        }
        return;
      case 'post':
        if (param) {
          void this.loadPost(param);
        }
        return;
      default:
        return;
    }
  }

  private routeHash(view: BlogsView, param: string): string {
    const base = `#/${this.scope()}`;
    switch (view) {
      case 'feed':
        return base;
      case 'post':
        return `${base}/post/${encodeURIComponent(param)}`;
      case 'profile':
        return `${base}/@${encodeURIComponent(param)}`;
      case 'notifications':
        return `${base}/notificaciones`;
      case 'search':
        return `${base}/explorar`;
      case 'messages':
        return `${base}/mensajes${param ? `/${encodeURIComponent(param)}` : ''}`;
      case 'saved':
        return `${base}/guardados`;
      case 'write':
        return `${base}/escribir`;
      case 'studio':
        return `${base}/studio`;
      case 'subscribe':
        return `${base}/suscribir`;
      default:
        return base;
    }
  }

  private writeHash(view: BlogsView, param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = this.routeHash(view, param);
    if (window.location.hash !== hash) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (hash === this.#suppressedHash) {
      this.#suppressedHash = '';
      return;
    }
    const base = `#/${this.scope()}`;
    if (hash !== base && !hash.startsWith(`${base}/`)) {
      return;
    }
    const segments = hash
      .slice(base.length)
      .split('/')
      .filter((s) => s !== '');
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('feed', '');
        return;
      case 'post':
        this.applyRoute('post', decodeURIComponent(tail));
        return;
      case 'notificaciones':
        this.applyRoute('notifications', '');
        return;
      case 'explorar':
        this.applyRoute('search', '');
        return;
      case 'mensajes':
        this.applyRoute('messages', tail ? decodeURIComponent(tail) : '');
        return;
      case 'guardados':
        this.applyRoute('saved', '');
        return;
      case 'escribir':
        this.applyRoute('write', '');
        return;
      case 'studio':
        this.applyRoute('studio', '');
        return;
      case 'suscribir':
        this.applyRoute('subscribe', '');
        return;
      default:
        if (head.startsWith('@')) {
          this.applyRoute('profile', decodeURIComponent(head.slice(1)));
          return;
        }
        this.applyRoute('feed', '');
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
      const page = await this.#orchestrator.callApi(`feed:${this.feedScope()}`, () =>
        this.#api.feed(this.apiBase(), this.feedScope(), null),
      );
      this.posts.set(page.posts);
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
      this.posts.update((current) => [...current, ...page.posts]);
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

  // ─── Composer (inline short post) ───────────────────────────────────────────────
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
        this.go('feed');
        this.postpublished.emit({ id: post.id });
      })
      .catch((error: unknown) => {
        this.errorMessage.set('No pudimos publicar. Intenta de nuevo.');
        void error;
      })
      .finally(() => this.publishing.set(false));
  }

  // ─── Long-form editor (`/write`) ────────────────────────────────────────────────
  publishArticle(): void {
    if (!this.articleValid() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    const draft = {
      title: this.articleTitle().trim(),
      body: this.articleBody().trim(),
      coverUrl: this.articleCover().trim() || undefined,
      coverAlt: this.articleCoverAlt().trim() || undefined,
    };
    this.#api
      .publishArticle(this.apiBase(), draft, this.viewer)
      .then((post) => {
        this.posts.update((current) => [post, ...current]);
        this.articleTitle.set('');
        this.articleBody.set('');
        this.articleCover.set('');
        this.articleCoverAlt.set('');
        this.go('feed');
        this.articlepublished.emit({ id: post.id });
        this.postpublished.emit({ id: post.id });
      })
      .catch((error: unknown) => {
        this.errorMessage.set('No pudimos publicar el artículo. Intenta de nuevo.');
        void error;
      })
      .finally(() => this.publishing.set(false));
  }

  // ─── Reactions (optimistic, idempotent toggle) ──────────────────────────────────
  react(post: Post, type: ReactionType): void {
    const optimistic = toggleReaction(post.reactions, type);
    const active = optimistic.mine === type;
    this.patchPost(post.id, (current) => ({ ...current, reactions: optimistic }));
    this.postreacted.emit({ id: post.id, type, active });

    this.#api
      .react(this.apiBase(), post.id, type, optimistic)
      .then((reactions) => this.patchPost(post.id, (current) => ({ ...current, reactions })))
      .catch((error: unknown) => {
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

  // ─── Bookmark (guardados) ────────────────────────────────────────────────────────
  isSaved(id: string): boolean {
    return this.savedIds().has(id);
  }

  toggleSave(post: Post): void {
    const saved = !this.savedIds().has(post.id);
    this.savedIds.update((current) => {
      const next = new Set(current);
      if (saved) {
        next.add(post.id);
      } else {
        next.delete(post.id);
      }
      return next;
    });
    this.savedPosts.update((current) => {
      if (saved) {
        return current.some((entry) => entry.id === post.id) ? current : [post, ...current];
      }
      return current.filter((entry) => entry.id !== post.id);
    });
  }

  // ─── Follow (optimistic toggle + count recalc) ──────────────────────────────────
  toggleFollow(author: Author): void {
    const isFollowing = this.following().has(author.actorKey);
    const next = !isFollowing;
    this.setFollowing(author.actorKey, next);
    this.authorfollowed.emit({ actorKey: author.actorKey, following: next });

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
    this.activePost.set(post);
    this.comments.set([]);
    this.applyRoute('post', '');
    this.writeHash('post', post.id);
    void this.loadPost(post.id);
  }

  backToFeed(): void {
    this.go('feed');
    this.activePost.set(null);
  }

  private async loadPost(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const detail = await this.#orchestrator.callApi(`post:${id}`, () =>
        this.#api.post(this.apiBase(), id),
      );
      this.activePost.set(detail.post);
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
    this.patchPost(post.id, (current) => ({ ...current, commentCount: current.commentCount + 1 }));
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
    this.patchPost(post.id, (current) => ({ ...current, commentCount: current.commentCount + 1 }));
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
    this.profile.set(null);
    this.profilePosts.set([]);
    this.applyRoute('profile', '');
    this.writeHash('profile', handle);
    void this.loadProfile(handle);
  }

  setProfileTab(tab: 'posts' | 'replies' | 'media'): void {
    this.profileTab.set(tab);
  }

  private async loadProfile(handle: string): Promise<void> {
    this.loading.set(true);
    try {
      const payload = await this.#orchestrator.callApi(`profile:${handle}`, () =>
        this.#api.profile(this.apiBase(), handle),
      );
      this.profile.set(payload.author);
      this.profilePosts.set(payload.posts);
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

  /** Start a DM with the profiled author (creates/opens a thread). */
  messageAuthor(author: Author): void {
    const threadId = `t-${author.handle}`;
    const existing = this.threads().find((thread) => thread.participant.actorKey === author.actorKey);
    if (!existing) {
      this.threads.update((current) => [
        {
          id: threadId,
          participant: author,
          lastMessage: '',
          lastAtUtc: new Date().toISOString(),
          unread: 0,
          messages: [],
        },
        ...current,
      ]);
    }
    this.threadsLoaded.set(true);
    this.applyRoute('messages', '');
    this.writeHash('messages', existing?.id ?? threadId);
    void this.openThread(existing?.id ?? threadId);
  }

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
      this.applyRoute('post', '');
      this.writeHash('post', notification.postId);
      void this.loadPost(notification.postId);
      return;
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

  // ─── Explore / search / hashtag (SH-1) ─────────────────────────────────────────────
  onSearchCriteria(criteria: DiscoveryCriteria): void {
    this.searchCriteria.set(criteria);
    this.searchTerm.set(criteria.term);
    const tab = (criteria.facets['tab'] ?? [])[0];
    if (tab && (SEARCH_TABS as readonly { key: string }[]).some((entry) => entry.key === tab)) {
      this.searchTab.set(tab as SearchTab);
    }
    const tag = (criteria.facets['hashtag'] ?? [])[0] ?? '';
    this.searchTag.set(tag);
    void this.runSearch();
  }

  setSearchTab(tab: SearchTab): void {
    this.searchTab.set(tab);
  }

  searchHashtag(tag: string): void {
    this.searchTerm.set('');
    this.searchTag.set(tag);
    this.searchTab.set('posts');
    this.searchCriteria.set({ term: '', facets: { hashtag: [tag] }, sort: 'top', page: 1 });
    this.applyRoute('search', '');
    this.writeHash('search', '');
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    this.searching.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#api.explore(this.apiBase(), this.searchTerm(), this.searchTag());
      this.searchResult.set(result);
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

  // ─── DMs (SH-7 message-center) ──────────────────────────────────────────────────
  private async loadThreads(): Promise<void> {
    this.loading.set(true);
    try {
      const threads = await this.#orchestrator.callApi('messages', () =>
        this.#api.messages(this.apiBase(), this.user()),
      );
      this.threads.set(threads);
      this.threadsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus mensajes.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  onThreadSelect(thread: MessageThread): void {
    this.writeHash('messages', thread.id);
    void this.openThread(thread.id);
  }

  private async openThread(threadId: string): Promise<void> {
    // Optimistically clear unread on the selected row.
    this.threads.update((current) =>
      current.map((thread) => (thread.id === threadId ? { ...thread, unread: 0 } : thread)),
    );
    try {
      const thread = await this.#api.thread(this.apiBase(), threadId);
      this.activeThread.set(thread);
      this.threads.update((current) =>
        current.some((entry) => entry.id === thread.id)
          ? current.map((entry) => (entry.id === thread.id ? { ...thread, unread: 0 } : entry))
          : [{ ...thread, unread: 0 }, ...current],
      );
    } catch (error) {
      void error;
    }
  }

  onSendMessage(event: { thread: MessageThread; body: string }): void {
    const body = event.body.trim();
    if (!body || this.sendingMessage()) {
      return;
    }
    const threadId = event.thread.id;
    // Optimistic append.
    const local: DirectMessage = {
      id: `local-m-${Date.now().toString(36)}`,
      threadId,
      author: this.viewer,
      body,
      createdAtUtc: new Date().toISOString(),
      outgoing: true,
    };
    this.patchThread(threadId, (thread) => ({
      ...thread,
      messages: [...thread.messages, local],
      lastMessage: body,
      lastAtUtc: local.createdAtUtc,
    }));
    this.sendingMessage.set(true);
    this.#api
      .sendMessage(this.apiBase(), { threadId, body }, this.viewer)
      .then((message) => {
        // Reconcile the optimistic message id with the server's.
        this.patchThread(threadId, (thread) => ({
          ...thread,
          messages: thread.messages.map((entry) => (entry.id === local.id ? message : entry)),
        }));
        this.messagesent.emit({ threadId });
      })
      .catch((error: unknown) => void error)
      .finally(() => this.sendingMessage.set(false));
  }

  // ─── Guardados / listas (SH-4) ────────────────────────────────────────────────────
  private async loadSaved(): Promise<void> {
    this.loading.set(true);
    try {
      const posts = await this.#api.saved(this.apiBase(), this.user());
      this.savedPosts.set(posts);
      this.savedIds.set(new Set(posts.map((post) => post.id)));
      this.savedLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus guardados.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  onSavedSectionChange(sectionId: string): void {
    if (sectionId === 'saved' || sectionId === 'lists') {
      this.savedSection.set(sectionId);
    }
  }

  // ─── Creator studio (SH-5) ────────────────────────────────────────────────────────
  private async loadStudio(): Promise<void> {
    this.loading.set(true);
    try {
      const studio = await this.#orchestrator.callApi('studio', () =>
        this.#api.studio(this.apiBase(), this.user()),
      );
      this.studio.set(studio);
      this.studioLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el estudio.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  onStudioSectionChange(sectionId: string): void {
    if ((STUDIO_SECTIONS as readonly string[]).includes(sectionId)) {
      this.studioSection.set(sectionId as StudioSection);
    }
  }

  onStudioAction(event: ConsoleRowActionEvent<StudioPostStat>): void {
    if (event.actionId === 'open') {
      const post = this.posts().find((entry) => entry.id === event.row.postId);
      if (post) {
        this.openPost(post);
        return;
      }
      this.applyRoute('post', '');
      this.writeHash('post', event.row.postId);
      void this.loadPost(event.row.postId);
    }
  }

  audiencePct(value: number): number {
    return Math.round((value / this.audienceMax()) * 100);
  }

  // ─── Monetization (SH-3 subscribe/tip over engine) ─────────────────────────────────
  /** Open the subscribe wizard for a creator's tier (called from studio or profile). */
  startSubscribe(creator: Author, tier: CreatorTier): void {
    this.subscribeCreator.set(creator);
    this.subscribeTier.set(tier);
    this.confirmedMembership.set('');
    this.#store.reset();
    void this.selectTierIntoCart(creator, tier);
    this.applyRoute('subscribe', '');
    this.writeHash('subscribe', '');
  }

  private async selectTierIntoCart(creator: Author, tier: CreatorTier): Promise<void> {
    const session = this.#store.getValidSession();
    const selection = await this.#fulfillment.select(
      {
        productRef: `${creator.actorKey}:${tier.id}`,
        kind: 'subscription',
        label: `${tier.name} · @${creator.handle}`,
        amount: tier.priceMinor,
        selection: {
          creatorKey: creator.actorKey,
          creatorName: creator.displayName,
          tierId: tier.id,
          tierName: tier.name,
          kind: 'subscription',
        },
      },
      session,
    );
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.#store.setPricing({
      currency: tier.currency,
      totalAmount: tier.priceMinor,
      balanceDue: tier.priceMinor,
      breakdown: [{ code: 'base', label: `Membresía ${tier.name}`, amount: tier.priceMinor }],
    });
  }

  selectTier(tier: CreatorTier): void {
    const creator = this.subscribeCreator();
    if (creator) {
      this.subscribeTier.set(tier);
      void this.selectTierIntoCart(creator, tier);
    }
  }

  onSubscribeCompleted(result: CheckoutWizardResult): void {
    const creator = this.subscribeCreator();
    const tier = this.subscribeTier();
    this.confirmedMembership.set(result.reference);
    this.#store.reset();
    if (creator && tier) {
      const payload = { creatorKey: creator.actorKey, tierId: tier.id };
      this.subscribed.emit(payload);
      this.#bus.publish('subscribed', payload);
    }
  }

  onSubscribeFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos procesar la suscripción. Intenta de nuevo.');
  }

  onSubscribeExit(): void {
    this.go('studio');
  }

  // ─── Relative-time / formatting ─────────────────────────────────────────────────────
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
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')} k`;
    }
    return String(value);
  }

  formatMinor(minorUnits: number, currency: string): string {
    const amount = minorUnits / 100;
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: currency || 'COP',
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
    }
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
  trackMessage = (_: number, message: DirectMessage): string => message.id;
  trackTier = (_: number, tier: CreatorTier): string => tier.id;

  // ─── Helpers ────────────────────────────────────────────────────────────────────────
  /** Apply the same patch to a post wherever it currently lives in state. */
  private patchPost(id: string, patch: (post: Post) => Post): void {
    const map = (post: Post): Post => (post.id === id ? patch(post) : post);
    this.posts.update((current) => current.map(map));
    this.profilePosts.update((current) => current.map(map));
    this.savedPosts.update((current) => current.map(map));
    const active = this.activePost();
    if (active?.id === id) {
      this.activePost.set(patch(active));
    }
    const result = this.searchResult();
    if (result) {
      this.searchResult.set({ ...result, posts: result.posts.map(map) });
    }
  }

  /** Apply the same patch to a thread in the inbox and to the active thread. */
  private patchThread(id: string, patch: (thread: MessageThread) => MessageThread): void {
    this.threads.update((current) =>
      current.map((thread) => (thread.id === id ? patch(thread) : thread)),
    );
    const active = this.activeThread();
    if (active?.id === id) {
      this.activeThread.set(patch(active));
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
