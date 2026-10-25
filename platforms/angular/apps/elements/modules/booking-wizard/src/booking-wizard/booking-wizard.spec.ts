import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES, SessionStore } from '@synergos/transaction-engine';
import { BookingWizardElementComponent } from './booking-wizard';
import { BookingApiClient } from './booking-api.client';
import { BookingFulfillmentStrategy } from './booking-fulfillment.strategy';
import type { BookingOffer } from './booking.model';
import { BOOKING_WIZARD_SYNHOST } from '@synergos/contracts';
import { definirCoordinador } from '@synergos/vitals-core';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: BOOKING_WIZARD_SYNHOST.ejemplo.apiBase };

/**
 * El asistente de reserva, ya compuesto (#24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE DE VERDAD SE PRUEBA ACÁ son los dos fallos del final, que antes eran
 * UNO. `/hold` fallido significa que la habitación ya no está y hay que volver a
 * elegir; `/pay` fallido significa que la tarjeta no pasó y reintentar ahí mismo
 * es lo correcto. Los dos caían al mismo `catch` con el mismo texto y dejaban a
 * la persona en el mismo sitio, reintentando un pago contra un apartado que
 * nunca iba a existir.
 *
 * Y no lo vio nadie porque los tests de antes mockeaban `fetch` con la respuesta
 * feliz: el camino de error no tenía un solo caso. Por eso acá el mock despacha
 * **por URL**, que es lo que permite hacer fallar una llamada y no la otra.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** localStorage en memoria: el motor persiste su sesión ahí. */
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

interface RespuestasPorRuta {
  readonly search?: unknown;
  /** `false` = el motor no aparta. */
  readonly hold?: unknown | false;
  /** `false` = el cobro no pasa. */
  readonly pay?: unknown | false;
}

/**
 * Mock de `fetch` que despacha por ruta. Devolver `false` para una ruta la hace
 * fallar con 500 — que es la única forma de distinguir los dos fallos del final.
 */
function stubFetch(rutas: RespuestasPorRuta): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    const clave = url.endsWith('/search') ? 'search' : url.endsWith('/hold') ? 'hold' : 'pay';
    const body = rutas[clave as keyof RespuestasPorRuta];
    if (body === false || body === undefined) {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

async function settle(fixture: ComponentFixture<unknown>, times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
    fixture.detectChanges();
  }
}

const SAMPLE_OFFER: BookingOffer = {
  offerId: 'OFR-1',
  // El producto de la estadía lo dice el servidor con SU regla; no se parece al `offerId` a propósito.
  productRef: 'SUITE/BB',
  roomTypeName: 'Suite Vista al Mar',
  board: 'Desayuno incluido',
  totalPrice: 1_200_000,
  totalPriceFormatted: '$ 1.200.000',
  currency: 'COP',
  refundable: true,
  cancellationPolicy: 'Cancelación gratuita hasta 48h antes',
  roomsLeft: 3,
};

const OTRA_OFERTA: BookingOffer = {
  ...SAMPLE_OFFER,
  offerId: 'OFR-2',
  productRef: 'STD/RO',
  roomTypeName: 'Habitación Estándar',
  totalPrice: 600_000,
  totalPriceFormatted: '$ 600.000',
};

const VOUCHER_OK = {
  reservationId: 'RES-9001',
  status: 'Confirmed',
  totalPrice: 1_200_000,
  totalPriceFormatted: '$ 1.200.000',
  currency: 'COP',
  checkIn: '2026-10-01',
  checkOut: '2026-10-04',
};

