import { provideZonelessChangeDetection, type Provider, type ProviderToken, type Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { AccountShellComponent, CheckoutWizardComponent } from '@synergos/shells';
import { MUESTRAS_DE_LA_CUENTA, ResenasApi, ShopFulfillmentStrategy } from '@synergos/dominio/tienda';
import { ConfiguracionDeLaTienda, AvisosDeLaTienda, CatalogoDeLaTienda, ResenasDeLaTienda, DeseosDeLaTienda, MensajesDeLaTienda, PedidosDeLaTienda, DevolucionesDeLaTienda, EscritorioDeLaTienda, CarritoDeLaTienda, CompraDeLaTienda } from '@synergos/dominio/tienda';
import { CompraEnLaPagina } from './estado/compra-en-la-pagina';
import { NavegacionDeLaTienda } from './estado/navegacion';
import { PresentacionDeLaTienda } from './estado/presentacion';
import { TiendaCatalogoComponent } from './vistas/catalogo/catalogo';
import { TiendaFichaOpinionesComponent } from './vistas/ficha/opiniones/opiniones';
import { TiendaCarritoComponent } from './vistas/carrito/carrito';
import { TiendaCuentaComponent } from './vistas/cuenta/cuenta';
import { TiendaCuentaPedidoComponent } from './vistas/cuenta/pedido/pedido';
import { TiendaVendedorComponent } from './vistas/vendedor/vendedor';
import { StorefrontElementComponent } from './storefront';
import type { ShopOrder } from '@synergos/dominio/tienda';
import type { ShopProduct } from '@synergos/dominio/tienda';
import { asentar } from '../../../../../../tools/asentar';
import { STOREFRONT_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: STOREFRONT_SYNHOST.ejemplo.apiBase };

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
  await asentar(times);
}

