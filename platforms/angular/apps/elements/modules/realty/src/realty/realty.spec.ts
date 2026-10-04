import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { RealtyApiClient } from './realty-api.client';
import { RealtyFulfillmentStrategy } from './realty-fulfillment.strategy';
import { RealtyElementComponent } from './realty';
import { calculateMortgage } from './mortgage.calc';
import { asentar } from '../../../../../../tools/asentar';
import { REALTY_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = {
  apiBase: REALTY_SYNHOST.ejemplo.apiBase,
  defaultRatePercent: REALTY_SYNHOST.ejemplo.defaultRatePercent,
};

/** Minimal in-memory localStorage stand-in so the SessionStore can persist. */
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
  vi.stubGlobal('localStorage', mock);
  return store;
}

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 10): Promise<void> {
  await asentar(times);
}

type FetchDoble = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Un borde de realty que contesta las ESCRITURAS con la forma del de verdad y se apaga
 * por MÉTODO y ruta (UI#92 · UI#95; reglas 16 y 18).
 *
 * Las formas son las de `RealtyController` del CMS: `VisitResponse` envuelve un `VisitDto`
 * (con `visitId` e `id`, el `status` como lo serializa el enum —`Confirmed`— y `slot`
 * como objeto), `LeadResponse` es `{ leadId }`, `SavedSearchDto` va sin envoltorio y
 * `PublishListingResponse` es `{ listingId, id, status }`.
 *
 * **Los ids no se parecen a nada que el respaldo produzca** (regla 7): `visit_77`,
 * `lead_42`, `ss_9`, `L-77`. El `catch` de antes acuñaba `VIS-<ts>`, `LEAD-<ts>`, `SS-<ts>`
 * y `L-<ts>`, así que un test que sólo mirara «hay un id» pasaba con el defecto puesto.
 * Y el título de la visita es el del CATÁLOGO del servidor, no el que mandó la ficha.
 *
 * Las LECTURAS que no se declaran caen como hasta ahora —catálogo de muestra con su
 * cartel, que es legítimo (regla 4)—: lo que se prueba acá son las escrituras.
 */
function bordeDeEscrituras(opciones: { readonly caidas?: readonly string[] } = {}): {
  readonly fetchDoble: ReturnType<typeof vi.fn<FetchDoble>>;
  readonly llamadas: (clave: string) => number;
  readonly encender: (clave: string) => void;
} {
  const caidas = new Set(opciones.caidas ?? []);
  const vistas: string[] = [];
  const responder = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

  const fetchDoble = vi.fn<FetchDoble>((url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = new URL(String(url), 'http://borde.test').pathname.replace(/^\/api\/realty/, '');
    const clave = `${metodo} ${ruta}`;
    vistas.push(clave);
    if (caidas.has(clave)) {
      return Promise.reject(new Error('offline'));
    }
    const cuerpo = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    switch (clave) {
      case 'POST /visit':
        return responder(200, {
          visit: {
            visitId: 'visit_77',
            status: 'Confirmed',
            id: 'visit_77',
            listingId: cuerpo['listingId'],
            mode: cuerpo['mode'],
            listingTitle: 'Casa campestre en La Calera',
            slot: cuerpo['slot'],
          },
        });
      case 'POST /lead':
        return responder(200, { leadId: 'lead_42' });
      case 'POST /saved-search':
        return responder(200, {
          id: 'ss_9',
          label: cuerpo['label'],
          criteria: cuerpo['criteria'],
          savedAt: '2026-10-03T10:00:00+00:00',
          createdAt: '2026-10-03',
          operation: 'sale',
        });
      case 'POST /listing':
        return responder(200, { listingId: 'L-77', id: 'L-77', status: 'active' });
      default:
        return Promise.reject(new Error('offline'));
    }
  });

  return {
    fetchDoble,
    llamadas: (clave) => vistas.filter((vista) => vista === clave).length,
    encender: (clave) => {
      caidas.delete(clave);
    },
  };
}

describe('RealtyElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<RealtyElementComponent>;
  let component: RealtyElementComponent;

  /**
   * Monta el elemento como lo monta el CMS: el `config` llega DESPUÉS del constructor y ANTES del
   * primer ciclo. Por defecto, la configuración de negocio con los valores base del sitio.
   */
  async function createComponent(config: Record<string, unknown> = NEGOCIO_DEL_CMS): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RealtyElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        RealtyApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: RealtyFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RealtyElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // Initial search runs in ngOnInit; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });


  // ── El día es el LOCAL, no el de UTC ─────────────────────────────────────────
  //
  // Con `toISOString().slice(0, 10)`, desde las 19:00 de Bogotá «hoy» ya era mañana. Se fija la
  // zona del sitio (en una máquina en UTC los dos días coinciden y el test no exigiría nada) y el
  // reloj a las 22:30 locales; sólo se finge `Date`, los temporizadores siguen siendo reales.
  describe('el día LOCAL a las 22:30 de Bogotá', () => {
    const entorno = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    let zonaDeLaMaquina: string | undefined;
    beforeEach(() => {
      zonaDeLaMaquina = entorno['TZ'];
      entorno['TZ'] = 'America/Bogota';
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 3, 22, 30) });
    });
    afterEach(() => {
      vi.useRealTimers();
      if (zonaDeLaMaquina === undefined) {
        delete entorno['TZ'];
      } else {
        entorno['TZ'] = zonaDeLaMaquina;
      }
    });

    it('las franjas de visita empiezan MAÑANA en el calendario local, no un día después', async () => {
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-04');
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(component.availableDays()[0]).toBe('2026-10-04');
      expect(component.availableSlots()[0]).toEqual({ date: '2026-10-04', time: '09:00' });
    });
  });

  // ── empty: pristine portal, search view, mock catalogue, no favorites ─────────
  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/hipoteca';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/hipoteca');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.view()).toBe('mortgage');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    component.navigate('search');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1');
  });

  it('opens on the SH-1 + SH-8 search with seeded listings and no favorites (empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('demand');
    expect(component.view()).toBe('search');
    expect(component.favoriteCount()).toBe(0);
    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.discoveryFacets().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  /** PDP → asistente de visita con los datos llenos, parado en el último paso. */
  async function llegarAlUltimoPasoDeLaVisita(): Promise<CheckoutWizardComponent> {
    component.openListing(component.listings()[0]);
    await flushMicrotasks();
    expect(component.view()).toBe('pdp');

    component.startVisit();
    fixture.detectChanges();
    expect(component.view()).toBe('visit');

    component.selectSlot(component.availableSlots()[0]);
    component.visitName.set('Ada Lovelace');
    component.visitEmail.set('ada@example.com');
    component.visitPhone.set('3005551234');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    // mode → slot → contact → agendar.
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    return wizard;
  }

  const alertas = (): HTMLElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="alert"]'));

  // ── happy: PDP → SH-3 visit wizard → confirm (NO payment) ─────────────────────
  //
  // Corría con la red caída y lo que probaba era el `VIS-<ts>` que fabricaba el `catch`
  // (UI#92 · UI#95, regla 16). Hoy el borde de mentira contesta el `POST /visit` con la
  // forma de `VisitResponse`, y lo que se mira es un id que el respaldo NO puede producir.
  it('runs the full visit lifecycle through the SH-3 wizard, pago OFF (happy case)', async () => {
    installMemoryStorage();
    const borde = bordeDeEscrituras();
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();

    const wizard = await llegarAlUltimoPasoDeLaVisita();
    wizard.next(); // submit → pay (accepted no-op) → confirm (POST /visit)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmationReference()).toBe('visit_77');
    expect(component.myVisits().map((visit) => visit.id)).toEqual(['visit_77']);
    expect(borde.llamadas('POST /visit')).toBe(1);
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── UI#92 · UI#95: el POST caído NO agenda, lo dice una vez y deja reintentar ──
  it('con el POST /visit caído NO confirma: lo dice UNA vez, no anuncia nada y deja reintentar', async () => {
    installMemoryStorage();
    const borde = bordeDeEscrituras({ caidas: ['POST /visit'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const anunciadas: unknown[] = [];
    component.visitscheduled.subscribe((payload) => anunciadas.push(payload));

    const wizard = await llegarAlUltimoPasoDeLaVisita();
    const motivos: string[] = [];
    wizard.failed.subscribe((motivo) => motivos.push(motivo));
    wizard.next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    // La estrategia CONTESTA que no confirmó —la forma de EHR, #111—, no revienta.
    expect(motivos).toEqual(['visit-not-booked']);
    // Nada de «¡Visita agendada!»: la ficha sigue en el asistente, sin visita ni bandeja.
    expect(component.view()).toBe('visit');
    expect(component.confirmedVisit()).toBeNull();
    expect(component.myVisits()).toEqual([]);
    expect(anunciadas).toEqual([]);
    // Y se dice UNA vez (regla 55), con el texto de la visita y no el de un cobro.
    expect(alertas().map((alerta) => alerta.textContent?.trim())).toEqual([
      component.visitCheckoutConfig.confirmFailedMessage,
    ]);
    expect(wizard.errorMessage()).not.toContain('pago');

    // Lo tecleado sigue ahí y volver a pulsar reintenta: con el borde de vuelta, agenda.
    expect(component.visitName()).toBe('Ada Lovelace');
    borde.encender('POST /visit');
    wizard.next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmationReference()).toBe('visit_77');
    expect(borde.llamadas('POST /visit')).toBe(2);
    expect(anunciadas).toEqual([{ visitId: 'visit_77', listingId: component.listings()[0].id }]);
  });

  // ── #83: los dos selectores exclusivos los pinta `syn-segmented` ─────────────
  //
  // La modalidad eran dos <button> con sólo la clase `is-active`: el lector de pantalla
  // no sabía cuál estaba elegida. Se busca por ROL y NOMBRE —lo que recibe el lector—,
  // y lo que se mira al final es el ARGUMENTO del POST, no el estado de la pantalla.
  function radiosDe(nombre: string): HTMLButtonElement[] {
    const group = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `syn-segmented [role="radiogroup"][aria-label="${nombre}"]`,
    );
    expect(group).not.toBeNull();
    return Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
  }
  const marcado = (radios: HTMLButtonElement[]): (string | null)[] =>
    radios.map((radio) => radio.getAttribute('aria-checked'));

  it('la modalidad de la visita se elige con el teclado y viaja en el POST (#83)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    installMemoryStorage();
    // El POST lo contesta el borde con la forma de verdad: con la red caída la visita ya no
    // se confirma (UI#95), y lo que se lee al final es la modalidad que el SERVIDOR anotó.
    const borde = bordeDeEscrituras();
    const fetchMock = borde.fetchDoble;
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    component.openListing(component.listings()[0]);
    await flushMicrotasks();
    component.startVisit();
    fixture.detectChanges();

    const radios = radiosDe('Modalidad de la visita');
    expect(radios.map((radio) => radio.textContent?.trim())).toEqual(['Visita presencial', 'Video-tour']);
    expect(marcado(radios)).toEqual(['true', 'false']);

    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(marcado(radios)).toEqual(['false', 'true']);

    component.selectSlot(component.availableSlots()[0]);
    component.visitName.set('Ada Lovelace');
    component.visitEmail.set('ada@example.com');
    component.visitPhone.set('3005551234');
    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    wizard.next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    const post = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/visit') && init?.method === 'POST',
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.[1]?.body)).mode).toBe('video');
    expect(component.confirmedVisit()?.mode).toBe('video');
  });

  it('la operación es un radiogroup con estado, y cambiarla vuelve a buscar (#83)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const radios = radiosDe('Operación');
    expect(radios.map((radio) => radio.textContent?.trim())).toEqual(['Comprar', 'Arrendar']);
    expect(marcado(radios)).toEqual(['true', 'false']);

    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    await flushMicrotasks();

    expect(component.operation()).toBe('rent');
    expect(marcado(radios)).toEqual(['false', 'true']);
    expect(component.listings().every((listing) => listing.operation === 'rent')).toBe(true);

    // Una operación que no está en la lista se ignora: ni cambia ni dispara otra búsqueda.
    component.setOperation('permuta');
    expect(component.operation()).toBe('rent');
  });

  // ── filter: SH-1 criteria filters the catalogue by property type ──────────────
  it('filters the catalogue by type through the discovery criteria (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.listings().length;
    component.onCriteriaChange({ term: '', facets: { type: ['casa'] }, sort: 'relevance', page: 1 });
    await flushMicrotasks();

    const after = component.listings();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((listing) => listing.type === 'casa')).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── favorites: toggling ♥ builds the shortlist ───────────────────────────────
  it('builds a favorites shortlist through the P11 toggle', async () => {
    installMemoryStorage();
    // El catálogo sigue offline (cae al mock, que es lo que puebla `listings()`), pero
    // /favorite responde OK: este test mide la lista, no la ruta de fallo — esa tiene la
    // suya. Antes rechazaba TODO y el toggle iba en silencio por el camino del error.
    vi.stubGlobal('fetch', favoriteAwareFetch());
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id);
    await flushMicrotasks();
    expect(component.favoriteCount()).toBe(1);
    expect(component.isFavorite(listing.id)).toBe(true);
    expect(component.favoriteListings().length).toBe(1);

    component.toggleFavorite(listing.id);
    await flushMicrotasks();
    expect(component.favoriteCount()).toBe(0);
  });

  // ── favoritos: la persistencia REAL (camino feliz + reversión) ────────────────
  //
  // Lo que se mide aquí NO es que la estrella se encienda —eso ya lo hacía cuando la
  // acción era mentira—, sino que el SERVIDOR reciba la escritura, y que cuando la
  // rechaza la UI vuelva a su sitio en vez de quedarse encendida.

  /** Las llamadas a /favorite que vio el servidor, en orden: método + cuerpo. */
  function favoriteCalls(fetchMock: ReturnType<typeof vi.fn>): { method: string; listingId: string }[] {
    return fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/favorite'))
      .map(([, init]) => ({
        method: String((init as RequestInit)?.method ?? 'GET'),
        listingId: String(JSON.parse(String((init as RequestInit)?.body ?? '{}')).listingId ?? ''),
      }));
  }

  /** Catálogo offline (→ mock) pero /favorite OK, salvo que se pida lo contrario. */
  function favoriteAwareFetch(favoriteResponse?: () => Promise<Response>): ReturnType<typeof vi.fn> {
    return vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes('/favorite')) {
        return (
          favoriteResponse?.() ??
          Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ favorites: [] }) } as Response)
        );
      }
      void init;
      return Promise.reject(new Error('offline'));
    });
  }

  it('manda el favorito al servidor: POST al marcar y DELETE al desmarcar (happy)', async () => {
    installMemoryStorage();
    const fetchMock = favoriteAwareFetch();
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id);
    await flushMicrotasks();

    // La prueba de que la acción dejó de ser una señal local: hubo llamada, con el id.
    expect(favoriteCalls(fetchMock)).toEqual([{ method: 'POST', listingId: listing.id }]);
    expect(component.isFavorite(listing.id)).toBe(true);

    component.toggleFavorite(listing.id);
    await flushMicrotasks();
    expect(favoriteCalls(fetchMock)).toEqual([
      { method: 'POST', listingId: listing.id },
      { method: 'DELETE', listingId: listing.id },
    ]);
    expect(component.isFavorite(listing.id)).toBe(false);
  });

  it('revierte el favorito y lo dice cuando el servidor lo rechaza', async () => {
    installMemoryStorage();
    const fetchMock = favoriteAwareFetch(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id);
    // Optimista: se pinta ANTES de que el servidor conteste.
    expect(component.isFavorite(listing.id)).toBe(true);

    await flushMicrotasks();
    // …y como el servidor dijo que no, queda exactamente como estaba.
    expect(component.isFavorite(listing.id)).toBe(false);
    expect(component.favoriteCount()).toBe(0);
    expect(component.errorMessage()).toContain('No pudimos guardar el favorito');
    // Un fallo de escritura NO es "datos de ejemplo": ese aviso habla del catálogo.
    expect(component.unauthenticated()).toBe(false);
  });

  it('quitar un favorito también se revierte si el servidor lo rechaza', async () => {
    installMemoryStorage();
    let failing = false;
    const fetchMock = favoriteAwareFetch(() =>
      failing
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id);
    await flushMicrotasks();
    expect(component.isFavorite(listing.id)).toBe(true);

    failing = true;
    component.removeFavorite(listing.id);
    await flushMicrotasks();
    // Revierte al estado CONFIRMADO por el servidor (marcado), no al optimista.
    expect(component.isFavorite(listing.id)).toBe(true);
    expect(component.errorMessage()).toContain('No pudimos quitar el favorito');
  });

  it('un 401 al marcar favorito revierte Y lleva al panel de inicio de sesión', async () => {
    installMemoryStorage();
    const fetchMock = favoriteAwareFetch(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id);
    await flushMicrotasks();

    expect(component.isFavorite(listing.id)).toBe(false);
    expect(component.unauthenticated()).toBe(true);
    expect(component.view()).toBe('account');
    // Sin doble anuncio: manda la invitación a iniciar sesión, no un "algo falló" genérico.
    expect(component.errorMessage()).toBe('');
  });

  it('dos pulsaciones rápidas sobre el mismo inmueble no se cruzan', async () => {
    installMemoryStorage();
    // La PRIMERA respuesta se retiene y se suelta DESPUÉS de la segunda: es justo el
    // cruce que dejaría el servidor en "favorito" y la UI en "no".
    const gates: (() => void)[] = [];
    const fetchMock = favoriteAwareFetch(
      () =>
        new Promise<Response>((resolve) => {
          gates.push(() =>
            resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id); // marcar
    component.toggleFavorite(listing.id); // desmarcar, sin esperar a la anterior
    await flushMicrotasks();

    // El encadenamiento por id impide que la segunda salga antes que la primera:
    // hasta que el POST no vuelve, el DELETE ni se ha enviado.
    expect(favoriteCalls(fetchMock)).toEqual([{ method: 'POST', listingId: listing.id }]);

    gates.shift()?.();
    await flushMicrotasks();
    gates.shift()?.();
    await flushMicrotasks();

    // El servidor las recibió en el ORDEN en que el usuario las hizo, y gana la última.
    expect(favoriteCalls(fetchMock)).toEqual([
      { method: 'POST', listingId: listing.id },
      { method: 'DELETE', listingId: listing.id },
    ]);
    expect(component.isFavorite(listing.id)).toBe(false);
  });

  it('un fallo VIEJO no pisa la última intención del usuario', async () => {
    installMemoryStorage();
    // El usuario pulsa tres veces seguidas. La PRIMERA escritura falla, pero para cuando
    // se sabe, el usuario ya decidió otra cosa dos veces: revertir ahí le borraría su
    // última decisión (que sí se guardó).
    const outcomes = [false, true, true];
    let call = 0;
    const fetchMock = favoriteAwareFetch(() => {
      const ok = outcomes[call] ?? true;
      call += 1;
      return Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve({}),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id); // ON  — fallará
    component.toggleFavorite(listing.id); // OFF
    component.toggleFavorite(listing.id); // ON  — la que manda
    await flushMicrotasks();

    expect(favoriteCalls(fetchMock).map((entry) => entry.method)).toEqual([
      'POST',
      'DELETE',
      'POST',
    ]);
    // Server y UI coinciden en la ÚLTIMA intención, y no se le echa la culpa de un
    // fallo que quedó superado.
    expect(component.isFavorite(listing.id)).toBe(true);
    expect(component.errorMessage()).toBe('');
  });

  it('dos escrituras seguidas que fallan las dos dejan la UI donde está el SERVIDOR', async () => {
    installMemoryStorage();
    // El caso que distingue "revertir a lo que había antes de este clic" de "revertir a lo
    // que el servidor confirmó". Ninguna de las dos escrituras llega: el servidor no tiene
    // el favorito, así que la UI tampoco puede tenerlo. Revertir al estado previo del
    // ÚLTIMO clic dejaría la estrella encendida sobre un servidor vacío — la misma mentira
    // otra vez, solo que más difícil de ver.
    const fetchMock = favoriteAwareFetch(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const listing = component.listings()[0];
    component.toggleFavorite(listing.id); // ON  — falla
    component.toggleFavorite(listing.id); // OFF — falla también
    await flushMicrotasks();

    expect(component.isFavorite(listing.id)).toBe(false);
    expect(component.favoriteCount()).toBe(0);
  });

  it('un fallo en un inmueble no revierte el favorito de otro', async () => {
    installMemoryStorage();
    const fetchMock = favoriteAwareFetch();
    vi.stubGlobal('fetch', fetchMock);
    await createComponent();

    const [first, second] = component.listings();
    component.toggleFavorite(first.id);
    await flushMicrotasks();

    // Ahora el segundo falla: solo ÉL debe desaparecer.
    vi.stubGlobal(
      'fetch',
      favoriteAwareFetch(() =>
        Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
      ),
    );
    component.toggleFavorite(second.id);
    await flushMicrotasks();

    expect(component.isFavorite(first.id)).toBe(true);
    expect(component.isFavorite(second.id)).toBe(false);
    expect(component.favoriteCount()).toBe(1);
  });

  it('rehidrata los favoritos que ya tenía el servidor al abrir la cuenta', async () => {
    installMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/saved')
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ searches: [], favorites: ['L-1', 'L-2'] }),
            } as Response)
          : Promise.reject(new Error('offline')),
      ),
    );
    await createComponent();

    // Antes el cliente TIRABA `favorites` del GET /saved y el favorito no volvía nunca.
    expect(component.favoriteCount()).toBe(0);
    component.navigate('account');
    await flushMicrotasks();
    expect(component.favoriteCount()).toBe(2);
    expect(component.isFavorite('L-1')).toBe(true);
  });

  // ── lead: contacting the agent lands a confirmation ──────────────────────────
  async function escribirLead(): Promise<void> {
    component.openListing(component.listings()[0]);
    await flushMicrotasks();
    component.openLead();
    component.leadName.set('Grace Hopper');
    component.leadEmail.set('grace@example.com');
    component.leadPhone.set('3009998877');
    component.leadMessage.set('Me interesa esta propiedad, más info por favor.');
    expect(component.leadValid()).toBe(true);
  }

  it('submits a lead to the agent and lands on the confirmation', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEscrituras().fetchDoble);
    await createComponent();
    await escribirLead();

    component.submitLead();
    await flushMicrotasks();
    expect(component.view()).toBe('confirmation');
    // El id del SERVIDOR (`LeadResponse.leadId`), no un `LEAD-<ts>` de aquí.
    expect(component.confirmedLeadId()).toBe('lead_42');
  });

  // ── UI#92: un lead que no llegó NO se confirma, y lo escrito se queda ─────────
  it('con el POST /lead caído no dice «¡Mensaje enviado!» y conserva lo escrito', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEscrituras({ caidas: ['POST /lead'] }).fetchDoble);
    await createComponent();
    await escribirLead();
    const anunciados: unknown[] = [];
    component.leadsubmitted.subscribe((payload) => anunciados.push(payload));

    component.submitLead();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.view()).toBe('pdp');
    expect(component.confirmedLeadId()).toBe('');
    expect(anunciados).toEqual([]);
    expect(component.leadOpen()).toBe(true);
    expect(component.leadMessage()).toBe('Me interesa esta propiedad, más info por favor.');
    expect(alertas().map((alerta) => alerta.textContent?.trim())).toEqual([
      'No pudimos enviar tu mensaje. Intenta de nuevo.',
    ]);
  });

  // ── agent console (SH-5): desk loads cartera + leads + agenda ─────────────────
  it('loads the SH-5 agent console with cartera, leads and agenda', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('agent');
    await flushMicrotasks();
    expect(component.desk()).not.toBeNull();
    expect(component.consoleKpis().length).toBeGreaterThan(0);
    expect(component.consoleRows().length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('/agente');

    component.onAgentSectionChange('leads');
    expect(component.agentView()).toBe('leads');
    expect(component.consoleColumns()).toBe(component.leadColumns);
  });

  // ── publish (SH-6): authoring wizard publishes a listing ─────────────────────
  async function llenarPublicacion(): Promise<void> {
    component.setRole('agent');
    await flushMicrotasks();
    component.openPublish();
    expect(component.agentView()).toBe('publish');

    component.onPublishDraftChange({
      title: 'Apartamento de prueba',
      operation: 'sale',
      type: 'apartamento',
      city: 'Bogotá',
      neighborhood: 'Chapinero',
      price: '520000000',
      lat: '4.65',
      lng: '-74.06',
    });
    expect(component.publishValidity()['publicar']).toBe(true);
  }

  it('publishes a listing through the SH-6 authoring wizard', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEscrituras().fetchDoble);
    await createComponent();
    await llenarPublicacion();

    component.onPublished(component.createDraft());
    await flushMicrotasks();
    // El id que devolvió `PublishListingResponse`, no un `L-<ts>` de aquí.
    expect(component.publishResultId()).toBe('L-77');
  });

  // ── UI#92: un inmueble que no se publicó no se da por publicado ───────────────
  it('con el POST /listing caído no dice «Publicado con id…» y el borrador sobrevive', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEscrituras({ caidas: ['POST /listing'] }).fetchDoble);
    await createComponent();
    await llenarPublicacion();

    component.onPublished(component.createDraft());
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.publishResultId()).toBe('');
    expect(component.publishing()).toBe(false);
    expect(component.createDraft()['title']).toBe('Apartamento de prueba');
    expect(component.desk()?.portfolio.some((row) => row.title === 'Apartamento de prueba')).toBe(false);
    expect(alertas().map((alerta) => alerta.textContent?.trim())).toEqual([
      'No pudimos publicar el inmueble. Intenta de nuevo.',
    ]);
  });

  // ── UI#92: una búsqueda que no se guardó no aparece como guardada ─────────────
  it('guardar la búsqueda con el borde de verdad la apunta con su id; caído, no la apunta y lo dice', async () => {
    installMemoryStorage();
    const borde = bordeDeEscrituras({ caidas: ['POST /saved-search'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const antes = component.savedSearches().map((search) => search.id);

    component.saveCurrentSearch();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.savedSearches().map((search) => search.id)).toEqual(antes);
    expect(alertas().map((alerta) => alerta.textContent?.trim())).toEqual([
      'No pudimos guardar tu búsqueda. Intenta de nuevo.',
    ]);

    borde.encender('POST /saved-search');
    component.saveCurrentSearch();
    await flushMicrotasks();
    expect(component.savedSearches()[0]?.id).toBe('ss_9');
  });

  // ── hash router: deep-links views + the agent console ─────────────────────────
  it('deep-links views and the agent console through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToMortgage();
    expect(window.location.hash).toBe('#/realty/hipoteca');

    component.setRole('agent');
    expect(window.location.hash).toContain('/agente');
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ─────────────
  it('degrades to a visible mock catalogue when the listings endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.listings().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── 403 del agente: la consola NO se degrada a mock (los leads son PII ajena) ──
  it('no pinta la consola del agente con datos de ejemplo cuando el backend responde 403', async () => {
    installMemoryStorage();
    // Solo /agent/leads responde 403; el catálogo público sigue cayendo a mock a propósito.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/agent/leads')
          ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response)
          : Promise.reject(new Error('offline')),
      ),
    );
    await createComponent();

    component.setRole('agent');
    await flushMicrotasks();

    // 'forbidden', no 'anon': volver a iniciar sesión no le daría el rol.
    expect(component.agentAccess()).toBe('forbidden');
    expect(component.desk()).toBeNull();
    // Y el catálogo público sí degradó — las dos verdades conviven sin mezclarse.
    expect(component.listings().length).toBeGreaterThan(0);
  });

  // ── 401 del usuario: las búsquedas guardadas NO se inventan ───────────────────
  it('pide iniciar sesión en vez de inventar búsquedas guardadas cuando el backend responde 401', async () => {
    installMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/saved')
          ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)
          : Promise.reject(new Error('offline')),
      ),
    );
    await createComponent();

    component.goToAccount();
    await flushMicrotasks();

    expect(component.unauthenticated()).toBe(true);
    expect(component.savedSearches()).toHaveLength(0);
    // El badge de alertas se apaga: si no, seguiría contando matches de nadie.
    expect(component.savedAlertCount()).toBe(0);
  });

  // ── WCAG 2.4.3: el panel de acceso RECIBE el foco ─────────────────────────────
  // El bug que cierran: el markup ya traía `tabindex="-1"` + `#signinPanel`, pero ningún
  // .ts consumía la ref, así que el foco no se movía. El panel sustituye el contenido sin
  // avisar y el usuario de teclado se queda donde estaba (o en <body>), sin enterarse de
  // que hay un "Iniciar sesión" nuevo.
  it('un 401 en las búsquedas guardadas mueve el foco al CONTENEDOR del panel', async () => {
    installMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/saved')
          ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)
          : Promise.reject(new Error('offline')),
      ),
    );
    await createComponent();

    component.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    const panel = (fixture.nativeElement as HTMLElement).querySelector('.realty__signin');
    expect(panel).not.toBeNull(); // control: el panel se pintó de verdad
    // El CONTENEDOR, no el botón: el lector lee el título y el porqué ANTES que las acciones.
    expect(document.activeElement).toBe(panel);
    const loginLink = (fixture.nativeElement as HTMLElement).querySelector('.realty__signin a');
    expect(loginLink).not.toBeNull(); // control: sí había un botón al que enfocar por error
    expect(document.activeElement).not.toBe(loginLink);
  });

  it('un 403 en la consola del agente también enfoca el panel', async () => {
    installMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/agent/leads')
          ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response)
          : Promise.reject(new Error('offline')),
      ),
    );
    await createComponent();

    component.setRole('agent');
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    const panel = (fixture.nativeElement as HTMLElement).querySelector('.realty__signin');
    expect(panel).not.toBeNull();
    expect(document.activeElement).toBe(panel);
  });

  // El foco se mueve SOLO cuando la negativa viene de una acción del usuario: si colgara de
  // un effect que corre en cada cambio, se lo arrancaría al usuario mientras tabula.
  it('un re-render posterior NO le roba el foco al usuario dentro del panel', async () => {
    installMemoryStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/saved')
          ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)
          : Promise.reject(new Error('offline')),
      ),
    );
    await createComponent();

    component.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();
    await flushMicrotasks();

    const loginLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.realty__signin a',
    );
    loginLink?.focus();
    expect(document.activeElement).toBe(loginLink); // control: el foco se movió de verdad

    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(document.activeElement).toBe(loginLink);
  });

  // El CMS NO manda atributos sueltos: fusiona todos los props en UN `config='{...}'`.
  // Al llegar, el sanitizer RECONSTRUYE el objeto clave por clave, así que toda clave que
  // no esté en la whitelist se cae en silencio (sin error, sin warning) y la app pinta su
  // <h1> baked. Este test mira el DOM renderizado, no el signal: es el único que atrapa
  // que alguien quite `heading` de sanitizeConfig y deje el input() puesto (build verde,
  // título hardcodeado igual).
  it('pinta en el <h1> del hero el título que manda el CMS por `config`', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const heroTitle = (fixture.nativeElement as HTMLElement).querySelector('.realty__hero-title');
    // Control: sin config el hero trae el default, o sea el <h1> existe y lo estamos leyendo.
    expect(heroTitle?.textContent?.trim()).toBe('Encuentra tu próximo hogar en Colombia');

    fixture.componentRef.setInput('config', { heading: 'X', subheading: 'Y' });
    fixture.detectChanges();
    await flushMicrotasks();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.realty__hero-title')?.textContent?.trim(),
    ).toBe('X');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.realty__hero-sub')?.textContent?.trim(),
    ).toBe('Y');
  });

  // El mount real llega como STRING JSON en el atributo, no como objeto: el mismo camino
  // que recorre DefaultSynHostEmitter.
  it('acepta el `config` serializado tal cual lo emite el CMS', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    fixture.componentRef.setInput('config', JSON.stringify({ heading: 'Vive el Quindío' }));
    fixture.detectChanges();
    await flushMicrotasks();

    expect(component.heading()).toBe('Vive el Quindío');
    // Lo que el CMS no manda NO se pierde: el subtítulo cae al default de la plantilla.
    expect(component.subheading()).toBe(
      'Compra y arriendo · lista y mapa · calculadora de hipoteca · agenda tu visita',
    );
  });

  // ── SH-14: comparar desde los RESULTADOS, y el techo ─────────────────────────
  //
  // Se PULSA el botón en vez de llamar al método: lo que esta HU arregla es que
  // comparar sea alcanzable desde la lista —antes había que guardar en favoritos—,
  // y un spec que llamara a `toggleCompare(listing)` pasaría en verde con el botón
  // quitado (regla 5 de CLAUDE.md, aprendida en la #27).
  it('marca dos propiedades desde los resultados y la tabla aparece con su eje', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const botones = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.realty__cmp'),
      ) as HTMLButtonElement[];

    expect(botones().length).toBeGreaterThan(1);
    expect(fixture.nativeElement.querySelector('syn-compare-table')).toBeNull();

    botones()[0].click();
    fixture.detectChanges();
    // Con uno la pieza ya está montada, pero dice que hacen falta dos.
    expect(fixture.nativeElement.querySelector('syn-compare-table')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.syn-compare__table')).toBeNull();

    botones()[1].click();
    fixture.detectChanges();

    expect(component.compare.count()).toBe(2);
    expect(fixture.nativeElement.querySelector('.syn-compare__table')).not.toBeNull();
    // El eje es por atributo: una fila por característica, no un bloque por tarjeta.
    const filas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
    ).map((el) => el.textContent?.trim());
    expect(filas).toContain('Habitaciones');
    expect(filas).toContain('Área construida');
  });

  it('pasado el techo de cuatro NO se añade la quinta, y se dice por qué', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const botones = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.realty__cmp'),
    ) as HTMLButtonElement[];
    expect(botones.length).toBeGreaterThan(4);

    for (let i = 0; i < 5; i += 1) {
      botones[i].click();
    }
    fixture.detectChanges();

    expect(component.compare.count()).toBe(4);
    expect(component.compareMessage()).toContain('hasta 4 propiedades');
    // Y la quinta NO expulsó a la primera: las cuatro elegidas siguen ahí.
    expect(fixture.nativeElement.querySelector('.realty__compare-msg')).not.toBeNull();
  });

  it('quitar una hace hueco y borra el motivo anterior', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const listings = component.listings();
    for (let i = 0; i < 5; i += 1) {
      component.toggleCompare(listings[i]);
    }
    expect(component.compareMessage()).not.toBe('');

    component.removeFromCompare(listings[0].id);
    expect(component.compare.count()).toBe(3);
    expect(component.compareMessage()).toBe('');
  });

  // ── ADR 0137 (CMS#196): la tasa del simulador llega del sitio, no del bundle ────────────
  //
  // Era `DEFAULT_RATE = 12` compilado; ahora la manda el CMS desde `Synergos:Features:Realty`.

  it('el simulador arranca con la tasa del sitio: el config llega después del constructor', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    await createComponent({ ...NEGOCIO_DEL_CMS, defaultRatePercent: 10.5 });

    expect(component.mortgageRate()).toBe(10.5);
  });

  it('sin tasa configurada no inventa una cuota: el simulador espera a que la escriban', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    await createComponent({ apiBase: NEGOCIO_DEL_CMS.apiBase });

    expect(component.mortgageRate()).toBeNull();
    component.setMortgageRate(11);
    expect(component.mortgageRate()).toBe(11);
  });

  it('sin la base de la API no llama a nada y degrada a la muestra', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);

    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    expect(component.listings().length).toBeGreaterThan(0);
  });
});