describe('BookingWizardElementComponent', () => {
  let fixture: ComponentFixture<BookingWizardElementComponent>;
  let component: BookingWizardElementComponent;

  beforeEach(() => {
    installMemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BookingApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: BookingFulfillmentStrategy, multi: true },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mount(config: object = NEGOCIO_DEL_CMS): void {
    fixture = TestBed.createComponent(BookingWizardElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
  }

  const texto = (sel: string): string =>
    (fixture.nativeElement.querySelector(sel)?.textContent ?? '').trim();

  const primario = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.syn-wizard__btn--primary') as HTMLButtonElement;

  /** Pulsa «continuar» de SH-3 y deja asentar lo que dispare. */
  async function avanzar(): Promise<void> {
    primario().click();
    await settle(fixture);
  }

  function conFechas(): void {
    component.checkIn.set('2026-10-01');
    component.checkOut.set('2026-10-04');
    fixture.detectChanges();
  }

  async function hastaRevisar(): Promise<void> {
    conFechas();
    await avanzar(); // fechas → habitación (dispara la búsqueda)
    fixture.nativeElement.querySelectorAll('.booking-wizard__offer button')[0].click();
    await settle(fixture);
    await avanzar(); // habitación → huésped
    component.guestName.set('Camila Restrepo');
    component.guestEmail.set('camila@example.com');
    fixture.detectChanges();
    await avanzar(); // huésped → revisar
  }

  // ─── vacío ──────────────────────────────────────────────────────────────────
  it('sin la base de la API no llama a nada y la búsqueda avisa, visible (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    mount({});
    conFechas();
    await avanzar();

    expect(red).not.toHaveBeenCalled();
    expect(component.offers()).toHaveLength(0);
    expect(component.errorMessage()).not.toBe('');
  });

  it('arranca en fechas, con una habitación por defecto y sin pedir disponibilidad', () => {
    const fetchMock = stubFetch({ search: { offers: [SAMPLE_OFFER] } });
    mount();

    expect(component.currentStep()).toBe('fechas');
    expect(component.rooms()).toEqual([{ adults: 2, childAges: [] }]);
    // Nada de red hasta que haya fechas: buscar con el formulario en blanco
    // gastaría una llamada para devolver todo el inventario.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('monta SH-3 y no el indicador de pasos a mano', () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER] } });
    mount();

    expect(fixture.nativeElement.querySelector('syn-checkout-wizard')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.booking-wizard__steps')).toBeNull();
  });

  // ─── gating ─────────────────────────────────────────────────────────────────
  it('sin fechas válidas no se pasa de paso', async () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER] } });
    mount();

    expect(primario().disabled).toBe(true);

    // Salida antes que entrada: sigue bloqueado y lo dice.
    component.checkIn.set('2026-10-04');
    component.checkOut.set('2026-10-01');
    fixture.detectChanges();
    expect(primario().disabled).toBe(true);
    expect(component.dateError()).toContain('posterior');

    conFechas();
    expect(primario().disabled).toBe(false);
  });

  // ─── feliz ──────────────────────────────────────────────────────────────────
  it('al entrar a habitación pide la disponibilidad sola y la pinta', async () => {
    const fetchMock = stubFetch({ search: { offers: [SAMPLE_OFFER, OTRA_OFERTA] } });
    mount();
    conFechas();
    await avanzar();

    expect(component.currentStep()).toBe('habitacion');
    expect(fixture.nativeElement.querySelectorAll('.booking-wizard__offer')).toHaveLength(2);
    expect(texto('.booking-wizard__offer-title')).toBe('Suite Vista al Mar');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/booking/search');
    expect(JSON.parse(String(init.body))).toMatchObject({
      checkIn: '2026-10-01',
      checkOut: '2026-10-04',
    });
  });

  it('elegir una oferta la mete como LÍNEA del carrito del motor', async () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER] } });
    mount();
    conFechas();
    await avanzar();
    fixture.nativeElement.querySelectorAll('.booking-wizard__offer button')[0].click();
    await settle(fixture);

    const store = TestBed.inject(SessionStore);
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].productRef).toBe('OFR-1');
    // El motor cuenta en unidades menores.
    expect(store.pricing().totalAmount).toBe(120_000_000);
    expect(component.selectedOffer()?.roomTypeName).toBe('Suite Vista al Mar');
  });

  it('el sessionKey del tag, que llega DESPUÉS del constructor, rige la sesión (CMS#196)', async () => {
    const almacen = installMemoryStorage();
    stubFetch({ search: { offers: [SAMPLE_OFFER] } });
    fixture = TestBed.createComponent(BookingWizardElementComponent);
    component = fixture.componentInstance;
    // Como en un custom element: los inputs se aplican tras crear el componente y antes del primer ciclo.
    fixture.componentRef.setInput('sessionKey', 'reserva-a');
    fixture.componentRef.setInput('config', NEGOCIO_DEL_CMS);
    fixture.detectChanges();
    conFechas();
    await avanzar();
    fixture.nativeElement.querySelectorAll('.booking-wizard__offer button')[0].click();
    await settle(fixture);

    expect([...almacen.keys()]).toContain('syn.txn.session.booking.reserva-a');
  });

  it('confirma y entrega el desenlace a SH-11 con la referencia de la reserva', async () => {
    stubFetch({
      search: { offers: [SAMPLE_OFFER] },
      hold: { reservationId: 'RES-9001' },
      pay: VOUCHER_OK,
    });
    mount();
    const confirmados: string[] = [];
    component.bookingconfirmed.subscribe((v) => confirmados.push(v.reservationId));

    await hastaRevisar();
    expect(component.currentStep()).toBe('revisar');

    await avanzar(); // confirmar y pagar
    await settle(fixture);

    expect(component.voucher()?.reservationId).toBe('RES-9001');
    expect(confirmados).toEqual(['RES-9001']);
    expect(fixture.nativeElement.querySelector('syn-confirmation-shell')).not.toBeNull();
    expect(texto('.syn-confirm__ref-value')).toBe('RES-9001');
    // Terminal: el asistente desaparece, porque volver a pintarlo ofrecería
    // reservar otra vez lo mismo.
    expect(fixture.nativeElement.querySelector('syn-checkout-wizard')).toBeNull();
  });

  // ─── EL caso: los dos fallos que antes eran uno ─────────────────────────────

  /**
   * Los textos de los `role="alert"` con algo escrito. El fallo lo dice el ASISTENTE, una
   * vez (UI#91): la ficha lo repetía en su banner, y con el texto por defecto del asistente
   * el pago FALLIDO se anunciaba como «Ya recibimos tu pago».
   */
  function alertas(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]'))
      .map((alerta) => (alerta.textContent ?? '').trim())
      .filter((texto) => texto !== '');
  }

  const NO_SE_COBRO = 'No pudimos completar el pago de tu reserva. Revisa tus datos e intenta de nuevo.';
  it('el APARTADO fallido manda a elegir otra habitación y suelta la línea muerta', async () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER, OTRA_OFERTA] }, hold: false });
    mount();
    await hastaRevisar();

    await avanzar(); // intentar confirmar
    await settle(fixture);

    // Dice lo que pasó de verdad: la habitación, no el pago — y UNA vez.
    expect(alertas()).toEqual(['Esa habitación ya no está disponible. Elige otra de las opciones.']);
    // Y suelta la selección: dejarla viva deja el botón de confirmar apuntando a
    // algo que el motor ya rechazó.
    expect(TestBed.inject(SessionStore).items()).toHaveLength(0);
    expect(component.selectedOffer()).toBeNull();
    // No hay comprobante que celebrar.
    expect(component.voucher()).toBeNull();
  });

  it('el COBRO fallido se queda donde está y NO suelta la línea', async () => {
    stubFetch({
      search: { offers: [SAMPLE_OFFER] },
      hold: { reservationId: 'RES-9001' },
      pay: false,
    });
    mount();
    await hastaRevisar();

    await avanzar();
    await settle(fixture);

    // Acá reintentar SÍ sirve, así que la reserva elegida se conserva. Y el aviso es UNO y
    // dice que el pago NO salió: el texto por defecto decía «Ya recibimos tu pago».
    expect(alertas()).toEqual([NO_SE_COBRO]);
    expect(TestBed.inject(SessionStore).items()).toHaveLength(1);
    expect(component.selectedOffer()?.offerId).toBe('OFR-1');
    expect(component.voucher()).toBeNull();
  });

  it('un estado que no es «confirmado» NO es un comprobante', async () => {
    stubFetch({
      search: { offers: [SAMPLE_OFFER] },
      hold: { reservationId: 'RES-9001' },
      pay: { ...VOUCHER_OK, status: 'Pending' },
    });
    mount();
    await hastaRevisar();

    await avanzar();
    await settle(fixture);

    // Celebrar un «pendiente» le diría a alguien que tiene habitación cuando el
    // motor no lo ha aceptado.
    expect(component.voucher()).toBeNull();
    expect(alertas()).toEqual([NO_SE_COBRO]);
  });

  // ─── búsqueda sin resultados ────────────────────────────────────────────────
  it('sin disponibilidad lo dice y deja volver a buscar', async () => {
    stubFetch({ search: { offers: [] } });
    mount();
    conFechas();
    await avanzar();

    expect(component.hasOffers()).toBe(false);
    expect(fixture.nativeElement.querySelector('syn-empty-state')).not.toBeNull();
    // Y no se puede seguir: sin habitación no hay nada que revisar.
    expect(primario().disabled).toBe(true);
  });

  it('si la búsqueda revienta lo dice y no deja el paso en blanco', async () => {
    stubFetch({ search: false });
    mount();
    conFechas();
    await avanzar();

    expect(component.errorMessage()).toContain('No pudimos buscar disponibilidad');
    expect(component.hasOffers()).toBe(false);
    // Y el paso no queda en blanco: dice que no hay nada que elegir.
    expect(fixture.nativeElement.querySelector('syn-empty-state')).not.toBeNull();
  });

  // ─── idempotente ────────────────────────────────────────────────────────────
  it('elegir la misma oferta dos veces deja UNA línea, no dos', async () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER] } });
    mount();
    conFechas();
    await avanzar();

    const boton = fixture.nativeElement.querySelectorAll('.booking-wizard__offer button')[0];
    boton.click();
    await settle(fixture);
    boton.click();
    await settle(fixture);

    expect(TestBed.inject(SessionStore).items()).toHaveLength(1);
  });

  it('elegir otra oferta REEMPLAZA: una reserva es una habitación', async () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER, OTRA_OFERTA] } });
    mount();
    conFechas();
    await avanzar();

    const botones = fixture.nativeElement.querySelectorAll('.booking-wizard__offer button');
    botones[0].click();
    await settle(fixture);
    botones[1].click();
    await settle(fixture);

    const store = TestBed.inject(SessionStore);
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].productRef).toBe('OFR-2');
  });

  // ─── empezar de nuevo ───────────────────────────────────────────────────────
  it('«Nueva reserva» deja la sesión del motor limpia', async () => {
    stubFetch({
      search: { offers: [SAMPLE_OFFER] },
      hold: { reservationId: 'RES-9001' },
      pay: VOUCHER_OK,
    });
    mount();
    await hastaRevisar();
    await avanzar();
    await settle(fixture);
    expect(component.voucher()).not.toBeNull();

    (fixture.nativeElement.querySelector('.syn-confirm__action') as HTMLButtonElement).click();
    await settle(fixture);

    expect(component.voucher()).toBeNull();
    expect(component.currentStep()).toBe('fechas');
    expect(TestBed.inject(SessionStore).items()).toHaveLength(0);
    expect(component.guestName()).toBe('');
  });
});

