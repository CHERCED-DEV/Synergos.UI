import { provideZonelessChangeDetection, type Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LiveAnnouncerService } from '@synergos/shared';
import {
  FULFILLMENT_STRATEGIES,
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  BordeDeBlogs,
  ContenidoApi,
  EstudioApi,
  ExplorarApi,
  GuardadosApi,
  MensajesApi,
  NotificacionesApi,
  ReaccionesApi,
  SeguidoresApi,
  isBlogsForbidden,
  isBlogsUnauthorized,
} from '@synergos/dominio/blogs';
import { BlogsElementComponent } from './blogs';
import { BlogsEscribirComponent } from './vistas/escribir/escribir';
import { BlogsEstudioComponent } from './vistas/estudio/estudio';
import { BlogsFulfillmentStrategy } from './blogs-fulfillment.strategy';
import type { Author, Post } from '@synergos/dominio/blogs';
import { asentar } from '../../../../../../tools/asentar';
import { BLOGS_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: BLOGS_SYNHOST.ejemplo.apiBase };

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 8): Promise<void> {
  await asentar(times);
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

/** Post mínimo para forzar la vista de detalle sin depender de la semilla del mock. */
const POST_FOR_SKELETON: Post = {
  id: 'p-skeleton',
  author: AUTHOR,
  objectKind: 'post',
  body: 'Cuerpo del post',
  media: [],
  hashtags: [],
  mentions: [],
  createdAtUtc: '2026-07-20T10:00:00Z',
  reactions: { counts: [], mine: null, total: 0 },
  commentCount: 3,
  repostCount: 0,
  reposted: false,
};

/**
 * Busca la región viva que ANUNCIA algo concreto. Se filtra por texto a propósito:
 * la app tiene varias `role="status"` (avisos de sesión, de datos de ejemplo…), y un
 * `querySelector('[role=status]')` a secas pasaría con cualquiera de ellas — el test
 * seguiría verde con el anuncio de carga borrado.
 */
function findLiveStatus(host: HTMLElement, text: RegExp): Element | undefined {
  return Array.from(host.querySelectorAll('[role="status"]')).find((el) =>
    text.test(el.textContent ?? ''),
  );
}

/** Un post con la forma mínima que `normalizePost` acepta: id + autor válido. */
function postDeServidor(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'srv-1',
    author: { id: 'a-1', handle: 'camila', displayName: 'Camila Restrepo' },
    body: 'cuerpo',
    createdAtUtc: '2026-09-12T10:00:00Z',
    ...over,
  };
}

type FetchDoble = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Un borde de Blogs que contesta reaccionar, seguir y mandar un DM con la forma del de
 * verdad, con ESTADO, y se apaga por MÉTODO y ruta (UI#92; reglas 16 y 19).
 *
 * Las formas son las de `BlogsController` del CMS: `ReactResponse` (un `ReactionsDto` con
 * `counts` y `mine`), `FollowResponse` (el borde ALTERNA: «si ya sigue, deja de seguir») y
 * `ThreadResponse` con el `DmMessageDto` recién guardado.
 *
 * **Los números no los puede producir el optimista** (regla 7): el servidor parte de 41
 * «me gusta» y 7 «me encanta» —el post de ejemplo trae otros—, el DM vuelve con el id
 * `dm_77`, y seguir parte de lo que diga `siguiendoAlEmpezar`.
 *
 * Las LECTURAS que no se declaran caen como hasta ahora (feed de ejemplo con su cartel).
 */
function bordeDeBlogs(opciones: { readonly caidas?: readonly string[]; readonly siguiendoAlEmpezar?: boolean } = {}): {
  readonly fetchDoble: ReturnType<typeof vi.fn<FetchDoble>>;
  readonly encender: (clave: string) => void;
} {
  const caidas = new Set(opciones.caidas ?? []);
  let mia: string | null = null;
  let siguiendo = opciones.siguiendoAlEmpezar ?? false;
  const responder = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

  const fetchDoble = vi.fn<FetchDoble>((url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = new URL(String(url), 'http://borde.test')
      .pathname.replace(/^\/api\/blogs/, '')
      .replace(/^\/post\/[^/]+\/react$/, '/post/{id}/react')
      .replace(/^\/follow\/[^/]+$/, '/follow/{id}');
    const clave = `${metodo} ${ruta}`;
    if (caidas.has(clave)) {
      return Promise.reject(new Error('offline'));
    }
    const cuerpo = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    switch (clave) {
      case 'POST /post/{id}/react': {
        const tipo = String(cuerpo['type'] ?? 'like');
        mia = mia === tipo ? null : tipo;
        const counts = [
          { type: 'like', count: 41 + (mia === 'like' ? 1 : 0) },
          { type: 'love', count: 7 + (mia === 'love' ? 1 : 0) },
        ];
        const total = counts.reduce((suma, fila) => suma + fila.count, 0);
        return responder(200, {
          reactions: { total, countsByType: {}, myReaction: mia, counts, mine: mia },
        });
      }
      case 'POST /follow/{id}':
        siguiendo = !siguiendo;
        return responder(200, {
          following: siguiendo,
          followerId: 'yo',
          authorId: 'valeria',
          followers: 1500,
          followingCount: 12,
        });
      case 'POST /message':
        return responder(200, {
          thread: { threadId: cuerpo['threadId'], participants: [], messages: [], lastMessageAt: '2026-10-03T10:00:00Z' },
          message: {
            id: 'dm_77',
            from: 'yo',
            body: cuerpo['body'],
            sentAt: '2026-10-03T10:00:00Z',
            author: { id: 'yo', handle: 'yo', displayName: 'Yo', avatarUrl: null, verified: false },
            createdAtUtc: '2026-10-03T10:00:00Z',
            outgoing: true,
            threadId: cuerpo['threadId'],
          },
        });
      default:
        return Promise.reject(new Error('offline'));
    }
  });

  return {
    fetchDoble,
    encender: (clave) => {
      caidas.delete(clave);
    },
  };
}

/** `fetch` que acepta el POST de publicar y rechaza todo lo demás (modo demo). */
function fetchQuePublica(post: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    const esPublicar = init?.method === 'POST' && /\/(post|article)$/.test(url);
    if (!esPublicar) {
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ post }),
    } as Response);
  });
  vi.stubGlobal('fetch', mock as unknown as typeof fetch);
  return mock;
}

