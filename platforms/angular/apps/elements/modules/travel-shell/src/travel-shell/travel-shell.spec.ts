import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { TravelApiClient } from './travel-api.client';
import { TravelFulfillmentStrategy } from './travel-fulfillment.strategy';
import { TravelShellElementComponent } from './travel-shell';
import type { TravelTrip } from './travel.model';
import { asentar } from '../../../../../../tools/asentar';
import { TRAVEL_SHELL_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: TRAVEL_SHELL_SYNHOST.ejemplo.apiBase };

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
 * Un borde de viajes que contesta las ESCRITURAS con la forma del de verdad y se apaga por
 * MÉTODO y ruta (UI#92; reglas 16 y 18).
 *
 * Las formas son las de `TravelController` del CMS: `CheckoutResponse`, `ConfirmResponse`
 * (`status: 'Confirmed'`, `confirmationCode`, y sus `ConfirmItemDto` TAL CUAL: `product`
 * con mayúscula, `label` y no `title`, sin `reference`) y `CancelOrderResponse`.
 *
 * **Lo que se mira no lo puede producir el respaldo de antes** (regla 7): la orden es
 * `trv_77` y el código `TRV-77-OK` (el `catch` acuñaba `MOCK-<ts>` y usaba la orden como
 * código), y la reserva `res_77_1` (allá `<orden>-01`).
 *
 * Las LECTURAS que no se declaran caen como hasta ahora (ofertas de muestra con su cartel).
 */
function bordeDeViajes(opciones: { readonly caidas?: readonly string[] } = {}): {
  readonly fetchDoble: ReturnType<typeof vi.fn<FetchDoble>>;
  readonly llamadas: (clave: string) => number;
  readonly encender: (clave: string) => void;
} {
  const caidas = new Set(opciones.caidas ?? []);
  const vistas: string[] = [];
  const responder = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

  const fetchDoble = vi.fn<FetchDoble>((url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = new URL(String(url), 'http://borde.test').pathname
      .replace(/^\/api\/travel/, '')
      .replace(/^\/order\/[^/]+\/cancel$/, '/order/{ref}/cancel');
    const clave = `${metodo} ${ruta}`;
    vistas.push(clave);
    if (caidas.has(clave)) {
      return Promise.reject(new Error('offline'));
    }
    switch (clave) {
      case 'POST /checkout':
        return responder(200, {
          orderRef: 'trv_77',
          paymentSessionId: 'psp_77',
          amount: 1_250_000,
          amountFormatted: '$ 1.250.000',
          currency: 'COP',
        });
      case 'POST /confirm':
        return responder(200, {
          status: 'Confirmed',
          confirmationCode: 'TRV-77-OK',
          orderRef: 'trv_77',
          items: [
            {
              product: 'Flight',
              offerId: 'FL-1',
              label: 'BOG → CTG',
              reservationId: 'res_77_1',
              status: 'Confirmed',
              price: 1_250_000,
              priceFormatted: '$ 1.250.000',
              currency: 'COP',
            },
          ],
        });
      case 'POST /order/{ref}/cancel':
        return responder(200, {
          status: 'Cancelled',
          refunded: true,
          refundAmount: 1_250_000,
          refundAmountFormatted: '$ 1.250.000',
          currency: 'COP',
          orderRef: 'trv_77',
        });
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

describe('TravelShellElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<TravelShellElementComponent>;
  let component: TravelShellElementComponent;

  async function createComponent(config: object = NEGOCIO_DEL_CMS): Promise<void> {
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
    fixture.componentRef.setInput('config', config);
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

  /** Search cars offline → mock offers with category + transmission facets. */
  async function searchCars(): Promise<void> {
    component.selectProduct('car');
    component.carLocation.set('Aeropuerto El Dorado');
    component.carPickUp.set('2026-08-01');
    component.carDropOff.set('2026-08-05');
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
  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('sin la base de la API no llama a nada y degrada, visible (ADR 0137, CMS#196)', async () => {
    installMemoryStorage();
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent({});
    await searchFlights();

    expect(red).not.toHaveBeenCalled();
    expect(component.offers().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/vuelos';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/vuelos');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.view()).toBe('flights');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    component.navigate('stays');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1/estadias');
  });

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

  // ── hero copy: el CMS compone el título; sin config el default no cambia ─────
  it('paints the hero title + lead composed by the CMS instead of a baked string', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const host = fixture.nativeElement as HTMLElement;

    // 1) Sin config: la página se ve IDÉNTICA a antes (cambio puramente aditivo).
    expect(host.querySelector('.travel__hero-title')?.textContent?.trim()).toBe(
      'Tu próximo viaje empieza aquí',
    );
    expect(host.querySelector('.travel__hero-sub')?.textContent?.trim()).toBe(
      'Estadías, vuelos y autos en un solo lugar · un solo pago',
    );

    // 2) Con config: el título del editor GANA. Este es el caso que el whitelist
    //    de sanitizeConfig() descarta en silencio si alguien quita las claves —
    //    ni error ni warning, sólo el <h1> hardcodeado de vuelta.
    fixture.componentRef.setInput('config', { heading: 'X', subheading: 'Y' });
    fixture.detectChanges();

    expect(component.heading()).toBe('X');
    expect(component.subheading()).toBe('Y');
    expect(host.querySelector('.travel__hero-title')?.textContent?.trim()).toBe('X');
    expect(host.querySelector('.travel__hero-sub')?.textContent?.trim()).toBe('Y');

    // 3) La ruta REAL del CMS: DefaultSynHostEmitter fusiona todos los props en
    //    UN atributo config='{...}', así que la clave debe sobrevivir al JSON.
    fixture.componentRef.setInput(
      'config',
      JSON.stringify({ heading: 'Vuela con nosotros', subheading: 'Tarifas en vivo' }),
    );
    fixture.detectChanges();

    expect(host.querySelector('.travel__hero-title')?.textContent?.trim()).toBe(
      'Vuela con nosotros',
    );
    expect(host.querySelector('.travel__hero-sub')?.textContent?.trim()).toBe('Tarifas en vivo');
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

    // Car: el tercer producto. ANTES este test se llamaba «stay + flight + car»,
    // nunca agregaba un auto, y afirmaba `cartCount() === 2` celebrando el
    // cross-sell hacia el producto que no se podía agregar (#27). El auto era
    // inalcanzable: buscar uno caía en la vista de vuelos y `addCarToCart` no
    // tenía llamador.
    await searchCars();
    expect(component.view()).toBe('cars');
    // Se pulsa el BOTÓN, no el método: el defecto era precisamente que
    // `addCarToCart` existía y ninguna plantilla lo invocaba, así que un test que
    // llame al método directamente no vería volver la regresión.
    const agregar = fixture.nativeElement.querySelector(
      '.travel__car-card .travel__btn--primary',
    ) as HTMLButtonElement | null;
    expect(agregar).not.toBeNull();
    agregar!.click();
    await flushMicrotasks();
    fixture.detectChanges();

    const kinds = component.cartItems().map((item) => item.kind).sort();
    expect(kinds).toEqual(['car', 'flight', 'hotel']);
    expect(component.cartCount()).toBe(3);
    expect(component.hasCart()).toBe(true);
    // Con los tres productos dentro ya no hay nada que sugerir.
    expect(component.crossSell()).toBeNull();
  });

  // ── EL caso: buscar un auto llega a la vista de autos ────────────────────────
  it('buscar un auto lleva a la vista de AUTOS, no a la de vuelos', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await searchCars();

    // El ternario anterior mandaba `car` a `'flights'`, así que un auto se pintaba
    // bajo «Vuelos disponibles», pedía elegir una tarifa que no existe y el botón
    // de agregar quedaba gris: callejón sin salida.
    expect(component.view()).toBe('cars');
    expect(component.carResults().length).toBeGreaterThan(0);
    expect(component.carResults().every((offer) => offer.product === 'car')).toBe(true);
    expect(fixture.nativeElement.querySelector('syn-discovery-shell')).not.toBeNull();
  });

  it('los autos salen ordenados por precio, y se puede invertir', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await searchCars();

    // Ninguna lista de esta app tenía orden: cada tarjeta decía «desde $X» y no
    // había forma de ordenar por precio.
    const ascendente = component.carResults().map((o) => o.amount);
    expect(ascendente).toEqual([...ascendente].sort((a, b) => a - b));

    component.onCarCriteriaChange({ ...component.carCriteria(), sort: 'price-desc' });
    fixture.detectChanges();
    const descendente = component.carResults().map((o) => o.amount);
    expect(descendente).toEqual([...ascendente].reverse());
  });

  it('las facetas salen de los datos y filtran', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await searchCars();

    const claves = component.carFacets().map((f) => f.key);
    expect(claves).toContain('category');
    expect(claves).toContain('transmission');
    // De valor único, no casillas: el transporte manda un valor por clave, y
    // declararlas MultiSelect perdería la selección en silencio (#18).
    expect(component.carFacets().every((f) => f.kind === 'SingleSelect')).toBe(true);

    const total = component.carResults().length;
    component.onCarCriteriaChange({
      ...component.carCriteria(),
      facets: { transmission: ['Manual'] },
    });
    fixture.detectChanges();

    const filtrados = component.carResults();
    expect(filtrados.length).toBeGreaterThan(0);
    expect(filtrados.length).toBeLessThan(total);
    expect(filtrados.every((o) => o.carTransmission === 'Manual')).toBe(true);
  });

  it('una faceta con un solo valor no se pinta', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await searchCars();

    // Con la transmisión fijada en Manual, «Manual» queda como único valor de esa
    // faceta: un control que no filtra nada y ocupa el sitio de los que sí.
    component.onCarCriteriaChange({
      ...component.carCriteria(),
      facets: { transmission: ['Manual'] },
    });
    fixture.detectChanges();
    // La faceta se calcula sobre TODAS las ofertas, no sobre las filtradas, así
    // que sigue pintándose — quitarla dejaría a la persona sin poder deshacer.
    expect(component.carFacets().map((f) => f.key)).toContain('transmission');

    // El caso real de faceta única: una sola oferta.
    const una = component.carResults()[0];
    component.offers.set([una]);
    fixture.detectChanges();
    expect(component.carFacets()).toEqual([]);
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

  const alertas = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="alert"]')).map(
      (alerta) => alerta.textContent?.trim() ?? '',
    );

  function asistente(): CheckoutWizardComponent {
    return fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
  }

  /** Un vuelo en el carrito, viajero llenado, y el asistente hasta el envío final. */
  async function pagarUnVuelo(antesDeEnviar: (wizard: CheckoutWizardComponent) => void = () => undefined): Promise<void> {
    await searchFlights();
    component.addFlightToCart();
    await flushMicrotasks();
    component.guestName.set('Ada Lovelace');
    component.guestEmail.set('ada@example.com');
    component.goToCheckout();
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

  // ── UI#92: sin orden abierta no hay viaje, ni cobro, ni anuncio ───────────────
  it('con el POST /checkout caído no hay viaje: lo dice una vez, sin cobro ni anuncio', async () => {
    installMemoryStorage();
    const borde = bordeDeViajes({ caidas: ['POST /checkout'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const anunciados: unknown[] = [];
    component.bookingconfirmed.subscribe((payload) => anunciados.push(payload));
    const fallos = motivosDe();

    await pagarUnVuelo(fallos.escuchar);

    // La estrategia CONTESTA que no abrió la orden; no revienta.
    expect(fallos.motivos).toEqual(['checkout-not-opened']);

    expect(component.view()).toBe('checkout');
    expect(component.confirmationCode()).toBe('');
    expect(anunciados).toEqual([]);
    expect(borde.llamadas('POST /confirm')).toBe(0);
    expect(alertas()).toEqual([asistente().config().payFailedMessage]);
  });

  // ── UI#92: la orden quedó y los localizadores no — reintentar NO vuelve a cobrar
  it('con el POST /confirm caído nombra la orden que quedó; reintentar confirma la MISMA', async () => {
    installMemoryStorage();
    const borde = bordeDeViajes({ caidas: ['POST /confirm'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await pagarUnVuelo(fallos.escuchar);

    expect(fallos.motivos).toEqual(['locators-not-issued']);
    expect(component.view()).toBe('checkout');
    expect(component.confirmedVouchers()).toEqual([]);
    expect(alertas()).toEqual([asistente().config().confirmFailedMessage.replaceAll('{referencia}', 'trv_77')]);

    borde.encender('POST /confirm');
    asistente().next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.confirmationCode()).toBe('TRV-77-OK');
    expect(borde.llamadas('POST /checkout')).toBe(1);
    expect(borde.llamadas('POST /confirm')).toBe(2);
  });

  // ── checkout: SH-3 wizard → pay → confirm → SH-10 wallet ──────────────────────
  //
  // Corría con la red caída y lo que probaba era el `MOCK-<ts>` con localizadores armados
  // en el navegador (UI#92, regla 16). Hoy el borde contesta con la forma de verdad.
  it('runs the SH-3 wizard to a confirmation with credentials (checkout case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeViajes().fetchDoble);
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
    wizard.next(); // submit → pay (POST /checkout) → confirm (POST /confirm)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmation');
    expect(component.orderRef()).toBe('trv_77');
    expect(component.confirmationCode()).toBe('TRV-77-OK');
    expect(component.confirmedVouchers().map((voucher) => voucher.reservationId)).toEqual(['res_77_1']);
    expect(component.confirmationCredentials().length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── account: mis viajes (SH-4) + timeline + cancelar + wallet ─────────────────
  /** Mis viajes (una LECTURA: degrada a los de ejemplo) y el próximo, cancelable. */
  async function abrirMisViajes(): Promise<TravelTrip> {
    component.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.view()).toBe('account');
    const upcoming = component.trips().find((trip) => trip.status === 'upcoming')!;
    expect(component.canCancel(upcoming)).toBe(true);
    return upcoming;
  }

  // ── CMS#197: «Mis viajes» son los de la sesión, no los de un `?traveler=` ─────
  //
  // `HostIdentityService` lee `window.synergos` al construirse: el bridge va ANTES del componente.
  describe('quién viaja (CMS#197)', () => {
    interface ConBridge {
      synergos?: unknown;
    }
    afterEach(() => {
      delete (globalThis as unknown as ConBridge).synergos;
    });
    const rutasPedidas = (doble: ReturnType<typeof vi.fn>): string[] =>
      doble.mock.calls.map(([url]) => String(url));

    it('no manda `?traveler=`: los viajes son los del miembro que el servidor ve', async () => {
      const doble = vi.fn(() => Promise.reject(new Error('offline')));
      vi.stubGlobal('fetch', doble);
      await createComponent();
      component.goToAccount();
      await flushMicrotasks();

      const viajes = rutasPedidas(doble).filter((url) => url.includes('/trips'));
      expect(viajes).toEqual([`${NEGOCIO_DEL_CMS.apiBase}/trips`]);
    });

    it('con host y sin sesión pide entrar: ni pide ni pinta los viajes de muestra', async () => {
      (globalThis as unknown as ConBridge).synergos = {};
      const doble = vi.fn(() => Promise.reject(new Error('offline')));
      vi.stubGlobal('fetch', doble);
      await createComponent();
      component.goToAccount();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(rutasPedidas(doble).filter((url) => url.includes('/trips'))).toEqual([]);
      expect(component.trips()).toEqual([]);
      expect(component.tripsAccess()).toBe('sin-sesion');
      const host: HTMLElement = fixture.nativeElement;
      expect(host.textContent).toContain('Inicia sesión para ver tus viajes');
      expect(host.textContent).not.toContain('Todavía no tienes viajes reservados');
    });

    it('el 401 de `/trips` no cae a los viajes de muestra: pide entrar', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          String(url).includes('/trips')
            ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Se requiere iniciar sesión.' }) } as Response)
            : Promise.reject(new Error('offline')),
        ),
      );
      await createComponent();
      component.goToAccount();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.trips()).toEqual([]);
      expect(component.tripsAccess()).toBe('sin-sesion');
      expect(component.errorMessage()).toBe('');
      expect(fixture.nativeElement.textContent).toContain('Inicia sesión para ver tus viajes');
    });

    it('con sesión, los datos del viajero se prellenan con el miembro', async () => {
      (globalThis as unknown as ConBridge).synergos = {
        member: { key: 'k-3', displayName: 'Ada Lovelace', email: 'ada@ejemplo.co', roles: [] },
      };
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(component.guestName()).toBe('Ada Lovelace');
      expect(component.guestEmail()).toBe('ada@ejemplo.co');
    });
  });

  // ── UI#92: un viaje que no se canceló sigue en pie, con su botón ──────────────
  it('con la cancelación caída el viaje sigue «Próximo», cancelable, y se dice una vez', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeViajes({ caidas: ['POST /order/{ref}/cancel'] }).fetchDoble);
    await createComponent();
    const upcoming = await abrirMisViajes();

    component.cancelTrip(upcoming);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.cancelReceipt(upcoming.ref)).toBeNull();
    expect(component.trips().find((trip) => trip.ref === upcoming.ref)?.status).toBe('upcoming');
    expect(component.canCancel(upcoming)).toBe(true);
    expect(alertas()).toEqual(['No pudimos cancelar el viaje: sigue en pie. Intenta de nuevo.']);
  });

  it('loads mis viajes, derives the timeline and cancels a trip (SH-4 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeViajes().fetchDoble);
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
  // ── opiniones de la estadía: SH-13 (#28) ─────────────────────────────────────
  it('la ficha de la estadía monta SH-13 con los criterios de una ESTADÍA', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await searchStays();
    component.openStay(component.stayOffers()[0]);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('syn-review-panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.syn-reviews__dist-row').length).toBe(5);
    // Limpieza, ubicación y precio-valor: NO son los criterios de un curso.
    expect(component.stayReviewSummary().criteria?.map((c) => c.id)).toEqual([
      'limpieza',
      'ubicacion',
      'precio-valor',
    ]);
    expect(component.stayReviewPrompts().map((p) => p.id)).toEqual([
      'limpieza',
      'ubicacion',
      'precio-valor',
    ]);
  });

  it('un envío contra un endpoint que no existe NO dice «gracias»', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await searchStays();
    component.openStay(component.stayOffers()[0]);
    await flushMicrotasks();

    await component.submitStayReview({
      rating: 5,
      title: 'Volvería',
      body: 'La ubicación es inmejorable.',
      criteria: { limpieza: 5, ubicacion: 5, 'precio-valor': 4 },
    });

    expect(component.reviewFailed()).toBe(true);
    expect(component.reviewNotice()).not.toContain('publicada');
    expect(component.reviewNotice()).toContain('No pudimos publicar');
  });

  // ── SH-14 comparar (#30) ─────────────────────────────────────────────────────
  //
  // Lo que este dominio prueba y los otros tres no pueden: **dos selecciones
  // separadas**. Un hotel y un auto no tienen eje común, así que compartir la
  // selección daría una tabla con filas vacías en tres de cada cuatro celdas.
  it('estadías y autos comparan POR SEPARADO: no comparten selección', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const marcarDos = async (): Promise<void> => {
      const botones = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.travel__cmp'),
      ) as HTMLButtonElement[];
      expect(botones.length).toBeGreaterThan(1);
      botones[0].click();
      botones[1].click();
      await flushMicrotasks();
      fixture.detectChanges();
    };

    await searchStays();
    await marcarDos();
    expect(component.compareStays.count()).toBe(2);
    expect(component.compareCars.count()).toBe(0);

    await searchCars();
    await marcarDos();
    expect(component.compareCars.count()).toBe(2);
    // Y lo de estadías NO se perdió al cambiar de producto.
    expect(component.compareStays.count()).toBe(2);

    const filas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
    ).map((el) => el.textContent?.trim());
    // El eje de los autos, no el de las estadías: categoría y transmisión son los
    // datos que #27 volvió datos de verdad en vez de prosa del `subtitle`.
    expect(filas).toContain('Categoría');
    expect(filas).toContain('Transmisión');
    expect(filas).not.toContain('Zona');
  });

  it('régimen y zona NO se pintan: viajan dentro del subtitle como prosa', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    await searchStays();
    const botones = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.travel__cmp'),
    ) as HTMLButtonElement[];
    botones[0].click();
    botones[1].click();
    fixture.detectChanges();

    const filas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
    ).map((el) => el.textContent?.trim());
    // Están DECLARADAS en el eje y no se pintan porque ningún candidato las trae:
    // partir el `subtitle` para rellenarlas sería adivinar (#27).
    expect(component.stayCompareAttributes.map((a) => a.id)).toContain('board');
    expect(filas).not.toContain('Régimen');
    expect(filas).not.toContain('Zona');
    // Y lo que sí es dato, sí sale.
    expect(filas).toContain('Precio');
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

  it('degrades stay + trips to visible mock data — the READS (degradation case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const stay = await client.stay('/api/travel', 'HMOCK-1', 'COP');
    expect(client.degraded).toBe(true);
    expect(stay.rates.length).toBeGreaterThan(0);
    expect(stay.amenities.length).toBeGreaterThan(0);

    const trips = await client.trips('/api/travel', 'COP');
    expect(trips.length).toBeGreaterThan(0);
    expect(trips[0].items.length).toBeGreaterThan(0);
  });

  // ── EL QUE MUERDE: con la red caída no hay orden, ni localizador, ni cancelación ─
  it('con la red caída abrir la orden, confirmar y cancelar LANZAN (UI#92)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    await expect(
      client.checkout('/api/travel', [{ product: 'hotel', offerId: 'X1', detail: {} }], { name: 'Ada', email: 'a@b.co' }, 'COP'),
    ).rejects.toMatchObject({ name: 'TravelWriteFailedError', endpoint: 'POST /api/travel/checkout' });
    await expect(client.confirm('/api/travel', 'trv_77')).rejects.toMatchObject({ name: 'TravelWriteFailedError' });
    await expect(client.cancel('/api/travel', 'TRIP-2026-0481')).rejects.toMatchObject({
      name: 'TravelWriteFailedError',
    });
    expect(client.degraded).toBe(false);
  });

  it('opens a single checkout session and confirms with reservationIds (happy case)', async () => {
    vi.stubGlobal('fetch', bordeDeViajes().fetchDoble);
    const client = createClient();

    const checkout = await client.checkout(
      '/api/travel',
      [{ product: 'flight', offerId: 'FL-1', detail: {} }],
      { name: 'Ada', email: 'a@b.co' },
      'COP',
    );
    expect(checkout.orderRef).toBe('trv_77');

    const confirmation = await client.confirm('/api/travel', 'trv_77');
    expect(confirmation.status).toBe('Confirmed');
    expect(confirmation.confirmationCode).toBe('TRV-77-OK');
    expect(confirmation.items[0].reservationId).toBe('res_77_1');

    const receipt = await client.cancel('/api/travel', 'trv_77');
    expect(receipt).toMatchObject({ ref: 'trv_77', status: 'cancelled' });
  });
  // ── #28: el default de `canReview` ──
  it('`canReview` ausente significa NO (default seguro)', async () => {
    const client = createClient();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stay: { id: 'S-1', title: 'Hotel', currency: 'COP' } }),
        } as Response),
      ),
    );

    const detalle = await client.stay('/api/travel', 'S-1', 'COP');

    expect(detalle.canReview).toBe(false);
    expect(detalle.reviews).toEqual([]);
    expect(detalle.reviewSummary).toBeNull();
  });
});

