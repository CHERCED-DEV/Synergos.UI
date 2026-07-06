import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { TravelApiClient } from './travel-api.client';
import { TravelFulfillmentStrategy } from './travel-fulfillment.strategy';
import { TravelShellElementComponent } from './travel-shell';

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

describe('TravelShellElementComponent (v2 sobre shells)', () => {
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
    await flushMicrotasks();
  }

  /** Search stays (hotel) offline → mock offers + degraded flag. */
  async function searchStays(): Promise<void> {
    component.selectProduct('hotel');
    component.hotelDestination.set('Cartagena');
    component.hotelCheckIn.set('2026-08-01');
    component.hotelCheckOut.set('2026-08-05');
    component.search();
    await flushMicrotasks();
    fixture.detectChanges();
  }

  /** Search flights offline → mock offers with fare families. */
  async function searchFlights(): Promise<void> {
    component.selectProduct('flight');
    component.flightOrigin.set('BOG');
    component.flightDestination.set('CTG');
    component.flightDepart.set('2026-08-01');
    component.flightReturn.set('2026-08-05');
    component.search();
    await flushMicrotasks();
    fixture.detectChanges();
  }

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── render + empty: pristine app, home view, cart empty ──────────────────────
  it('renders the home with the product tabs and an empty cart (render/empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('home');
    expect(component.activeProduct()).toBe('hotel');
    expect(component.cartCount()).toBe(0);
    expect(component.hasCart()).toBe(false);
    // The three search tabs render.
    const tabs = fixture.debugElement.queryAll(By.css('.travel__tab'));
    expect(tabs.length).toBe(3);
  });

  // ── tabs: switching product tab clears results ───────────────────────────────
  it('switches product tab and resets the previous results (tabs case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await searchFlights();
    expect(component.offers().length).toBeGreaterThan(0);
    expect(component.view()).toBe('flights');

    component.goHome();
    component.selectProduct('car');
    expect(component.activeProduct()).toBe('car');
    expect(component.offers().length).toBe(0);
    expect(component.searched()).toBe(false);
  });

  // ── cart: heterogeneous multi-item cart (stay + flight + car) ─────────────────
  it('builds a multi-item travel cart from stay + flight + car (cart case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    // Stay: open a mock stay ficha → add the selected rate.
    await searchStays();
    const firstStay = component.stayOffers()[0];
    component.openStay(firstStay);
    await flushMicrotasks();
    expect(component.stay()).not.toBeNull();
    component.addStayToCart();
    await flushMicrotasks();

    // Flight: pick fare + add.
    await searchFlights();
    expect(component.selectedFlight()).not.toBeNull();
    expect(component.fareFamilies().length).toBeGreaterThan(0);
    component.addFlightToCart();
    await flushMicrotasks();

    const kinds = component.cartItems().map((item) => item.kind).sort();
    expect(kinds).toEqual(['flight', 'hotel']);
    expect(component.cartCount()).toBe(2);
    expect(component.hasCart()).toBe(true);
    // Cross-sell nudges the missing product (car).
    expect(component.crossSell()).toBe('car');
  });

  // ── filter: removing one line keeps the rest ─────────────────────────────────
  it('removes a single line from the mixed cart without touching the rest (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await searchFlights();
    component.addFlightToCart();
    await flushMicrotasks();
    await searchStays();
    component.openStay(component.stayOffers()[0]);
    await flushMicrotasks();
    component.addStayToCart();
    await flushMicrotasks();
    expect(component.cartCount()).toBe(2);

    const flightId = component.cartItems().find((item) => item.kind === 'flight')?.id ?? '';
    component.removeFromCart(flightId);
    await flushMicrotasks();

    expect(component.cartItems().map((item) => item.kind)).toEqual(['hotel']);
  });

  // ── checkout: SH-3 wizard → pay → confirm → SH-10 wallet ──────────────────────
  it('runs the SH-3 wizard to a confirmation with credentials (checkout case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await searchFlights();
    component.addFlightToCart();
    await flushMicrotasks();

    component.guestName.set('Ada Lovelace');
    component.guestEmail.set('ada@example.com');
    expect(component.guestValid()).toBe(true);

    component.goToCheckout();
    fixture.detectChanges();
    expect(component.view()).toBe('checkout');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    expect(wizard.currentStep()?.id).toBe('viajeros');

    wizard.next(); // → pago
    fixture.detectChanges();
    wizard.next(); // → revisar
    fixture.detectChanges();
    wizard.next(); // submit → pay → confirm (mock degradado)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmationCode().length).toBeGreaterThan(0);
    expect(component.confirmationCredentials().length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── account: mis viajes (SH-4) + timeline + cancelar + wallet ─────────────────
  it('loads mis viajes, derives the timeline and cancels a trip (SH-4 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.view()).toBe('account');
    expect(component.trips().length).toBeGreaterThan(0);
    expect(component.walletCredentials().length).toBeGreaterThan(0);

    const upcoming = component.trips().find((trip) => trip.status === 'upcoming')!;
    const stages = component.tripStages(upcoming);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.some((stage) => stage.state === 'current' || stage.state === 'done')).toBe(true);

    expect(component.canCancel(upcoming)).toBe(true);
    component.cancelTrip(upcoming);
    await flushMicrotasks();
    expect(component.cancelReceipt(upcoming.ref)?.status).toBe('cancelled');
    expect(component.canCancel(upcoming)).toBe(false);
  });

  // ── degradation: search offline falls back to visible mock offers ────────────
  it('degrades to visible mock offers when the backend is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await searchStays();

    expect(component.offers().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── hash router: deep-links views ────────────────────────────────────────────
  it('deep-links views through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToAccount('credenciales');
    expect(window.location.hash).toBe('#/travel/cuenta/credenciales');
    expect(component.accountSection()).toBe('credenciales');

    // checkout sin carrito redirige a carrito.
    component.navigate('checkout');
    expect(component.view()).toBe('cart');
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

  it('normalises a live search response with fares + geo (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              offers: [
                {
                  offerId: 'X1',
                  title: 'Hotel X',
                  amount: 500_000,
                  currency: 'COP',
                  badges: ['a'],
                  geo: { lat: 10.4, lng: -75.5 },
                },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const offers = await client.search('/api/travel', 'hotel', { destination: 'CTG' }, 'COP');

    expect(offers).toHaveLength(1);
    expect(offers[0].offerId).toBe('X1');
    expect(offers[0].geo).toEqual({ lat: 10.4, lng: -75.5 });
    expect(client.degraded).toBe(false);
  });

  it('degrades stay + trips + cancel to visible mock data (degradation case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const stay = await client.stay('/api/travel', 'HMOCK-1', 'COP');
    expect(client.degraded).toBe(true);
    expect(stay.rates.length).toBeGreaterThan(0);
    expect(stay.amenities.length).toBeGreaterThan(0);

    const trips = await client.trips('/api/travel', 'ada', 'COP');
    expect(trips.length).toBeGreaterThan(0);
    expect(trips[0].items.length).toBeGreaterThan(0);

    const receipt = await client.cancel('/api/travel', 'TRIP-2026-0481');
    expect(receipt.status).toBe('cancelled');
  });

  it('opens a single checkout session and confirms with reservationIds (happy case)', async () => {
    const fetchMock = vi.fn((url: string) => {
      const body = url.endsWith('/checkout')
        ? { orderRef: 'ORD-1', paymentSessionId: 'psp_1', amount: 100, currency: 'COP' }
        : {
            status: 'confirmed',
            confirmationCode: 'CODE-1',
            items: [{ product: 'hotel', title: 'Hotel X', reference: 'HT-1', reservationId: 'RES-1' }],
          };
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

    const confirmation = await client.confirm('/api/travel', 'ORD-1', []);
    expect(confirmation.status).toBe('confirmed');
    expect(confirmation.items[0].reservationId).toBe('RES-1');
  });
});
