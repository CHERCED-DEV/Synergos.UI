import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { EventosApiClient } from './eventos-api.client';
import { EventosFulfillmentStrategy } from './eventos-fulfillment.strategy';
import { EventosElementComponent } from './eventos';

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
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('EventosElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<EventosElementComponent>;
  let component: EventosElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EventosElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        EventosApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: EventosFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventosElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Initial catalogue search runs in the constructor; let it settle.
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

  /** Drive catálogo → SH-2 ficha → selección → carrito → SH-3 wizard → confirm. */
  async function purchaseFirstGeneralEvent(): Promise<void> {
    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();
    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();

    component.setAttendeeField(0, 'name', 'Ada Lovelace');
    component.setAttendeeField(0, 'email', 'ada@example.com');
    component.setAttendeeField(0, 'document', 'CC123');
    component.buyerName.set('Ada Lovelace');
    component.buyerEmail.set('ada@example.com');

    component.goToCheckout();
    fixture.detectChanges();

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    // asistentes → pago → revisar → submit (steps collapse for free events).
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
    }
    wizard.next(); // submit → pay → confirm (mock degradado)
    await flushMicrotasks(30);
    fixture.detectChanges();
  }

  // ── empty: pristine app, catalogue view, no order ────────────────────────────
  it('starts on the SH-1 catalogue with no order (empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('attendee');
    expect(component.view()).toBe('catalog');
    expect(component.orderRef()).toBe('');
    expect(component.tickets().length).toBe(0);
    expect(component.events().length).toBeGreaterThan(0);
    expect(component.discoveryFacets().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── el hero se COMPONE: el título del CMS llega por el JSON de `config` ───────
  it('pinta el heading/subheading que manda el CMS por `config` (no el baked)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const host = fixture.nativeElement as HTMLElement;
    // Baseline aditivo: sin config, el hero se ve EXACTAMENTE como antes.
    expect(host.querySelector('.eventos__hero-title')?.textContent?.trim()).toBe(
      'Vive los mejores eventos, sin complicarte',
    );

    // El emitter del CMS fusiona todo en UN atributo `config`; si el sanitizer no
    // lista la clave, ésta desaparece en silencio y el <h1> vuelve al default.
    fixture.componentRef.setInput('config', { heading: 'X', subheading: 'Y' });
    fixture.detectChanges();

    expect(component.config()?.heading).toBe('X');
    expect(host.querySelector('.eventos__hero-title')?.textContent?.trim()).toBe('X');
    expect(host.querySelector('.eventos__hero-sub')?.textContent?.trim()).toBe('Y');
  });

  // ── happy: catálogo → ficha → carrito(+fees) → SH-3 wizard → confirm + QR ─────
  it('runs the full purchase lifecycle through the SH-3 wizard into e-tickets (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await purchaseFirstGeneralEvent();

    expect(component.view()).toBe('confirmed');
    expect(component.orderRef().length).toBeGreaterThan(0);
    expect(component.tickets().length).toBeGreaterThan(0);
    expect(component.tickets().every((ticket) => ticket.qr.length > 0)).toBe(true);
    // Fees were applied on top of the ticket subtotal.
    expect(component.feesMinor()).toBeGreaterThan(0);
    expect(component.cartTotalMinor()).toBe(component.cartSubtotalMinor() + component.feesMinor());
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── filter: SH-1 criteria filters the catalogue by category ──────────────────
  it('filters the catalogue by category through the discovery criteria (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.events().length;
    const category = component.homeCategories()[0].value;
    component.openCategory(category);
    await flushMicrotasks();

    const after = component.events();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((event) => event.category === category)).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── idempotent: re-priming the same tier keeps a single order line ───────────
  it('keeps a single order line when the selection is re-primed (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();

    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();
    component.backToEvent();
    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();

    expect(component.cartItems().length).toBe(1);
  });

  // ── reserved seating: seat-map selection drives the ticket count ──────────────
  it('uses the seat selection to drive the ticket count for reserved events', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const reserved = component.events().find((e) => e.mode === 'reserved');
    expect(reserved).toBeDefined();
    component.openEvent(reserved!);
    await flushMicrotasks();
    expect(component.isReserved()).toBe(true);

    component.startSelection();
    component.onSeatSelect(new CustomEvent('seatselect', { detail: { selected: ['A1', 'A2'] } }));
    expect(component.ticketCount()).toBe(2);
    expect(component.canProceedSelection()).toBe(true);
  });

  // ── wallet (SH-10): a purchase surfaces in "mis tickets" + transfer ──────────
  it('surfaces the purchase in the SH-10 wallet and transfers a ticket', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await purchaseFirstGeneralEvent();
    component.goToWallet();
    await flushMicrotasks();

    expect(component.view()).toBe('wallet');
    expect(component.wallet().length).toBeGreaterThan(0);
    expect(component.walletCredentials().length).toBe(component.wallet().length);

    const ticketId = component.wallet()[0].id;
    component.openTransfer(ticketId);
    component.transferTo.set('nuevo@example.com');
    component.confirmTransfer();
    await flushMicrotasks();

    const transferred = component.wallet().find((t) => t.id === ticketId);
    expect(transferred?.status).toBe('transferred');
  });

  // ── organizer console (SH-5): dashboard aforo + check-in Válido/Ya-usado ─────
  it('loads the SH-5 organizer console and checks in a valid e-ticket idempotently', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    // First purchase to issue a recognisable e-ticket for the mock check-in.
    await purchaseFirstGeneralEvent();
    // T9: se entra con el TOKEN del QR, no con el id (que la UI imprime bajo el código).
    const ticketQr = component.tickets()[0].qr;

    component.setRole('organizer');
    await flushMicrotasks();
    expect(component.manage()).not.toBeNull();
    expect(component.soldPercent()).toBeGreaterThanOrEqual(0);
    expect(component.consoleKpis().length).toBeGreaterThan(0);
    expect(component.portfolioRows().length).toBeGreaterThan(0);

    component.onManagerSectionChange('checkin');
    component.checkinCode.set(ticketQr);
    component.submitCheckin();
    await flushMicrotasks();
    expect(component.lastScan()?.status).toBe('valid');
    expect(component.checkedInCount()).toBeGreaterThan(0);

    // Idempotent: a second scan of the same ticket → already-used.
    component.checkinCode.set(ticketQr);
    component.submitCheckin();
    await flushMicrotasks();
    expect(component.lastScan()?.status).toBe('already-used');
  });

  // ── create event (SH-6): authoring wizard publishes an event ─────────────────
  it('publishes a new event through the SH-6 authoring wizard', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('organizer');
    await flushMicrotasks();
    component.openCreateEvent();
    expect(component.managerView()).toBe('create');

    component.onCreateDraftChange({
      title: 'Festival Synergos 2026',
      city: 'Bogotá',
      startsAt: '2026-10-01T20:00',
      tierName: 'General',
      tierAmount: '80000',
      capacity: '500',
    });
    expect(component.createValidity()['publicar']).toBe(true);

    component.onCreatePublished(component.createDraft());
    await flushMicrotasks();
    expect(component.createResultSlug()).toContain('festival');
  });

  // ── hash router: deep-links a view + the organizer console ───────────────────
  it('deep-links views and the organizer console through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToWallet();
    expect(window.location.hash).toBe('#/eventos/mis-tickets');

    component.setRole('organizer');
    expect(window.location.hash).toContain('/organizador');
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ─────────────
  it('degrades to a visible mock catalogue when the events endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.events().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── T2-Eventos: la consola del organizador exige ROL ─────────────────────────
  // El bug que cierra: los 9 endpoints eran anónimos. Cualquiera abría el panel y veía
  // la lista de ASISTENTES con sus datos, publicaba eventos y quemaba entradas ajenas.
  async function bootOrganizer(status: 401 | 403): Promise<void> {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/manage/')) {
        return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: 'x' }) } as Response);
      }
      return Promise.reject(new Error('offline'));
    }));
    await createComponent();
    component.setRole('organizer');
    await flushMicrotasks();
  }

  it('pide iniciar sesión cuando el panel del organizador responde 401 (no mock)', async () => {
    await bootOrganizer(401);

    expect(component.organizerAccess()).toBe('anon');
    // Lo que importa: NINGÚN asistente a la vista.
    expect(component.manage()).toBeNull();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.eventos__denied-title');
    expect(panel?.textContent).toContain('Inicia sesión como organizador');
    expect(component.loginUrl()).toContain('/account/login?returnUrl=');
  });

  it('dice sin-permiso cuando responde 403 (el login no ayuda)', async () => {
    await bootOrganizer(403);

    expect(component.organizerAccess()).toBe('forbidden');
    expect(component.manage()).toBeNull();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.eventos__denied-title');
    expect(panel?.textContent).toContain('no tiene permiso de organizador');
    // 403: iniciar sesión NO ayuda → no se ofrece el enlace de login.
    expect((fixture.nativeElement as HTMLElement).querySelector('.eventos__denied a')).toBeNull();
  });

  // ── T7 Ola B: la consola ESCUCHA el canal del evento ─────────────────────────
  // El backend ya publicaba cada check-in (ADR 0111) y no había nadie escuchando.
  // jsdom no trae EventSource, así que se instala uno falso que además deja
  // comprobar lo que más importa: que la conexión se CIERRE.
  interface FakeSource {
    url: string;
    closed: boolean;
    emit(event: string, data: unknown): void;
  }

  function installFakeEventSource(): FakeSource[] {
    const created: FakeSource[] = [];
    class FakeEventSource {
      readonly #listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
      closed = false;
      constructor(readonly url: string) {
        created.push(this as unknown as FakeSource);
      }
      addEventListener(type: string, handler: (e: MessageEvent<string>) => void): void {
        this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), handler]);
      }
      close(): void {
        this.closed = true;
      }
      emit(type: string, data: unknown): void {
        for (const h of this.#listeners.get(type) ?? []) {
          h({ data: JSON.stringify(data) } as MessageEvent<string>);
        }
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    return created;
  }

  /** Abre la consola con el panel cargado (manage OK) y devuelve los streams creados. */
  async function bootOrganizerWithManage(): Promise<FakeSource[]> {
    const sources = installFakeEventSource();
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/manage/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            attendees: [
              { ticketId: 'TKT-1', name: 'Ada', email: 'a@b.co', tier: 'VIP', seat: '', state: 'pending' },
              { ticketId: 'TKT-2', name: 'Grace', email: 'g@b.co', tier: 'GEN', seat: '', state: 'pending' },
            ],
            capacity: 100,
            sold: 2,
          }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    }));
    await createComponent();
    component.setRole('organizer');
    await flushMicrotasks();
    return sources;
  }

  it('abre el canal del evento al cargar la consola', async () => {
    const sources = await bootOrganizerWithManage();

    expect(sources.length).toBe(1);
    expect(sources[0].url).toContain('/api/realtime/stream');
    expect(sources[0].url).toContain(encodeURIComponent('eventos:checkin:'));
    // Aún no dice "en vivo": el servidor no ha confirmado el canal.
    expect(component.liveConnected()).toBe(false);
  });

  it('un check-in de OTRA puerta actualiza la consola sin recargar', async () => {
    const sources = await bootOrganizerWithManage();
    const before = component.checkedInCount();

    sources[0].emit('ready', {});
    sources[0].emit('checkin', { status: 'valid', ticketId: 'TKT-1', attendee: 'Ada' });
    await flushMicrotasks();

    expect(component.liveConnected()).toBe(true);
    expect(component.checkedInCount()).toBe(before + 1);
    expect(component.manage()!.attendees.find((a) => a.ticketId === 'TKT-1')!.state).toBe('checked-in');
    // La otra fila no se toca.
    expect(component.manage()!.attendees.find((a) => a.ticketId === 'TKT-2')!.state).toBe('pending');
  });

  it('el eco del propio check-in NO infla el contador (idempotente)', async () => {
    const sources = await bootOrganizerWithManage();
    sources[0].emit('ready', {});

    sources[0].emit('checkin', { status: 'valid', ticketId: 'TKT-1', attendee: 'Ada' });
    await flushMicrotasks();
    const afterFirst = component.checkedInCount();

    // Mismo ticket otra vez (eco, o el operador que ya lo marcó): no vuelve a sumar.
    sources[0].emit('checkin', { status: 'valid', ticketId: 'TKT-1', attendee: 'Ada' });
    sources[0].emit('checkin', { status: 'already-used', ticketId: 'TKT-2', attendee: 'Grace' });
    await flushMicrotasks();

    expect(component.checkedInCount()).toBe(afterFirst);
  });

  it('cierra el canal al volver a la cara de asistente', async () => {
    const sources = await bootOrganizerWithManage();
    expect(sources[0].closed).toBe(false);

    component.setRole('attendee');
    await flushMicrotasks();

    // Sin esto queda una conexión abierta por cada ida y vuelta.
    expect(sources[0].closed).toBe(true);
    expect(component.liveConnected()).toBe(false);
  });

  it('un payload corrupto no tumba el stream', async () => {
    const sources = await bootOrganizerWithManage();
    sources[0].emit('ready', {});

    // Emitir algo que no es el shape esperado: no debe lanzar ni cambiar nada.
    sources[0].emit('checkin', { status: 'valid' }); // sin ticketId
    await flushMicrotasks();

    expect(component.checkedInCount()).toBe(0);
    expect(component.liveConnected()).toBe(true);
  });

});