describe('BlogsElementComponent', () => {
  let fixture: ComponentFixture<BlogsElementComponent>;
  let component: BlogsElementComponent;

  // `hash` alimenta el router de hash (deep-links `#/blogs/mensajes/<id>`); vacío = feed.
  async function createComponent(hash = '', config: object = NEGOCIO_DEL_CMS): Promise<void> {
    if (typeof window !== 'undefined') {
      window.location.hash = hash;
    }
    await TestBed.configureTestingModule({
      imports: [BlogsElementComponent],
      providers: [
        provideZonelessChangeDetection(),
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
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // La carga inicial del feed corre en ngOnInit, ya con el config del CMS; que asiente.
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

  /** La vista pintada de ese tipo: lo que pinta una vista (las cifras del estudio, el asistente) es suyo (012, I2). */
  function vista<T>(tipo: Type<T>): T {
    fixture.detectChanges();
    const nodo = fixture.debugElement.query(By.directive(tipo));
    expect(nodo).not.toBeNull();
    return nodo.componentInstance as T;
  }

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
  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('sin la base de la API no llama a nada y degrada, visible (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent('', {});

    expect(red).not.toHaveBeenCalled();
    expect(component.inicio.posts().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/explorar';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/explorar');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.red.view()).toBe('search');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    component.navegacion.go('notifications');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1/notificaciones');
  });

  it('lands on the feed with a populated demo timeline and flags degradation (empty case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.red.view()).toBe('feed');
    expect(component.inicio.feedScope()).toBe('foryou');
    // Mock catalogue loaded → posts present, degradation surfaced.
    expect(component.inicio.posts().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── CMS#197: quien lee lo dice la sesión del host, no el editor ─────────────
  //
  // Eran `viewerHandle`/`viewerName` del JSON libre, con «Tú · @tu» por defecto: con el CMS
  // delante, cada lector se veía como el mismo demo. `HostIdentityService` lee
  // `window.synergos` UNA vez al construirse, así que el bridge se monta antes del componente.
  describe('quién lee (CMS#197)', () => {
    interface ConBridge {
      synergos?: unknown;
    }
    const conHost = (bridge: unknown): void => {
      (globalThis as unknown as ConBridge).synergos = bridge;
    };
    afterEach(() => {
      delete (globalThis as unknown as ConBridge).synergos;
    });

    /** Iniciales, nombre y handle de la tarjeta «yo», por pieza (la plantilla no deja espacios entre ellas). */
    const tarjeta = (): string[] =>
      ['.blogs__rail-me .blogs__avatar', '.blogs__rail-me-name', '.blogs__rail-me-handle'].map(
        (selector) => (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? '',
      );
    const hayPerfil = (): boolean =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.blogs__nav-btn')).some((boton) =>
        (boton.textContent ?? '').includes('Perfil'),
      );

    it('sin host, la tarjeta «yo» es la de muestra, como siempre', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(tarjeta()).toEqual(['T', 'Tú', '@tu']);
      expect(hayPerfil()).toBe(true);
    });

    it('con sesión y sin respuesta de /me, la tarjeta es la del miembro, sin handle y sin su correo', async () => {
      conHost({ member: { key: 'k-1', displayName: 'Camila Restrepo', email: 'camila@ejemplo.co', roles: [] } });
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(tarjeta()).toEqual(['CR', 'Camila Restrepo', '']);
      // El correo ya no hace de llave (012-blogs-social, I0): salía a la vista de todos. Sin la
      // llave pública que contesta /me, la llave va vacía y no se le inventa otra.
      expect(component.red.viewer()?.actorKey).toBe('');
      expect(JSON.stringify(component.red.viewer())).not.toContain('camila@ejemplo.co');
      // Sin handle no hay perfil que abrir: el de `tu` no existe en el servidor.
      expect(hayPerfil()).toBe(false);
    });

    it('con sesión, quien lee es su cara pública: la llave y el alias que contesta /me', async () => {
      conHost({ member: { key: 'k-1', displayName: 'Camila Restrepo', email: 'camila@ejemplo.co', roles: [] } });
      const cara = { id: '0123abcdef456789', actorKey: '0123abcdef456789', handle: 'camila-restrepo-0123ab', displayName: 'Camila Restrepo' };
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          String(url).endsWith('/me')
            ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ author: cara }) } as Response)
            : Promise.reject(new Error('offline')),
        ),
      );
      await createComponent();
      fixture.detectChanges();

      expect(component.red.viewer()?.actorKey).toBe('0123abcdef456789');
      expect(component.red.viewer()?.handle).toBe('camila-restrepo-0123ab');
      expect(tarjeta()).toEqual(['CR', 'Camila Restrepo', '@camila-restrepo-0123ab']);
      expect(JSON.stringify(component.red.viewer())).not.toContain('camila@ejemplo.co');
      expect(hayPerfil()).toBe(true);
    });

    it('con host y sin sesión no hay «yo»: se ofrece entrar, no se inventa a nadie', async () => {
      conHost({});
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(component.red.viewer()).toBeNull();
      const host: HTMLElement = fixture.nativeElement;
      const entrar = host.querySelector<HTMLAnchorElement>('.blogs__rail-me--signin');
      expect(entrar?.textContent?.trim()).toBe('Inicia sesión');
      expect(entrar?.getAttribute('href')).toMatch(/^\/account\/login\?returnUrl=/);
      expect(host.querySelector('.blogs__rail-me-name')).toBeNull();
      expect(hayPerfil()).toBe(false);
    });
  });

  // ── happy: publish a post → optimistic insert at the top of the feed ─────────
  //
  // Este caso se llamaba «happy» y dejaba `fetch` RECHAZANDO: o sea comprobaba el
  // camino degradado y lo daba por bueno. Desde #26 un post que el servidor no
  // acepta no entra al feed, así que el caso feliz tiene que ser feliz de verdad
  // — el servidor acepta el POST y el resto sigue en modo demo.
  it('publishes a post and inserts it optimistically at the top (happy case)', async () => {
    await createComponent();
    const before = component.inicio.posts().length;

    fetchQuePublica(
      postDeServidor({ body: 'Mi primer post en Synergos Social #hola', hashtags: ['hola'] }),
    );
    component.compositor.draftBody.set('Mi primer post en Synergos Social #hola');
    expect(component.compositor.draftValid()).toBe(true);

    component.compositor.publish();
    await flushMicrotasks();

    expect(component.inicio.posts().length).toBe(before + 1);
    expect(component.inicio.posts()[0].body).toContain('Mi primer post');
    expect(component.inicio.posts()[0].hashtags).toContain('hola');
    expect(component.compositor.draftBody()).toBe('');
  });

  // ── filter: "Siguiendo" scope narrows the feed to followed authors ───────────
  it('narrows the feed to followed authors on the Siguiendo scope (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const forYouCount = component.inicio.posts().length;
    component.inicio.setFeedScope('following');
    await flushMicrotasks();

    expect(component.inicio.feedScope()).toBe('following');
    // Following is a subset of For-you (the demo graph excludes some authors).
    expect(component.inicio.posts().length).toBeLessThanOrEqual(forYouCount);
    expect(component.inicio.posts().length).toBeGreaterThan(0);
  });

  // ── idempotent: reacting twice with the same type toggles off, net zero ──────
  //
  // Corría con la red caída y lo que probaba era el `optimistic` que el cliente devolvía
  // (UI#92, regla 19). Hoy el borde contesta con su estado y lo que se mira es SU conteo.
  it('toggles a reaction off when applied twice with the same type (idempotent case)', async () => {
    vi.stubGlobal('fetch', bordeDeBlogs().fetchDoble);
    await createComponent();

    const post = component.inicio.posts().find((p) => p.reactions.mine === null) ?? component.inicio.posts()[0];

    component.reacciones.react(post, 'like');
    await flushMicrotasks();
    let current = component.inicio.posts().find((p) => p.id === post.id)!;
    expect(component.reacciones.isReacted(current, 'like')).toBe(true);
    expect(component.reacciones.reactionCount(current, 'like')).toBe(42);

    // Same type again → removed (idempotent toggle, back to the server's baseline).
    component.reacciones.react(current, 'like');
    await flushMicrotasks();
    current = component.inicio.posts().find((p) => p.id === post.id)!;
    expect(component.reacciones.isReacted(current, 'like')).toBe(false);
    expect(component.reacciones.reactionCount(current, 'like')).toBe(41);
  });

  // ── UI#92: una reacción que no se guardó vuelve atrás y se dice ───────────────
  it('con el POST /react caído la reacción vuelve a como estaba, no se anuncia y se dice', async () => {
    vi.stubGlobal('fetch', bordeDeBlogs({ caidas: ['POST /post/{id}/react'] }).fetchDoble);
    await createComponent();
    const anunciadas: unknown[] = [];
    component.postreacted.subscribe((payload) => anunciadas.push(payload));

    const post = component.inicio.posts().find((p) => p.reactions.mine === null) ?? component.inicio.posts()[0];
    const baseline = component.reacciones.reactionCount(post, 'like');
    component.reacciones.react(post, 'like');
    await flushMicrotasks();
    fixture.detectChanges();

    const current = component.inicio.posts().find((p) => p.id === post.id)!;
    expect(component.reacciones.isReacted(current, 'like')).toBe(false);
    expect(component.reacciones.reactionCount(current, 'like')).toBe(baseline);
    expect(anunciadas).toEqual([]);
    expect(component.red.errorMessage()).toBe('No pudimos guardar tu reacción. Intenta de nuevo.');
  });

  // ── reaction switch: love replaces like (one active reaction per user) ────────
  it('switches the active reaction without double-counting', async () => {
    vi.stubGlobal('fetch', bordeDeBlogs().fetchDoble);
    await createComponent();

    const post = component.inicio.posts().find((p) => p.reactions.mine === null) ?? component.inicio.posts()[0];
    component.reacciones.react(post, 'like');
    await flushMicrotasks();
    let current = component.inicio.posts().find((p) => p.id === post.id)!;
    component.reacciones.react(current, 'love');
    await flushMicrotasks();
    current = component.inicio.posts().find((p) => p.id === post.id)!;

    expect(component.reacciones.isReacted(current, 'like')).toBe(false);
    expect(component.reacciones.isReacted(current, 'love')).toBe(true);
  });

  // ── follow: optimistic toggle + follower count recalc on the profile ─────────
  /** Abre el perfil de ejemplo (una LECTURA) y pone el borde que contesta las escrituras. */
  async function abrirPerfilConBorde(caidas: readonly string[] = []): Promise<boolean> {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    component.navegacion.openProfile('valeria.code');
    await flushMicrotasks();
    const wasFollowing = component.perfil.profileViewerFollows();
    // El borde parte de lo mismo que pinta el perfil: alterna desde ahí, como el de verdad.
    vi.stubGlobal('fetch', bordeDeBlogs({ caidas, siguiendoAlEmpezar: wasFollowing }).fetchDoble);
    return wasFollowing;
  }

  it('follows an author optimistically and bumps the follower count', async () => {
    const wasFollowing = await abrirPerfilConBorde();
    const anunciados: unknown[] = [];
    component.authorfollowed.subscribe((payload) => anunciados.push(payload));

    const profile = component.perfil.profile()!;
    const before = profile.followersCount;

    component.seguidores.toggleFollow(profile);
    await flushMicrotasks();

    expect(component.perfil.profileViewerFollows()).toBe(!wasFollowing);
    expect(component.perfil.profile()!.followersCount).toBe(before + (wasFollowing ? -1 : 1));
    // Se anuncia lo que el SERVIDOR dejó.
    expect(anunciados).toEqual([{ actorKey: profile.actorKey, following: !wasFollowing }]);
  });

  // ── UI#92: seguir que no se guardó vuelve atrás, con su contador, y se dice ───
  it('con el POST /follow caído el botón y el contador vuelven a como estaban', async () => {
    const wasFollowing = await abrirPerfilConBorde(['POST /follow/{id}']);
    const anunciados: unknown[] = [];
    component.authorfollowed.subscribe((payload) => anunciados.push(payload));

    const profile = component.perfil.profile()!;
    const before = profile.followersCount;
    component.seguidores.toggleFollow(profile);
    // El optimista se pinta…
    expect(component.perfil.profileViewerFollows()).toBe(!wasFollowing);
    await flushMicrotasks();

    // …y el fallo lo revierte.
    expect(component.perfil.profileViewerFollows()).toBe(wasFollowing);
    expect(component.seguidores.isFollowing(profile.actorKey)).toBe(wasFollowing);
    expect(component.perfil.profile()!.followersCount).toBe(before);
    expect(anunciados).toEqual([]);
    expect(component.red.errorMessage()).toBe('No pudimos actualizar a quién sigues. Intenta de nuevo.');
  });

  // ── thread: comentar va al servidor y se pinta lo que guardó (012-blogs-social, I0) ──
  //
  // Antes el comentario se pintaba en local y no se mandaba a ninguna parte: al recargar no estaba.

  /** Un servidor que guarda el comentario y lo devuelve como lo vería el hilo. */
  function servidorQueComenta(aprobado = true): ReturnType<typeof vi.fn> {
    const mock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/comments') && init?.method === 'POST') {
        const cuerpo = JSON.parse(String(init.body)) as { body: string; parentId: string | null };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              approved: aprobado,
              comment: { id: 'c-srv', author: AUTHOR, body: cuerpo.body, parentId: cuerpo.parentId, createdAtUtc: '2026-11-02T10:00:00Z', likeCount: 0, replies: [] },
            }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', mock as unknown as typeof fetch);
    return mock;
  }

  it('comentar manda el comentario y pinta el que guardó el servidor', async () => {
    const fetchMock = servidorQueComenta();
    await createComponent();
    component.navegacion.openPost(component.inicio.posts()[0]);
    await flushMicrotasks();
    const before = component.publicacion.comments().length;

    component.publicacion.commentDraft.set('¡Excelente!');
    await component.publicacion.submitComment();

    const pedido = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/comments'));
    expect(pedido).toBeDefined();
    expect(JSON.parse(String((pedido![1] as RequestInit).body))).toEqual({ body: '¡Excelente!', parentId: null });
    expect(component.publicacion.comments().length).toBe(before + 1);
    expect(component.publicacion.comments()[component.publicacion.comments().length - 1].id).toBe('c-srv');
    expect(component.publicacion.commentDraft()).toBe('');
  });

  it('si el comentario no llega al servidor, no se pinta y el borrador se queda', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    component.navegacion.openPost(component.inicio.posts()[0]);
    await flushMicrotasks();
    const before = component.publicacion.comments().length;

    component.publicacion.commentDraft.set('¡Excelente!');
    await component.publicacion.submitComment();

    expect(component.publicacion.comments().length).toBe(before);
    expect(component.publicacion.commentDraft()).toBe('¡Excelente!');
    expect(component.red.errorMessage()).toContain('NO se publicó');
  });

  it('un comentario en revisión no se pinta como publicado y se dice', async () => {
    servidorQueComenta(false);
    await createComponent();
    component.navegacion.openPost(component.inicio.posts()[0]);
    await flushMicrotasks();
    const before = component.publicacion.comments().length;

    component.publicacion.commentDraft.set('Espera tu turno');
    await component.publicacion.submitComment();
    fixture.detectChanges();

    expect(component.publicacion.comments().length).toBe(before);
    expect(component.publicacion.commentNotice()).toContain('en revisión');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('en revisión');
  });

  // ── search: hashtag search routes to the search view with results ────────────
  it('runs a hashtag search and returns matching posts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.explorar.searchHashtag('design');
    await flushMicrotasks();

    expect(component.red.view()).toBe('search');
    expect(component.explorar.searchResult()).not.toBeNull();
    expect(component.explorar.searchResult()!.posts.length).toBeGreaterThan(0);
  });

  // ── composer a11y gate: media without alt text blocks publishing ─────────────
  it('blocks publishing media without alt text (a11y gate)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.compositor.draftBody.set('Mira esta foto');
    component.compositor.draftMediaUrl.set('https://example.com/x.jpg');
    expect(component.compositor.draftValid()).toBe(false);

    component.compositor.draftMediaAlt.set('Una foto de ejemplo');
    expect(component.compositor.draftValid()).toBe(true);
  });

  // ── v2 DMs (SH-7): loading the inbox + optimistic send appends to the thread ──
  /** Bandeja de ejemplo (una LECTURA) con el primer hilo abierto; luego, el borde. */
  async function abrirHiloConBorde(borde: ReturnType<typeof bordeDeBlogs>): Promise<number> {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.navegacion.go('messages');
    await flushMicrotasks();
    expect(component.red.view()).toBe('messages');
    expect(component.mensajes.threads().length).toBeGreaterThan(0);

    const thread = component.mensajes.threads()[0];
    component.mensajes.onThreadSelect(thread);
    await flushMicrotasks();
    expect(component.mensajes.activeThread()!.id).toBe(thread.id);
    vi.stubGlobal('fetch', borde.fetchDoble);
    return component.mensajes.activeThread()!.messages.length;
  }

  it('loads the DM inbox and appends a sent message optimistically', async () => {
    const before = await abrirHiloConBorde(bordeDeBlogs());

    component.mensajes.onSendMessage({ thread: component.mensajes.activeThread()!, body: '¡Hola desde el test!' });
    await flushMicrotasks();
    const after = component.mensajes.activeThread()!;
    expect(after.messages.length).toBe(before + 1);
    // La burbuja optimista se reconcilia con la que guardó el SERVIDOR.
    expect(after.messages.at(-1)).toMatchObject({ id: 'dm_77', body: '¡Hola desde el test!' });
    expect(after.messages.at(-1)?.failed).toBeUndefined();
  });

  // ── UI#92: un DM que no salió se queda MARCADO, sin hora, y se reintenta ──────
  it('con el POST /message caído el DM queda marcado en el hilo, se dice y se reintenta', async () => {
    const borde = bordeDeBlogs({ caidas: ['POST /message'] });
    const before = await abrirHiloConBorde(borde);

    component.mensajes.onSendMessage({ thread: component.mensajes.activeThread()!, body: '¡Hola desde el test!' });
    await flushMicrotasks();

    const marcado = component.mensajes.activeThread()!.messages.at(-1)!;
    expect(component.mensajes.activeThread()!.messages.length).toBe(before + 1);
    expect(marcado).toMatchObject({ body: '¡Hola desde el test!', failed: true });
    expect(component.red.errorMessage()).toBe('Tu mensaje NO se envió. Queda en el hilo para reintentarlo.');

    borde.encender('POST /message');
    component.mensajes.retryMessage(component.mensajes.activeThread()!, marcado);
    await flushMicrotasks();

    const after = component.mensajes.activeThread()!;
    expect(after.messages.length).toBe(before + 1);
    expect(after.messages.at(-1)).toMatchObject({ id: 'dm_77', body: '¡Hola desde el test!' });
    expect(after.messages.at(-1)?.failed).toBeUndefined();
    expect(component.red.errorMessage()).toBe('');
  });

  // ── v2 explore (SH-1): hashtag facet drives the discovery criteria + results ──
  it('runs an explore query via the SH-1 criteria and returns matching posts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.explorar.onSearchCriteria({ term: '', facets: { hashtag: ['design'] }, sort: 'top', page: 1 });
    await flushMicrotasks();
    expect(component.explorar.searchTag()).toBe('design');
    expect(component.explorar.searchResult()).not.toBeNull();
    expect(component.explorar.searchResult()!.posts.length).toBeGreaterThan(0);
  });

  // ── v2 guardados: el marcador PERSISTE (no solo se enciende) ─────────────────
  /**
   * Una escritura de guardados que el servidor acepta. `204 No Content` a propósito: el
   * `.json()` revienta, y si el cliente parseara el cuerpo un guardado bueno se leería
   * como fallo y se revertiría.
   */
  function acceptedWrite(): Response {
    return {
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('no-body')),
    } as unknown as Response;
  }

  function rejectedWrite(status: number): Response {
    return { ok: false, status, json: () => Promise.resolve({}) } as Response;
  }

  /** Una escritura de `/saved` (POST o DELETE); el GET es la carga de la lista. */
  function isSavedWrite(url: unknown, init?: RequestInit): boolean {
    return String(url).includes('/saved') && String(init?.method ?? 'GET') !== 'GET';
  }

  it('guarda un post y la llamada LLEGA al servidor, con su método, ruta y cuerpo', async () => {
    const calls: Array<{ url: string; method: string; body: string | null }> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (isSavedWrite(url, init)) {
        calls.push({
          url: String(url),
          method: String(init?.method),
          body: typeof init?.body === 'string' ? init.body : null,
        });
        return Promise.resolve(acceptedWrite());
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const post = component.inicio.posts()[0];
    expect(component.guardados.isSaved(post.id)).toBe(false);

    component.guardados.toggleSave(post);
    await flushMicrotasks();

    // Lo que se mide NO es que el icono se encienda —eso ya lo hacía mintiendo—, sino que
    // salió la petición. Sin esto el test pasa igual con el arreglo entero borrado.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/saved');
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ postId: post.id });
    expect(component.guardados.isSaved(post.id)).toBe(true);
    expect(component.guardados.savedPosts().some((p) => p.id === post.id)).toBe(true);

    component.guardados.toggleSave(post);
    await flushMicrotasks();

    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe('DELETE');
    expect(calls[1].url).toContain(`postId=${encodeURIComponent(post.id)}`);
    expect(component.guardados.isSaved(post.id)).toBe(false);
    expect(component.guardados.savedPosts().some((p) => p.id === post.id)).toBe(false);
  });

  // ── el fallo DESHACE, y deja la lista exactamente como estaba ────────────────
  it('si el servidor rechaza, revierte las DOS señales y devuelve el post a su posición', async () => {
    let failWrites = false;
    const savedFromServer = ['p-1', 'p-2', 'p-3'].map((id) => ({ ...MY_SAVED_POST, id }));
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (isSavedWrite(u, init)) {
        return Promise.resolve(failWrites ? rejectedWrite(500) : acceptedWrite());
      }
      if (u.includes('/saved')) {
        return Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve({ posts: savedFromServer }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    component.navegacion.go('saved');
    await flushMicrotasks();
    // Control: la lista llega ORDENADA del servidor — hay una posición que respetar.
    expect(component.guardados.savedPosts().map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3']);

    failWrites = true;
    const middle = component.guardados.savedPosts()[1];
    component.guardados.toggleSave(middle);
    // Optimista: desaparece al instante, sin esperar al servidor.
    expect(component.guardados.savedPosts().map((p) => p.id)).toEqual(['p-1', 'p-3']);

    await flushMicrotasks();

    // Y vuelve a SU sitio, no al principio: reinsertar al frente sería otra forma de
    // mentir sobre una lista que el servidor ordenó.
    expect(component.guardados.savedPosts().map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3']);
    expect(component.guardados.isSaved('p-2')).toBe(true);
    expect(component.red.errorMessage()).toContain('No pudimos');
    // Un 500 no es un hueco de sesión: la invitación a iniciar sesión NO aparece.
    expect(component.red.sessionAccess()).toBe('ok');
  });

  // ── 401 al guardar: revierte Y lleva a la invitación de sesión que ya existe ──
  it('un 401 al guardar revierte el marcador y pide iniciar sesión (no un error genérico)', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      isSavedWrite(url, init)
        ? Promise.resolve(rejectedWrite(401))
        : Promise.reject(new Error('offline')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const post = component.inicio.posts()[0];
    component.guardados.toggleSave(post);
    expect(component.guardados.isSaved(post.id)).toBe(true);

    await flushMicrotasks();
    await settleAnnouncer();

    expect(component.guardados.isSaved(post.id)).toBe(false);
    expect(component.guardados.savedPosts().some((p) => p.id === post.id)).toBe(false);
    expect(component.red.sessionAccess()).toBe('anon');
    expect(lastLiveRegion()?.textContent ?? '').toContain('Inicia sesión');

    // El botón de guardar vive en la TARJETA DE POST, o sea en el feed — y el panel
    // `.blogs__signin` solo se pinta dentro de las cuatro vistas personales. Antes
    // `errorMessage` se vaciaba siempre "para no duplicar el aviso", y el resultado era
    // que quien pulsaba desde el feed no veía NADA: el marcador parpadeaba y se acabó.
    // Solo se enteraba quien usa lector de pantalla — el arreglo funcionaba justo para
    // quien no mira y fallaba para todos los demás.
    expect(component.red.view()).not.toBe('saved');
    expect(component.red.errorMessage()).toContain('Inicia sesión');

    // Y que esté PINTADO, no solo en la señal.
    fixture.detectChanges();
    const avisos = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.blogs__signin, .blogs__notice--error',
    );
    expect(avisos.length).toBeGreaterThan(0);
  });

  // ── respuestas cruzadas: la cola por post impone el orden en el SERVIDOR ─────
  it('dos pulsaciones rápidas sobre el mismo post no se cruzan: se serializan', async () => {
    const writes: Array<{ method: string; release: () => void }> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (isSavedWrite(url, init)) {
        return new Promise<Response>((resolve) => {
          writes.push({
            method: String(init?.method),
            release: () => resolve(acceptedWrite()),
          });
        });
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const post = component.inicio.posts()[0];
    component.guardados.toggleSave(post); // guardar
    component.guardados.toggleSave(post); // quitar, sin esperar a la primera
    await flushMicrotasks();

    // CONTROL: sin cola habría DOS peticiones en vuelo y el servidor podría aplicarlas al
    // revés — quedaría guardado justo lo que el usuario acaba de quitar. Solo salió una.
    expect(writes.map((w) => w.method)).toEqual(['POST']);
    // La UI, en cambio, ya muestra la última intención: no espera al servidor.
    expect(component.guardados.isSaved(post.id)).toBe(false);

    writes[0].release();
    await flushMicrotasks();

    // La segunda sale DESPUÉS de que la primera termine: el servidor las ve pulsadas.
    expect(writes.map((w) => w.method)).toEqual(['POST', 'DELETE']);
    writes[1].release();
    await flushMicrotasks();

    expect(component.guardados.isSaved(post.id)).toBe(false);
    expect(component.red.errorMessage()).toBe('');
  });

  it('el fallo de una pulsación ya superada NO revierte la más reciente', async () => {
    const methods: string[] = [];
    let firstWrite = true;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (isSavedWrite(url, init)) {
        methods.push(String(init?.method));
        if (firstWrite) {
          firstWrite = false;
          return Promise.resolve(rejectedWrite(500));
        }
        return Promise.resolve(acceptedWrite());
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const post = component.inicio.posts()[0];
    component.guardados.toggleSave(post); // guardar — fallará
    component.guardados.toggleSave(post); // quitar — esta es la intención vigente
    await flushMicrotasks();

    expect(methods).toEqual(['POST', 'DELETE']);
    // Revertir el POST caído habría vuelto a ENCENDER el marcador que el usuario acababa
    // de apagar, y encima con un error que ya no describe nada.
    expect(component.guardados.isSaved(post.id)).toBe(false);
    expect(component.guardados.savedPosts().some((p) => p.id === post.id)).toBe(false);
    expect(component.red.errorMessage()).toBe('');
  });

  it('marcar dos posts distintos no encola uno detrás del otro', async () => {
    const bodies: string[] = [];
    const release: Array<() => void> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (isSavedWrite(url, init)) {
        bodies.push(typeof init?.body === 'string' ? init.body : '');
        return new Promise<Response>((resolve) => release.push(() => resolve(acceptedWrite())));
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const [first, second] = component.inicio.posts();
    component.guardados.toggleSave(first);
    component.guardados.toggleSave(second);
    await flushMicrotasks();

    // La cola es POR POST: serializar TODO haría que marcar rápido dos posts distintos se
    // sintiera lento sin ninguna razón — no compiten por el mismo estado.
    expect(bodies).toHaveLength(2);
    expect(bodies.map((body) => JSON.parse(body).postId)).toEqual([first.id, second.id]);

    release.forEach((resolve) => resolve());
    await flushMicrotasks();

    expect(component.guardados.isSaved(first.id)).toBe(true);
    expect(component.guardados.isSaved(second.id)).toBe(true);
  });

  // ── v2 long-form: el editor de artículo sobre SH-6 (#26) ─────────────────────
  //
  // ⚠️ ESTE BLOQUE REEMPLAZA UN TEST QUE AFIRMABA EL DEFECTO. El anterior
  // rechazaba `fetch` a propósito y comprobaba que el artículo aparecía arriba
  // del feed — o sea consagraba que un fallo del servidor se viera como
  // publicación exitosa, mientras el editor se vaciaba. Por eso el defecto no lo
  // vio nadie: no faltaba cobertura, sobraba la equivocada.
  const TITULO = 'Por qué el motor compartido escala';
  const CUERPO = 'Un cuerpo suficientemente largo para pasar la validación del editor.';

  function escribirArticulo(): void {
    component.articulo.articleTitle.set(TITULO);
    component.articulo.articleBody.set(CUERPO);
  }

  it('publica un artículo y lo inserta arriba del feed cuando el servidor lo ACEPTA', async () => {
    await createComponent();
    const before = component.inicio.posts().length;
    escribirArticulo();
    expect(component.articulo.articleValid()).toBe(true);

    fetchQuePublica(postDeServidor({ id: 'art-1', objectKind: 'postPage', body: CUERPO }));
    const publicados: string[] = [];
    component.articlepublished.subscribe((e) => publicados.push(e.id));

    component.articulo.publishArticle();
    await flushMicrotasks();

    expect(component.inicio.posts().length).toBe(before + 1);
    expect(component.inicio.posts()[0].objectKind).toBe('postPage');
    expect(publicados).toEqual(['art-1']);
    // Ahora sí se limpia: hay confirmación del servidor.
    expect(component.articulo.articleTitle()).toBe('');
    expect(component.articulo.articleBody()).toBe('');
    expect(component.articulo.articleNotSaved()).toBe(false);
  });

  // ── EL caso: el servidor no lo acepta ────────────────────────────────────────
  it('si el servidor NO lo acepta, el texto se queda y NO se da por publicado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    const before = component.inicio.posts().length;
    escribirArticulo();

    const publicados: string[] = [];
    component.articlepublished.subscribe((e) => publicados.push(e.id));

    component.articulo.publishArticle();
    await flushMicrotasks();

    // Lo que antes pasaba y ya no: el texto se borraba, el artículo aparecía en
    // el feed como publicado y el CMS recibía un id inventado.
    expect(component.articulo.articleTitle()).toBe(TITULO);
    expect(component.articulo.articleBody()).toBe(CUERPO);
    expect(component.inicio.posts().length).toBe(before);
    expect(publicados).toEqual([]);
    // Y se dice, en vez de dejar la pantalla como si nada hubiera pasado.
    expect(component.articulo.articleNotSaved()).toBe(true);
  });

  it('el post corto tampoco se da por publicado si el servidor no lo acepta', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    const before = component.inicio.posts().length;
    component.compositor.draftBody.set('Un post corto que no va a llegar a ninguna parte.');

    component.compositor.publish();
    await flushMicrotasks();

    expect(component.compositor.draftBody()).toBe('Un post corto que no va a llegar a ninguna parte.');
    expect(component.inicio.posts().length).toBe(before);
    expect(component.red.errorMessage()).toContain('sigue acá');
  });

  it('el doble clic no publica dos veces', async () => {
    await createComponent();
    let articulos = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (!/\/article$/.test(url)) {
          return Promise.reject(new Error('offline'));
        }
        articulos += 1;
        return new Promise(() => undefined); // nunca resuelve: deja el latch puesto
      }) as unknown as typeof fetch,
    );
    escribirArticulo();

    component.articulo.publishArticle();
    component.articulo.publishArticle();
    await flushMicrotasks();

    // La guarda es sincrónica (`publishing.set(true)` corre en el mismo tick), al
    // revés que el `input` `publishing` de SH-6, que llegaría un tick tarde.
    expect(articulos).toBe(1);
  });

  it('monta SH-6 en la vista de escribir, no el formulario a mano', async () => {
    await createComponent();
    component.navegacion.go('write');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('syn-authoring-wizard')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('form.blogs__editor')).toBeNull();
  });

  it('un borrador rehidratado siembra el espejo y deja CONTINUAR, no un botón muerto', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    component.navegacion.go('write');
    fixture.detectChanges();

    const wizard = vista(BlogsEscribirComponent).articleWizard();
    expect(wizard).toBeTruthy();

    // Así llega un borrador restaurado: el wizard lo tiene y el espejo del
    // dominio NO, porque SH-6 no emite `draftchange` al rehidratar.
    wizard!.patchDraft({ title: TITULO, body: CUERPO });
    fixture.detectChanges();

    expect(component.articulo.articleTitle()).toBe(TITULO);
    expect(component.articulo.articleBody()).toBe(CUERPO);
    // Lo que de verdad importa: sin la siembra, el autor vería su texto en los
    // campos y el botón de continuar gris, porque `validity` sale del espejo.
    expect(component.articulo.articleValidity()['contenido']).toBe(true);
  });

  it('quitar la portada limpia su texto alternativo', async () => {
    await createComponent();
    component.articulo.articleCover.set('https://ejemplo.test/portada.jpg');
    component.articulo.articleCoverAlt.set('Una portada');
    expect(component.articulo.articleValid()).toBe(false); // falta título y cuerpo

    const patched: Record<string, unknown>[] = [];
    component.articulo.onArticleField(
      (v) => patched.push(v as Record<string, unknown>),
      'coverUrl',
      '',
    );

    // Antes el alt se quedaba rancio: el input vive dentro de un `@if` que lo
    // oculta sin borrar la señal, así que el POST salía con `coverAlt` y sin
    // `coverUrl`.
    expect(component.articulo.articleCoverAlt()).toBe('');
    expect(patched).toEqual([{ coverUrl: '', coverAlt: '' }]);
  });

  // ── v2 studio (SH-5): loading the creator dashboard aggregate + KPIs ─────────
  it('loads the creator studio aggregate and derives KPI cards', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.navegacion.go('studio');
    await flushMicrotasks();
    expect(component.red.view()).toBe('studio');
    expect(component.estudio.studio()).not.toBeNull();
    expect(vista(BlogsEstudioComponent).studioKpis().length).toBeGreaterThan(0);
    expect(component.estudio.studioRows().length).toBeGreaterThan(0);
  });

  // ── La suscripción, declarada y apagada (012-blogs-social, I0, P5 A) ──────────
  //
  // Su pago es local: el asistente aceptaba con una referencia inventada. Hasta que haya cobro
  // real la pantalla no la ofrece; el asistente y su estrategia se quedan (superset).
  it('la suscripción está apagada: el estudio no ofrece monetización ni ingresos, y no se abre', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.navegacion.go('studio');
    await flushMicrotasks();
    expect(component.suscripcionEncendida).toBe(false);
    expect(vista(BlogsEstudioComponent).studioConfig().sections.map((s) => s.id)).not.toContain('monetization');
    expect(vista(BlogsEstudioComponent).studioKpis().map((k) => k.id)).not.toContain('revenue');

    const tier = component.estudio.studio()!.tiers[0];
    component.suscripcion.startSubscribe(component.red.autorLocal(), tier);
    await flushMicrotasks();
    expect(component.red.view()).toBe('studio');
    expect(component.suscripcion.subscribeTier()).toBeNull();
  });

  it('un enlace a #/suscribir lleva al inicio y no a un pago que no cobra', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent('#/blogs/suscribir');

    expect(component.red.view()).toBe('feed');
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

    component.navegacion.go('messages');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/messages');
    expect(component.red.sessionAccess()).toBe('anon');
    // EL CORAZÓN DE LA OLA: cero conversaciones sembradas a la vista.
    expect(component.mensajes.threads()).toEqual([]);
    expect(component.mensajes.activeThread()).toBeNull();
    // Y se dice con palabras, no con un banner de "datos de ejemplo".
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tus mensajes');
    expect(component.navegacion.loginUrl()).toContain('/account/login?returnUrl=');
  });

  it('un 401 en notificaciones no pinta la actividad sembrada', async () => {
    const fetchMock = await bootWith401On('/notifications');

    component.navegacion.go('notifications');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/notifications');
    expect(component.red.sessionAccess()).toBe('anon');
    expect(component.notificaciones.notifications()).toEqual([]);
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tus notificaciones');
  });

  it('un 401 en guardados no pinta la colección sembrada', async () => {
    const fetchMock = await bootWith401On('/saved');

    component.navegacion.go('saved');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/saved');
    expect(component.red.sessionAccess()).toBe('anon');
    expect(component.guardados.savedPosts()).toEqual([]);
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tus guardados');
  });

  it('un 401 en el estudio no pinta alcance ni ingresos sembrados', async () => {
    const fetchMock = await bootWith401On('/studio');

    component.navegacion.go('studio');
    await flushMicrotasks();
    fixture.detectChanges();

    expectRequested(fetchMock, '/studio');
    expect(component.red.sessionAccess()).toBe('anon');
    // Métricas de otro leídas como propias: la mentira más cara de las cuatro.
    expect(component.estudio.studio()).toBeNull();
    expect(vista(BlogsEstudioComponent).studioKpis()).toEqual([]);
    const title = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin-title');
    expect(title?.textContent).toContain('Inicia sesión para ver tu estudio');
  });

  // ── WCAG 2.4.3: el panel de acceso RECIBE el foco ─────────────────────────────
  // El bug que cierran: el markup ya traía `tabindex="-1"` + `#signinPanel` en los cuatro
  // paneles, pero ningún .ts consumía la ref, así que el foco no se movía y el usuario de
  // teclado tenía que tabular desde el principio para llegar al "Iniciar sesión".
  it('un 401 mueve el foco al CONTENEDOR del panel, no al botón de login', async () => {
    const fetchMock = await bootWith401On('/messages');

    component.navegacion.go('messages');
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

    component.navegacion.go('notifications');
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

    component.navegacion.go('messages');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    const firstPanel = (fixture.nativeElement as HTMLElement).querySelector('.blogs__signin');
    expect(document.activeElement).toBe(firstPanel); // control: la 1.ª negativa sí enfocó
    const callsAfterDenial = fetchMock.mock.calls.length;

    // El usuario navega él mismo a otra superficie del panel.
    component.navegacion.go('notifications');
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

    component.navegacion.go('messages');
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
    component.red.sessionAccess.set('ok');
    component.mensajes.threadsLoaded.set(false);
    component.navegacion.go('messages');
    await flushMicrotasks();
    expect(component.red.sessionAccess()).toBe('anon'); // control: el 401 volvió a ocurrir

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

    component.navegacion.go('messages');
    await flushMicrotasks();
    component.navegacion.go('saved');
    await flushMicrotasks();
    component.navegacion.go('notifications');
    await flushMicrotasks();
    component.navegacion.go('studio');
    await flushMicrotasks();

    // Control: las CUATRO están POBLADAS con lo suyo — hay algo real que borrar.
    expect(component.red.sessionAccess()).toBe('ok');
    expect(component.mensajes.threads().map((t) => t.id)).toEqual(['t-mio']);
    expect(component.guardados.savedPosts().map((p) => p.id)).toEqual(['p-mio']);
    expect(component.notificaciones.notifications().map((n) => n.id)).toEqual(['n-mia']);
    expect(component.estudio.studio()?.followers).toBe(1234);

    // La sesión expira y el usuario manda un DM: el servidor responde 401.
    sessionValid = false;
    component.mensajes.onSendMessage({ thread: component.mensajes.threads()[0], body: '¿Hola?' });
    await flushMicrotasks();

    expect(component.red.sessionAccess()).toBe('anon');
    // NADA personal sobrevive: ni en pantalla ni en los contadores del nav.
    expect(component.mensajes.threads()).toEqual([]);
    expect(component.mensajes.activeThread()).toBeNull();
    expect(component.notificaciones.notifications()).toEqual([]);
    expect(component.guardados.savedPosts()).toEqual([]);
    expect(component.guardados.isSaved('p-mio')).toBe(false);
    expect(component.estudio.studio()).toBeNull();
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

    expect(component.red.view()).toBe('messages');
    expectRequested(fetchMock, '/thread/');
    expect(component.red.threadAccess()).toBe('forbidden');
    // Ninguna conversación abierta bajo el id ajeno (antes se servía OTRA del mock).
    expect(component.mensajes.activeThread()).toBeNull();
    // No se le pide iniciar sesión: YA la tiene. Y su bandeja sigue en pie.
    expect(component.red.sessionAccess()).toBe('ok');
    expect(component.mensajes.threads().map((t) => t.id)).toEqual(['t-mio']);
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

    expect(component.red.threadAccess()).toBe('forbidden'); // control

    component.navegacion.go('messages');
    await flushMicrotasks();
    expect(component.red.threadAccess()).toBe('ok');
  });

  // ── Regresión en la dirección CONTRARIA: lo público debe SEGUIR degradando ─────
  // Blindar el 401 no puede convertir una caída de red en un "inicia sesión": el feed y
  // el detalle de un post son contenido público y ahí el mock no le miente a nadie.
  it('las rutas públicas (feed, post) siguen degradando a mock ante un error de red', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.inicio.posts().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
    // Una caída de red NO es un hueco de sesión.
    expect(component.red.sessionAccess()).toBe('ok');

    component.navegacion.openPost(component.inicio.posts()[0]);
    await flushMicrotasks();

    expect(component.red.view()).toBe('post');
    expect(component.publicacion.comments().length).toBeGreaterThan(0);
    expect(component.red.sessionAccess()).toBe('ok');
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
    expect(component.mensajes.threads().length).toBeGreaterThan(0);
    // Lo que cierra el bug: nada abierto bajo el id pedido.
    expect(component.mensajes.activeThread()).toBeNull();
    expect(component.red.threadAccess()).toBe('ok'); // no es un 403: es un fallo del backend
    expect(component.red.sessionAccess()).toBe('ok'); // ni un 401
  });

  it('offline, un hilo SÍ sembrado sigue abriéndose (la demo no se rompió)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent('#/blogs/mensajes/t-valeria');

    expect(component.mensajes.activeThread()?.id).toBe('t-valeria');
  });

  // ─── Moldes de carga (doc 24) ───────────────────────────────────────────────
  // La trampa de este patrón: al cambiar el `<p>Cargando…</p>` por un esqueleto la
  // PANTALLA mejora y el lector de pantalla se queda MUDO — se habría empeorado la
  // accesibilidad en nombre del pulido. Por eso cada test pide LAS DOS cosas: huesos
  // con la forma real Y un `role="status"` con TEXTO que no esté tapado por el
  // `aria-hidden` del molde. Un aserto solo sobre los huesos dejaría pasar la regresión.
  it('el hilo de comentarios carga con molde MUDO y un anuncio que SÍ se lee', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.red.view.set('post');
    component.publicacion.activePost.set(POST_FOR_SKELETON);
    component.publicacion.comments.set([]);
    component.red.loading.set(true);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;

    // 1. El molde tiene la FORMA real del comentario: avatar + cabecera + cuerpo +
    //    acción + caja de respuesta, uno por cada fila anunciada. Es el del hilo de
    //    `libs/shells` (SH-15, T016), con las mismas clases que su comentario.
    const rows = component.presentacion.commentSkeletons.length;
    expect(host.querySelectorAll('.syn-cthread__bone--avatar').length).toBe(rows);
    expect(host.querySelectorAll('.syn-cthread__bone--head').length).toBe(rows);
    expect(host.querySelectorAll('.syn-cthread__bone--text').length).toBe(rows);
    expect(host.querySelectorAll('.syn-cthread__bone--form').length).toBe(rows);

    // 2. Los huesos son decorativos: viven bajo un contenedor `aria-hidden`.
    const bone = host.querySelector('.syn-cthread__bone--avatar');
    expect(bone?.closest('[aria-hidden="true"]')).not.toBeNull();

    // 3. …y el aviso sigue existiendo, con TEXTO, FUERA del aria-hidden. Sin esto el
    //    usuario ciego no sabría que algo está cargando.
    const status = findLiveStatus(host, /Cargando comentarios/);
    expect(status).toBeDefined();
    expect(status!.closest('[aria-hidden="true"]')).toBeNull();
    // Y sigue siendo PERCEPTIBLE: una auditoría mutó el SCSS a `display: none` —el nodo
    // queda con su rol y su texto— y las pruebas siguieron verdes. `display:none` y
    // `visibility:hidden` sacan el nodo del árbol de accesibilidad; el recorte no.
    {
      const e = getComputedStyle(status!);
      expect(e.display).not.toBe('none');
      expect(e.visibility).not.toBe('hidden');
    }
  });

  it('las notificaciones cargan con molde MUDO y un anuncio que SÍ se lee', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.red.sessionAccess.set('ok');
    component.red.view.set('notifications');
    component.notificaciones.notificationsLoaded.set(false);
    component.red.loading.set(true);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;

    const rows = component.presentacion.notificationSkeletons.length;
    expect(host.querySelectorAll('.blogs__bone--notif-text').length).toBe(rows);
    expect(host.querySelectorAll('.blogs__bone--notif-time').length).toBe(rows);

    // El molde reusa `blogs__notif` para heredar el padding real, pero NO puede ser
    // un control: un esqueleto no se enfoca ni se pulsa.
    const skeletonRow = host.querySelector('.blogs__notif--skeleton');
    expect(skeletonRow).not.toBeNull();
    expect(skeletonRow!.tagName).not.toBe('BUTTON');
    expect(skeletonRow!.closest('[aria-hidden="true"]')).not.toBeNull();

    const status = findLiveStatus(host, /Cargando notificaciones/);
    expect(status).toBeDefined();
    expect(status!.closest('[aria-hidden="true"]')).toBeNull();
    // Y sigue siendo PERCEPTIBLE: una auditoría mutó el SCSS a `display: none` —el nodo
    // queda con su rol y su texto— y las pruebas siguieron verdes. `display:none` y
    // `visibility:hidden` sacan el nodo del árbol de accesibilidad; el recorte no.
    {
      const e = getComputedStyle(status!);
      expect(e.display).not.toBe('none');
      expect(e.visibility).not.toBe('hidden');
    }
  });
  // ─── El <h1> del feed: lo compone el CMS ────────────────────────────────────
  //
  // Dos defectos distintos se cruzaban aquí. (1) El feed era la ÚNICA de las seis
  // vistas sin `blogs__view-title`, así que /blogs cargaba sin un solo <h1> y su
  // esquema arrancaba en h2. (2) El CMS SÍ componía el título y `sanitizeConfig` lo
  // descartaba en silencio, porque reconstruye el objeto clave por clave y todo lo
  // que no lista desaparece sin error ni warning.
  //
  // El assert mira el DOM RENDERIZADO, no el signal: si alguien quita `heading` del
  // sanitizer y deja el `input()` puesto, el build sigue verde y el título vuelve a
  // ser el default — y sólo un assert contra el <h1> se pone rojo.
  describe('título compuesto del feed', () => {
    it('CONTROL: sin config, el feed titula con el default de la app', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      const h1 = fixture.nativeElement.querySelector('.blogs__view-title');
      // Que el control encuentre el h1 es lo que da valor al test siguiente: prueba
      // que el selector acierta y que la vista por defecto es el feed. Si el header
      // no renderizara, aquí falla en vez de dar un verde falso más abajo.
      expect(h1).toBeTruthy();
      expect(h1.textContent.trim()).toBe('Inicio');
    });

    it('pinta el título que el CMS manda en el JSON de `config`', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      // Como STRING, que es la ruta real del mount: el emitter fusiona todos los
      // props en UN atributo `config='{...}'` y el transform hace JSON.parse. Un
      // test que pase el objeto ya parseado no cubriría el camino de producción.
      fixture.componentRef.setInput(
        'config',
        JSON.stringify({ heading: 'Conecta, publica y crece tu audiencia' }),
      );
      fixture.detectChanges();

      expect(component.heading()).toBe('Conecta, publica y crece tu audiencia');
      expect(fixture.nativeElement.querySelector('.blogs__view-title').textContent.trim()).toBe(
        'Conecta, publica y crece tu audiencia',
      );
    });

    // CMS#196: el subtítulo viajaba en el ElementType y nadie lo pintaba. Sin él, no hay
    // párrafo vacío; con él, va bajo el título, por la misma ruta real del mount (`config`).
    it('pinta el subtítulo del CMS bajo el título, y sin subtítulo no deja un párrafo vacío', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      expect(fixture.nativeElement.querySelector('.blogs__view-sub')).toBeNull();

      fixture.componentRef.setInput(
        'config',
        JSON.stringify({ ...NEGOCIO_DEL_CMS, subheading: 'Sigue autores y reacciona en tiempo real' }),
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.blogs__view-sub').textContent.trim()).toBe(
        'Sigue autores y reacciona en tiempo real',
      );
    });
  });

  // ── #87: los contadores del editor hablaban en CADA tecla ──────────────────────
  // Eran regiones vivas (`aria-live="polite"`) cuyo texto cambia con cada carácter: el lector
  // decía «487», «486», «485»… encima de lo que se escribe. Lo que hay que contar no es si
  // tienen aria-live, sino CUÁNTAS VECES hablan mientras se escribe (regla 42c).
  function anunciosCon(texto: RegExp, espia: { mock: { calls: unknown[][] } }): string[] {
    return espia.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => texto.test(m));
  }

  it('el contador del compositor se DESCRIBE y sólo habla en los hitos, no en cada tecla', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    (fixture.nativeElement.querySelector('.blogs__composer-open button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const campo = fixture.nativeElement.querySelector('.blogs__composer-input textarea') as HTMLTextAreaElement;
    const contador = fixture.nativeElement.querySelector('.blogs__char-count') as HTMLElement;
    expect(campo).toBeTruthy();
    expect(contador.getAttribute('aria-live')).toBeNull();
    expect(contador.id).toBeTruthy();
    expect(campo.getAttribute('aria-describedby')).toBe(contador.id);

    const anuncios = vi.spyOn(LiveAnnouncerService.prototype, 'announce');
    const escribir = async (n: number): Promise<void> => {
      campo.value = 'a'.repeat(n);
      campo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    for (const n of [1, 2, 3, 50, 200, 479]) await escribir(n);
    expect(anunciosCon(/caracteres/, anuncios)).toEqual([]);

    for (const n of [480, 485, 490, 499]) await escribir(n);
    expect(anunciosCon(/caracteres/, anuncios)).toEqual(['Quedan 20 caracteres o menos.']);

    await escribir(500);
    expect(anunciosCon(/caracteres/, anuncios)).toEqual([
      'Quedan 20 caracteres o menos.',
      'Llegaste al límite de 500 caracteres.',
    ]);
  });

  it('la pista del cuerpo del artículo se describe y sólo avisa al llegar al mínimo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    component.navegacion.go('write');
    fixture.detectChanges();
    await fixture.whenStable();

    const campo = fixture.nativeElement.querySelector('.blogs__editor-body textarea') as HTMLTextAreaElement;
    const pista = fixture.nativeElement.querySelector('.blogs__editor-hint') as HTMLElement;
    expect(campo, 'el paso «contenido» no está a la vista').toBeTruthy();
    expect(pista.getAttribute('aria-live')).toBeNull();
    expect(campo.getAttribute('aria-describedby')).toBe(pista.id);

    const anuncios = vi.spyOn(LiveAnnouncerService.prototype, 'announce');
    const escribir = async (n: number): Promise<void> => {
      campo.value = 'b'.repeat(n);
      campo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    for (const n of [1, 5, 10, 19]) await escribir(n);
    expect(anunciosCon(/extensión mínima/, anuncios)).toEqual([]);

    for (const n of [20, 21, 40]) await escribir(n);
    expect(anunciosCon(/extensión mínima/, anuncios)).toEqual([
      'El cuerpo ya tiene la extensión mínima: puedes continuar.',
    ]);
  });
});

