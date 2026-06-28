import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { TravelApiClient } from './travel-api.client';
import { TravelFulfillmentStrategy } from './travel-fulfillment.strategy';
import { TravelShellElementComponent } from './travel-shell';
import type { TravelOffer } from './travel.model';

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

const HOTEL_OFFER: TravelOffer = {
  offerId: 'OFR-HOTEL-1',
  product: 'hotel',
  title: 'Hotel Caribe',
  subtitle: 'Frente al mar',
  amount: 980_000,
  currency: 'COP',
  badges: ['Reembolsable'],
  detail: { title: 'Hotel Caribe' },
};

const FLIGHT_OFFER: TravelOffer = {
  offerId: 'OFR-FLIGHT-1',
  product: 'flight',
  title: 'BOG → CTG',
  subtitle: 'Directo · 1h 25m',
  amount: 412_000,
  currency: 'COP',
  badges: ['Sin escalas'],
  detail: { title: 'BOG → CTG' },
};

describe('TravelShellElementComponent', () => {
  let fixture: ComponentFixture<TravelShellElementComponent>;
  let component: TravelShellElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TravelShellElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        TravelApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: TravelFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TravelShellElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine shell, cart empty, hotel tab active ──────────────────────
  it('starts on the hotel tab with an empty unified cart (empty case)', async () => {
    installMemoryStorage();
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.phase()).toBe('shop');
    expect(component.activeProduct()).toBe('hotel');
    expect(component.cartCount()).toBe(0);
    expect(component.hasCart()).toBe(false);
    // No criteria yet → cannot search.
    expect(component.canSearch()).toBe(false);
  });

  // ── happy: search → add hotel → add flight → checkout → pay → confirm ─────────
  it('runs the full multi-product lifecycle to a single confirmation (happy case)', async () => {
    installMemoryStorage();
    await createComponent();

    // Add a hotel and a flight to the unified cart (heterogeneous lines).
    component.addToCart(HOTEL_OFFER);
    component.addToCart(FLIGHT_OFFER);
    await flushMicrotasks();

    expect(component.cartCount()).toBe(2);
    expect(component.hasCart()).toBe(true);
    // Pricing is aggregated in minor units (×100).
    expect(component.cartTotalMinor()).toBe((980_000 + 412_000) * 100);

    // Cart → checkout → guest → single pay.
    component.goToCheckout();
    expect(component.phase()).toBe('checkout');

    component.guestName.set('Ada Lovelace');
    component.guestEmail.set('ada@example.com');
    expect(component.guestValid()).toBe(true);

    component.pay();
    // The pay chain is longer (pay → setSession → confirm → state); drain generously.
    await flushMicrotasks(30);

    // One checkout for the whole mixed cart → confirmation with a code.
    expect(component.phase()).toBe('confirmation');
    expect(component.confirmationCode().length).toBeGreaterThan(0);
    expect(component.confirmedVouchers().length).toBeGreaterThan(0);
  });

  // ── filter: heterogeneous cart keeps each kind; removing one line is targeted ─
  it('removes a single line from the mixed cart without touching the rest (filter case)', async () => {
    installMemoryStorage();
    await createComponent();

    component.addToCart(HOTEL_OFFER);
    component.addToCart(FLIGHT_OFFER);
    await flushMicrotasks();
    expect(component.cartCount()).toBe(2);

    const flightId = component.cartItems().find((item) => item.kind === 'flight')?.id ?? '';
    component.removeFromCart(flightId);
    await flushMicrotasks();

    const kinds = component.cartItems().map((item) => item.kind);
    expect(kinds).toEqual(['hotel']);
    expect(component.cartTotalMinor()).toBe(980_000 * 100);
  });

  // ── idempotent: re-adding the same offer replaces, never duplicates ──────────
  it('re-adding the same offer is idempotent by line id (idempotent case)', async () => {
    installMemoryStorage();
    await createComponent();

    component.addToCart(HOTEL_OFFER);
    component.addToCart(HOTEL_OFFER);
    component.addToCart(HOTEL_OFFER);
    await flushMicrotasks();

    expect(component.cartCount()).toBe(1);
    expect(component.cartTotalMinor()).toBe(980_000 * 100);
  });

  // ── product tabs reset the result list ───────────────────────────────────────
  it('switching product tab clears the previous results', async () => {
    installMemoryStorage();
    await createComponent();

    component.selectProduct('flight');
    expect(component.activeProduct()).toBe('flight');
    expect(component.offers().length).toBe(0);
    expect(component.searched()).toBe(false);
  });

  // ── degradation: search with no backend falls back to visible mock offers ────
  it('degrades to visible mock offers when the search endpoint is unavailable', async () => {
    installMemoryStorage();
    // No fetch stub → the API client throws and falls back to mock data.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.hotelDestination.set('Cartagena');
    component.hotelCheckIn.set('2026-08-01');
    component.hotelCheckOut.set('2026-08-05');
    expect(component.canSearch()).toBe(true);

    component.search();
    await flushMicrotasks();

    expect(component.offers().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });
});

describe('TravelApiClient', () => {
  function createClient(): TravelApiClient {
    TestBed.configureTestingModule({ providers: [TravelApiClient] });
    return TestBed.inject(TravelApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live search response into offers (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              offers: [
                { offerId: 'X1', title: 'Hotel X', amount: 500_000, currency: 'COP', badges: ['a'] },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const offers = await client.search('/api/travel', 'hotel', { destination: 'CTG' }, 'COP');

    expect(offers).toHaveLength(1);
    expect(offers[0].offerId).toBe('X1');
    expect(offers[0].product).toBe('hotel');
    expect(client.degraded).toBe(false);
  });

  it('opens a single checkout session and confirms the order (happy case)', async () => {
    const fetchMock = vi.fn((url: string) => {
      const body = url.endsWith('/checkout')
        ? { orderRef: 'ORD-1', paymentSessionId: 'psp_1', amount: 100, currency: 'COP' }
        : { status: 'confirmed', confirmationCode: 'CODE-1', items: [] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    const checkout = await client.checkout(
      '/api/travel',
      [{ product: 'hotel', offerId: 'X1', detail: {} }],
      { name: 'Ada', email: 'a@b.co' },
      100,
      'COP',
    );
    expect(checkout.orderRef).toBe('ORD-1');
    expect(checkout.paymentSessionId).toBe('psp_1');

    const confirmation = await client.confirm('/api/travel', 'ORD-1', []);
    expect(confirmation.status).toBe('confirmed');
    expect(confirmation.confirmationCode).toBe('CODE-1');
  });
});
