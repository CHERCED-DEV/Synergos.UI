import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { ShopApiClient } from './shop-api.client';
import { ShopFulfillmentStrategy } from './shop-fulfillment.strategy';
import { StorefrontElementComponent } from './storefront';
import type { ShopOrder } from './shop.model';
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
  /** Deja un producto en el carrito para poder descontar sobre algo. */
  async function agregarAlCarrito(): Promise<void> {
    component.quickAdd(PRODUCT_A);
    await flushMicrotasks();
    fixture.detectChanges();
  }

  // ── cupones y descuentos (#29) ───────────────────────────────────────────────
  //
  // El motor soportaba la línea negativa desde el primer día y ningún dominio la
  // emitía. Lo que estos casos guardan: que el descuento se VEA en el resumen, que
  // no se dé por aplicado sin el servidor, y que el total nunca quede bajo cero.
  function respuestaPromo(body: unknown, status = 200): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        } as Response),
      ),
    );
  }

  it('un cupón aceptado entra como línea NEGATIVA y baja el total', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    const antes = component.cartTotalMinor();
    expect(antes).toBeGreaterThan(0);

    respuestaPromo({ code: 'BIENVENIDA10', amountMinor: 500_000, label: 'Cupón BIENVENIDA10' });
    await component.applyPromo('BIENVENIDA10');

    expect(component.promo()?.code).toBe('BIENVENIDA10');
    // El backend mandó el descuento en POSITIVO; se fuerza el signo, porque
    // sumarlo se vería como un cargo sorpresa.
    expect(component.promo()?.amountMinor).toBe(-500_000);
    expect(component.cartTotalMinor()).toBe(antes - 500_000);

    // Y se VE: un total más bajo sin la línea que lo explica se lee como un error
    // de precio.
    const filas = component.cartSummaryRows().map((f) => f.id);
    expect(filas).toEqual(['subtotal', 'promo', 'total']);
  });

  it('quitar el cupón devuelve el total anterior', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = component.cartTotalMinor();

    respuestaPromo({ code: 'X', amountMinor: 100_000, label: 'Cupón X' });
    await component.applyPromo('X');
    expect(component.cartTotalMinor()).toBe(antes - 100_000);

    component.removePromo();
    expect(component.promo()).toBeNull();
    expect(component.cartTotalMinor()).toBe(antes);
    expect(component.cartSummaryRows()).toEqual([]);
  });

  it('un descuento mayor que el carrito NO deja el total bajo cero', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    respuestaPromo({ code: 'TODO', amountMinor: 999_999_999, label: 'Cupón TODO' });
    await component.applyPromo('TODO');

    // Un carrito que se debe a sí mismo no es un carrito, y el checkout lo
    // cobraría como un importe negativo.
    expect(component.cartTotalMinor()).toBe(0);
  });

  it('EL caso: un 200 sin descuento utilizable NO es un cupón aplicado', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = component.cartTotalMinor();

    // El servidor contesta OK y no manda importe.
    respuestaPromo({ code: 'VACIO' });
    await component.applyPromo('VACIO');

    // Decir que sí dejaría el total igual y al comprador creyendo que ahorró.
    expect(component.promo()).toBeNull();
    expect(component.promoRejection()).toBe('unknown');
    expect(component.cartTotalMinor()).toBe(antes);
  });

  it('el mínimo no alcanzado dice CUÁNTO falta', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    respuestaPromo({ reason: 'minimum-not-met', shortfallMinor: 1_200_000 }, 422);
    await component.applyPromo('GRANDE');

    expect(component.promoRejection()).toBe('minimum-not-met');
    // Es lo único accionable de ese rechazo.
    expect(component.promoDetail()).toContain('12.000');
  });

  it('cada estado del servidor tiene su motivo', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    const casos: Array<[number, unknown, string]> = [
      [404, null, 'unknown'],
      [410, null, 'expired'],
      [409, null, 'already-used'],
      [422, { reason: 'not-applicable' }, 'not-applicable'],
      [500, null, 'failed'],
    ];
    for (const [status, body, esperado] of casos) {
      respuestaPromo(body, status);
      await component.applyPromo('X');
      expect(component.promoRejection()).toBe(esperado);
    }
  });

  it('con el endpoint caído NO se aplica nada', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = component.cartTotalMinor();

    await component.applyPromo('LOQUESEA');

    // Un descuento fingido acá es una promesa de plata que el checkout rompe.
    expect(component.promo()).toBeNull();
    expect(component.promoRejection()).toBe('failed');
    expect(component.cartTotalMinor()).toBe(antes);
  });

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

  // ── config: el hero se COMPONE desde el CMS, no viene baked ──────────────────
  // El emitter del CMS no manda atributos sueltos: fusiona todo en UN `config`
  // JSON. Si `sanitizeConfig` deja de listar heading/subheading, las claves
  // desaparecen EN SILENCIO (sin error ni warning) y el <h1> vuelve al texto
  // hardcodeado. Este test monta por esa misma ruta —config como string JSON—
  // para que esa regresión salga en rojo.
  it('pinta en el hero el heading y el subheading que llegan en el JSON de config', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    fixture.componentRef.setInput(
      'config',
      JSON.stringify({ heading: 'X', subheading: 'Y' }),
    );
    fixture.detectChanges();

    expect(component.heading()).toBe('X');
    expect(component.subheading()).toBe('Y');

    const title = fixture.debugElement.query(By.css('.storefront__hero-title'));
    const sub = fixture.debugElement.query(By.css('.storefront__hero-sub'));
    expect(title.nativeElement.textContent.trim()).toBe('X');
    expect(sub.nativeElement.textContent.trim()).toBe('Y');
  });

  // ── config: sin CMS el hero queda IDÉNTICO (el cambio es puramente aditivo) ──
  it('cae a los textos por defecto del hero cuando el CMS no manda nada', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const title = fixture.debugElement.query(By.css('.storefront__hero-title'));
    const sub = fixture.debugElement.query(By.css('.storefront__hero-sub'));
    expect(title.nativeElement.textContent.trim()).toBe('Todo lo que buscas, en un solo lugar');
    expect(sub.nativeElement.textContent.trim()).toBe(
      'Envíos a todo el país · hasta 36 cuotas · compra protegida',
    );
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

    // Devolución (#32). Este bloque AFIRMABA EL DEFECTO: decía «mock degradado →
    // claim abierto» y comprobaba que un reclamo inventado en el cliente contaba
    // como abierto. Con el servidor caído no hay reclamo, y por tanto tampoco se
    // ofrece el botón — no se sabe si la línea ya tiene uno.
    const linea = order.items[0];
    expect(component.returnsUnknown(order)).toBe(true);
    expect(component.canReturnLine(order, linea)).toBe(false);

    component.openReturn(order.orderNumber, linea);
    await component.submitReturn();
    expect(component.claimForLine(order.orderNumber, linea)).toBeNull();
    expect(component.returnError()).not.toBe('');

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

    // La REGLA de «sin nota o sin texto no se envía» se mudó a SH-13 con #28 y
    // tiene su caso allá. Lo que sigue siendo de la Tienda es el CABLEADO: que el
    // botón de la pieza esté gateado de verdad en esta pantalla, y que un segundo
    // envío mientras el primero está en vuelo no salga.
    it('el botón de publicar sale gateado, y no se reenvía mientras hay uno en vuelo', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      const boton = fixture.nativeElement.querySelector(
        '.syn-reviews__submit',
      ) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);

      const panel = component.reviewPanel()!;
      panel.draftRating.set(4);
      panel.draftBody.set('Cumple lo que promete.');
      fixture.detectChanges();
      expect(boton.disabled).toBe(false);

      let envios = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          envios += 1;
          return new Promise(() => undefined); // nunca resuelve: deja el latch puesto
        }) as unknown as typeof fetch,
      );
      boton.click();
      fixture.detectChanges();
      boton.click();
      await flushMicrotasks();

      expect(envios).toBe(1);
    });

    /** Ficha mínima para pintar la PDP, con el permiso que se quiera probar. */
    /** Tres reseñas con notas distintas, para que la distribución tenga forma. */
    const RESEÑAS = [
      { id: 'r1', author: 'Ana', rating: 5, title: 'Muy bien', body: 'Cumple', date: 'ayer' },
      { id: 'r2', author: 'Beto', rating: 4, title: '', body: 'Bien', date: 'ayer' },
      { id: 'r3', author: 'Cira', rating: 2, title: '', body: 'Regular', date: 'ayer' },
    ];

    function abrirFicha(canReview: boolean, reviews = RESEÑAS): void {
      component.detail.set({
        product: { ...PRODUCT_A, id: 'SKU-1' },
        description: 'desc',
        variants: [],
        reviews,
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

      const form = fixture.nativeElement.querySelector('.syn-reviews__form');
      expect(form).toBeTruthy();
      // Desde #28 la escala la pinta la pieza como radiogroup propio y no
      // `<synergos-rating-stars>`: un shell del catálogo no puede dar por
      // registrado un custom element del CDN.
      expect(form.querySelector('[role="radiogroup"]')).toBeTruthy();
      expect(form.querySelectorAll('[role="radio"]')).toHaveLength(5);
      expect(form.querySelector('textarea')).toBeTruthy();
      // Sin nota ni texto no se puede enviar: el botón nace deshabilitado.
      expect(form.querySelector('.syn-reviews__submit').disabled).toBe(true);
    });

    it('sin permiso del servidor NO se pinta, aunque la ficha esté abierta', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      abrirFicha(false);

      expect(fixture.nativeElement.querySelector('.syn-reviews__form')).toBeNull();
      // …y las opiniones existentes se siguen leyendo: ocultar el formulario no oculta el bloque.
      expect(fixture.nativeElement.querySelector('syn-review-panel')).toBeTruthy();
    });

    it('un 403 al enviar NO dice "publicada" y no ofrece iniciar sesión', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      // El borrador vive en SH-13 desde #28; la regla de negocio no cambió.
      const panel = component.reviewPanel();
      expect(panel).toBeTruthy();
      panel!.draftRating.set(5);
      panel!.draftBody.set('Cumple lo que promete.');
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response)));

      await component.submitReview({
        rating: 5,
        title: '',
        body: 'Cumple lo que promete.',
        criteria: {},
      });

      expect(component.reviewFailed()).toBe(true);
      expect(component.reviewNotice()).toContain('compró');
      // Los dos fallos que importan: anunciar una escritura que no ocurrió…
      expect(component.reviewNotice()).not.toContain('publicada');
      // …y mandar a iniciar sesión por un problema que no es de sesión.
      expect(component.reviewNotice().toLowerCase()).not.toContain('inicia sesión');
      // El texto se conserva: perder lo escrito por un rechazo sería castigar dos
      // veces. Ahora lo custodia la pieza, que no se limpia sola al enviar.
      expect(panel!.draftBody()).toBe('Cumple lo que promete.');
    });

    it('monta SH-13 y pinta la distribución que antes se calculaba sin usarse', () => {
      abrirFicha(true);

      expect(fixture.nativeElement.querySelector('syn-review-panel')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.storefront__review-form')).toBeNull();
      // `reviewSummary().distribution` existía desde siempre y ninguna plantilla
      // la usaba: cinco barras, una por estrella.
      expect(
        fixture.nativeElement.querySelectorAll('.syn-reviews__dist-row').length,
      ).toBe(5);
      expect(component.reviewPanelSummary().distribution?.map((b) => b.stars)).toEqual([
        5, 4, 3, 2, 1,
      ]);
    });
  });

  // ── moderación: el acuse dice la verdad (#31) ────────────────────────────────
  describe('reseña en revisión', () => {
    /** Deja la PDP abierta con un producto que SÍ se puede reseñar. */
    async function abrirFichaReseñable(): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.openProduct(component.products()[0]);
      await flushMicrotasks();
      fixture.detectChanges();
    }

    it('EL caso: un 202 NO dice «publicada» y NO recarga la lista', async () => {
      await abrirFichaReseñable();
      const sku = component.detail()!.product.id;

      // Sólo el POST de la reseña contesta; cualquier recarga posterior se vería
      // como una llamada más a la ficha, que es justo lo que se comprueba.
      const llamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          llamadas.push(String(url));
          return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await component.submitReview({
        rating: 5,
        title: 'Muy bueno',
        body: 'Cumple lo que promete y llegó antes de lo previsto.',
        criteria: {},
      });

      expect(component.reviewNotice()).toContain('en revisión');
      expect(component.reviewNotice()).not.toContain('publicada');
      expect(component.reviewFailed()).toBe(false);
      // Ni una sola recarga de la ficha: traería la lista SIN la reseña, o sea la
      // prueba de que el acuse miente, en la misma pantalla.
      expect(llamadas.filter((u) => u.includes(`/product/${sku}`))).toEqual([]);
    });

    it('un 201 sí dice publicada y sí recarga', async () => {
      await abrirFichaReseñable();
      const sku = component.detail()!.product.id;

      const llamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          llamadas.push(String(url));
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await component.submitReview({
        rating: 5,
        title: 'Muy bueno',
        body: 'Cumple lo que promete y llegó antes de lo previsto.',
        criteria: {},
      });

      expect(component.reviewNotice()).toContain('publicada');
      expect(llamadas.some((u) => u.includes(`/product/${sku}`))).toBe(true);
    });

    it('reportar dos veces la misma no manda dos peticiones', async () => {
      await abrirFichaReseñable();

      let envios = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          envios += 1;
          return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await component.reportReview('rev-1');
      await component.reportReview('rev-1');

      expect(envios).toBe(1);
      expect(component.reportedReviewIds()).toEqual(['rev-1']);
      expect(component.reviewNotice()).toContain('Gracias por avisar');
    });

    it('«ya reportada» se trata como éxito: reintentar no arregla nada', async () => {
      await abrirFichaReseñable();
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) } as Response),
        ),
      );

      await component.reportReview('rev-9');

      expect(component.reportedReviewIds()).toEqual(['rev-9']);
      expect(component.reviewFailed()).toBe(false);
    });
  });

  // ── devoluciones y consola de vendedor (#32) ─────────────────────────────────
  describe('devoluciones', () => {
    /** Deja la cuenta abierta con pedidos y un servidor que contesta lo que se le diga. */
    async function abrirCuenta(responder: (url: string) => Response): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(responder(String(url)))));
      await createComponent();
      component.goToAccount();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    const json = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

    const RECLAMO = {
      claimId: 'rma_x1',
      orderRef: 'ORD-2026-00481',
      lineRef: 'SONY-XM5',
      productName: 'Audífonos Sony WH-1000XM5',
      quantity: 1,
      refundAmountFormatted: '$1.499.000',
      reason: 'damaged',
      status: 'abierto',
      requestedAt: '2026-09-12',
      updatedAt: '2026-09-12',
    };

    it('EL caso: el reclamo SOBREVIVE a recargar, y no se ofrece abrir otro', async () => {
      // El servidor ya tiene un reclamo abierto sobre la línea. Antes esto no se
      // leía nunca, así que al recargar el botón volvía y se abría un SEGUNDO.
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [RECLAMO] }) : json({}, 500),
      );

      const order = component.orders().find((o) => o.orderNumber === 'ORD-2026-00481')!;
      const linea = order.items[0];

      expect(component.returnsUnknown(order)).toBe(false);
      expect(component.claimForLine(order.orderNumber, linea)?.claimId).toBe('rma_x1');
      expect(component.canReturnLine(order, linea)).toBe(false);
    });

    it('EL caso: si NO se pudo leer, tampoco se ofrece — no se sabe si ya hay uno', async () => {
      await abrirCuenta(() => json({}, 500));

      const order = component.orders().find((o) => o.status === 'paid')!;
      expect(component.returnsUnknown(order)).toBe(true);
      expect(component.canReturnLine(order, order.items[0])).toBe(false);
    });

    it('EL caso: un POST fallido NO da el reclamo por abierto', async () => {
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [] }) : json({}, 500),
      );

      const order = component.orders().find((o) => o.status === 'paid')!;
      const linea = order.items[0];
      // Con la lectura en verde y sin reclamos, el botón SÍ se ofrece.
      expect(component.canReturnLine(order, linea)).toBe(true);

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            json({ error: 'Solo se puede devolver sobre una orden pagada.' }, 400),
          ),
        ),
      );
      component.openReturn(order.orderNumber, linea);
      await component.submitReturn();

      // Ni reclamo inventado ni pantalla que diga que se abrió.
      expect(component.claimForLine(order.orderNumber, linea)).toBeNull();
      // Y se enseña lo que dijo el servidor, no un genérico: lo escribió quien sabe.
      expect(component.returnError()).toContain('orden pagada');
      expect(component.canReturnLine(order, linea)).toBe(true);
    });

    it('manda lineId y el motivo ELEGIDO, no un literal fijo', async () => {
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [] }) : json({}, 500),
      );
      const order = component.orders().find((o) => o.status === 'paid')!;
      const linea = order.items[0];

      const cuerpos: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => {
          cuerpos.push(String(init?.body ?? ''));
          return Promise.resolve(json(RECLAMO));
        }),
      );

      component.openReturn(order.orderNumber, linea);
      component.setReturnReason('not-as-described');
      await component.submitReturn();

      const enviado = JSON.parse(cuerpos[0]) as { lineId: string; reason: string };
      // Sin `lineId` el borde contesta 400 — y contestaba 400 SIEMPRE, porque
      // este cuerpo no lo llevaba.
      expect(enviado.lineId).toBe('SONY-XM5');
      expect(enviado.reason).toBe('not-as-described');
      expect(component.claimForLine(order.orderNumber, linea)?.claimId).toBe('rma_x1');
    });
  });

  // ── el gate disjunto (#33) ───────────────────────────────────────────────────
  //
  // El botón era INALCANZABLE contra el backend real: pedía `delivered|shipped` y
  // el enum del CMS sólo tiene `Pending | Paid | Cancelled`. Lo único que lo hacía
  // aparecer eran los pedidos de ejemplo, que traían esos estados cableados.
  describe('cuándo se puede devolver', () => {
    async function conPedidos(responder: (url: string) => Response): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(responder(String(url)))));
      await createComponent();
      component.goToAccount();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    const json = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

    /**
     * Un pedido tal como lo emite el backend: el estado es uno de los TRES que el
     * enum tiene, y el permiso de devolver viene decidido por el servidor (#34) —
     * la UI ya no lo deduce de `status`.
     */
    const pedido = (status: ShopOrder['status'], canReturn = status === 'paid'): ShopOrder => ({
      orderNumber: 'ORD-REAL-1',
      date: '2026-09-01',
      status,
      total: 120_000,
      currency: 'COP',
      items: [
        {
          title: 'Cafetera',
          qty: 1,
          amount: 120_000,
          productId: 'SKU-CAF',
          canReturn,
          returnBlock: canReturn ? undefined : 'order-not-paid',
        },
      ],
    });

    const etapas = (entregado: boolean) => ({
      orderRef: 'ORD-REAL-1',
      stages: [
        { id: 'paid', label: 'Pago confirmado', state: 'done' },
        { id: 'preparing', label: 'En preparación', state: 'done' },
        { id: 'shipped', label: 'Enviado', state: entregado ? 'done' : 'current' },
        { id: 'delivered', label: 'Entregado', state: entregado ? 'done' : 'pending' },
      ],
    });

    it('EL caso: un pedido `paid` y entregado SÍ se puede devolver', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = component.orders()[0];
      expect(order.status).toBe('paid');
      component.onOrderSelect(order);
      await flushMicrotasks(10);

      // Antes esto era FALSO siempre: el gate pedía `delivered|shipped`, que el
      // backend no emite nunca.
      expect(component.canReturnLine(order, order.items[0])).toBe(true);
      expect(component.returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('EL caso: la entrega REFINA — si no llegó, no se ofrece y se dice por qué', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(false));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = component.orders()[0];
      component.onOrderSelect(order);
      await flushMicrotasks(10);

      expect(component.isDelivered(order)).toBe(false);
      expect(component.canReturnLine(order, order.items[0])).toBe(false);
      expect(component.returnBlockedReason(order, order.items[0])).toContain('cuando llegue');
    });

    it('EL caso: si el SEGUIMIENTO no se pudo leer, se ofrece igual', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json({}, 500);
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = component.orders()[0];
      // Sin pedir el seguimiento: no hay etapas que mirar.
      expect(component.trackingStages(order.orderNumber)).toHaveLength(0);
      // La condición del servidor se cumple, así que el botón NO va a rebotar.
      // Bloquear la devolución porque se cayó el seguimiento cambiaría un problema
      // de información por uno de negocio.
      expect(component.canReturnLine(order, order.items[0])).toBe(true);
    });

    it('EL caso: manda el SERVIDOR — sin su permiso no se ofrece, aunque todo lo demás cuadre', async () => {
      // Pedido `paid`, entregado, sin reclamos: todo lo que la UI sabía mirar
      // dice que sí. Pero el servidor dice que no, y el servidor es el que aplica
      // el POST. Deducirlo acá es lo que produjo el #33.
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid', false)] });
      });

      const order = component.orders()[0];
      component.onOrderSelect(order);
      await flushMicrotasks(10);

      expect(order.status).toBe('paid');
      expect(component.isDelivered(order)).toBe(true);
      expect(component.canReturnLine(order, order.items[0])).toBe(false);
    });

    it('y el motivo lo NOMBRA el servidor: «ya hay un reclamo» se explica', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({
          orders: [
            {
              ...pedido('paid'),
              items: [
                {
                  title: 'Cafetera',
                  qty: 1,
                  amount: 120_000,
                  productId: 'SKU-CAF',
                  canReturn: false,
                  returnBlock: 'already-open',
                },
              ],
            },
          ],
        });
      });

      const order = component.orders()[0];
      component.onOrderSelect(order);
      await flushMicrotasks(10);

      expect(component.returnBlockedReason(order, order.items[0])).toContain('reclamo abierto');
    });

    it('un motivo que no le sirve a quien compró no se pinta', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('cancelled', false)] });
      });

      const order = component.orders()[0];
      component.onOrderSelect(order);
      await flushMicrotasks(10);

      // `order-not-paid`: a quien canceló no hay que contarle que no puede
      // devolver lo que nunca recibió.
      expect(component.returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('un pedido sin pagar o cancelado no se devuelve: el servidor lo rechaza', async () => {
      for (const estado of ['pending', 'cancelled'] as const) {
        await conPedidos((url) => {
          if (url.includes('/tracking')) return json(etapas(true));
          if (url.includes('/return')) return json({ returns: [] });
          return json({ orders: [pedido(estado)] });
        });

        const order = component.orders()[0];
        component.onOrderSelect(order);
        await flushMicrotasks(10);

        expect(component.canReturnLine(order, order.items[0])).toBe(false);
        // Y no se le explica nada: a quien canceló no hay que contarle que no
        // puede devolver lo que nunca recibió.
        expect(component.returnBlockedReason(order, order.items[0])).toBe('');
        TestBed.resetTestingModule();
      }
    });
  });

  describe('consola del vendedor', () => {
    async function abrirConsola(): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('seller');
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    it('la consola se monta y trae sus cuatro secciones', async () => {
      await abrirConsola();

      expect(component.view()).toBe('seller');
      expect(fixture.nativeElement.querySelector('syn-console-shell')).not.toBeNull();
      expect(component.sellerConfig().sections.map((s) => s.id)).toEqual([
        'orders',
        'returns',
        'reviews',
        'messages',
      ]);
    });

    it('EL caso: las devoluciones SIN atender van primero', async () => {
      await abrirConsola();

      // El escritorio de ejemplo llega con la de `en-revision` ANTES que la
      // `abierto`, así que esto sólo pasa si el orden se aplica de verdad.
      expect(component.sellerReturns().map((c) => c.status)).toEqual(['abierto', 'en-revision']);
    });

    it('EL caso: las opiniones reportadas van primero, con conteo o sin él', async () => {
      await abrirConsola();

      const cola = component.sellerModeration();
      expect(cola.map((i) => i.reason)).toEqual(['reported', 'reported', 'pending']);
      // La segunda reportada llega SIN conteo: sin esta fila, ordenar sólo por
      // conteo daría el mismo resultado y la regla del motivo no se vigilaría
      // (regla 7 de CLAUDE.md, aprendida en #31).
      expect(cola[1].reportCount).toBe(0);
    });

    it('EL caso: un avance fallido NO cambia el estado del reclamo', async () => {
      await abrirConsola();
      const antes = component.sellerReturns()[0];

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: 'No se puede pasar de abierto a recibido.' }),
          } as Response),
        ),
      );
      await component.advanceReturn(antes.claimId, 'received');

      // `refunded` mueve plata de verdad: pintar «Resuelto» sobre un POST que
      // falló diría que se devolvió algo que sigue donde estaba.
      expect(component.sellerReturns()[0].status).toBe(antes.status);
      expect(component.deskFailed()).toBe(true);
      expect(component.deskNotice()).toContain('abierto a recibido');
    });

    it('un avance aceptado toma el estado QUE DEVUELVE el servidor', async () => {
      await abrirConsola();
      const objetivo = component.sellerReturns()[0];

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({ ...objetivo, claimId: objetivo.claimId, status: 'en-revision' }),
          } as Response),
        ),
      );
      await component.advanceReturn(objetivo.claimId, 'approved');

      const despues = component
        .sellerReturns()
        .find((c) => c.claimId === objetivo.claimId)!;
      expect(despues.status).toBe('en-revision');
      expect(component.deskFailed()).toBe(false);
    });

    it('el escritorio de ejemplo se rotula: es una LECTURA degradada, no una mentira', async () => {
      await abrirConsola();

      expect(component.degraded()).toBe(true);
      expect(fixture.nativeElement.querySelector('syn-status-banner')).not.toBeNull();
    });
  });

  // ── SH-14 comparar (#30) ─────────────────────────────────────────────────────
  //
  // Se PULSA el botón: lo que esta HU entrega es que comparar sea ALCANZABLE desde
  // el catálogo, y un spec que llamara a `toggleCompare(product)` pasaría en verde
  // con el botón quitado (regla 5 de CLAUDE.md).
  describe('comparar', () => {
    const botones = (): HTMLButtonElement[] =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.storefront__cmp'),
      ) as HTMLButtonElement[];

    it('marca dos productos desde el catálogo y la ficha se alinea por atributo', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      // El catálogo vive en la PLP, no en el inicio.
      component.goToPlp();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(botones().length).toBeGreaterThan(1);
      expect(fixture.nativeElement.querySelector('.syn-compare__table')).toBeNull();

      botones()[0].click();
      botones()[1].click();
      fixture.detectChanges();

      expect(component.compare.count()).toBe(2);
      const filas = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
      ).map((el) => el.textContent?.trim());
      expect(filas).toContain('Marca');
      expect(filas).toContain('Condición');
    });

    it('un producto sin reseñas NO trae fila de calificación: nadie la dio', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.goToPlp();
      await flushMicrotasks();

      // Se fuerzan los dos candidatos a «sin reseñas»: el catálogo sembrado trae
      // valoraciones, y lo que se prueba es que un 0 no se escriba como «0,0».
      component.products.set(
        component
          .products()
          .slice(0, 2)
          .map((product) => ({ ...product, rating: 0, reviewCount: 0 })),
      );
      fixture.detectChanges();

      botones()[0].click();
      botones()[1].click();
      fixture.detectChanges();

      const filas = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
      ).map((el) => el.textContent?.trim());
      expect(filas).not.toContain('Calificación');
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

  // ── moderación (#31) ────────────────────────────────────────────────────────
  //
  // EL defecto: `response.ok` es cierto para TODO 2xx, así que un `202 Accepted`
  // —lo que contesta un borde que encola para revisión— se leía como publicación.
  function respuesta(status: number): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve({}),
        } as Response),
      ),
    );
  }

  it('EL caso: un 202 es «en revisión», no «publicada»', async () => {
    respuesta(202);
    const result = await createClient().submitReview('/api/shop', 'SKU-1', {
      rating: 5,
      title: 'Muy bueno',
      body: 'Cumple lo que promete y llegó antes.',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.pending).toBe(true);
  });

  it('un 201 sí es publicada', async () => {
    respuesta(201);
    const result = await createClient().submitReview('/api/shop', 'SKU-1', {
      rating: 5,
      title: 'Muy bueno',
      body: 'Cumple lo que promete y llegó antes.',
    });

    expect(result.ok && result.pending).toBe(false);
  });

  it('un 409 al reportar NO es un fallo: el servidor deduplica', async () => {
    respuesta(409);
    const result = await createClient().reportReview('/api/shop', 'r1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('already-reported');
  });

  it('reportar sin sesión NO se confunde con reportar y que falle', async () => {
    respuesta(401);
    // Un solo cliente: TestBed no admite reconfigurarse una vez instanciado.
    const client = createClient();
    expect((await client.reportReview('/api/shop', 'r1')) as unknown).toMatchObject({
      ok: false,
      reason: 'unauthenticated',
    });

    respuesta(500);
    expect((await client.reportReview('/api/shop', 'r1')) as unknown).toMatchObject({
      ok: false,
      reason: 'failed',
    });
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

    // El estado que se pasa es `paid` porque es el ÚNICO que un pedido comprado
    // puede valer: el enum del CMS tiene `Pending | Paid | Cancelled` y nada más.
    // La FASE la lleva el seguimiento, por pedido (#33).
    const tracking = await client.tracking('/api/shop', 'ORD-2026-00512', 'paid');
    expect(client.degraded).toBe(true);
    expect(tracking.orderRef).toBe('ORD-2026-00512');
    expect(tracking.stages.find((stage) => stage.id === 'shipped')?.state).toBe('current');
    expect(tracking.stages.find((stage) => stage.id === 'paid')?.state).toBe('done');
    expect(tracking.stages.find((stage) => stage.id === 'delivered')?.state).toBe('pending');

    // Y un pedido sin pagar NO avanza, esté donde esté en el mapa del ejemplo.
    const sinPagar = await client.tracking('/api/shop', 'ORD-2026-00481', 'pending');
    expect(sinPagar.stages.find((stage) => stage.id === 'delivered')?.state).toBe('pending');

    // Wishlist add + remove degradan a un store local coherente (idempotente).
    const entry = { productId: 'X1', title: 'Producto X', amount: 10, currency: 'COP' };
    let list = await client.wishlistMutate('/api/shop', entry, 'add');
    expect(list.map((line) => line.productId)).toEqual(['X1']);
    list = await client.wishlistMutate('/api/shop', entry, 'add');
    expect(list).toHaveLength(1);
    list = await client.wishlistMutate('/api/shop', entry, 'remove');
    expect(list).toHaveLength(0);

    // Los mensajes SÍ degradan visibles — son una lectura.
    const threads = await client.messages('/api/shop');
    expect(threads.length).toBeGreaterThan(0);

    // La devolución ya NO degrada (#32): es una escritura, y fingirla dejaba al
    // comprador con un número de reclamo que no existe en ninguna parte.
    const rechazo = await client.requestReturn('/api/shop', 'ORD-9', 'SKU-1', 'damaged');
    expect(rechazo.ok).toBe(false);
  });
});