describe('RealtyApiClient', () => {
  function createClient(): RealtyApiClient {
    TestBed.configureTestingModule({ providers: [RealtyApiClient] });
    return TestBed.inject(RealtyApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live listings response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              listings: [
                {
                  id: 'X1',
                  title: 'Apto X',
                  operation: 'sale',
                  type: 'apartamento',
                  price: 500_000_000,
                  currency: 'COP',
                  geo: { lat: 4.6, lng: -74.0, city: 'Bogotá' },
                },
              ],
              total: 1,
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.listings(
      '/api/realty',
      { q: '', operation: 'sale', type: '', minPrice: 0, maxPrice: 0, beds: 0, location: '', sort: 'relevance' },
      'COP',
    );

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].id).toBe('X1');
    expect(client.degraded).toBe(false);
  });

  const VISITA_PEDIDA = {
    listingId: 'L-1',
    slot: { date: '2026-07-10', time: '11:00' },
    contact: { name: 'Ada', email: 'a@b.co', phone: '3001112222' },
    mode: 'video' as const,
  };

  // ── UI#92 · UI#95: el caso feliz es lo que el endpoint DEVUELVE ──────────────
  it('agenda una visita con lo que contesta el borde (`VisitResponse`)', async () => {
    const borde = bordeDeEscrituras();
    vi.stubGlobal('fetch', borde.fetchDoble);
    const client = createClient();

    const visit = await client.scheduleVisit('/api/realty', VISITA_PEDIDA, 'Apartamento en Chicó');

    // `Confirmed` es como lo serializa el CMS (el enum con `ToString()`).
    expect(visit).toMatchObject({ id: 'visit_77', status: 'confirmed', listingId: 'L-1', mode: 'video' });
    expect(visit.listingTitle).toBe('Casa campestre en La Calera');
    expect(client.degraded).toBe(false);
  });

  // ── EL QUE MUERDE: con la red caída NO hay visita, ni confirmada ni de ejemplo ─
  it('con la red caída la visita NO se fabrica: lanza y no enciende el cartel de ejemplo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    await expect(client.scheduleVisit('/api/realty', VISITA_PEDIDA, 'Apartamento en Chicó')).rejects.toMatchObject({
      name: 'RealtyWriteFailedError',
      endpoint: 'POST /api/realty/visit',
    });
    // `degraded` dice «estás viendo datos de ejemplo»; aquí no se enseñó ninguno.
    expect(client.degraded).toBe(false);
  });

  it('un lead que el servidor aceptó entra en el CRM con SU id', async () => {
    vi.stubGlobal('fetch', bordeDeEscrituras().fetchDoble);
    const client = createClient();

    const lead = await client.submitLead(
      '/api/realty',
      { listingId: 'L-1', contact: { name: 'Grace', email: 'g@b.co', phone: '3009998877' }, message: 'Hola' },
      'Apartamento en Chicó',
    );
    expect(lead.leadId).toBe('lead_42');

    const desk = await client.agentDesk('/api/realty');
    expect(desk.leads.some((entry) => entry.id === 'lead_42')).toBe(true);
  });

  it('un lead que no llegó lanza y NO aparece en el CRM', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    await expect(
      client.submitLead(
        '/api/realty',
        { listingId: 'L-1', contact: { name: 'Grace', email: 'g@b.co', phone: '3009998877' }, message: 'Hola' },
        'Apartamento en Chicó',
      ),
    ).rejects.toMatchObject({ name: 'RealtyWriteFailedError' });

    // El escritorio sí degrada (es una LECTURA, con su cartel), pero sin el lead fantasma.
    const desk = await client.agentDesk('/api/realty');
    expect(client.degraded).toBe(true);
    expect(desk.leads.some((entry) => entry.name === 'Grace')).toBe(false);
  });

  it('una búsqueda que no se guardó lanza; un 401 sigue saliendo como 401', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();
    const pedida = {
      label: 'Venta en Bogotá',
      operation: 'sale' as const,
      criteria: { q: '', operation: 'sale' as const, type: '', minPrice: 0, maxPrice: 0, beds: 0, location: 'Bogotá', sort: 'relevance' as const },
      alert: true,
    };

    await expect(client.saveSearch('/api/realty', pedida)).rejects.toMatchObject({ name: 'RealtyWriteFailedError' });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)),
    );
    await expect(client.saveSearch('/api/realty', pedida)).rejects.toMatchObject({ name: 'RealtyUnauthorizedError' });
  });

  it('re-lanza el 401 de las búsquedas guardadas en vez de degradar a mock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)),
    );
    const client = createClient();

    await expect(client.savedSearches('/api/realty')).rejects.toMatchObject({
      // Discriminado por `name` — es lo que la UI mira, porque `instanceof` no cruza bundles.
      name: 'RealtyUnauthorizedError',
    });
    // Un 401 NO es "el backend no responde": el aviso de datos de ejemplo no debe encenderse.
    expect(client.degraded).toBe(false);
  });

  it('re-lanza el 403 del escritorio del agente y olvida los leads en memoria', async () => {
    // El lead lo ACEPTA el borde (desde UI#92 sólo entra en memoria lo que el servidor
    // aceptó); el escritorio contesta 403.
    const borde = bordeDeEscrituras();
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      String(url).includes('/agent/leads')
        ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response)
        : borde.fetchDoble(url, init),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    // Un lead dejado desde la ficha pública (con nombre y teléfono) queda en memoria…
    await client.submitLead(
      '/api/realty',
      { listingId: 'L-1', contact: { name: 'Grace', email: 'g@b.co', phone: '3009998877' }, message: 'Hola' },
      'Apartamento en Chicó',
    );

    await expect(client.agentDesk('/api/realty')).rejects.toMatchObject({
      name: 'RealtyForbiddenError',
    });

    // …y el 403 lo BORRA: si no, un fallo de red posterior (que sí degrada) lo repintaría
    // plegado en la cartera de quien no tiene el rol.
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    const desk = await client.agentDesk('/api/realty');
    expect(desk.leads.some((entry) => entry.name === 'Grace')).toBe(false);
  });

  const INMUEBLE_NUEVO = {
    title: 'Nuevo Apto',
    operation: 'sale' as const,
    type: 'apartamento' as const,
    price: 400_000_000,
    city: 'Cali',
    neighborhood: 'Granada',
    address: 'Cl 1',
    lat: 3.45,
    lng: -76.53,
    beds: 2,
    baths: 2,
    areaBuilt: 70,
    stratum: 5,
  };

  it('publishes a listing that surfaces in the cartera with the id the server gave it', async () => {
    vi.stubGlobal('fetch', bordeDeEscrituras().fetchDoble);
    const client = createClient();

    const result = await client.publishListing('/api/realty', INMUEBLE_NUEVO, 'COP');
    expect(result).toEqual({ id: 'L-77', status: 'active' });

    const desk = await client.agentDesk('/api/realty');
    expect(desk.portfolio.some((entry) => entry.id === 'L-77')).toBe(true);
  });

  it('un inmueble que no se publicó lanza y NO aparece en la cartera', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    await expect(client.publishListing('/api/realty', INMUEBLE_NUEVO, 'COP')).rejects.toMatchObject({
      name: 'RealtyWriteFailedError',
    });

    const desk = await client.agentDesk('/api/realty');
    expect(desk.portfolio.some((entry) => entry.title === 'Nuevo Apto')).toBe(false);
  });
});