// ══ LA ESTADÍA POR LA PUERTA (línea 006, T022; ADR 0140) ═════════════════════════════════════════════════
//
// El asistente reserva por el `<synergos-flujo flujo="viajes.reserva">` que coloca la vista: una estadía es un viaje
// de UN ítem (006-P4). Lo que se mira es lo que viajó a la puerta —la llave, el producto de la oferta, su etiqueta y
// su ventana— y lo que el SERVIDOR contestó. Nunca cae a /hold ni a /pay.

type OperacionDeLaEstadia = 'abrir' | 'cerrar' | 'cancelar' | 'consultar';

interface GuionDeLaEstadia {
  /** El total que dice el servidor, en unidades MAYORES. */
  readonly total?: number;
  readonly rechazos?: Partial<Record<OperacionDeLaEstadia, { readonly code: string; readonly status?: number; readonly transient?: boolean }>>;
  /** Lo que `consultar` dice de la estadía después de un `cerrar` rechazado. */
  readonly estadoTrasCerrar?: string;
  /** Las ofertas que contesta la búsqueda. */
  readonly ofertas?: readonly BookingOffer[];
}

interface PedidoALaEstadia {
  readonly operacion: string;
  readonly url: string;
  readonly llave: string | null;
  readonly cuerpo: {
    readonly items?: readonly { producto: string; etiqueta: string | null; ventana: { start: string; end: string } }[];
  } | null;
}

