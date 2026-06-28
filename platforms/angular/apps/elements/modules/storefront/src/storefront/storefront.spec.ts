import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { ShopApiClient } from './shop-api.client';
import { ShopFulfillmentStrategy } from './shop-fulfillment.strategy';
import { StorefrontElementComponent } from './storefront';
import type { ShopProduct } from './shop.model';

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

const PRODUCT_A: ShopProduct = {
  id: 'P-A',
  title: 'Audífonos Pro',
  subtitle: 'Cancelación de ruido',
  amount: 500_000,
  currency: 'COP',
  brand: 'Sony',
  category: 'Audio',
  condition: 'new',
  freeShipping: true,
  rating: 4.7,
  reviewCount: 120,
  inStock: true,
  images: [],
  badges: ['Envío gratis'],
};

const PRODUCT_B: ShopProduct = {
  ...PRODUCT_A,
  id: 'P-B',
  title: 'Mouse Pro',
  amount: 200_000,
  brand: 'Logitech',
  category: 'Computación',
};

describe('StorefrontElementComponent', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  let component: StorefrontElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [StorefrontElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        ShopApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: ShopFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StorefrontElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Initial search runs in the constructor; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine storefront, cart empty, PLP view ─────────────────────────
  it('starts on the PLP with an empty cart (empty case)', async () => {
    installMemoryStorage();
    // Offline → mock catalogue; still a valid empty cart.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('plp');
    expect(component.cartCount()).toBe(0);
    expect(component.hasCart()).toBe(false);
    // Mock catalogue loaded → results present, degradation flagged.
    expect(component.products().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: add → cart → checkout wizard → pay → confirm ──────────────────────
  it('runs the full lifecycle to a single confirmation (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.quickAdd(PRODUCT_A);
    component.quickAdd(PRODUCT_B);
    await flushMicrotasks();

    expect(component.cartCount()).toBe(2);
    expect(component.hasCart()).toBe(true);
    expect(component.cartTotalMinor()).toBe((500_000 + 200_000) * 100);

    // Cart → checkout wizard.
    component.goToCheckout();
    expect(component.view()).toBe('checkout');
    expect(component.checkoutStep()).toBe('shipping');

    component.customerName.set('Ada Lovelace');
    component.customerEmail.set('ada@example.com');
    component.customerAddress.set('Calle 1 #2-3');
    component.customerCity.set('Bogotá');
    expect(component.shippingValid()).toBe(true);

    component.nextCheckoutStep();
    expect(component.checkoutStep()).toBe('payment');
    component.nextCheckoutStep();
    expect(component.checkoutStep()).toBe('review');

    component.placeOrder();
    await flushMicrotasks(30);

    expect(component.view()).toBe('confirmation');
    expect(component.orderNumber().length).toBeGreaterThan(0);
    expect(component.confirmedItems().length).toBeGreaterThan(0);
  });

  // ── filter: removing one line keeps the rest ─────────────────────────────────
  it('removes a single line from the cart without touching the rest (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.quickAdd(PRODUCT_A);
    component.quickAdd(PRODUCT_B);
    await flushMicrotasks();
    expect(component.cartLineCount()).toBe(2);

    const lineB = component.cartItems().find((item) => item.productRef === 'P-B')?.id ?? '';
    component.removeFromCart(lineB);
    await flushMicrotasks();

    const refs = component.cartItems().map((item) => item.productRef);
    expect(refs).toEqual(['P-A']);
    expect(component.cartTotalMinor()).toBe(500_000 * 100);
  });

  // ── idempotent: re-adding the same product+variant accumulates qty, one line ──
  it('re-adding the same product+variant keeps one line and accumulates qty (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.quickAdd(PRODUCT_A);
    component.quickAdd(PRODUCT_A);
    component.quickAdd(PRODUCT_A);
    await flushMicrotasks();

    // One line (deterministic id), qty accumulated to 3.
    expect(component.cartLineCount()).toBe(1);
    expect(component.cartCount()).toBe(3);
    expect(component.cartTotalMinor()).toBe(500_000 * 3 * 100);
  });

  // ── PDP: open a product, switch variant, change qty, add to cart ─────────────
  it('opens the PDP and adds the selected variant with quantity', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const first = component.products()[0];
    component.openProduct(first);
    await flushMicrotasks();

    expect(component.view()).toBe('pdp');
    expect(component.detail()).not.toBeNull();
    expect(component.selectedVariant()).not.toBeNull();

    component.changeQuantity(1);
    expect(component.pdpQuantity()).toBe(2);

    component.addCurrentToCart();
    await flushMicrotasks();
    expect(component.cartCount()).toBe(2);
  });

  // ── degradation: PLP falls back to visible mock catalogue ────────────────────
  it('degrades to a visible mock catalogue when the search endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.products().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });
});

describe('ShopApiClient', () => {
  function createClient(): ShopApiClient {
    TestBed.configureTestingModule({ providers: [ShopApiClient] });
    return TestBed.inject(ShopApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live faceted search response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              products: [
                { id: 'X1', title: 'Producto X', amount: 99_000, currency: 'COP', brand: 'Acme' },
              ],
              facets: [
                {
                  key: 'brand',
                  label: 'Marca',
                  values: [{ value: 'Acme', label: 'Acme', count: 1 }],
                },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.search(
      '/api/shop',
      { q: '', category: '', facets: {}, sort: 'relevance', page: 1 },
      'COP',
    );

    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe('X1');
    expect(result.facets).toHaveLength(1);
    expect(client.degraded).toBe(false);
  });

  it('opens a single checkout session and confirms the order (happy case)', async () => {
    const fetchMock = vi.fn((url: string) => {
      const body = url.endsWith('/checkout')
        ? { orderRef: 'ORD-1', paymentSessionId: 'psp_1', amount: 100, currency: 'COP' }
        : { status: 'confirmed', orderNumber: 'NUM-1', items: [] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    const checkout = await client.checkout(
      '/api/shop',
      [{ productId: 'X1', variantId: 'V1', qty: 1 }],
      { name: 'Ada', email: 'a@b.co' },
      100,
      'COP',
    );
    expect(checkout.orderRef).toBe('ORD-1');
    expect(checkout.paymentSessionId).toBe('psp_1');

    const confirmation = await client.confirm('/api/shop', 'ORD-1', []);
    expect(confirmation.status).toBe('confirmed');
    expect(confirmation.orderNumber).toBe('NUM-1');
  });

  it('filters the mock catalogue by selected facet when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.search(
      '/api/shop',
      { q: '', category: '', facets: { brand: ['Sony'] }, sort: 'relevance', page: 1 },
      'COP',
    );

    expect(client.degraded).toBe(true);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((product) => product.brand === 'Sony')).toBe(true);
  });
});