describe('calculateMortgage', () => {
  it('computes a fixed-rate monthly payment (French amortization)', () => {
    const result = calculateMortgage(
      { price: 500_000_000, downPayment: 150_000_000, termMonths: 240, annualRatePercent: 12 },
      6,
    );
    expect(result.principal).toBe(350_000_000);
    expect(result.monthly).toBeGreaterThan(0);
    expect(result.totalPaid).toBeGreaterThan(result.principal);
    expect(result.schedule?.length).toBe(6);
  });

  it('degrades a 0% rate to straight-line and a fully-covered price to zero', () => {
    const zeroRate = calculateMortgage({ price: 120_000_000, downPayment: 0, termMonths: 12, annualRatePercent: 0 });
    expect(zeroRate.monthly).toBe(10_000_000);
    expect(zeroRate.totalInterest).toBe(0);

    const covered = calculateMortgage({ price: 100_000_000, downPayment: 100_000_000, termMonths: 60, annualRatePercent: 10 });
    expect(covered.monthly).toBe(0);
    expect(covered.principal).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// «Mis visitas»: el REGISTRO, no lo que se agendó en esta pestaña (#73)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Un borde de realty **con la forma del de verdad**, apagable por método y ruta.
 *
 * Hace falta por la regla 16: los specs de arriba stubean `fetch` para que rechace
 * SIEMPRE, así que el sistema bajo prueba es el camino degradado. Para «mis visitas» eso
 * no sirve ni de lejos — la bandeja **no degrada**, y el defecto que se cierra acá es
 * justamente que nunca hubo una respuesta de verdad con la que comparar.
 *
 * Reglas del fixture, y cada una tapa una mutación (regla 7):
 *
 *  - **Dos filas que NO se parecen**: una completa —título, hora y `video`— y otra a la
 *    que le falta todo lo que el registro puede no saber. Con dos completas, «pinta lo
 *    que llegó» y «rellena lo que falta» dan el mismo verde.
 *  - **`video` y no `in-person`** en la que sí tiene modalidad: es el valor que ningún
 *    default produce. Con `in-person`, reponerla o leerla se ven igual.
 *  - **El título de la completa NO se parece a su id**, para que un respaldo que
 *    compusiera «Inmueble L-9» se distinga de haber leído el que mandó el servidor.
 */
function servidorDeRealty(
  visitas: readonly unknown[],
  opciones: { readonly estado?: number } = {},
): (url: string, init?: RequestInit) => Promise<Response> {
  const responder = (status: number, body: unknown): Response =>
    ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

  return (url: string, init?: RequestInit) => {
    const ruta = String(url);
    const metodo = (init?.method ?? 'GET').toUpperCase();

    if (metodo === 'GET' && ruta.includes('/visits')) {
      return Promise.resolve(
        opciones.estado && opciones.estado !== 200
          ? responder(opciones.estado, { error: 'no' })
          : responder(200, { visits: visitas }),
      );
    }
    // El resto del portal contesta lo mínimo para que la cuenta se monte sin ruido: lo
    // que se prueba acá es la bandeja, no el catálogo.
    if (ruta.includes('/saved')) {
      return Promise.resolve(responder(200, { searches: [], favorites: [] }));
    }
    return Promise.resolve(responder(200, { listings: [], facets: [], total: 0 }));
  };
}

/** La visita COMPLETA: el registro lo sabe todo. */
const VISITA_COMPLETA = {
  id: 'visit_a1',
  visitId: 'visit_a1',
  listingId: 'L-9',
  listingTitle: 'Casa campestre en La Calera',
  mode: 'video',
  status: 'confirmed',
  slot: { date: '2026-10-01', time: '15:00' },
};

/** La visita a la que le falta TODO lo que el registro puede no saber. */
const VISITA_SIN_DATOS = {
  id: 'visit_b2',
  visitId: 'visit_b2',
  listingId: 'L-4',
  listingTitle: null,
  mode: null,
  status: 'confirmed',
  slot: null,
};

describe('RealtyElementComponent · mis visitas (#73)', () => {
  let fixture: ComponentFixture<RealtyElementComponent>;
  let component: RealtyElementComponent;

  async function montar(fetchDoble: unknown): Promise<void> {
    vi.stubGlobal('fetch', vi.fn(fetchDoble as never));
    await TestBed.configureTestingModule({
      imports: [RealtyElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        RealtyApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: RealtyFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RealtyElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', NEGOCIO_DEL_CMS);
    fixture.detectChanges();
    await flushMicrotasks();
  }

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── happy: la bandeja SOBREVIVE a la recarga, que es el defecto entero ────────
  it('trae del servidor las visitas de quien tiene la sesión (happy case)', async () => {
    installMemoryStorage();
    await montar(servidorDeRealty([VISITA_COMPLETA, VISITA_SIN_DATOS]));

    // Nadie agendó nada en ESTA pestaña: es exactamente el caso que antes daba una
    // bandeja vacía con el cartel «Todavía no tienes visitas agendadas».
    expect(component.myVisits().length).toBe(0);

    component.goToAccount();
    await flushMicrotasks();

    expect(component.visitsState()).toBe('ok');
    expect(component.myVisits().map((v) => v.id)).toEqual(['visit_a1', 'visit_b2']);
  });

  // ── EL QUE MUERDE: lo que el registro no sabe NO se rellena ───────────────────
  it('no inventa ni la modalidad ni el título ni la hora que no vinieron', async () => {
    installMemoryStorage();
    await montar(servidorDeRealty([VISITA_COMPLETA, VISITA_SIN_DATOS]));

    component.goToAccount();
    await flushMicrotasks();

    const [completa, vacia] = component.myVisits();

    // Lo que SÍ vino se lee tal cual — y `video` es el valor que ningún default produce.
    expect(completa.mode).toBe('video');
    expect(completa.listingTitle).toBe('Casa campestre en La Calera');
    expect(completa.slot).toEqual({ date: '2026-10-01', time: '15:00' });

    // Y lo que NO vino se queda en null. Un `in-person` acá le diría a quien pidió
    // videollamada que se desplace; un título compuesto con el id se leería como un
    // nombre; y una hora recalculada con la agenda de hoy sería plausible y falsa.
    expect(vacia.mode).toBeNull();
    expect(vacia.listingTitle).toBeNull();
    expect(vacia.slot).toBeNull();
    expect(component.visitModeLabel(vacia.mode)).toBe('');
  });

  // ── filter: un 401 NO es una bandeja vacía ───────────────────────────────────
  it('con 401 ofrece iniciar sesión en vez de decir que no tienes visitas', async () => {
    installMemoryStorage();
    await montar(servidorDeRealty([], { estado: 401 }));

    component.goToAccount();
    await flushMicrotasks();

    expect(component.visitsState()).toBe('anon');
    expect(component.myVisits()).toEqual([]);
    // El shell pinta su estado de error, no el vacío: «Todavía no tienes visitas
    // agendadas» dicho a un anónimo afirma algo sobre una cuenta que no se miró.
    expect(component.accountConfig().errorTitle).toContain('Inicia sesión');
    expect(component.accountConfig().errorMessage).toContain('tu cuenta');
  });

  // ── filter: el borde caído tampoco dice «no tienes ninguna» ───────────────────
  it('con el borde caído lo dice, y NO borra lo que se agendó en esta pestaña', async () => {
    installMemoryStorage();
    await montar(servidorDeRealty([], { estado: 500 }));

    // Una visita agendada en esta sesión, antes de ir a la cuenta.
    component.myVisits.set([
      { id: 'visit_local', listingId: 'L-1', listingTitle: 'Apartamento en Chicó',
        slot: { date: '2026-11-02', time: '09:00' }, mode: 'in-person', status: 'confirmed' },
    ]);

    component.goToAccount();
    await flushMicrotasks();

    expect(component.visitsState()).toBe('unreadable');
    // Vaciarla sería decirle «no tienes ninguna» a quien la acaba de agendar.
    expect(component.myVisits().map((v) => v.id)).toEqual(['visit_local']);
    expect(component.accountConfig().errorTitle).toContain('No pudimos');
    // Y el mensaje NO dice «no tienes ninguna»: dice que no se pudo leer, que es otra cosa.
    expect(component.accountConfig().errorMessage).toContain('no está disponible');
  });

  // ── idempotent: lo local y lo del servidor son la MISMA visita, no dos ────────
  it('fusiona por id: lo que ya está en el servidor no se duplica', async () => {
    installMemoryStorage();
    await montar(servidorDeRealty([VISITA_COMPLETA]));

    component.myVisits.set([
      { id: 'visit_a1', listingId: 'L-9', listingTitle: null,
        slot: null, mode: null, status: 'confirmed' },
    ]);

    component.goToAccount();
    await flushMicrotasks();

    // Una sola fila, y con lo que sabe el SERVIDOR: es la misma visita vista mejor.
    expect(component.myVisits().length).toBe(1);
    expect(component.myVisits()[0].listingTitle).toBe('Casa campestre en La Calera');
  });

  // ── el cliente, suelto: una forma que no se reconoce es un FALLO, no `[]` ─────
  it('una respuesta sin `visits` se rechaza en vez de contestar una bandeja vacía', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ nope: 1 }) } as Response)));
    TestBed.configureTestingModule({ providers: [RealtyApiClient] });
    const client = TestBed.inject(RealtyApiClient);

    // `[]` diría «no tienes ninguna», que es justo la afirmación que este método existe
    // para no hacer: la forma rota tiene que llegar a la UI como estado `unreadable`.
    await expect(client.myVisits('/api/realty')).rejects.toThrow('visits-shape');
  });
});