// El borde de la red: era `BlogsApiClient`, y desde I2 son los adaptadores de `@synergos/dominio/blogs`, uno por
// capacidad, sobre un solo `BordeDeBlogs`. El contrato que prueban estos casos no cambia: cada llamada se le pide al
// adaptador que la tiene ahora.
describe('el borde de la red (los adaptadores de @synergos/dominio/blogs)', () => {
  function createClient() {
    TestBed.configureTestingModule({});
    const borde = TestBed.inject(BordeDeBlogs);
    const contenido = TestBed.inject(ContenidoApi);
    const reacciones = TestBed.inject(ReaccionesApi);
    const seguidores = TestBed.inject(SeguidoresApi);
    const explorar = TestBed.inject(ExplorarApi);
    const mensajes = TestBed.inject(MensajesApi);
    const notificaciones = TestBed.inject(NotificacionesApi);
    const guardados = TestBed.inject(GuardadosApi);
    const estudio = TestBed.inject(EstudioApi);
    return {
      get degraded(): boolean {
        return borde.degraded;
      },
      feed: contenido.feed.bind(contenido),
      react: reacciones.react.bind(reacciones),
      follow: seguidores.follow.bind(seguidores),
      explore: explorar.explore.bind(explorar),
      trending: explorar.trending.bind(explorar),
      messages: mensajes.messages.bind(mensajes),
      thread: mensajes.thread.bind(mensajes),
      sendMessage: mensajes.sendMessage.bind(mensajes),
      notifications: notificaciones.notifications.bind(notificaciones),
      saved: guardados.saved.bind(guardados),
      studio: estudio.studio.bind(estudio),
    };
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
    const following = await client.follow('/api/blogs', 'a-1');
    expect(following).toBe(true);
    expect(client.degraded).toBe(false);
  });

  // ── EL QUE MUERDE: reaccionar, seguir y mandar un DM con la red caída LANZAN ──
  // Antes se llamaba «echoes the optimistic reaction state when the react endpoint is
  // down»: el nombre era el defecto (regla 19, UI#92).
  it('con la red caída reaccionar, seguir y mandar un DM lanzan y no devuelven el optimista', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();
    const fallo = { name: 'BlogsWriteFailedError' };

    await expect(client.react('/api/blogs', 'X1', 'like')).rejects.toMatchObject({
      ...fallo,
      endpoint: 'POST /api/blogs/post/{id}/react',
    });
    await expect(client.follow('/api/blogs', 'a-1')).rejects.toMatchObject(fallo);
    await expect(client.sendMessage('/api/blogs', { threadId: 't-valeria', body: 'hola' })).rejects.toMatchObject(
      fallo,
    );
    expect(client.degraded).toBe(false);
  });

  // Este caso probaba `search()`, que se quitó en #76: pedía `GET /api/blogs/search`, un endpoint
  // que no existe ni existió, así que sólo sabía degradar. Va por `explore()`, que es el que
  // `blogs.ts` llama y que comparte el mismo normalizador y el mismo mock — la cobertura del
  // filtro por hashtag se conserva, que es lo que hacía valioso este test.
  it('filters the mock explore results by hashtag when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.explore('/api/blogs', '', 'design');
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
      .sendMessage('/api/blogs', { threadId: 't-valeria', body: 'hola' })
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
