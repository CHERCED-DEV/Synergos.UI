import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FULFILLMENT_STRATEGIES,
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import { BlogsApiClient, isBlogsForbidden, isBlogsUnauthorized } from './blogs-api.client';
import { BlogsElementComponent } from './blogs';
import { BlogsFulfillmentStrategy } from './blogs-fulfillment.strategy';
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

/**
 * Payloads "de verdad" del member de la sesión — lo que el backend devuelve con 200 y
 * que un 401 posterior tiene que BORRAR. Deliberadamente distintos de la semilla del
 * mock (`t-valeria`, `buildMockSaved()`…): si un test los confunde, el aserto lo canta.
 */
const MY_THREAD = {
  id: 't-mio',
  participant: AUTHOR,
  lastMessage: 'Esta conversación sí es mía',
  lastAtUtc: '2026-07-18T10:00:00Z',
  unread: 0,
  messages: [
    {
      id: 'm-1',
      threadId: 't-mio',
      author: AUTHOR,
      body: 'Hola',
      createdAtUtc: '2026-07-18T10:00:00Z',
      outgoing: false,
    },
  ],
};

const MY_SAVED_POST = {
  id: 'p-mio',
  author: AUTHOR,
  body: 'Un post que guardé yo',
  createdAtUtc: '2026-07-18T10:00:00Z',
  reactions: { counts: [], mine: null, total: 0 },
  commentCount: 0,
};

const MY_NOTIFICATION = {
  id: 'n-mia',
  verb: 'follow',
  actor: AUTHOR,
  summary: 'te empezó a seguir',
  createdAtUtc: '2026-07-18T10:00:00Z',
  read: false,
};

const MY_STUDIO = {
  followers: 1234,
  followersDelta: 12,
  reach: 56789,
  reachDelta: 300,
  engagementRate: 4.2,
  monthlyRevenueMinor: 250000,
  currency: 'COP',
  audience: [{ label: 'Ene', value: 10 }],
  topPosts: [
    { postId: 'p-mio', excerpt: 'Un post mío', impressions: 10, engagements: 2, reactions: 2, comments: 0 },
  ],
  tiers: [{ id: 'tier-mio', name: 'Fan', priceMinor: 1000, currency: 'COP', perks: [], subscribers: 3 }],
};

