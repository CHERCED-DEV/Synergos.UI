import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { RealtyApiClient } from './realty-api.client';
import { RealtyFulfillmentStrategy } from './realty-fulfillment.strategy';
import { RealtyElementComponent } from './realty';
import { calculateMortgage } from './mortgage.calc';

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
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('RealtyElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<RealtyElementComponent>;
  let component: RealtyElementComponent;

  async function createComponent(): Promise<void> {
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
    fixture.detectChanges();
    // Initial search runs in the constructor; let it settle.
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

  // ── empty: pristine portal, search view, mock catalogue, no favorites ─────────
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

  // ── happy: PDP → SH-3 visit wizard → confirm (NO payment) ─────────────────────
  it('runs the full visit lifecycle through the SH-3 wizard, pago OFF (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const first = component.listings()[0];
    component.openListing(first);
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
    // mode → slot → contact → agendar → submit (pay OFF → confirm).
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
      await flushMicrotasks();
    }
    wizard.next(); // submit → pay (accepted no-op) → confirm (schedule visit, mock)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmedVisit()).not.toBeNull();
    expect(component.myVisits().length).toBe(1);
    expect(window.location.hash).toContain('/confirmacion');
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
  it('submits a lead to the agent and lands on the confirmation', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openListing(component.listings()[0]);
    await flushMicrotasks();
    component.openLead();
    component.leadName.set('Grace Hopper');
    component.leadEmail.set('grace@example.com');
    component.leadPhone.set('3009998877');
    component.leadMessage.set('Me interesa esta propiedad, más info por favor.');
    expect(component.leadValid()).toBe(true);

    component.submitLead();
    await flushMicrotasks();
    expect(component.view()).toBe('confirmation');
    expect(component.confirmedLeadId().length).toBeGreaterThan(0);
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
  it('publishes a listing through the SH-6 authoring wizard', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

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

    component.onPublished(component.createDraft());
    await flushMicrotasks();
    expect(component.publishResultId().length).toBeGreaterThan(0);
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

  it('schedules a visit and degrades to a mock visit (no payment)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const visit = await client.scheduleVisit(
      '/api/realty',
      {
        listingId: 'L-1',
        slot: { date: '2026-07-10', time: '11:00' },
        contact: { name: 'Ada', email: 'a@b.co', phone: '3001112222' },
        mode: 'in-person',
      },
      'Apartamento en Chicó',
    );
    expect(client.degraded).toBe(true);
    expect(visit.status).toBe('confirmed');
    expect(visit.listingId).toBe('L-1');
  });

  it('degrades the agent desk + submits a lead that surfaces in the CRM', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const lead = await client.submitLead(
      '/api/realty',
      { listingId: 'L-1', contact: { name: 'Grace', email: 'g@b.co', phone: '3009998877' }, message: 'Hola' },
      'Apartamento en Chicó',
    );
    expect(lead.leadId.length).toBeGreaterThan(0);

    const desk = await client.agentDesk('/api/realty');
    expect(client.degraded).toBe(true);
    expect(desk.portfolio.length).toBeGreaterThan(0);
    // The just-submitted lead is folded into the CRM.
    expect(desk.leads.some((entry) => entry.id === lead.leadId)).toBe(true);
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
    const fetchMock = vi.fn((url: string) =>
      String(url).includes('/agent/leads')
        ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response)
        : Promise.reject(new Error('offline')),
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

  it('publishes a listing that surfaces in the cartera (mock)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.publishListing(
      '/api/realty',
      {
        title: 'Nuevo Apto',
        operation: 'sale',
        type: 'apartamento',
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
      },
      'COP',
    );
    expect(result.id.length).toBeGreaterThan(0);

    const desk = await client.agentDesk('/api/realty');
    expect(desk.portfolio.some((entry) => entry.id === result.id)).toBe(true);
  });
});

describe('calculateMortgage', () => {
  it('computes a fixed-rate monthly payment (French amortization)', () => {
    const result = calculateMortgage(
      { price: 500_000_000, downPayment: 150_000_000, termMonths: 240, annualRate: 12 },
      6,
    );
    expect(result.principal).toBe(350_000_000);
    expect(result.monthly).toBeGreaterThan(0);
    expect(result.totalPaid).toBeGreaterThan(result.principal);
    expect(result.schedule?.length).toBe(6);
  });

  it('degrades a 0% rate to straight-line and a fully-covered price to zero', () => {
    const zeroRate = calculateMortgage({ price: 120_000_000, downPayment: 0, termMonths: 12, annualRate: 0 });
    expect(zeroRate.monthly).toBe(10_000_000);
    expect(zeroRate.totalInterest).toBe(0);

    const covered = calculateMortgage({ price: 100_000_000, downPayment: 100_000_000, termMonths: 60, annualRate: 10 });
    expect(covered.monthly).toBe(0);
    expect(covered.principal).toBe(0);
  });
});
