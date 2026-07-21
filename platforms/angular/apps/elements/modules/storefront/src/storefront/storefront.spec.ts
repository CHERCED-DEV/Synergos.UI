import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
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
  seller: 'TecnoHub',
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
  seller: 'PeriferiCO',
};

describe('StorefrontElementComponent (v2 sobre shells)', () => {
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
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine storefront, home view, cart empty ────────────────────────
  it('starts on the home with an empty cart and degraded mock rails (empty case)', async () => {
    installMemoryStorage();
    // Offline → mock catalogue; still a valid empty cart.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('home');
    expect(component.cartCount()).toBe(0);
    expect(component.hasCart()).toBe(false);
    // Mock catalogue loaded → home rails present, degradation flagged.
    expect(component.products().length).toBeGreaterThan(0);
    expect(component.deals().length).toBeGreaterThan(0);
    expect(component.homeCategories().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: add → cart agrupado → SH-3 wizard → pay → confirm ─────────────────
  it('runs the full lifecycle through the SH-3 wizard to a confirmation (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.quickAdd(PRODUCT_A);
    component.quickAdd(PRODUCT_B);
    await flushMicrotasks();

    expect(component.cartCount()).toBe(2);
    expect(component.cartTotalMinor()).toBe((500_000 + 200_000) * 100);
    // Carrito agrupado por vendedor (multi-seller marketplace).
    expect(component.cartGroups().map((group) => group.seller).sort()).toEqual([
      'PeriferiCO',
      'TecnoHub',
    ]);

    component.customerName.set('Ada Lovelace');
    component.customerEmail.set('ada@example.com');
    component.customerAddress.set('Calle 1 #2-3');
    component.customerCity.set('Bogotá');
    expect(component.shippingValid()).toBe(true);

    component.goToCheckout();
    fixture.detectChanges();
    expect(component.view()).toBe('checkout');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    expect(wizard.currentStep()?.id).toBe('datos');

    wizard.next();
    fixture.detectChanges();
    expect(wizard.currentStep()?.id).toBe('pago');
    wizard.next();
    fixture.detectChanges();
    expect(wizard.currentStep()?.id).toBe('revisar');

    wizard.next(); // submit → pay → confirm (mock degradado)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.orderNumber().length).toBeGreaterThan(0);
    expect(component.confirmedItems().length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('/confirmacion');
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
    expect(component.cartGroups()).toHaveLength(1);
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

  // ── PDP (SH-2): open product, switch variant, qty, add, wishlist toggle ──────
  it('opens the PDP, adds the selected variant and toggles wishlist once (SH-2 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const first = component.products()[0];
    component.openProduct(first);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.view()).toBe('pdp');
    expect(component.detail()).not.toBeNull();
    expect(component.selectedVariant()).not.toBeNull();
    expect(window.location.hash).toContain(`/p/${first.id}`);

    component.changeQuantity(1);
    expect(component.pdpQuantity()).toBe(2);

    component.addCurrentToCart();
    await flushMicrotasks();
    expect(component.cartCount()).toBe(2);

    // Wishlist: toggle on + toggle on the same product stays a single entry.
    const product = component.detail()!.product;
    component.toggleWishlist(product);
    await flushMicrotasks();
    expect(component.isWished(product.id)).toBe(true);
    expect(component.wishlist()).toHaveLength(1);

    component.toggleWishlist(product);
    await flushMicrotasks();
    expect(component.isWished(product.id)).toBe(false);
    expect(component.wishlist()).toHaveLength(0);
  });

  // ── Account (SH-4): orders inbox + tracking timeline + return ────────────────
  it('loads mis compras, derives the tracking timeline and opens a return (SH-4 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.view()).toBe('account');
    expect(component.accountSection()).toBe('compras');
    expect(component.orders().length).toBeGreaterThan(0);

    const order = component.orders()[0];
    component.onOrderSelect(order);
    await flushMicrotasks();

    const stages = component.trackingStages(order.orderNumber);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.some((stage) => stage.state === 'current' || stage.state === 'done')).toBe(true);

    // Return flow (mock degradado → claim abierto), idempotente por orden.
    expect(component.canReturn(order)).toBe(true);
    component.startReturn(order);
    await flushMicrotasks();
    expect(component.returnReceipt(order.orderNumber)?.status).toBe('abierto');
    expect(component.canReturn(order)).toBe(false);

    // Sección mensajes (v1): threads mock cargados al cambiar de sección.
    component.onAccountSectionChange('mensajes');
    await flushMicrotasks();
    expect(component.threads().length).toBeGreaterThan(0);
  });

  // ── Hash router: deep-link a una vista ────────────────────────────────────────
  it('deep-links views through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToPlp();
    expect(window.location.hash).toBe('#/storefront/plp');

    component.goToAccount('favoritos');
    expect(window.location.hash).toBe('#/storefront/cuenta/favoritos');
    expect(component.accountSection()).toBe('favoritos');

    // checkout sin carrito redirige a carrito.
    component.navigate('checkout');
    expect(component.view()).toBe('cart');
  });

  // ── Reseñar (T10 Ola B): el formulario y el envío ───────────────────────────
  //
  // Lo que se prueba aquí no es que el formulario pinte, sino DOS invariantes:
  // (1) no se le ofrece a quien no puede reseñar, y (2) un envío que falla NO se
  // anuncia como publicado. Fingir una escritura que no ocurrió es el fallo que
  // ADR 0112 documenta en gov.mockDecide.
  describe('reseñar', () => {
    /** El cliente suelto: estos casos prueban el CONTRATO HTTP, sin montar el componente. */
    function reviewClient(): ShopApiClient {
      TestBed.configureTestingModule({ providers: [ShopApiClient] });
      return TestBed.inject(ShopApiClient);
    }

    it('NO ofrece el formulario cuando el servidor dice que no se puede', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      // En modo degradado canReview es false por diseño: el backend que decide
      // quién puede es justo el que no responde.
      expect(component.canReview()).toBe(false);
    });

    it('un 403 NO se anuncia como publicado, y no invita a iniciar sesión', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response)),
      );
      const client = reviewClient();

      const result = await client.submitReview('/api/shop', 'SKU-1', {
        rating: 5,
        title: 't',
        body: 'b',
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('not-buyer');
    });

    it('distingue 401 (entra) de 403 (compraste) de 400 (revisa) de caída de red', async () => {
      const client = reviewClient();
      const cases: ReadonlyArray<readonly [number | 'network', string]> = [
        [401, 'unauthenticated'],
        [403, 'not-buyer'],
        [400, 'invalid'],
        [500, 'failed'],
        ['network', 'failed'],
      ];

      for (const [status, expected] of cases) {
        vi.stubGlobal(
          'fetch',
          vi.fn(() =>
            status === 'network'
              ? Promise.reject(new Error('offline'))
              : Promise.resolve({ ok: false, status } as Response),
          ),
        );
        const result = await client.submitReview('/api/shop', 'SKU-1', {
          rating: 4,
          title: '',
          body: 'x',
        });
        expect(result.ok === false && result.reason).toBe(expected);
      }
    });

    it('un envío correcto se reporta como correcto', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)),
      );
      const client = reviewClient();

      const result = await client.submitReview('/api/shop', 'SKU-1', {
        rating: 5,
        title: 'Bueno',
        body: 'Cumple',
      });

      expect(result.ok).toBe(true);
    });

    it('sin nota o sin texto el envío ni se intenta', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      component.reviewRating.set(0);
      component.reviewBody.set('algo');
      expect(component.reviewReady()).toBe(false);

      component.reviewRating.set(4);
      component.reviewBody.set('   ');
      expect(component.reviewReady()).toBe(false);

      component.reviewBody.set('Cumple lo que promete.');
      expect(component.reviewReady()).toBe(true);
    });

    /** Ficha mínima para pintar la PDP, con el permiso que se quiera probar. */
    function abrirFicha(canReview: boolean): void {
      component.detail.set({
        product: { ...PRODUCT_A, id: 'SKU-1' },
        description: 'desc',
        variants: [],
        reviews: [],
        questions: [],
        canReview,
      });
      component.view.set('pdp');
      fixture.detectChanges();
    }

    it('con permiso del servidor, el formulario se PINTA con sus partes', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      abrirFicha(true);

      const form = fixture.nativeElement.querySelector('.storefront__review-form');
      expect(form).toBeTruthy();
      // Reusa el elemento de estrellas ya publicado, no un selector inventado.
      expect(form.querySelector('synergos-rating-stars')).toBeTruthy();
      expect(form.querySelector('#sf-review-title')).toBeTruthy();
      expect(form.querySelector('#sf-review-body')).toBeTruthy();
      // Sin nota ni texto no se puede enviar: el botón nace deshabilitado.
      expect(form.querySelector('.storefront__review-submit').disabled).toBe(true);
    });

    it('sin permiso del servidor NO se pinta, aunque la ficha esté abierta', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      abrirFicha(false);

      expect(fixture.nativeElement.querySelector('.storefront__review-form')).toBeNull();
      // …y las opiniones existentes se siguen leyendo: ocultar el formulario no oculta el bloque.
      expect(fixture.nativeElement.querySelector('.storefront__reviews')).toBeTruthy();
    });

    it('un 403 al enviar NO dice "publicada" y no ofrece iniciar sesión', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      component.reviewRating.set(5);
      component.reviewBody.set('Cumple lo que promete.');
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response)));

      await component.submitReview();

      expect(component.reviewFailed()).toBe(true);
      expect(component.reviewNotice()).toContain('compró');
      // Los dos fallos que importan: anunciar una escritura que no ocurrió…
      expect(component.reviewNotice()).not.toContain('publicada');
      // …y mandar a iniciar sesión por un problema que no es de sesión.
      expect(component.reviewNotice().toLowerCase()).not.toContain('inicia sesión');
      // El texto se conserva: perder lo escrito por un rechazo sería castigar dos veces.
      expect(component.reviewBody()).toBe('Cumple lo que promete.');
    });
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

  it('reads `total` from the response, not the page length', async () => {
    // The seam that matters: `total` drives pageCount in the shell, so a page of 1 out of 30
    // must report 30. Mistyping the key here (`totalCount`, `Total`) silently collapses the
    // pager to a single page and strands the rest of the catalogue — and nothing else in the
    // suite would notice, because every other test lets fetch reject into the mock.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              total: 30,
              products: [
                { id: 'X1', title: 'Producto X', amount: 99_000, currency: 'COP', brand: 'Acme' },
              ],
              facets: [],
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
    expect(result.total).toBe(30);
  });

  it('falls back to the page length when the backend omits `total`', async () => {
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
              facets: [],
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

    expect(result.total).toBe(1);
  });

  it('serialises multi-value facets as CSV and sends page>1', async () => {
    // The wire contract the backend parses: `values.join(',')`. The Tienda backend shipped a
    // bug where `category` was the one key it did not split, and two categories returned zero
    // — this asserts our half of that contract so a change here surfaces loudly.
    let requestedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        requestedUrl = String(input);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ products: [], facets: [], total: 0 }),
        } as Response);
      }),
    );

    const client = createClient();
    await client.search(
      '/api/shop',
      {
        q: 'laptop',
        category: '',
        facets: { category: ['Hogar', 'Deportes'], brand: ['Acme'] },
        sort: 'price-asc',
        page: 2,
      },
      'COP',
    );

    expect(requestedUrl).toContain('category=Hogar%2CDeportes');
    expect(requestedUrl).toContain('brand=Acme');
    expect(requestedUrl).toContain('page=2');
    expect(requestedUrl).toContain('q=laptop');
    expect(requestedUrl).toContain('sort=price-asc');
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

  it('degrades tracking to a status-coherent timeline and wishlist to a local store', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const tracking = await client.tracking('/api/shop', 'ORD-9', 'shipped');
    expect(client.degraded).toBe(true);
    expect(tracking.orderRef).toBe('ORD-9');
    expect(tracking.stages.find((stage) => stage.id === 'shipped')?.state).toBe('current');
    expect(tracking.stages.find((stage) => stage.id === 'paid')?.state).toBe('done');
    expect(tracking.stages.find((stage) => stage.id === 'delivered')?.state).toBe('pending');

    // Wishlist add + remove degradan a un store local coherente (idempotente).
    const entry = { productId: 'X1', title: 'Producto X', amount: 10, currency: 'COP' };
    let list = await client.wishlistMutate('/api/shop', entry, 'add');
    expect(list.map((line) => line.productId)).toEqual(['X1']);
    list = await client.wishlistMutate('/api/shop', entry, 'add');
    expect(list).toHaveLength(1);
    list = await client.wishlistMutate('/api/shop', entry, 'remove');
    expect(list).toHaveLength(0);

    // Return + messages degradan visibles.
    const receipt = await client.requestReturn('/api/shop', 'ORD-9', 'motivo');
    expect(receipt.status).toBe('abierto');
    const threads = await client.messages('/api/shop');
    expect(threads.length).toBeGreaterThan(0);
  });
});
