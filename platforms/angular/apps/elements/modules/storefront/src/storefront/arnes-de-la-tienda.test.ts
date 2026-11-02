/**
 * El arnés de las specs de la tienda (014-despiece-tienda, T013): la tienda montada entera, con su borde de mentira y
 * sus productos de muestra. Las specs se repartieron por el componente que ejercitan y todas montan lo mismo; lo
 * común vive aquí. `*.test.ts` y no `*.spec.ts`: no lo corre vitest ni lo empaqueta el build del elemento.
 */
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
export const NEGOCIO_DEL_CMS = { apiBase: STOREFRONT_SYNHOST.ejemplo.apiBase };

/** Minimal in-memory localStorage stand-in so the SessionStore can persist. */
export function installMemoryStorage(): Map<string, string> {
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
export async function flushMicrotasks(times = 8): Promise<void> {
  await asentar(times);
}

export type FetchDoble = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
export function bordeDeLaTienda(opciones: { readonly caidas?: readonly string[] } = {}): {
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

export const PRODUCT_A: ShopProduct = {
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

export const PRODUCT_B: ShopProduct = {
  ...PRODUCT_A,
  id: 'P-B',
  title: 'Mouse Pro',
  amount: 200_000,
  brand: 'Logitech',
  category: 'Computación',
  seller: 'PeriferiCO',
};


/**
 * Lo que cada spec de la tienda comparte: montar la tienda, sus fachadas y la compra con el asistente. Se llama dentro
 * del `describe`, donde deja su `afterEach`; `alMontar` le entrega a la spec el `fixture` y el componente de cada
 * montaje, así que las pruebas se leen igual que en la spec única de antes.
 */
export function prepararLaTienda(
  alMontar: (fixture: ComponentFixture<StorefrontElementComponent>, component: StorefrontElementComponent) => void,
) {
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
    alMontar(fixture, component);
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


  return { tienda, abrirLaCompra, createComponent, agregarAlCarrito, respuestaPromo, alertas, asistente, comprarAyB, motivosDe };
}

// Lo que las specs usan de lo de arriba, desde un solo sitio.
export { provideZonelessChangeDetection, ComponentFixture, TestBed, By, FULFILLMENT_STRATEGIES, AccountShellComponent, CheckoutWizardComponent, MUESTRAS_DE_LA_CUENTA, ResenasApi, ShopFulfillmentStrategy, ConfiguracionDeLaTienda, AvisosDeLaTienda, CatalogoDeLaTienda, ResenasDeLaTienda, DeseosDeLaTienda, MensajesDeLaTienda, PedidosDeLaTienda, DevolucionesDeLaTienda, EscritorioDeLaTienda, CarritoDeLaTienda, CompraDeLaTienda, CompraEnLaPagina, NavegacionDeLaTienda, PresentacionDeLaTienda, TiendaCatalogoComponent, TiendaFichaOpinionesComponent, TiendaCarritoComponent, TiendaCuentaComponent, TiendaCuentaPedidoComponent, TiendaVendedorComponent, StorefrontElementComponent, asentar, STOREFRONT_SYNHOST };
export type { Provider, ProviderToken, ShopOrder, ShopProduct, Type };