describe('BlogsElementComponent', () => {
  let fixture: ComponentFixture<BlogsElementComponent>;
  let component: BlogsElementComponent;

  // `hash` alimenta el router de hash (deep-links `#/blogs/mensajes/<id>`); vacío = feed.
  async function createComponent(hash = ''): Promise<void> {
    if (typeof window !== 'undefined') {
      window.location.hash = hash;
    }
    await TestBed.configureTestingModule({
      imports: [BlogsElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        BlogsApiClient,
        // Engine services the v2 shell injects (monetization edge + orchestration).
        SessionStore,
        OrchestratorService,
        TransactionEventBusService,
        FulfillmentContext,
        { provide: FULFILLMENT_STRATEGIES, useClass: BlogsFulfillmentStrategy, multi: true },
      ],
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
    // El hash es estado GLOBAL del jsdom: sin limpiarlo, un deep-link de un test
    // arrastra al siguiente a otra vista y el fallo aparece donde no está la causa.
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    // Ídem la región de `LiveAnnouncerService`: cuelga de <body> y sobrevive al reset del
    // TestBed, así que `lastLiveRegion()` leería la del test anterior.
    document.querySelectorAll('[data-syn-live-announcer]').forEach((node) => node.remove());
  });

  /** La región aria-live COMPARTIDA (`@synergos/shared`), o null si nadie la creó. */
  function lastLiveRegion(): HTMLElement | null {
    const regions = document.querySelectorAll<HTMLElement>('[data-syn-live-announcer]');
    return regions.length ? regions[regions.length - 1] : null;
  }

  /** El servicio escribe el mensaje 100 ms después de limpiar; hay que dejarlo llegar. */
  async function settleAnnouncer(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

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

  // ── v2 DMs (SH-7): loading the inbox + optimistic send appends to the thread ──
  it('loads the DM inbox and appends a sent message optimistically', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.go('messages');
    await flushMicrotasks();
    expect(component.view()).toBe('messages');
    expect(component.threads().length).toBeGreaterThan(0);

    const thread = component.threads()[0];
    component.onThreadSelect(thread);
    await flushMicrotasks();
    const active = component.activeThread()!;
    expect(active.id).toBe(thread.id);
    const before = active.messages.length;

    component.onSendMessage({ thread: active, body: '¡Hola desde el test!' });
    await flushMicrotasks();
    const after = component.activeThread()!;
    expect(after.messages.length).toBe(before + 1);
    expect(after.messages[after.messages.length - 1].body).toBe('¡Hola desde el test!');
  });

  // ── v2 explore (SH-1): hashtag facet drives the discovery criteria + results ──
  it('runs an explore query via the SH-1 criteria and returns matching posts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.onSearchCriteria({ term: '', facets: { hashtag: ['design'] }, sort: 'top', page: 1 });
    await flushMicrotasks();
    expect(component.searchTag()).toBe('design');
    expect(component.searchResult()).not.toBeNull();
    expect(component.searchResult()!.posts.length).toBeGreaterThan(0);
  });

  // ── v2 guardados: bookmarking a post adds it to the saved collection ─────────
  it('bookmarks a post into guardados and toggles it off idempotently', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const post = component.posts()[0];
    expect(component.isSaved(post.id)).toBe(false);

    component.toggleSave(post);
    expect(component.isSaved(post.id)).toBe(true);
    expect(component.savedPosts().some((p) => p.id === post.id)).toBe(true);

    component.toggleSave(post);
    expect(component.isSaved(post.id)).toBe(false);
    expect(component.savedPosts().some((p) => p.id === post.id)).toBe(false);
  });

  // ── v2 long-form: publishing an article inserts a postPage at the top ────────
  it('publishes a long-form article and inserts it at the top of the feed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.posts().length;
    component.articleTitle.set('Por qué el motor compartido escala');
    component.articleBody.set('Un cuerpo suficientemente largo para pasar la validación del editor.');
    expect(component.articleValid()).toBe(true);

    component.publishArticle();
    await flushMicrotasks();

    expect(component.posts().length).toBe(before + 1);
    expect(component.posts()[0].objectKind).toBe('postPage');
  });

  // ── v2 studio (SH-5): loading the creator dashboard aggregate + KPIs ─────────
  it('loads the creator studio aggregate and derives KPI cards', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.go('studio');
    await flushMicrotasks();
    expect(component.view()).toBe('studio');
    expect(component.studio()).not.toBeNull();
    expect(component.studioKpis().length).toBeGreaterThan(0);
    expect(component.studioRows().length).toBeGreaterThan(0);
  });

  // ── v2 monetization (SH-3): subscribe wizard runs pay→confirm over the engine ─
  it('completes a subscription checkout over the engine and confirms membership', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    // Seed a tier from the studio, then open the subscribe wizard.
    component.go('studio');
    await flushMicrotasks();
    const tier = component.studio()!.tiers[0];

    component.startSubscribe(component.viewer, tier);
    await flushMicrotasks();
    expect(component.view()).toBe('subscribe');
    expect(component.subscribeTier()!.id).toBe(tier.id);

    component.onSubscribeCompleted({ reference: 'SUB-TEST', vouchers: [] });
    expect(component.confirmedMembership()).toBe('SUB-TEST');
  });

  // ═══ Ola de seguridad: lo del usuario NO se degrada a datos sembrados ═════════
  //
  // El bug que cierran estos tests: cada `catch` del cliente caía a mock, así que un 401
  // del backend pintaba la bandeja de DMs / las notificaciones / los guardados / el
  // estudio SEMBRADOS como si fueran del visitante. En pantalla se veía perfecto —
  // por eso ni el compilador ni un smoke lo atrapaban.

  /** Boot con 401 en UNA ruta del usuario; el resto cae a mock (error de red). */
  async function bootWith401On(path: string, hash = ''): Promise<ReturnType<typeof vi.fn>> {
    const fetchMock = vi.fn((url: string) =>
      String(url).includes(path)
        ? Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }),
          } as Response)
        : Promise.reject(new Error('offline')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent(hash);
    return fetchMock;
  }

  /** La ruta se pidió DE VERDAD: sin esto, un 401 que nunca ocurre "pasa" el test. */
  function expectRequested(fetchMock: ReturnType<typeof vi.fn>, path: string): void {
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes(path))).toBe(true);
  }

  it('un 401 en la bandeja pide iniciar sesión y NO pinta los DMs sembrados', async () => {
    const fetchMock = await bootWith401On('/messages');

    component.go('messages');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/messages');
    expect(component.sessionAccess()).toBe('anon');
    // EL CORAZÓN DE LA OLA: cero conversaciones sembradas a la vista.
    expect(component.threads()).toEqual([]);
    expect(component.activeThread()).toBeNull();
    // Y se dice con palabras, no con un banner de "datos de ejemplo".
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tus mensajes');
    expect(component.loginUrl()).toContain('/account/login?returnUrl=');
  });

  it('un 401 en notificaciones no pinta la actividad sembrada', async () => {
    const fetchMock = await bootWith401On('/notifications');

    component.go('notifications');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/notifications');
    expect(component.sessionAccess()).toBe('anon');
    expect(component.notifications()).toEqual([]);
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tus notificaciones');
  });

  it('un 401 en guardados no pinta la colección sembrada', async () => {
    const fetchMock = await bootWith401On('/saved');

    component.go('saved');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/saved');
    expect(component.sessionAccess()).toBe('anon');
    expect(component.savedPosts()).toEqual([]);
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tus guardados');
  });

  it('un 401 en el estudio no pinta alcance ni ingresos sembrados', async () => {
    const fetchMock = await bootWith401On('/studio');

    component.go('studio');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/studio');
    expect(component.sessionAccess()).toBe('anon');
    // Métricas de otro leídas como propias: la mentira más cara de las cuatro.
    expect(component.studio()).toBeNull();
    expect(component.studioKpis()).toEqual([]);
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tu estudio');
  });

  // ── WCAG 2.4.3: el panel de acceso RECIBE el foco ─────────────────────────────
  // El bug que cierran: el markup ya traía `tabindex="-1"` + `#signinPanel` en los cuatro
  // paneles, pero ningún .ts consumía la ref, así que el foco no se movía y el usuario de
  // teclado tenía que tabular desde el principio para llegar al "Iniciar sesión".
  it('un 401 mueve el foco al CONTENEDOR del panel, no al botón de login', async () => {
    const fetchMock = await bootWith401On('/messages');

    component.go('messages');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    expectRequested(fetchMock, '/messages'); // control: el 401 ocurrió de verdad
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin');
    expect(panel).not.toBeNull();
    // El CONTENEDOR: el lector lee el título y el porqué ANTES que las acciones.
    expect(document.activeElement).toBe(panel);
    const loginLink = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin a');
    expect(loginLink).not.toBeNull(); // control: sí había un botón al que enfocar por error
    expect(document.activeElement).not.toBe(loginLink);
  });

  // El foco se mueve SOLO cuando la negativa viene de una acción del usuario: si colgara de
  // un effect que corre en cada cambio, se lo arrancaría al usuario mientras tabula.
  it('un re-render posterior NO le roba el foco al usuario dentro del panel', async () => {
    await bootWith401On('/notifications');

    component.go('notifications');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    const loginLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.blogs__signin a',
    );
    loginLink?.focus();
    expect(document.activeElement).toBe(loginLink); // control: el foco se movió de verdad

    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(document.activeElement).toBe(loginLink);
  });

  // El caso que de verdad distingue "enfocar en la negativa" de "enfocar en cada render":
  // `handleUnauthenticated` marca las CUATRO superficies como cargadas, así que navegar
  // entre ellas NO dispara fetch ni negativa nueva — solo destruye un panel y pinta otro.
  // Si el `.focus()` colgara de la mera aparición del panel, cada clic del usuario en el nav
  // le arrancaría el foco. Solo la negativa (una acción suya) puede moverlo.
  it('navegar entre superficies ya denegadas NO vuelve a robar el foco', async () => {
    const fetchMock = await bootWith401On('/messages');

    component.go('messages');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    const firstPanel = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin');
    expect(document.activeElement).toBe(firstPanel); // control: la 1.ª negativa sí enfocó
    const callsAfterDenial = fetchMock.mock.calls.length;

    // El usuario navega él mismo a otra superficie del panel.
    component.go('notifications');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    // control: fue navegación pura — ni un fetch más, luego ninguna negativa nueva.
    expect(fetchMock.mock.calls.length).toBe(callsAfterDenial);
    const secondPanel = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin');
    expect(secondPanel).not.toBeNull();
    expect(secondPanel).not.toBe(firstPanel); // control: el panel se re-creó de verdad
    // Y aun así el foco NO saltó al panel nuevo.
    expect(document.activeElement).not.toBe(secondPanel);
  });

  // ── GOV-BL-A11Y-05: el MISMO mensaje se vuelve a anunciar ─────────────────────
  // `announce()` era `this.announcement.set(message)`. Las señales comparan con `Object.is`,
  // así que repetir el mismo string no notificaba → el DOM no cambiaba → el lector callaba.
  // Escenario real: le niegan una sección, navega, y le niegan OTRA con el mismo aviso.
  it('re-anuncia el MISMO mensaje cuando llega una segunda negativa idéntica', async () => {
    // 401 en las DOS rutas de mensajes: navegar entre ellas repite el mismo aviso.
    const fetchMock = vi.fn((url: string) =>
      String(url).includes('/messages') || String(url).includes('/saved')
        ? Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }),
          } as Response)
        : Promise.reject(new Error('offline')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    component.go('messages');
    await flushMicrotasks();
    fixture.detectChanges();
    await settleAnnouncer();

    const region = lastLiveRegion();
    expect(region).not.toBeNull(); // control: se usa la región compartida, no un signal
    expect(region?.textContent).toContain('Inicia sesión para ver tus mensajes');

    // Se marca el nodo: si el segundo aviso NO se escribe, la marca sobrevive — que es
    // exactamente lo que pasaba con la señal.
    region!.textContent = '((no se re-anunció))';

    // `handleUnauthenticated` ya marcó las cuatro como cargadas, así que la segunda negativa
    // se fuerza volviendo a pedir la bandeja: mismo 401, MISMO texto.
    component.sessionAccess.set('ok');
    component.threadsLoaded.set(false);
    component.go('messages');
    await flushMicrotasks();
    expect(component.sessionAccess()).toBe('anon'); // control: el 401 volvió a ocurrir

    await settleAnnouncer();
    expect(lastLiveRegion()?.textContent).toContain('Inicia sesión para ver tus mensajes');
  });

  // ── La sesión expira a media navegación: se vacían las CUATRO, no solo la vista ──
  // Si `handleUnauthenticated` dejara de limpiar una sola de ellas, los badges del nav
  // seguirían contando mensajes que ya no podemos leer mientras el cuerpo pide login.
  //
  // El 401 llega por `POST /message` —una ACCIÓN del usuario, que siempre va a la red—
  // y no por una de las cuatro cargas: así las cuatro alcanzan a poblarse con 200 antes
  // de que caduque la sesión. Con el 401 en la propia carga, la superficie afectada
  // nunca llegaba a tener datos y su aserto pasaba en vacío sin proteger nada.
  it('un 401 con las CUATRO superficies cargadas las vacía todas (la sesión expiró)', async () => {
    let sessionValid = true;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      // `POST /message` (singular) — no confundir con `GET /messages` (bandeja).
      if (u.endsWith('/message') && init?.method === 'POST') {
        return sessionValid
          ? Promise.resolve({
              ok: true, status: 200,
              json: () => Promise.resolve({
                message: {
                  id: 'm-server', threadId: 't-mio', author: AUTHOR, body: 'ok',
                  createdAtUtc: '2026-07-18T11:00:00Z', outgoing: true,
                },
              }),
            } as Response)
          : Promise.resolve({
              ok: false, status: 401, json: () => Promise.resolve({ error: 'Sesión expirada.' }),
            } as Response);
      }
      if (u.includes('/messages')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ threads: [MY_THREAD] }),
        } as Response);
      }
      if (u.includes('/saved')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ posts: [MY_SAVED_POST] }),
        } as Response);
      }
      if (u.includes('/notifications')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ notifications: [MY_NOTIFICATION] }),
        } as Response);
      }
      if (u.includes('/studio')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve(MY_STUDIO),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    component.go('messages');
    await flushMicrotasks();
    component.go('saved');
    await flushMicrotasks();
    component.go('notifications');
    await flushMicrotasks();
    component.go('studio');
    await flushMicrotasks();

    // Control: las CUATRO están POBLADAS con lo suyo — hay algo real que borrar.
    expect(component.sessionAccess()).toBe('ok');
    expect(component.threads().map((t) => t.id)).toEqual(['t-mio']);
    expect(component.savedPosts().map((p) => p.id)).toEqual(['p-mio']);
    expect(component.notifications().map((n) => n.id)).toEqual(['n-mia']);
    expect(component.studio()?.followers).toBe(1234);

    // La sesión expira y el usuario manda un DM: el servidor responde 401.
    sessionValid = false;
    component.onSendMessage({ thread: component.threads()[0], body: '¿Hola?' });
    await flushMicrotasks();

    expect(component.sessionAccess()).toBe('anon');
    // NADA personal sobrevive: ni en pantalla ni en los contadores del nav.
    expect(component.threads()).toEqual([]);
    expect(component.activeThread()).toBeNull();
    expect(component.notifications()).toEqual([]);
    expect(component.savedPosts()).toEqual([]);
    expect(component.isSaved('p-mio')).toBe(false);
    expect(component.studio()).toBeNull();
  });

  // ── 403 de hilo AJENO: se cierra el hilo, la bandeja propia queda INTACTA ──────
  // Un 403 no es un hueco de identidad: hay sesión y lo suyo sigue siendo suyo. Vaciarle
  // la bandeja por tocar una conversación ajena castigaría al dueño legítimo.
  it('un 403 al abrir un hilo ajeno lo cierra sin tocar la bandeja propia', async () => {
    const fetchMock = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('/thread/')) {
        return Promise.resolve({
          ok: false, status: 403, json: () => Promise.resolve({ error: 'Esa conversación no es tuya.' }),
        } as Response);
      }
      if (u.includes('/messages')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ threads: [MY_THREAD] }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    // El id deep-linkeado EXISTE en la semilla a propósito: es la forma real del IDOR
    // (se adivina/conoce un hilo ajeno de verdad) y, de paso, hace el test sensible —
    // con un id inventado, el `buildMockThread → null → throw` taparía una regresión
    // del re-lanzado y el test pasaría en verde sin proteger nada.
    await createComponent('#/blogs/mensajes/t-valeria');
    fixture.detectChanges();

    expect(component.view()).toBe('messages');
    expectRequested(fetchMock, '/thread/');
    expect(component.threadAccess()).toBe('forbidden');
    // Ninguna conversación abierta bajo el id ajeno (antes se servía OTRA del mock).
    expect(component.activeThread()).toBeNull();
    // No se le pide iniciar sesión: YA la tiene. Y su bandeja sigue en pie.
    expect(component.sessionAccess()).toBe('ok');
    expect(component.threads().map((t) => t.id)).toEqual(['t-mio']);
    const notice = (fixture.nativeElement as HTMLElement).querySelector('.blogs__notice--error');
    expect(notice?.textContent).toContain('no es tuya');
  });

  it('entrar a la bandeja sin hilo limpia el veredicto del 403 anterior', async () => {
    const fetchMock = vi.fn((url: string) =>
      String(url).includes('/thread/')
        ? Promise.resolve({
            ok: false, status: 403, json: () => Promise.resolve({ error: 'x' }),
          } as Response)
        : Promise.reject(new Error('offline')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent('#/blogs/mensajes/t-valeria'); // sembrado: ver nota arriba

    expect(component.threadAccess()).toBe('forbidden'); // control

    component.go('messages');
    await flushMicrotasks();
    expect(component.threadAccess()).toBe('ok');
  });

  // ── Regresión en la dirección CONTRARIA: lo público debe SEGUIR degradando ─────
  // Blindar el 401 no puede convertir una caída de red en un "inicia sesión": el feed y
  // el detalle de un post son contenido público y ahí el mock no le miente a nadie.
  it('las rutas públicas (feed, post) siguen degradando a mock ante un error de red', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.posts().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
    // Una caída de red NO es un hueco de sesión.
    expect(component.sessionAccess()).toBe('ok');

    component.openPost(component.posts()[0]);
    await flushMicrotasks();

    expect(component.view()).toBe('post');
    expect(component.comments().length).toBeGreaterThan(0);
    expect(component.sessionAccess()).toBe('ok');
  });

  // ── Deep-link a un hilo que no existe: 404/500 NO puede abrir otra conversación ──
  // `buildMockThread` devolvía `?? [primer hilo]`: un id desconocido abría mensajes que
  // el usuario nunca tuvo, rotulados con el id pedido e indistinguibles de los suyos.
  it('un 500 al abrir un hilo por deep-link no abre otra conversación', async () => {
    const fetchMock = vi.fn((url: string) =>
      String(url).includes('/thread/')
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)
        : Promise.reject(new Error('offline')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent('#/blogs/mensajes/t-que-no-existe');

    // Control: la bandeja SÍ se sembró — hay hilos que el `?? [0]` podría haber servido.
    expect(component.threads().length).toBeGreaterThan(0);
    // Lo que cierra el bug: nada abierto bajo el id pedido.
    expect(component.activeThread()).toBeNull();
    expect(component.threadAccess()).toBe('ok'); // no es un 403: es un fallo del backend
    expect(component.sessionAccess()).toBe('ok'); // ni un 401
  });

  it('offline, un hilo SÍ sembrado sigue abriéndose (la demo no se rompió)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent('#/blogs/mensajes/t-valeria');

    expect(component.activeThread()?.id).toBe('t-valeria');
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

  // ── auxiliary degradation: an unwired trending sidebar must NOT trip the shell banner ──
  it('falls back to mock trending WITHOUT flagging degraded (auxiliary case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const tags = await client.trending('/api/blogs');
    expect(tags.length).toBeGreaterThan(0);
    // Trending is auxiliary: its absence must not brand the shell as offline.
    expect(client.degraded).toBe(false);
  });

  // ── Ola de seguridad: las 6 rutas del usuario re-lanzan el 401/403 ─────────────

  it('re-lanza el 401 en las CUATRO rutas del usuario en vez de devolver la semilla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }),
        } as Response),
      ),
    );
    const client = createClient();

    const routes: readonly [string, Promise<unknown>][] = [
      ['messages', client.messages('/api/blogs')],
      ['notifications', client.notifications('/api/blogs')],
      ['saved', client.saved('/api/blogs')],
      ['studio', client.studio('/api/blogs')],
    ];
    for (const [name, promise] of routes) {
      const error = await promise.then(() => null, (e: unknown) => e);
      // Se discrimina por `name`, no por `instanceof`: esa es la garantía que sobrevive
      // a que la clase se duplique en otro bundle.
      expect(isBlogsUnauthorized(error), name).toBe(true);
    }
    // Un 401 NO es una caída del backend: el banner de "datos de ejemplo" sigue apagado.
    expect(client.degraded).toBe(false);
  });

  it('re-lanza el 401 al enviar un DM (no sintetiza una burbuja "enviada")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response),
      ),
    );
    const client = createClient();

    const error = await client
      .sendMessage('/api/blogs', { threadId: 't-valeria', body: 'hola' }, AUTHOR)
      .then(() => null, (e: unknown) => e);
    expect(isBlogsUnauthorized(error)).toBe(true);
  });

  // El id pedido está SEMBRADO a propósito: si el `rethrowIfAuthError` desapareciera, el
  // mock resolvería con esa conversación y el 403 se convertiría en "aquí tienes un hilo".
  it('un 403 en thread(id) re-lanza en vez de abrir la conversación sembrada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ error: 'Esa conversación no es tuya.' }),
        } as Response),
      ),
    );
    const client = createClient();

    const error = await client.thread('/api/blogs', 't-valeria').then(() => null, (e: unknown) => e);
    expect(isBlogsForbidden(error)).toBe(true);
    expect(client.degraded).toBe(false);
  });

  it('un 500 en thread(id) sin hilo sembrado propaga en vez de servir otro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)),
    );
    const client = createClient();

    await expect(client.thread('/api/blogs', 'no-existe-en-ningun-lado')).rejects.toThrow();
  });

  it('offline, un hilo SÍ sembrado sigue resolviendo (control opuesto)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const seeded = await client.thread('/api/blogs', 't-valeria');
    expect(seeded.id).toBe('t-valeria');
  });

  // Lo público es deliberadamente asimétrico: ahí el mock no le miente a nadie, así que
  // ni siquiera un 401 re-lanza. Blindar de más rompería el feed anónimo.
  it('el feed (ruta pública) sigue degradando a mock incluso ante un 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response),
      ),
    );
    const client = createClient();

    const page = await client.feed('/api/blogs', 'foryou', null);
    expect(page.posts.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });
});
