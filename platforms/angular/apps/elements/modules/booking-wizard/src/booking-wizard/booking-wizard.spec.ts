import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES, SessionStore } from '@synergos/transaction-engine';
import { BookingWizardElementComponent } from './booking-wizard';
import { BookingApiClient } from './booking-api.client';
import { BookingFulfillmentStrategy } from './booking-fulfillment.strategy';
import type { BookingOffer } from './booking.model';

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

  function mount(): void {
    fixture = TestBed.createComponent(BookingWizardElementComponent);
    component = fixture.componentInstance;
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
  it('el APARTADO fallido manda a elegir otra habitación y suelta la línea muerta', async () => {
    stubFetch({ search: { offers: [SAMPLE_OFFER, OTRA_OFERTA] }, hold: false });
    mount();
    await hastaRevisar();

    await avanzar(); // intentar confirmar
    await settle(fixture);

    // Dice lo que pasó de verdad: la habitación, no el pago.
    expect(component.errorMessage()).toContain('ya no está disponible');
    expect(component.errorMessage()).not.toContain('pago');
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

    // Acá reintentar SÍ sirve, así que la reserva elegida se conserva.
    expect(component.errorMessage()).toContain('pago');
    expect(component.errorMessage()).not.toContain('ya no está disponible');
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
    expect(component.errorMessage()).toContain('pago');
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