// ── ficha de estadía cargando: esqueleto CON forma + aviso audible ────────────
describe('TravelShellElementComponent — stay loading surface', () => {
  let fixture: ComponentFixture<TravelShellElementComponent>;
  let component: TravelShellElementComponent;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

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
    fixture.componentRef.setInput('config', NEGOCIO_DEL_CMS);
    fixture.detectChanges();
  }

  it('reserves the detail-shell shape with a skeleton and still announces the load', async () => {
    installMemoryStorage();
    // A never-resolving fetch parks loadStay() mid-flight → stay() null, loading true.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await createComponent();

    component.navigate('stay', 'HT-1');
    fixture.detectChanges();

    expect(component.stay()).toBeNull();
    expect(component.loading()).toBe(true);

    const host = fixture.nativeElement as HTMLElement;

    // 1) The mould mirrors syn-detail-shell's __top: a 4:3 gallery, an info
    //    column and a CTA column — not three generic bars.
    expect(host.querySelector('.travel__stay-skeleton-top')).not.toBeNull();
    expect(host.querySelector('.travel__bone--media')).not.toBeNull();
    expect(host.querySelectorAll('.travel__bone--thumb').length).toBe(3);
    expect(host.querySelector('.travel__bone--button')).not.toBeNull();

    // 2) Bones are decorative and hidden from assistive tech…
    expect(host.querySelector('.travel__stay-skeleton')?.getAttribute('aria-hidden')).toBe(
      'true',
    );

    // 3) …so the announcement MUST survive on a live region. Skeleton without
    //    this pair = prettier screen, silent screen reader — a11y REGRESSION.
    const announcement = host.querySelector('.travel__sr');
    expect(announcement).not.toBeNull();
    expect(announcement!.getAttribute('role')).toBe('status');
    expect(announcement!.textContent).toContain('Cargando alojamiento');
  });

  it('retires the skeleton AND its announcement once the stay settles', async () => {
    installMemoryStorage();
    // The API client degrades to mockStay() instead of throwing, so an offline
    // fetch still ends in a fully rendered detail shell — never in an error.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.navigate('stay', 'HT-1');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.stay()).not.toBeNull();

    const host = fixture.nativeElement as HTMLElement;
    // No stale live region left behind: a `role="status"` still reading
    // "Cargando…" after the content arrived would keep announcing a lie.
    expect(host.querySelector('.travel__stay-skeleton')).toBeNull();
    expect(host.querySelector('.travel__sr')).toBeNull();
    expect(host.textContent).not.toContain('Cargando alojamiento');
  });

});
