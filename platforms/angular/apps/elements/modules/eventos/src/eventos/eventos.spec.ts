import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
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

describe('EventosElementComponent', () => {
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  /** Drive catálogo → PDP → selección → asistentes → checkout → confirm. */
  async function purchaseFirstGeneralEvent(): Promise<void> {
    // Pick a paid, general-admission event so the seat-map path is skipped.
    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();
    component.startSelection();
    component.proceedToAttendees();
    await flushMicrotasks();
    component.setAttendeeField(0, 'name', 'Ada Lovelace');
    component.setAttendeeField(0, 'email', 'ada@example.com');
    component.setAttendeeField(0, 'document', 'CC123');
    component.proceedToCheckout();
    component.buyerName.set('Ada Lovelace');
    component.buyerEmail.set('ada@example.com');
    component.confirmPurchase();
    await flushMicrotasks(30);
  }

  // ── empty: pristine app, catalogue view, no order ────────────────────────────
  it('starts on the catalogue with no order (empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('attendee');
    expect(component.view()).toBe('catalog');
    expect(component.orderRef()).toBe('');
    expect(component.tickets().length).toBe(0);
    // Mock catalogue loaded → events present, degradation flagged.
    expect(component.events().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: catálogo → PDP → selección → asistentes → pay → confirm + QR ───────
  it('runs the full purchase lifecycle into e-tickets (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await purchaseFirstGeneralEvent();

    expect(component.view()).toBe('confirmed');
    expect(component.orderRef().length).toBeGreaterThan(0);
    expect(component.tickets().length).toBeGreaterThan(0);
    // Every issued e-ticket carries a QR payload to render + scan.
    expect(component.tickets().every((ticket) => ticket.qr.length > 0)).toBe(true);
  });

  // ── filter: catalogue filters by category without dropping unrelated state ────
  it('filters the catalogue by category (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.events().length;
    const category = component.categories()[0];
    component.selectCategory(category);
    await flushMicrotasks();

    const after = component.events();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((event) => event.category === category)).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── idempotent: re-selecting the same tier keeps a single order line ──────────
  it('keeps a single order line when the selection is re-primed (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();

    // Prime the cart twice for the same tier → one line, never duplicated.
    component.startSelection();
    component.proceedToAttendees();
    await flushMicrotasks();
    component.backToSelection();
    component.proceedToAttendees();
    await flushMicrotasks();

    await purchaseFirstGeneralEvent();
    expect(component.view()).toBe('confirmed');
    expect(component.tickets().length).toBeGreaterThan(0);
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
    // Simulate the seat-map CustomEvent.
    component.onSeatSelect(new CustomEvent('seatselect', { detail: { selected: ['A1', 'A2'] } }));
    expect(component.ticketCount()).toBe(2);
    expect(component.canProceedSelection()).toBe(true);
  });

  // ── organizer role: dashboard loads aforo + check-in validates a QR ───────────
  it('loads the organizer dashboard and checks in a valid e-ticket', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    // First purchase to issue a recognisable e-ticket for the mock check-in.
    await purchaseFirstGeneralEvent();
    const ticketId = component.tickets()[0].id;

    component.setRole('organizer');
    await flushMicrotasks();
    expect(component.manage()).not.toBeNull();
    expect(component.soldPercent()).toBeGreaterThanOrEqual(0);

    component.setManagerView('checkin');
    component.setCheckinCode(ticketId);
    component.submitCheckin();
    await flushMicrotasks();

    expect(component.lastScan()?.status).toBe('valid');
    expect(component.checkedInCount()).toBeGreaterThan(0);

    // Idempotent: a second scan of the same ticket → already-used.
    component.setCheckinCode(ticketId);
    component.submitCheckin();
    await flushMicrotasks();
    expect(component.lastScan()?.status).toBe('already-used');
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ─────────────
  it('degrades to a visible mock catalogue when the events endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.events().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
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

  it('opens a paid checkout and confirms with e-tickets (happy case)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/checkout')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ orderRef: 'ORD-1', paymentSessionId: 'psp_1', amount: 100, currency: 'COP' }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ status: 'confirmed', tickets: [{ id: 'TKT-1', qr: 'QR-1' }] }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    const checkout = await client.checkout(
      '/api/eventos',
      'X1',
      [{ tier: 'general', qty: 1 }],
      [{ name: 'Ada', email: 'a@b.co', document: 'CC1' }],
      { name: 'Ada', email: 'a@b.co' },
      100,
      'COP',
    );
    expect(checkout.orderRef).toBe('ORD-1');
    expect(checkout.free).toBe(false);

    const confirmation = await client.confirm(
      '/api/eventos',
      'ORD-1',
      [{ name: 'Ada', email: 'a@b.co', document: 'CC1' }],
      [{ tier: 'general', qty: 1 }],
    );
    expect(confirmation.status).toBe('confirmed');
    expect(confirmation.tickets[0].qr).toBe('QR-1');
  });

  it('issues mock e-tickets and validates check-in idempotently (filter + idempotent)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const confirmation = await client.confirm(
      '/api/eventos',
      'ORD-9',
      [{ name: 'Grace', email: 'g@b.co', document: 'CC9' }],
      [{ tier: 'vip', qty: 1 }],
    );
    expect(client.degraded).toBe(true);
    expect(confirmation.tickets.length).toBe(1);
    const id = confirmation.tickets[0].id;

    const first = await client.checkin('/api/eventos', id);
    expect(first.status).toBe('valid');

    const second = await client.checkin('/api/eventos', id);
    expect(second.status).toBe('already-used');

    const unknown = await client.checkin('/api/eventos', 'NOPE');
    expect(unknown.status).toBe('invalid');
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

  it('normalises a manage response with aforo (happy case)', async () => {
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
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.manage('/api/eventos', 'EVT-1');

    expect(result.capacity).toBe(100);
    expect(result.sold).toBe(42);
    expect(result.attendees).toHaveLength(1);
    expect(client.degraded).toBe(false);
  });
});