type FetchDoble = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Un borde de la Tienda que contesta las ESCRITURAS con la forma del de verdad y se apaga
 * por MÉTODO y ruta (UI#92; reglas 16 y 18).
 *
 * Las formas son las de `ShopCatalogController` del CMS: `CheckoutResponse`,
 * `ConfirmResponse` —con `status: 'Paid'`, que es lo que contesta cuando capturó
 * (`ShopConfirmationResult`), y sus `OrderLineDto`— y `WishlistResponse`, la lista ENTERA
 * del member. Los favoritos llevan estado, como el de verdad.
 *
 * **Lo que se mira no lo puede producir el respaldo de antes** (regla 7): la orden es
 * `ord_77` y el pedido `SYN-77` (el `catch` acuñaba `MOCK-<ts>` y usaba la orden como
 * número de pedido), y el favorito vuelve con el título que tiene el SERVIDOR.
 *
 * Las LECTURAS que no se declaran caen como hasta ahora (catálogo de muestra con su cartel).
 */
function bordeDeLaTienda(opciones: { readonly caidas?: readonly string[] } = {}): {
  readonly fetchDoble: ReturnType<typeof vi.fn<FetchDoble>>;
  readonly llamadas: (clave: string) => number;
  readonly encender: (clave: string) => void;
} {
  const caidas = new Set(opciones.caidas ?? []);
  const vistas: string[] = [];
  const favoritos = new Map<string, Record<string, unknown>>();
  const responder = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
  const linea = (productId: string, title: string, amount: number) => ({
    productId,
    variantId: null,
    title,
    qty: 1,
    amount,
    productName: title,
    quantity: 1,
    unitPrice: amount,
    unitPriceFormatted: '',
    lineTotal: amount,
    lineTotalFormatted: '',
    currency: 'COP',
    canReturn: false,
    returnBlock: null,
  });

  const fetchDoble = vi.fn<FetchDoble>((url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = new URL(String(url), 'http://borde.test').pathname.replace(/^\/api\/shop/, '');
    const clave = `${metodo} ${ruta}`;
    vistas.push(clave);
    if (caidas.has(clave)) {
      return Promise.reject(new Error('offline'));
    }
    const cuerpo = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    switch (clave) {
      case 'POST /checkout':
        return responder(200, {
          orderRef: 'ord_77',
          paymentSessionId: 'psp_77',
          amount: 700_000,
          amountFormatted: '$ 700.000',
          currency: 'COP',
        });
      case 'POST /confirm':
        return responder(200, {
          status: 'Paid',
          orderNumber: 'SYN-77',
          orderRef: 'ord_77',
          total: 700_000,
          totalFormatted: '$ 700.000',
          currency: 'COP',
          items: [linea('P-A', 'Audífonos Pro (servidor)', 500_000), linea('P-B', 'Mouse Pro (servidor)', 200_000)],
        });
      case 'POST /wishlist': {
        const productId = String(cuerpo['productId'] ?? '');
        if (cuerpo['action'] === 'remove') {
          favoritos.delete(productId);
        } else {
          favoritos.set(productId, {
            owner: 'ada@example.com',
            collection: 'favoritos',
            itemRef: productId,
            addedAt: '2026-10-03T10:00:00+00:00',
            productId,
            title: 'Favorito guardado en el servidor',
            amount: 99_000,
            currency: 'COP',
          });
        }
        return responder(200, { owner: 'ada@example.com', collection: 'favoritos', items: [...favoritos.values()] });
      }
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

  /**
   * La tienda montada, por capas (014-despiece-tienda): la fachada y los servicios de ESTE elemento (del inyector del
   * shell, que los provee) y, para lo que vive en una vista, la vista pintada.
   */
  function tienda() {
    const de = <T>(token: ProviderToken<T>): T => fixture.debugElement.injector.get(token);
    return {
      configuracion: de(ConfiguracionDeLaTienda),
      avisos: de(AvisosDeLaTienda),
      catalogo: de(CatalogoDeLaTienda),
      resenas: de(ResenasDeLaTienda),
      deseos: de(DeseosDeLaTienda),
      mensajes: de(MensajesDeLaTienda),
      pedidos: de(PedidosDeLaTienda),
      devoluciones: de(DevolucionesDeLaTienda),
      escritorio: de(EscritorioDeLaTienda),
      carrito: de(CarritoDeLaTienda),
      compra: de(CompraDeLaTienda),
      navegacion: de(NavegacionDeLaTienda),
      pagina: de(CompraEnLaPagina),
      presentacion: de(PresentacionDeLaTienda),
      vista: <T>(tipo: Type<T>): T => {
        fixture.detectChanges();
        const pintada = fixture.debugElement.query(By.directive(tipo));
        if (!pintada) {
          throw new Error(`${tipo.name} no está pintada`);
        }
        return pintada.componentInstance as T;
      },
    };
  }

  /**
   * Abre una compra de «Mis compras» como quien compra (014-despiece-tienda, T010): tocando su fila en la bandeja de
   * SH-4, que la selecciona y avisa a la tienda. Así se pinta su detalle, que es la pieza que la muestra.
   */
  function abrirLaCompra(order: ShopOrder): void {
    fixture.detectChanges();
    const bandeja = fixture.debugElement.query(By.directive(AccountShellComponent));
    if (!bandeja) {
      throw new Error('«Mis compras» no está pintada');
    }
    (bandeja.componentInstance as AccountShellComponent<ShopOrder>).selectItem(tienda().pedidos.orders().indexOf(order));
  }

  async function createComponent(config: object = NEGOCIO_DEL_CMS, extra: readonly Provider[] = []): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [StorefrontElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: FULFILLMENT_STRATEGIES, useClass: ShopFulfillmentStrategy, multi: true },
        ...extra,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StorefrontElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // La búsqueda inicial corre en ngOnInit, ya con el config del CMS; que asiente.
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
    tienda().carrito.quickAdd(PRODUCT_A);
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

  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('sin la base de la API no llama a nada y degrada, visible (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    expect(tienda().catalogo.products().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/plp';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/plp');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(tienda().navegacion.view()).toBe('plp');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    tienda().navegacion.navigate('cart');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1/carrito');
  });

  it('un cupón aceptado entra como línea NEGATIVA y baja el total', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    const antes = tienda().carrito.cartTotalMinor();
    expect(antes).toBeGreaterThan(0);

    respuestaPromo({ code: 'BIENVENIDA10', amountMinor: 500_000, label: 'Cupón BIENVENIDA10' });
    await tienda().carrito.applyPromo('BIENVENIDA10');

    expect(tienda().carrito.promo()?.code).toBe('BIENVENIDA10');
    // El backend mandó el descuento en POSITIVO; se fuerza el signo, porque
    // sumarlo se vería como un cargo sorpresa.
    expect(tienda().carrito.promo()?.amountMinor).toBe(-500_000);
    expect(tienda().carrito.cartTotalMinor()).toBe(antes - 500_000);

    // Y se VE: un total más bajo sin la línea que lo explica se lee como un error
    // de precio.
    const filas = tienda().vista(TiendaCarritoComponent).cartSummaryRows().map((f) => f.id);
    expect(filas).toEqual(['subtotal', 'promo', 'total']);
  });

  it('quitar el cupón devuelve el total anterior', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = tienda().carrito.cartTotalMinor();

    respuestaPromo({ code: 'X', amountMinor: 100_000, label: 'Cupón X' });
    await tienda().carrito.applyPromo('X');
    expect(tienda().carrito.cartTotalMinor()).toBe(antes - 100_000);

    tienda().carrito.removePromo();
    expect(tienda().carrito.promo()).toBeNull();
    expect(tienda().carrito.cartTotalMinor()).toBe(antes);
    expect(tienda().vista(TiendaCarritoComponent).cartSummaryRows()).toEqual([]);
  });

  it('un descuento mayor que el carrito NO deja el total bajo cero', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    respuestaPromo({ code: 'TODO', amountMinor: 999_999_999, label: 'Cupón TODO' });
    await tienda().carrito.applyPromo('TODO');

    // Un carrito que se debe a sí mismo no es un carrito, y el checkout lo
    // cobraría como un importe negativo.
    expect(tienda().carrito.cartTotalMinor()).toBe(0);
  });

  it('EL caso: un 200 sin descuento utilizable NO es un cupón aplicado', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = tienda().carrito.cartTotalMinor();

    // El servidor contesta OK y no manda importe.
    respuestaPromo({ code: 'VACIO' });
    await tienda().carrito.applyPromo('VACIO');

    // Decir que sí dejaría el total igual y al comprador creyendo que ahorró.
    expect(tienda().carrito.promo()).toBeNull();
    expect(tienda().carrito.promoRejection()).toBe('unknown');
    expect(tienda().carrito.cartTotalMinor()).toBe(antes);
  });

  it('el mínimo no alcanzado dice CUÁNTO falta', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    respuestaPromo({ reason: 'minimum-not-met', shortfallMinor: 1_200_000 }, 422);
    await tienda().carrito.applyPromo('GRANDE');

    expect(tienda().carrito.promoRejection()).toBe('minimum-not-met');
    // Es lo único accionable de ese rechazo.
    expect(tienda().carrito.promoDetail()).toContain('12.000');
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
      await tienda().carrito.applyPromo('X');
      expect(tienda().carrito.promoRejection()).toBe(esperado);
    }
  });

  it('con el endpoint caído NO se aplica nada', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = tienda().carrito.cartTotalMinor();

    await tienda().carrito.applyPromo('LOQUESEA');

    // Un descuento fingido acá es una promesa de plata que el checkout rompe.
    expect(tienda().carrito.promo()).toBeNull();
    expect(tienda().carrito.promoRejection()).toBe('failed');
    expect(tienda().carrito.cartTotalMinor()).toBe(antes);
  });

  it('starts on the home with an empty cart and degraded mock rails (empty case)', async () => {
    installMemoryStorage();
    // Offline → mock catalogue; still a valid empty cart.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(tienda().navegacion.view()).toBe('home');
    expect(tienda().carrito.cartCount()).toBe(0);
    expect(tienda().carrito.hasCart()).toBe(false);
    // Mock catalogue loaded → home rails present, degradation flagged.
    expect(tienda().catalogo.products().length).toBeGreaterThan(0);
    expect(tienda().catalogo.deals().length).toBeGreaterThan(0);
    expect(tienda().catalogo.homeCategories().length).toBeGreaterThan(0);
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

  // ── #82: agregar al carrito SE OYE ─────────────────────────────────────────────
  // Abrir el cajón se veía y no se oía. Y el `.then` no tenía `catch`: un fallo del motor era un
  // rechazo sin manejar, mudo para todos.
  it('agregar al carrito se anuncia por la región del documento', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    await vi.waitFor(
      () =>
        expect(document.querySelector('[data-syn-live-announcer]')?.textContent).toBe(
          'Audífonos Pro agregado al carrito.',
        ),
      { timeout: 2000, interval: 20 },
    );
    expect(tienda().navegacion.cartOpen()).toBe(true);
  });

  it('si el motor no puede agregar, no abre el cajón y lo dice asertivo', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    vi.spyOn(ShopFulfillmentStrategy.prototype, 'select').mockRejectedValue(new Error('sin cupo'));

    tienda().carrito.quickAdd(PRODUCT_A);
    await vi.waitFor(
      () =>
        expect(document.querySelector('[data-syn-live-announcer]')?.textContent).toBe(
          'No se pudo agregar Audífonos Pro al carrito.',
        ),
      { timeout: 2000, interval: 20 },
    );
    expect(tienda().navegacion.cartOpen()).toBe(false);
    expect(document.querySelector('[data-syn-live-announcer]')?.getAttribute('aria-live')).toBe('assertive');
  });

  // ── #87: el fallo de agregar también se VE, junto al botón que se pulsó ──────────
  // Desde el #82 se oía y no se veía nada: quien mira pulsaba, el cajón no se abría y no
  // había ningún porqué. Se pulsa el BOTÓN de la tarjeta (regla 5), no se llama al método.
  it('si el motor no puede agregar, la tarjeta lo dice al lado del botón, y reintentar lo limpia', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    // El «Agregar» rápido vive en las tarjetas del PLP, no en las de la portada.
    tienda().navegacion.navigate('plp');

    const botonDe = (tarjeta: Element) =>
      tarjeta.querySelector('.storefront__card-actions .storefront__card-add button') as HTMLButtonElement;
    const tarjetaConAgregar = (): Element | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('.storefront__card') as NodeListOf<Element>).find((t) => botonDe(t));
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(tarjetaConAgregar(), 'no hay ninguna tarjeta con «Agregar» en el PLP').toBeTruthy();
      },
      { timeout: 2000, interval: 20 },
    );
    const tarjeta = tarjetaConAgregar();
    expect(tarjeta!.querySelector('.storefront__add-error')).toBeNull();

    const select = vi.spyOn(ShopFulfillmentStrategy.prototype, 'select').mockRejectedValueOnce(new Error('sin cupo'));
    botonDe(tarjeta!).click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(tarjeta!.querySelector('.storefront__add-error')?.textContent).toContain('No se pudo agregar');
      },
      { timeout: 2000, interval: 20 },
    );
    expect(botonDe(tarjeta!).textContent?.trim()).toBe('Reintentar');
    // No es una región viva: el anuncio ya lo hizo el anunciador; una segunda lo diría dos veces.
    const aviso = tarjeta!.querySelector('.storefront__add-error')!;
    expect(aviso.getAttribute('role')).toBeNull();
    expect(aviso.getAttribute('aria-live')).toBeNull();

    select.mockRestore();
    botonDe(tarjeta!).click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(tarjeta!.querySelector('.storefront__add-error')).toBeNull();
      },
      { timeout: 2000, interval: 20 },
    );
    expect(botonDe(tarjeta!).textContent?.trim()).toBe('Agregar');
  });

  const alertas = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="alert"]')).map(
      (alerta) => alerta.textContent?.trim() ?? '',
    );

  function asistente(): CheckoutWizardComponent {
    return fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
  }

  /** Carrito con A y B, datos de envío, y el asistente hasta el envío final. */
  async function comprarAyB(antesDeEnviar: (wizard: CheckoutWizardComponent) => void = () => undefined): Promise<void> {
    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_B);
    await flushMicrotasks();
    tienda().compra.customerName.set('Ada Lovelace');
    tienda().compra.customerEmail.set('ada@example.com');
    tienda().compra.customerAddress.set('Calle 1 #2-3');
    tienda().compra.customerCity.set('Bogotá');
    tienda().navegacion.goToCheckout();
    fixture.detectChanges();
    while (!asistente().isLastStep()) {
      asistente().next();
      fixture.detectChanges();
    }
    antesDeEnviar(asistente());
    asistente().next();
    await flushMicrotasks(30);
    fixture.detectChanges();
  }

  /** Lo que el asistente emite en `failed`: el motivo con el que la estrategia contestó que no. */
  function motivosDe(): { readonly motivos: string[]; readonly escuchar: (wizard: CheckoutWizardComponent) => void } {
    const motivos: string[] = [];
    return { motivos, escuchar: (wizard) => wizard.failed.subscribe((motivo) => motivos.push(motivo)) };
  }

  // ── happy: add → cart agrupado → SH-3 wizard → pay → confirm ─────────────────
  //
  // Corría con la red caída y lo que probaba era la orden `MOCK-<ts>` (UI#92, regla 16).
  // Contra la forma de verdad destapó además que la estrategia sólo aceptaba `confirmed`
  // y el borde contesta `Paid`: un pedido colocado salía como «no pudimos confirmarlo».
  it('runs the full lifecycle through the SH-3 wizard to a confirmation (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeLaTienda().fetchDoble);
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_B);
    await flushMicrotasks();

    expect(tienda().carrito.cartCount()).toBe(2);
    expect(tienda().carrito.cartTotalMinor()).toBe((500_000 + 200_000) * 100);
    // Carrito agrupado por vendedor (multi-seller marketplace).
    expect(tienda().vista(TiendaCarritoComponent).cartGroups().map((group) => group.seller).sort()).toEqual([
      'PeriferiCO',
      'TecnoHub',
    ]);

    tienda().compra.customerName.set('Ada Lovelace');
    tienda().compra.customerEmail.set('ada@example.com');
    tienda().compra.customerAddress.set('Calle 1 #2-3');
    tienda().compra.customerCity.set('Bogotá');
    expect(tienda().compra.shippingValid()).toBe(true);

    tienda().navegacion.goToCheckout();
    fixture.detectChanges();
    expect(tienda().navegacion.view()).toBe('checkout');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    expect(wizard.currentStep()?.id).toBe('datos');

    wizard.next();
    fixture.detectChanges();
    expect(wizard.currentStep()?.id).toBe('pago');
    wizard.next();
    fixture.detectChanges();
    expect(wizard.currentStep()?.id).toBe('revisar');

    wizard.next(); // submit → pay (POST /checkout) → confirm (POST /confirm)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('confirmation');
    expect(tienda().compra.orderRef()).toBe('ord_77');
    expect(tienda().compra.orderNumber()).toBe('SYN-77');
    expect(tienda().compra.confirmedItems().map((item) => item.title)).toEqual([
      'Audífonos Pro (servidor)',
      'Mouse Pro (servidor)',
    ]);
    expect(window.location.hash).toContain('/confirmacion');
    // Lo comprado ya no está por comprar (etapa 3): antes seguía en el carrito hasta «Seguir comprando».
    expect(tienda().carrito.cartCount()).toBe(0);
  });

  // ── UI#92: sin orden abierta no hay pedido, ni cobro, ni anuncio ──────────────
  it('con el POST /checkout caído no hay pedido: lo dice una vez, sin cobro ni anuncio', async () => {
    installMemoryStorage();
    const borde = bordeDeLaTienda({ caidas: ['POST /checkout'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const pedidos: unknown[] = [];
    component.orderconfirmed.subscribe((payload) => pedidos.push(payload));
    const fallos = motivosDe();

    await comprarAyB(fallos.escuchar);

    // La estrategia CONTESTA que no abrió la orden; no revienta.
    expect(fallos.motivos).toEqual(['checkout-not-opened']);

    expect(tienda().navegacion.view()).toBe('checkout');
    expect(tienda().compra.orderNumber()).toBe('');
    expect(pedidos).toEqual([]);
    expect(borde.llamadas('POST /confirm')).toBe(0);
    // El carrito sigue ahí: nada se compró.
    expect(tienda().carrito.cartCount()).toBe(2);
    expect(alertas()).toEqual([asistente().config().payFailedMessage]);
  });

  // ── UI#92: la orden quedó y el pedido no — reintentar NO vuelve a cobrar ──────
  it('con el POST /confirm caído nombra la orden que quedó; reintentar confirma la MISMA', async () => {
    installMemoryStorage();
    const borde = bordeDeLaTienda({ caidas: ['POST /confirm'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await comprarAyB(fallos.escuchar);

    expect(fallos.motivos).toEqual(['order-not-placed']);
    expect(tienda().navegacion.view()).toBe('checkout');
    expect(tienda().compra.orderNumber()).toBe('');
    expect(alertas()).toEqual([asistente().config().confirmFailedMessage.replaceAll('{referencia}', 'ord_77')]);

    borde.encender('POST /confirm');
    asistente().next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('confirmation');
    expect(tienda().compra.orderNumber()).toBe('SYN-77');
    expect(borde.llamadas('POST /checkout')).toBe(1);
    expect(borde.llamadas('POST /confirm')).toBe(2);
  });

  // ── filter: removing one line keeps the rest ─────────────────────────────────
  it('removes a single line from the cart without touching the rest (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_B);
    await flushMicrotasks();
    expect(tienda().carrito.cartLineCount()).toBe(2);

    const lineB = tienda().carrito.cartItems().find((item) => item.productRef === 'P-B')?.id ?? '';
    tienda().carrito.removeFromCart(lineB);
    await flushMicrotasks();

    const refs = tienda().carrito.cartItems().map((item) => item.productRef);
    expect(refs).toEqual(['P-A']);
    expect(tienda().carrito.cartTotalMinor()).toBe(500_000 * 100);
    expect(tienda().vista(TiendaCarritoComponent).cartGroups()).toHaveLength(1);
  });

  // ── idempotent: re-adding the same product+variant accumulates qty, one line ──
  it('re-adding the same product+variant keeps one line and accumulates qty (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_A);
    await flushMicrotasks();

    // One line (deterministic id), qty accumulated to 3.
    expect(tienda().carrito.cartLineCount()).toBe(1);
    expect(tienda().carrito.cartCount()).toBe(3);
    expect(tienda().carrito.cartTotalMinor()).toBe(500_000 * 3 * 100);
  });

  // ── PDP (SH-2): open product, switch variant, qty, add, wishlist toggle ──────
  it('opens the PDP, adds the selected variant and toggles wishlist once (SH-2 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeLaTienda().fetchDoble);
    await createComponent();

    const first = tienda().catalogo.products()[0];
    tienda().navegacion.openProduct(first);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('pdp');
    expect(tienda().catalogo.detail()).not.toBeNull();
    expect(tienda().catalogo.selectedVariant()).not.toBeNull();
    expect(window.location.hash).toContain(`/p/${first.id}`);

    tienda().catalogo.changeQuantity(1);
    expect(tienda().catalogo.pdpQuantity()).toBe(2);

    tienda().carrito.addCurrentToCart();
    await flushMicrotasks();
    expect(tienda().carrito.cartCount()).toBe(2);

    // Wishlist: toggle on + toggle on the same product stays a single entry.
    const product = tienda().catalogo.detail()!.product;
    tienda().deseos.toggleWishlist(product);
    await flushMicrotasks();
    expect(tienda().deseos.isWished(product.id)).toBe(true);
    // La lista es la que devolvió el SERVIDOR, no la entrada que pintó el optimista.
    expect(tienda().deseos.wishlist().map((line) => line.title)).toEqual(['Favorito guardado en el servidor']);

    tienda().deseos.toggleWishlist(product);
    await flushMicrotasks();
    expect(tienda().deseos.isWished(product.id)).toBe(false);
    expect(tienda().deseos.wishlist()).toHaveLength(0);
  });

  // ── UI#92: un favorito que el servidor no guardó se revierte y se dice ────────
  it('con el POST /wishlist caído el favorito vuelve a como estaba y se dice una vez', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeLaTienda({ caidas: ['POST /wishlist'] }).fetchDoble);
    await createComponent();
    const product = tienda().catalogo.products()[0];

    tienda().deseos.toggleWishlist(product);
    // El optimista se pinta…
    expect(tienda().deseos.isWished(product.id)).toBe(true);
    await flushMicrotasks();
    fixture.detectChanges();

    // …y el fallo lo revierte: nada quedó guardado.
    expect(tienda().deseos.isWished(product.id)).toBe(false);
    expect(tienda().deseos.wishlist()).toEqual([]);
    expect(alertas()).toEqual(['No pudimos guardar el cambio en tus favoritos. Intenta de nuevo.']);
  });

  // ── Account (SH-4): orders inbox + tracking timeline + return ────────────────
  it('con la marca de demo DECLARADA, mis compras y el seguimiento de ejemplo; sin ella no salen (SH-4 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    // Los pedidos de ejemplo sólo los pinta una demo que lo escribe (etapa 3): el camino real ya no los inventa.
    await createComponent(NEGOCIO_DEL_CMS, [{ provide: MUESTRAS_DE_LA_CUENTA, useValue: true }]);

    tienda().navegacion.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('account');
    expect(tienda().navegacion.accountSection()).toBe('compras');
    expect(tienda().pedidos.orders().length).toBeGreaterThan(0);

    const order = tienda().pedidos.orders()[0];
    abrirLaCompra(order);
    await flushMicrotasks();

    const stages = tienda().pedidos.trackingStages(order.orderNumber);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.some((stage) => stage.state === 'current' || stage.state === 'done')).toBe(true);

    // Devolución (#32). Este bloque AFIRMABA EL DEFECTO: decía «mock degradado →
    // claim abierto» y comprobaba que un reclamo inventado en el cliente contaba
    // como abierto. Con el servidor caído no hay reclamo, y por tanto tampoco se
    // ofrece el botón — no se sabe si la línea ya tiene uno.
    const linea = order.items[0];
    expect(tienda().devoluciones.returnsUnknown(order)).toBe(true);
    expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(false);

    tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, linea);
    await tienda().devoluciones.submitReturn();
    expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)).toBeNull();
    expect(tienda().devoluciones.returnError()).not.toBe('');

    // Sección mensajes (v1): threads mock cargados al cambiar de sección.
    tienda().navegacion.onAccountSectionChange('mensajes');
    await flushMicrotasks();
    expect(tienda().mensajes.threads().length).toBeGreaterThan(0);
  });

  // ── Hash router: deep-link a una vista ────────────────────────────────────────
  it('deep-links views through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().navegacion.goToPlp();
    expect(window.location.hash).toBe('#/storefront/plp');

    tienda().navegacion.goToAccount('favoritos');
    expect(window.location.hash).toBe('#/storefront/cuenta/favoritos');
    expect(tienda().navegacion.accountSection()).toBe('favoritos');

    // checkout sin carrito redirige a carrito.
    tienda().navegacion.navigate('checkout');
    expect(tienda().navegacion.view()).toBe('cart');
  });

  // ── Reseñar (T10 Ola B): el formulario y el envío ───────────────────────────
  //
  // Lo que se prueba aquí no es que el formulario pinte, sino DOS invariantes:
  // (1) no se le ofrece a quien no puede reseñar, y (2) un envío que falla NO se
  // anuncia como publicado. Fingir una escritura que no ocurrió es el fallo que
  // ADR 0112 documenta en gov.mockDecide.
  describe('reseñar', () => {
    /** El cliente suelto: estos casos prueban el CONTRATO HTTP, sin montar el componente. */
    function reviewClient(): ResenasApi {
      return TestBed.inject(ResenasApi);
    }

    it('NO ofrece el formulario cuando el servidor dice que no se puede', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      // En modo degradado canReview es false por diseño: el backend que decide
      // quién puede es justo el que no responde.
      expect(tienda().resenas.canReview()).toBe(false);
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

      const panel = tienda().vista(TiendaFichaOpinionesComponent).reviewPanel()!;
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
      tienda().catalogo.detail.set({
        product: { ...PRODUCT_A, id: 'SKU-1' },
        description: 'desc',
        variants: [],
        reviews,
        questions: [],
        canReview,
      });
      tienda().navegacion.view.set('pdp');
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
      const panel = tienda().vista(TiendaFichaOpinionesComponent).reviewPanel();
      expect(panel).toBeTruthy();
      panel!.draftRating.set(5);
      panel!.draftBody.set('Cumple lo que promete.');
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response)));

      await tienda().vista(TiendaFichaOpinionesComponent).submitReview({
        rating: 5,
        title: '',
        body: 'Cumple lo que promete.',
        criteria: {},
      });

      expect(tienda().resenas.reviewFailed()).toBe(true);
      expect(tienda().resenas.reviewNotice()).toContain('compró');
      // Los dos fallos que importan: anunciar una escritura que no ocurrió…
      expect(tienda().resenas.reviewNotice()).not.toContain('publicada');
      // …y mandar a iniciar sesión por un problema que no es de sesión.
      expect(tienda().resenas.reviewNotice().toLowerCase()).not.toContain('inicia sesión');
      // El texto se conserva: perder lo escrito por un rechazo sería castigar dos
      // veces. Ahora lo custodia la pieza, que no se limpia sola al enviar.
      expect(panel!.draftBody()).toBe('Cumple lo que promete.');
    });

    it('monta SH-13 y pinta la distribución que antes se calculaba sin usarse', async () => {
      // Monta su propia tienda: antes leía la que dejaba la prueba de arriba, ya destruida (014-despiece-tienda).
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      expect(fixture.nativeElement.querySelector('syn-review-panel')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.storefront__review-form')).toBeNull();
      // `reviewSummary().distribution` existía desde siempre y ninguna plantilla
      // la usaba: cinco barras, una por estrella.
      expect(
        fixture.nativeElement.querySelectorAll('.syn-reviews__dist-row').length,
      ).toBe(5);
      expect(tienda().vista(TiendaFichaOpinionesComponent).reviewPanelSummary().distribution?.map((b) => b.stars)).toEqual([
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
      tienda().navegacion.openProduct(tienda().catalogo.products()[0]);
      await flushMicrotasks();
      fixture.detectChanges();
    }

    it('EL caso: un 202 NO dice «publicada» y NO recarga la lista', async () => {
      await abrirFichaReseñable();
      const sku = tienda().catalogo.detail()!.product.id;

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

      await tienda().vista(TiendaFichaOpinionesComponent).submitReview({
        rating: 5,
        title: 'Muy bueno',
        body: 'Cumple lo que promete y llegó antes de lo previsto.',
        criteria: {},
      });

      expect(tienda().resenas.reviewNotice()).toContain('en revisión');
      expect(tienda().resenas.reviewNotice()).not.toContain('publicada');
      expect(tienda().resenas.reviewFailed()).toBe(false);
      // Ni una sola recarga de la ficha: traería la lista SIN la reseña, o sea la
      // prueba de que el acuse miente, en la misma pantalla.
      expect(llamadas.filter((u) => u.includes(`/product/${sku}`))).toEqual([]);
    });

    it('un 201 sí dice publicada y sí recarga', async () => {
      await abrirFichaReseñable();
      const sku = tienda().catalogo.detail()!.product.id;

      const llamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          llamadas.push(String(url));
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await tienda().vista(TiendaFichaOpinionesComponent).submitReview({
        rating: 5,
        title: 'Muy bueno',
        body: 'Cumple lo que promete y llegó antes de lo previsto.',
        criteria: {},
      });

      expect(tienda().resenas.reviewNotice()).toContain('publicada');
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

      await tienda().resenas.reportReview('rev-1');
      await tienda().resenas.reportReview('rev-1');

      expect(envios).toBe(1);
      expect(tienda().resenas.reportedReviewIds()).toEqual(['rev-1']);
      expect(tienda().resenas.reviewNotice()).toContain('Gracias por avisar');
    });

    it('«ya reportada» se trata como éxito: reintentar no arregla nada', async () => {
      await abrirFichaReseñable();
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) } as Response),
        ),
      );

      await tienda().resenas.reportReview('rev-9');

      expect(tienda().resenas.reportedReviewIds()).toEqual(['rev-9']);
      expect(tienda().resenas.reviewFailed()).toBe(false);
    });
  });

  // ── devoluciones y consola de vendedor (#32) ─────────────────────────────────
  describe('devoluciones', () => {
    /** Deja la cuenta abierta con pedidos y un servidor que contesta lo que se le diga. */
    /** El pedido de los reclamos de abajo, como lo da el servidor: pagado y con su permiso de devolver. */
    const PEDIDO_DEL_SERVIDOR = {
      orderNumber: 'ORD-2026-00481',
      orderRef: 'ORD-2026-00481',
      date: '2026-09-10T15:00:00+00:00',
      status: 'paid',
      total: 1_499_000,
      currency: 'COP',
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000, productId: 'SONY-XM5', canReturn: true }],
    };

    async function abrirCuenta(responder: (url: string) => Response): Promise<void> {
      installMemoryStorage();
      // Los pedidos los sirve el servidor: antes salían de los de ejemplo, que el camino real ya no pinta (etapa 3).
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          Promise.resolve(String(url).endsWith('/orders') ? json({ orders: [PEDIDO_DEL_SERVIDOR] }) : responder(String(url))),
        ),
      );
      await createComponent();
      tienda().navegacion.goToAccount();
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

      const order = tienda().pedidos.orders().find((o) => o.orderNumber === 'ORD-2026-00481')!;
      const linea = order.items[0];

      expect(tienda().devoluciones.returnsUnknown(order)).toBe(false);
      expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)?.claimId).toBe('rma_x1');
      expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(false);
    });

    it('EL caso: si NO se pudo leer, tampoco se ofrece — no se sabe si ya hay uno', async () => {
      await abrirCuenta(() => json({}, 500));

      const order = tienda().pedidos.orders().find((o) => o.status === 'paid')!;
      expect(tienda().devoluciones.returnsUnknown(order)).toBe(true);
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(false);
    });

    it('EL caso: un POST fallido NO da el reclamo por abierto', async () => {
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [] }) : json({}, 500),
      );

      const order = tienda().pedidos.orders().find((o) => o.status === 'paid')!;
      const linea = order.items[0];
      // Con la lectura en verde y sin reclamos, el botón SÍ se ofrece.
      expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(true);
      // Devolver se pide desde la compra ABIERTA, como en la cuenta: es su detalle el que lo ofrece.
      abrirLaCompra(order);
      await flushMicrotasks();

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            json({ error: 'Solo se puede devolver sobre una orden pagada.' }, 400),
          ),
        ),
      );
      tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, linea);
      await tienda().devoluciones.submitReturn();

      // Ni reclamo inventado ni pantalla que diga que se abrió.
      expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)).toBeNull();
      // Y se enseña lo que dijo el servidor, no un genérico: lo escribió quien sabe.
      expect(tienda().devoluciones.returnError()).toContain('orden pagada');
      expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(true);
    });

    it('manda lineId y el motivo ELEGIDO, no un literal fijo', async () => {
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [] }) : json({}, 500),
      );
      const order = tienda().pedidos.orders().find((o) => o.status === 'paid')!;
      const linea = order.items[0];
      // Devolver se pide desde la compra ABIERTA, como en la cuenta: es su detalle el que lo ofrece.
      abrirLaCompra(order);
      await flushMicrotasks();

      const cuerpos: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => {
          cuerpos.push(String(init?.body ?? ''));
          return Promise.resolve(json(RECLAMO));
        }),
      );

      tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, linea);
      tienda().devoluciones.setReturnReason('not-as-described');
      await tienda().devoluciones.submitReturn();

      const enviado = JSON.parse(cuerpos[0]) as { lineId: string; reason: string };
      // Sin `lineId` el borde contesta 400 — y contestaba 400 SIEMPRE, porque
      // este cuerpo no lo llevaba.
      expect(enviado.lineId).toBe('SONY-XM5');
      expect(enviado.reason).toBe('not-as-described');
      expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)?.claimId).toBe('rma_x1');
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
      tienda().navegacion.goToAccount();
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
      orderRef: 'ORD-REAL-1',
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

    it('EL caso: el seguimiento y las devoluciones se piden con la REFERENCIA del pedido, no con su número (004, US 6)', async () => {
      // En la puerta la referencia es la saga y el número, ocho caracteres; en la directa, `ord_…` y `SYN-…`. El borde
      // busca por la referencia: pedir por el número daba 404, y «Mis compras» se quedaba sin seguimiento y con las
      // devoluciones «consultando» para siempre. Medido en vivo (T047).
      const urls: string[] = [];
      await conPedidos((url) => {
        urls.push(url);
        if (url.includes('/tracking')) return json({ ...etapas(true), orderRef: 'pta-saga-1' });
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [{ ...pedido('paid'), orderRef: 'pta-saga-1', orderNumber: 'CEBFA4B7' }] });
      });

      const order = tienda().pedidos.orders()[0];
      expect(order.orderRef).toBe('pta-saga-1');
      abrirLaCompra(order);
      await flushMicrotasks(20);
      tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, order.items[0]);
      await tienda().devoluciones.submitReturn();

      const porPedido = urls.filter((u) => u.includes('/order/'));
      expect(porPedido.some((u) => u.includes('/order/pta-saga-1/tracking'))).toBe(true);
      expect(porPedido.filter((u) => u.includes('/order/pta-saga-1/return')).length).toBeGreaterThanOrEqual(2);
      expect(porPedido.filter((u) => u.includes('CEBFA4B7'))).toEqual([]);
    });

    it('EL caso: un pedido `paid` y entregado SÍ se puede devolver', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = tienda().pedidos.orders()[0];
      expect(order.status).toBe('paid');
      abrirLaCompra(order);
      await flushMicrotasks(10);

      // Antes esto era FALSO siempre: el gate pedía `delivered|shipped`, que el
      // backend no emite nunca.
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(true);
      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('EL caso: el seguimiento ya NO decide — sin entregar, con `canReturn`, se ofrece y no se explica nada (etapa 3)', async () => {
      // Refinaba con «todavía no llegó», pero nadie avanza el envío y el seguimiento no pasa de «pagado»: «Pedir
      // devolución» no salía nunca, en ninguno de los dos caminos. Manda el servidor (`canReturn`).
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(false));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      expect(tienda().pedidos.isDelivered(order)).toBe(false);
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(true);
      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('EL caso: si el SEGUIMIENTO no se pudo leer, se ofrece igual', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json({}, 500);
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = tienda().pedidos.orders()[0];
      // Sin pedir el seguimiento: no hay etapas que mirar.
      expect(tienda().pedidos.trackingStages(order.orderNumber)).toHaveLength(0);
      // La condición del servidor se cumple, así que el botón NO va a rebotar.
      // Bloquear la devolución porque se cayó el seguimiento cambiaría un problema
      // de información por uno de negocio.
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(true);
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

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      expect(order.status).toBe('paid');
      expect(tienda().pedidos.isDelivered(order)).toBe(true);
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(false);
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

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toContain('reclamo abierto');
    });

    it('un motivo que no le sirve a quien compró no se pinta', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('cancelled', false)] });
      });

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      // `order-not-paid`: a quien canceló no hay que contarle que no puede
      // devolver lo que nunca recibió.
      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('un pedido sin pagar o cancelado no se devuelve: el servidor lo rechaza', async () => {
      for (const estado of ['pending', 'cancelled'] as const) {
        await conPedidos((url) => {
          if (url.includes('/tracking')) return json(etapas(true));
          if (url.includes('/return')) return json({ returns: [] });
          return json({ orders: [pedido(estado)] });
        });

        const order = tienda().pedidos.orders()[0];
        abrirLaCompra(order);
        await flushMicrotasks(10);

        expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(false);
        // Y no se le explica nada: a quien canceló no hay que contarle que no
        // puede devolver lo que nunca recibió.
        expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
        TestBed.resetTestingModule();
      }
    });
  });

  // ── La tienda que no miente (004-tienda-compra, etapa 3) ──────────────────────
  //
  // Lo que destapó el vivo del 2026-10-22: con la sesión caída «Mis compras» pintaba dos pedidos que la persona no hizo
  // (`ORD-2026-00481`, `ORD-2026-00512`), con el seguimiento caído una línea de tiempo con fechas falsas, «Pedir
  // devolución» no salía nunca porque el seguimiento no pasa de «pagado», y las fechas salían en ISO crudo.
  describe('la tienda que no miente (etapa 3)', () => {
    const json = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

    const pedidoReal = (orderRef: string, orderNumber: string, date = '2026-10-23T02:30:00+00:00') => ({
      orderNumber,
      orderRef,
      date,
      status: 'paid',
      total: 120_000,
      currency: 'COP',
      items: [{ title: 'Cafetera', qty: 1, amount: 120_000, productId: 'SKU-CAF', canReturn: true }],
    });

    /** El seguimiento tal como sale hoy: pagado y nada más, porque nadie avanza el envío. */
    const soloPagado = (orderRef: string) => ({
      orderRef,
      stages: [
        { id: 'paid', label: 'Pago confirmado', state: 'done', date: '2026-10-23T02:30:00Z' },
        { id: 'shipped', label: 'Enviado', state: 'pending' },
        { id: 'delivered', label: 'Entregado', state: 'pending' },
      ],
    });

    async function cuenta(responder: (url: string) => Response, config: object = NEGOCIO_DEL_CMS): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(responder(String(url)))));
      await createComponent(config);
      tienda().navegacion.goToAccount();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
    const filas = (): HTMLButtonElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.syn-account__row'));

    async function abrirPedido(indice: number): Promise<void> {
      filas()[indice].click();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    it('sin sesión (el servidor contestó 401) pide entrar, y no pinta ningún pedido de ejemplo', async () => {
      await cuenta((url) => (url.endsWith('/orders') ? json({ error: 'sin sesión' }, 401) : json({}, 404)));

      expect(tienda().pedidos.estadoDeLasCompras()).toBe('sin-sesion');
      expect(tienda().pedidos.orders()).toEqual([]);
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().inboxEmptyTitle).toBe('Inicia sesión para ver tus compras');
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().inboxEmptyActionHref).toContain('/account/login?returnUrl=');
      expect(texto()).toContain('Inicia sesión para ver tus compras');
      expect(texto()).toContain('Iniciar sesión');
      expect(texto()).not.toContain('ORD-2026');
    });

    it('con la lectura caída lo dice y reintenta; nunca los pedidos de ejemplo', async () => {
      let caida = true;
      await cuenta((url) => {
        if (url.endsWith('/orders')) return caida ? json({}, 503) : json({ orders: [pedidoReal('ord_1', 'SYN-1')] });
        if (url.includes('/return')) return json({ returns: [] });
        return json({}, 404);
      });

      expect(tienda().pedidos.estadoDeLasCompras()).toBe('caida');
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().errorMessage).toBe('No pudimos cargar tus compras.');
      expect(texto()).toContain('No pudimos cargar tus compras.');
      expect(texto()).not.toContain('ORD-2026');
      expect(tienda().pedidos.orders()).toEqual([]);

      caida = false;
      tienda().vista(TiendaCuentaComponent).reintentarCompras();
      await flushMicrotasks(20);
      fixture.detectChanges();

      expect(tienda().pedidos.estadoDeLasCompras()).toBe('leidas');
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().errorMessage).toBeUndefined();
      expect(tienda().pedidos.orders().map((o) => o.orderNumber)).toEqual(['SYN-1']);
    });

    it('el seguimiento caído dice «Seguimiento no disponible», sin una línea de tiempo inventada', async () => {
      await cuenta((url) => {
        if (url.endsWith('/orders')) return json({ orders: [pedidoReal('ord_1', 'SYN-1')] });
        if (url.includes('/tracking')) return json({}, 500);
        if (url.includes('/return')) return json({ returns: [] });
        return json({}, 404);
      });

      filas()[0].click();
      fixture.detectChanges();
      expect(texto()).toContain('Consultando el seguimiento…');

      await flushMicrotasks(20);
      fixture.detectChanges();
      const detalle = (fixture.nativeElement as HTMLElement).querySelector('.storefront__order-detail')!;
      expect(detalle.textContent).toContain('Seguimiento no disponible');
      expect(detalle.querySelectorAll('.syn-timeline__date')).toHaveLength(0);
      expect(tienda().pedidos.trackingStages('SYN-1')).toEqual([]);
    });

    it('«Pedir devolución» se ofrece con `canReturn` en los DOS caminos, aunque el seguimiento siga en «pagado»', async () => {
      // La directa: `ord_…` y `SYN-…`. La puerta: la saga y su número de ocho. Devolver sigue siendo del personal.
      await cuenta((url) => {
        if (url.endsWith('/orders')) {
          return json({ orders: [pedidoReal('ord_1', 'SYN-1'), pedidoReal('pta-saga-2', 'ABCD1234')] });
        }
        if (url.includes('/tracking')) return json(soloPagado(url.includes('pta-') ? 'pta-saga-2' : 'ord_1'));
        if (url.includes('/return')) return json({ returns: [] });
        return json({}, 404);
      });

      for (const [indice, numero] of [[0, 'SYN-1'], [1, 'ABCD1234']] as const) {
        await abrirPedido(indice);
        const pedido = tienda().pedidos.orders()[indice];
        expect(pedido.orderNumber).toBe(numero);
        expect(tienda().pedidos.isDelivered(pedido)).toBe(false);
        expect(tienda().devoluciones.canReturnLine(pedido, pedido.items[0])).toBe(true);

        const devolver = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.storefront__order-item button',
        )).find((b) => b.textContent?.trim() === 'Devolver')!;
        devolver.click();
        fixture.detectChanges();
        expect(texto()).toContain('Pedir devolución');
        tienda().devoluciones.closeReturn();
        fixture.detectChanges();
      }
    });

    it('las fechas salen en es-CO y en la hora del SITIO, no en ISO crudo', async () => {
      // 02:30 UTC del 23 son las 04:30 del 23 en Madrid. Un sitio que NO es el huso de esta máquina (Bogotá): si la
      // zona del sitio se perdiera y se leyera la del navegador, saldría el 22 a las 21:30.
      await cuenta(
        (url) => {
          if (url.endsWith('/orders')) return json({ orders: [pedidoReal('ord_1', 'SYN-1')] });
          if (url.includes('/tracking')) return json(soloPagado('ord_1'));
          if (url.includes('/return')) return json({ returns: [] });
          return json({}, 404);
        },
        { ...NEGOCIO_DEL_CMS, zonaHoraria: 'Europe/Madrid' },
      );

      expect(filas()[0].textContent).toContain('23 de octubre de 2026');
      expect(texto()).not.toContain('2026-10-23T');

      await abrirPedido(0);
      const fechas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.syn-timeline__date')).map((f) =>
        f.textContent?.trim(),
      );
      expect(fechas).toEqual(['23 de octubre de 2026, 04:30']);
    });

    it('la ficha de un producto del CMS, sin variantes, lo agrega TAL CUAL con su cantidad: el botón no es mudo', async () => {
      // El CMS da `variants: []` (medido en vivo: BOLIGRAFO-ALU-001). `selectedVariant` quedaba en `null` y
      // «Agregar al carrito» volvía sin hacer nada ni decir nada.
      const boli: ShopProduct = { ...PRODUCT_A, id: 'BOLI-1', title: 'Bolígrafo de aluminio', amount: 38_000 };
      installMemoryStorage();
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          String(url).includes('/product/BOLI-1')
            ? Promise.resolve(json({ product: boli, variants: [], reviews: [], questions: [], canReview: false }))
            : Promise.reject(new Error('offline')),
        ),
      );
      await createComponent();
      tienda().navegacion.openProduct(boli);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(tienda().catalogo.detail()?.variants).toEqual([]);
      expect(tienda().catalogo.selectedVariant()).toBeNull();
      expect(tienda().catalogo.pdpInStock()).toBe(true);
      tienda().catalogo.changeQuantity(1);
      fixture.detectChanges();

      const agregar = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Agregar al carrito',
      )!;
      expect(agregar.disabled).toBe(false);
      agregar.click();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(tienda().carrito.cartLineCount()).toBe(1);
      expect(tienda().carrito.cartCount()).toBe(2);
      expect(tienda().carrito.cartTotalMinor()).toBe(38_000 * 2 * 100);
      expect(tienda().carrito.addFailedId()).toBeNull();
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

      expect(tienda().navegacion.view()).toBe('seller');
      expect(fixture.nativeElement.querySelector('syn-console-shell')).not.toBeNull();
      expect(tienda().vista(TiendaVendedorComponent).sellerConfig().sections.map((s) => s.id)).toEqual([
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
      expect(tienda().escritorio.sellerReturns().map((c) => c.status)).toEqual(['abierto', 'en-revision']);
    });

    it('EL caso: las opiniones reportadas van primero, con conteo o sin él', async () => {
      await abrirConsola();

      const cola = tienda().escritorio.sellerModeration();
      expect(cola.map((i) => i.reason)).toEqual(['reported', 'reported', 'pending']);
      // La segunda reportada llega SIN conteo: sin esta fila, ordenar sólo por
      // conteo daría el mismo resultado y la regla del motivo no se vigilaría
      // (regla 7 de CLAUDE.md, aprendida en #31).
      expect(cola[1].reportCount).toBe(0);
    });

    it('EL caso: un avance fallido NO cambia el estado del reclamo', async () => {
      await abrirConsola();
      const antes = tienda().escritorio.sellerReturns()[0];

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
      await tienda().escritorio.advanceReturn(antes.claimId, 'received');

      // `refunded` mueve plata de verdad: pintar «Resuelto» sobre un POST que
      // falló diría que se devolvió algo que sigue donde estaba.
      expect(tienda().escritorio.sellerReturns()[0].status).toBe(antes.status);
      expect(tienda().escritorio.deskFailed()).toBe(true);
      expect(tienda().escritorio.deskNotice()).toContain('abierto a recibido');
    });

    it('un avance aceptado toma el estado QUE DEVUELVE el servidor', async () => {
      await abrirConsola();
      const objetivo = tienda().escritorio.sellerReturns()[0];

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
      await tienda().escritorio.advanceReturn(objetivo.claimId, 'approved');

      const despues = tienda()
        .escritorio.sellerReturns()
        .find((c) => c.claimId === objetivo.claimId)!;
      expect(despues.status).toBe('en-revision');
      expect(tienda().escritorio.deskFailed()).toBe(false);
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
        (fixture.nativeElement as HTMLElement).querySelectorAll('.storefront__cmp button'),
      ) as HTMLButtonElement[];

    it('marca dos productos desde el catálogo y la ficha se alinea por atributo', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      // El catálogo vive en la PLP, no en el inicio.
      tienda().navegacion.goToPlp();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(botones().length).toBeGreaterThan(1);
      expect(fixture.nativeElement.querySelector('.syn-compare__table')).toBeNull();

      botones()[0].click();
      botones()[1].click();
      fixture.detectChanges();

      expect(tienda().vista(TiendaCatalogoComponent).compare.count()).toBe(2);
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
      tienda().navegacion.goToPlp();
      await flushMicrotasks();

      // Se fuerzan los dos candidatos a «sin reseñas»: el catálogo sembrado trae
      // valoraciones, y lo que se prueba es que un 0 no se escriba como «0,0».
      tienda().catalogo.products.set(
        tienda()
          .catalogo.products()
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