const ID_DE_LA_ESTADIA = 'viaje-15';
const NUMERO_DE_LA_ESTADIA = 'VIA-0015';

/** La puerta de la estadía; la búsqueda la sigue sirviendo el CMS. `/hold` y `/pay` se sirven y se cuentan. */
function puertaDeLaEstadia(guion: GuionDeLaEstadia = {}) {
  const pedidos: PedidoALaEstadia[] = [];
  const rutas: string[] = [];
  let estado = 'Running';
  const total = { amount: guion.total ?? 1_150_000, currency: 'COP' };
  const json = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const estadia = () => ({
    id: ID_DE_LA_ESTADIA,
    flujo: 'viajes.reserva',
    numero: NUMERO_DE_LA_ESTADIA,
    estado,
    datos: { itinerario: [], subtotal: total, descuento: null, impuesto: null, total, vence: '2026-10-01T10:15:00Z' },
    compensacionesPendientes: 0,
    error: null,
    deshaciendo: false,
  });
  const fetchDoble = vi.fn((url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const ruta = String(url);
    rutas.push(`${(init?.method ?? 'GET').toUpperCase()} ${ruta}`);
    if (ruta.endsWith('/search')) {
      return json(200, { offers: guion.ofertas ?? [SAMPLE_OFFER, OTRA_OFERTA] });
    }
    if (ruta.endsWith('/hold')) {
      return json(200, { reservationId: 'RES-9001' });
    }
    if (ruta.endsWith('/pay')) {
      return json(200, VOUCHER_OK);
    }
    const m = /\/api\/flujos\/viajes\.reserva\/([a-z]+)/.exec(ruta);
    if (!m) {
      return json(500, {});
    }
    const operacion = m[1] as OperacionDeLaEstadia;
    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as PedidoALaEstadia['cuerpo']) : null;
    pedidos.push({ operacion, url: ruta, llave: new Headers(init?.headers).get('Idempotency-Key'), cuerpo });
    const rechazo = guion.rechazos?.[operacion];
    if (rechazo) {
      if (operacion === 'cerrar' && guion.estadoTrasCerrar) estado = guion.estadoTrasCerrar;
      return json(rechazo.status ?? 409, { code: rechazo.code, detail: 'guionado', title: 'Conflict', transient: rechazo.transient ?? false });
    }
    switch (operacion) {
      case 'abrir':
        estado = 'Running';
        return json(201, estadia());
      case 'cerrar':
        estado = 'Completed';
        return json(200, estadia());
      case 'cancelar':
        estado = estado === 'Running' ? 'Compensated' : estado;
        return json(200, estadia());
      default:
        return json(200, estadia());
    }
  });
  return {
    fetchDoble,
    pedidos,
    veces: (operacion: OperacionDeLaEstadia) => pedidos.filter((p) => p.operacion === operacion).length,
    busquedas: () => rutas.filter((r) => r.endsWith('/search')).length,
    directas: () => rutas.filter((r) => /\/(hold|pay)$/.test(r)).length,
    alaPuerta: () => rutas.filter((r) => r.includes('/api/flujos')).length,
    fueraDeLaBusqueda: () => rutas.filter((r) => !r.endsWith('/search')).length,
  };
}