describe('EventosApiClient', () => {
  function createClient(): EventosApiClient {
    TestBed.configureTestingModule({ providers: [EventosApiClient] });
    return TestBed.inject(EventosApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live catalogue response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              events: [
                { id: 'X1', title: 'Evento X', fromAmount: 99_000, currency: 'COP', city: 'Bogotá' },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.events(
      '/api/eventos',
      { q: '', category: '', city: '', sort: 'relevance' },
      'COP',
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('X1');
    expect(client.degraded).toBe(false);
  });

  it('issues mock e-tickets, seeds the wallet and validates check-in idempotently', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const confirmation = await client.confirm(
      '/api/eventos',
      'ORD-9',
      [{ name: 'Grace', email: 'g@b.co', document: 'CC9' }],
      [{ tier: 'vip', qty: 1 }],
      { eventId: 'EVT-1', eventTitle: 'Evento X', venueName: 'Ágora', startsAt: '2026-08-14T09:00:00' },
    );
    expect(client.degraded).toBe(true);
    expect(confirmation.tickets.length).toBe(1);
    const id = confirmation.tickets[0].id;
    // T9: la credencial es el token del QR, no el id.
    const qr = confirmation.tickets[0].qr;

    // The confirmed ticket is now in the wallet ("mis tickets").
    const wallet = await client.tickets('/api/eventos', 'g@b.co');
    expect(wallet.tickets.some((t) => t.id === id)).toBe(true);

    // Transfer invalidates the origin.
    const transfer = await client.transfer('/api/eventos', id, 'nuevo@b.co');
    expect(transfer.status).toBe('transferred');
    const walletAfter = await client.tickets('/api/eventos', 'g@b.co');
    expect(walletAfter.tickets.find((t) => t.id === id)?.status).toBe('transferred');

    // Check-in: first valid, second already-used, unknown invalid.
    const first = await client.checkin('/api/eventos', qr);
    expect(first.status).toBe('valid');
    const second = await client.checkin('/api/eventos', qr);
    expect(second.status).toBe('already-used');
    const unknown = await client.checkin('/api/eventos', 'NOPE');
    expect(unknown.status).toBe('invalid');
    // T9: el id suelto NO abre la puerta (la UI lo imprime bajo el QR).
    const bareId = await client.checkin('/api/eventos', id);
    expect(bareId.status).toBe('invalid');
  });

  it('returns a free checkout when the order total is zero (free case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const checkout = await client.checkout(
      '/api/eventos',
      'EVT-FREE',
      [{ tier: 'free', qty: 1 }],
      [],
      { name: 'Ada', email: 'a@b.co' },
      0,
      'COP',
    );

    expect(checkout.free).toBe(true);
    expect(checkout.amount).toBe(0);
    expect(checkout.paymentSessionId).toBe('');
  });

  it('normalises a manage response with aforo + portfolio (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              attendees: [
                { ticketId: 'TKT-1', name: 'Ada', email: 'a@b.co', tier: 'VIP', seat: '', state: 'pending' },
              ],
              capacity: 100,
              sold: 42,
              revenue: 5_000_000,
              portfolio: [{ id: 'EVT-1', title: 'Evento X', sold: 42, capacity: 100, revenue: 5_000_000 }],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.manage('/api/eventos', 'EVT-1');

    expect(result.capacity).toBe(100);
    expect(result.sold).toBe(42);
    expect(result.revenue).toBe(5_000_000);
    expect(result.portfolio).toHaveLength(1);
    expect(client.degraded).toBe(false);
  });

  it('degrades the wallet + create event to visible mocks', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const wallet = await client.tickets('/api/eventos', 'demo@b.co');
    expect(client.degraded).toBe(true);
    expect(wallet.tickets.length).toBeGreaterThan(0);

    const created = await client.createEvent('/api/eventos', {
      title: 'Mi Evento',
      category: 'Conferencia',
      city: 'Cali',
      venueName: 'Centro',
      startsAt: '2026-09-01T10:00',
      mode: 'general',
      capacity: 200,
      tiers: [{ name: 'General', amount: 50_000, capacity: 200 }],
    });
    expect(created.slug).toBe('mi-evento');
  });
});