/** Lo que el CMS manda cuando un sitio declara la puerta (`CaminoDeCompra.Decidir`, «directa» por defecto). */
const POR_LA_PUERTA = { ...NEGOCIO_DEL_CMS, bookingPath: 'puerta' };

describe('La estadía por la puerta (línea 006)', () => {
  let fixture: ComponentFixture<BookingWizardElementComponent>;
  let component: BookingWizardElementComponent;

  beforeAll(() => definirCoordinador());

  function montar(
    puerta: ReturnType<typeof puertaDeLaEstadia>,
    config: object = POR_LA_PUERTA,
    { conCoordinador = true }: { conCoordinador?: boolean } = {},
  ): void {
    installMemoryStorage();
    vi.stubGlobal('fetch', puerta.fetchDoble);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BookingApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: BookingFulfillmentStrategy, multi: true },
      ],
    });
    fixture = TestBed.createComponent(BookingWizardElementComponent);
    component = fixture.componentInstance;
    // Como lo coloca el CMS: dentro de su <synergos-flujo>, que la estadía encuentra por ancestro.
    if (conCoordinador) {
      const flujo = document.createElement('synergos-flujo');
      flujo.setAttribute('flujo', 'viajes.reserva');
      document.body.appendChild(flujo);
      flujo.appendChild(fixture.nativeElement as HTMLElement);
    }
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
  }

  afterEach(() => {
    document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  const primario = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.syn-wizard__btn--primary') as HTMLButtonElement;

  async function avanzar(veces = 12): Promise<void> {
    primario().click();
    await settle(fixture, veces);
  }

  /** Fechas, la primera oferta, el huésped, y el asistente en «revisar». */
  async function hastaRevisar(): Promise<void> {
    component.checkIn.set('2026-10-01');
    component.checkOut.set('2026-10-04');
    fixture.detectChanges();
    await avanzar();
    fixture.nativeElement.querySelectorAll('.booking-wizard__offer button')[0].click();
    await settle(fixture);
    await avanzar();
    component.guestName.set('Camila Restrepo');
    component.guestEmail.set('camila@example.com');
    fixture.detectChanges();
    await avanzar();
  }

  /** Confirmar recorre abrir, cerrar y, si cerrar falla, consultar: cada vuelta a la red son varias microtareas. */
  async function confirmar(): Promise<void> {
    await avanzar(100);
  }

  function avisos(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"], syn-live-region, .booking-wizard__error'))
      .map((nodo) => (nodo.textContent ?? '').trim())
      .filter((texto) => texto !== '');
  }

  const cancelarPendiente = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('.booking-wizard__btn--secondary') as HTMLButtonElement | null;

  it('«puerta»: abre UN ítem con el productRef de la oferta, su nombre y la ventana de la estadía; cierra por su id; ni /hold ni /pay', async () => {
    const puerta = puertaDeLaEstadia();
    montar(puerta);
    await hastaRevisar();
    await confirmar();

    const abrir = puerta.pedidos.find((p) => p.operacion === 'abrir')!;
    expect(abrir.cuerpo!.items).toEqual([
      {
        producto: 'SUITE/BB',
        etiqueta: 'Suite Vista al Mar',
        ventana: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-04T00:00:00.000Z' },
      },
    ]);
    expect(abrir.llave).toMatch(/\S/);
    expect(puerta.pedidos.find((p) => p.operacion === 'cerrar')!.url).toContain(`id=${ID_DE_LA_ESTADIA}`);
    expect(puerta.directas()).toBe(0);
    // El comprobante enseña el número del viaje y el total que dijo el SERVIDOR.
    expect(component.voucher()?.reservationId).toBe(NUMERO_DE_LA_ESTADIA);
    expect(component.voucher()?.totalPrice).toBe(1_150_000);
  });

  it('el total y el plazo del apartado son los que dijo el SERVIDOR al abrir, no el precio de la oferta', async () => {
    const puerta = puertaDeLaEstadia({ total: 1_345_000, rechazos: { cerrar: { code: 'gateway.timeout', status: 504, transient: true } } });
    montar(puerta);
    await hastaRevisar();
    await confirmar();

    const store = TestBed.inject(SessionStore);
    expect(store.pricing().totalAmount).toBe(134_500_000);
    expect(store.items()[0].expiresAt).toBe('2026-10-01T10:15:00Z');
    // Transitorio: la estadía sigue abierta, así que no se consulta ni se suelta.
    expect(puerta.veces('consultar')).toBe(0);
  });

  it('una oferta sin productRef NO se reserva por la puerta, ni cae a la directa: lo dice', async () => {
    const puerta = puertaDeLaEstadia({ ofertas: [{ ...SAMPLE_OFFER, productRef: '' }] });
    montar(puerta);
    await hastaRevisar();
    await confirmar();

    expect(puerta.fueraDeLaBusqueda()).toBe(0);
    expect(avisos()).toContain('Esa habitación no se puede reservar en línea.');
    expect(component.voucher()).toBeNull();
  });

  it('sin cupo al abrir: lo dice UNA vez, suelta la elección y vuelve a pedir la disponibilidad', async () => {
    const puerta = puertaDeLaEstadia({ rechazos: { abrir: { code: 'booking.at_capacity' } } });
    montar(puerta);
    await hastaRevisar();
    const antes = puerta.busquedas();
    await confirmar();

    expect(avisos().filter((t) => t === 'Esa habitación ya no está disponible. Elige otra de las opciones.')).toHaveLength(1);
    expect(TestBed.inject(SessionStore).items()).toHaveLength(0);
    expect(puerta.busquedas()).toBe(antes + 1);
    expect(puerta.directas()).toBe(0);
  });

  it('un 503 de la puerta NO cae a la ruta directa: dice que las reservas no están disponibles', async () => {
    const puerta = puertaDeLaEstadia({ rechazos: { abrir: { code: 'puerta.flujo_no_disponible', status: 503 } } });
    montar(puerta);
    await hastaRevisar();
    await confirmar();

    expect(puerta.directas()).toBe(0);
    expect(component.voucher()).toBeNull();
    expect(avisos()).toContain('Las reservas en línea no están disponibles en este momento.');
  });

  it('cerrar rechazado y la estadía COMPLETADA al consultar: se confirma con lo que dice el servidor (defecto 3)', async () => {
    const puerta = puertaDeLaEstadia({ rechazos: { cerrar: { code: 'cliente.respuesta_ilegible' } }, estadoTrasCerrar: 'Completed' });
    montar(puerta);
    await hastaRevisar();
    await confirmar();

    expect(puerta.veces('consultar')).toBe(1);
    expect(component.voucher()?.reservationId).toBe(NUMERO_DE_LA_ESTADIA);
  });

  it('una estadía que no se confirmó se puede CANCELAR: suelta y no cobra; después ya no se ofrece', async () => {
    const puerta = puertaDeLaEstadia({ rechazos: { cerrar: { code: 'viajes.not_continuable' } }, estadoTrasCerrar: 'Running' });
    montar(puerta);
    await hastaRevisar();
    await confirmar();

    expect(puerta.veces('consultar')).toBe(1);
    expect(component.voucher()).toBeNull();
    expect(cancelarPendiente()?.textContent?.trim()).toBe('Cancelar la reserva sin confirmar');
    cancelarPendiente()!.click();
    await settle(fixture, 20);

    expect(puerta.veces('cancelar')).toBe(1);
    expect(puerta.pedidos.find((p) => p.operacion === 'cancelar')!.url).toContain(`id=${ID_DE_LA_ESTADIA}`);
    expect(avisos()).toContain('Cancelamos tu reserva sin confirmar. No se te cobró nada.');
    expect(cancelarPendiente()).toBeNull();
  });

  it('«directa» (o sin declarar): ni una petición a /api/flujos; aparta y cobra por /hold y /pay como siempre', async () => {
    for (const config of [{ ...POR_LA_PUERTA, bookingPath: 'directa' }, NEGOCIO_DEL_CMS]) {
      const puerta = puertaDeLaEstadia();
      montar(puerta, config);
      await hastaRevisar();
      await confirmar();

      expect(puerta.alaPuerta()).toBe(0);
      expect(puerta.directas()).toBe(2);
      expect(component.voucher()?.reservationId).toBe('RES-9001');
      document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
      vi.unstubAllGlobals();
      TestBed.resetTestingModule();
    }
  });

  it('«puerta» sin <synergos-flujo> arriba: «no disponible», sin asistente y sin tocar la red', async () => {
    const puerta = puertaDeLaEstadia();
    montar(puerta, POR_LA_PUERTA, { conCoordinador: false });
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('syn-checkout-wizard')).toBeNull();
    expect(avisos()).toContain('Las reservas en línea no están disponibles en este momento.');
    expect(puerta.fetchDoble).not.toHaveBeenCalled();
  });
});
