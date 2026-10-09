import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { EventosApiClient } from './eventos-api.client';
import { EventosFulfillmentStrategy } from './eventos-fulfillment.strategy';
import { EVENTOS_RELOJ, EventosElementComponent } from './eventos';
import { comisionEnMenores } from './eventos-comision';
import { asentar } from '../../../../../../tools/asentar';
import { EVENTOS_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = {
  apiBase: EVENTOS_SYNHOST.ejemplo.apiBase,
  feePercent: EVENTOS_SYNHOST.ejemplo.feePercent,
  platformFeePercent: EVENTOS_SYNHOST.ejemplo.platformFeePercent,
};

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
 * Un borde de eventos que contesta las ESCRITURAS con la forma del de verdad y se apaga
 * por MÉTODO y ruta (UI#92; reglas 16, 18 y 38).
 *
 * Las formas son las de `EventosController` del CMS: `CheckoutResponse`, `ConfirmResponse`
 * con sus `EventTicketDto`, `TransferResponse` (con `status`, `to` y `ticketId` en la raíz),
 * `CreateEventResponse` y `CheckInResponse`. El check-in lleva ESTADO, como el de verdad:
 * la primera vez es `valid`, la segunda `already-used`, y lo que no emitió es `invalid`.
 *
 * **Lo que se mira no lo puede producir el respaldo de antes** (regla 7): la orden es
 * `evord_77` (el `catch` acuñaba `MOCK-<ts>`), la entrada `tkt_77_1` con el QR
 * `QR-SERVIDOR-77-1` (allá `TKT-<orden>-1` con un `SYN1|…` hecho en el navegador) y el
 * evento `evt_77` con un slug que `slugify(título)` no da.
 *
 * Las LECTURAS que no se declaran caen como hasta ahora (catálogo de muestra con su cartel).
 */
function bordeDeEventos(opciones: { readonly caidas?: readonly string[] } = {}): {
  readonly fetchDoble: ReturnType<typeof vi.fn<FetchDoble>>;
  readonly llamadas: (clave: string) => number;
  readonly encender: (clave: string) => void;
} {
  const caidas = new Set(opciones.caidas ?? []);
  const vistas: string[] = [];
  const quemadas = new Set<string>();
  const responder = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
  const entrada = (estado: string) => ({
    id: 'tkt_77_1',
    qr: 'QR-SERVIDOR-77-1',
    eventId: 'evt_1',
    attendeeName: 'Ada Lovelace',
    attendee: 'Ada Lovelace',
    tier: 'General',
    seat: null,
    holderEmail: 'ada@example.com',
    holder: 'ada@example.com',
    status: estado,
    eventTitle: 'Evento del servidor',
    venueName: 'Ágora',
    startsAt: '2026-11-14T20:00:00',
  });

  const fetchDoble = vi.fn<FetchDoble>((url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = new URL(String(url), 'http://borde.test').pathname.replace(/^\/api\/eventos/, '');
    const clave = `${metodo} ${ruta.replace(/^\/ticket\/[^/]+\/transfer$/, '/ticket/{id}/transfer')}`;
    vistas.push(clave);
    if (caidas.has(clave)) {
      return Promise.reject(new Error('offline'));
    }
    const cuerpo = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    switch (clave) {
      case 'POST /checkout':
        return responder(200, {
          orderRef: 'evord_77',
          paymentSessionId: 'psp_77',
          amount: 180_000,
          amountFormatted: '$ 180.000',
          currency: 'COP',
          free: false,
        });
      case 'POST /confirm':
        return responder(200, { status: 'Paid', tickets: [entrada('valid')] });
      case 'POST /ticket/{id}/transfer':
        return responder(200, {
          ticket: entrada('transferred'),
          newQr: 'QR-NUEVO-77',
          status: 'transferred',
          to: cuerpo['to'],
          ticketId: 'tkt_77_1',
        });
      case 'POST /event':
        return responder(200, {
          eventId: 'evt_77',
          id: 'evt_77',
          slug: 'festival-synergos-2026-en-bogota',
          status: 'draft',
        });
      case 'POST /checkin': {
        const codigo = String(cuerpo['ticketId'] ?? '');
        if (codigo !== 'QR-SERVIDOR-77-1') {
          return responder(200, { status: 'invalid', ticketId: null, attendee: null });
        }
        const estado = quemadas.has(codigo) ? 'already-used' : 'valid';
        quemadas.add(codigo);
        return responder(200, { status: estado, ticketId: 'tkt_77_1', attendee: 'Ada Lovelace' });
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

describe('EventosElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<EventosElementComponent>;
  let component: EventosElementComponent;

  /**
   * Monta el elemento como lo monta el CMS: el `config` llega DESPUÉS del constructor y ANTES
   * del primer ciclo. Por defecto, la configuración de negocio que la vista emite con los valores
   * base del sitio (el `ejemplo` del contrato, ADR 0137), sin la cara que eligió esa muestra.
   */
  async function createComponent(config: Record<string, unknown> = NEGOCIO_DEL_CMS): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EventosElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        EventosApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: EventosFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventosElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // Initial catalogue search runs in the constructor; let it settle.
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

  const alertas = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="alert"]')).map(
      (alerta) => alerta.textContent?.trim() ?? '',
    );

  /** Drive catálogo → SH-2 ficha → selección → carrito → SH-3 wizard → confirm. */
  async function purchaseFirstGeneralEvent(
    antesDeEnviar: (wizard: CheckoutWizardComponent) => void = () => undefined,
  ): Promise<void> {
    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();
    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();

    component.setAttendeeField(0, 'name', 'Ada Lovelace');
    component.setAttendeeField(0, 'email', 'ada@example.com');
    component.setAttendeeField(0, 'document', 'CC123');
    component.buyerName.set('Ada Lovelace');
    component.buyerEmail.set('ada@example.com');

    component.goToCheckout();
    fixture.detectChanges();

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    // asistentes → pago → revisar → submit (steps collapse for free events).
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
    }
    antesDeEnviar(wizard);
    wizard.next(); // submit → pay (POST /checkout) → confirm (POST /confirm)
    await flushMicrotasks(30);
    fixture.detectChanges();
  }

  /** Lo que el asistente emite en `failed`: el motivo con el que la estrategia contestó que no. */
  function motivosDe(): { readonly motivos: string[]; readonly escuchar: (wizard: CheckoutWizardComponent) => void } {
    const motivos: string[] = [];
    return { motivos, escuchar: (wizard) => wizard.failed.subscribe((motivo) => motivos.push(motivo)) };
  }

  function asistente(): CheckoutWizardComponent {
    return fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
  }

  // ── empty: pristine app, catalogue view, no order ────────────────────────────
  /** Deja entradas en el carrito (la comisión se mira sobre algo). */
  async function ponerEntradasEnCarrito(): Promise<void> {
    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();
    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();
    fixture.detectChanges();
  }

  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/carrito';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/carrito');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(component.view()).toBe('cart');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    component.navigate('wallet');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1/mis-tickets');
  });

  it('starts on the SH-1 catalogue with no order (empty case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.role()).toBe('attendee');
    expect(component.view()).toBe('catalog');
    expect(component.orderRef()).toBe('');
    expect(component.tickets().length).toBe(0);
    expect(component.events().length).toBeGreaterThan(0);
    expect(component.discoveryFacets().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── el hero se COMPONE: el título del CMS llega por el JSON de `config` ───────
  it('pinta el heading/subheading que manda el CMS por `config` (no el baked)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const host = fixture.nativeElement as HTMLElement;
    // Baseline aditivo: sin config, el hero se ve EXACTAMENTE como antes.
    expect(host.querySelector('.eventos__hero-title')?.textContent?.trim()).toBe(
      'Vive los mejores eventos, sin complicarte',
    );

    // El emitter del CMS fusiona todo en UN atributo `config`; si el sanitizer no
    // lista la clave, ésta desaparece en silencio y el <h1> vuelve al default.
    fixture.componentRef.setInput('config', { heading: 'X', subheading: 'Y' });
    fixture.detectChanges();

    expect(component.config()?.heading).toBe('X');
    expect(host.querySelector('.eventos__hero-title')?.textContent?.trim()).toBe('X');
    expect(host.querySelector('.eventos__hero-sub')?.textContent?.trim()).toBe('Y');
  });

  // ── happy: catálogo → ficha → carrito(+fees) → SH-3 wizard → confirm + QR ─────
  //
  // Corría con la red caída y lo que probaba era la orden `MOCK-<ts>` y las entradas con
  // QR hecho en el navegador (UI#92, regla 16). Hoy el borde contesta con la forma de
  // verdad y lo que se mira son la orden y el QR que emitió el SERVIDOR.
  it('runs the full purchase lifecycle through the SH-3 wizard into e-tickets (happy case)', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos();
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();

    await purchaseFirstGeneralEvent();

    expect(component.view()).toBe('confirmed');
    expect(component.orderRef()).toBe('evord_77');
    expect(component.tickets().map((ticket) => ticket.qr)).toEqual(['QR-SERVIDOR-77-1']);
    // Fees were applied on top of the ticket subtotal.
    expect(component.feesMinor()).toBeGreaterThan(0);
    expect(component.cartTotalMinor()).toBe(component.cartSubtotalMinor() + component.feesMinor());
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── UI#92: sin orden abierta no hay compra, ni entradas, ni anuncio ───────────
  it('con el POST /checkout caído no cobra ni emite: lo dice una vez y no anuncia la compra', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({ caidas: ['POST /checkout'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const compras: unknown[] = [];
    component.purchased.subscribe((payload) => compras.push(payload));
    const fallos = motivosDe();

    await purchaseFirstGeneralEvent(fallos.escuchar);

    // La estrategia CONTESTA que no abrió la orden; no revienta.
    expect(fallos.motivos).toEqual(['checkout-not-opened']);

    expect(component.view()).not.toBe('confirmed');
    expect(component.tickets()).toEqual([]);
    expect(compras).toEqual([]);
    expect(borde.llamadas('POST /confirm')).toBe(0);
    expect(alertas()).toEqual([asistente().config().payFailedMessage]);
  });

  // ── UI#92: la orden quedó abierta y la emisión no — reintentar NO abre otra ──
  it('con el POST /confirm caído no emite entradas; reintentar confirma la MISMA orden', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({ caidas: ['POST /confirm'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await purchaseFirstGeneralEvent(fallos.escuchar);

    expect(fallos.motivos).toEqual(['tickets-not-issued']);
    expect(component.view()).not.toBe('confirmed');
    expect(component.tickets()).toEqual([]);
    // El aviso nombra la orden que SÍ quedó, la del servidor.
    expect(alertas()).toEqual([
      asistente().config().confirmFailedMessage.replaceAll('{referencia}', 'evord_77'),
    ]);

    borde.encender('POST /confirm');
    asistente().next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmed');
    expect(component.tickets().map((ticket) => ticket.qr)).toEqual(['QR-SERVIDOR-77-1']);
    expect(borde.llamadas('POST /checkout')).toBe(1);
    expect(borde.llamadas('POST /confirm')).toBe(2);
  });

  // ── ADR 0140 F4: lo que dice un registro gratis sale del diccionario ─────────
  //
  // Sección `Events.Purchase`, que `EventosProps` declara desde la F4. `t()` pinta su respaldo
  // es-CO cuando la clave no llegó, así que un texto «bien traducido» no prueba nada: se mira con
  // un bridge que trae OTRO texto.
  async function abrirEventoGratis(): Promise<void> {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    const gratis = component.events().find((e) => e.fromAmount <= 0);
    expect(gratis).toBeDefined();
    component.openEvent(gratis!);
    await flushMicrotasks();
    expect(component.isFreeEvent()).toBe(true);
  }

  it('los avisos de un registro gratis son las claves `Events.Purchase` que publicó la página', async () => {
    (window as { synergos?: unknown }).synergos = {
      i18n: {
        culture: 'en-US',
        defaultCulture: 'es-CO',
        keys: {
          'Events.Purchase.FreeFailed': "We couldn't complete your registration.",
          'Events.Purchase.FreeConfirmPending': 'Your registration is open ({referencia}).',
        },
      },
    };
    try {
      await abrirEventoGratis();
      expect(component.checkoutConfig().payFailedMessage).toBe("We couldn't complete your registration.");
      expect(component.checkoutConfig().confirmFailedMessage).toBe('Your registration is open ({referencia}).');
    } finally {
      delete (window as { synergos?: unknown }).synergos;
    }
  });

  it('sin el bridge, los avisos de un registro gratis son el respaldo es-CO', async () => {
    await abrirEventoGratis();
    expect(component.checkoutConfig().payFailedMessage).toBe('No pudimos completar tu registro. Intenta de nuevo.');
    expect(component.checkoutConfig().confirmFailedMessage).toContain('(referencia {referencia})');
  });

  // ── ADR 0140 F4: tras recargar o volver del login, la compra no miente ───────
  //
  // El carrito y su llave viven en la sesión (`localStorage`) y sobreviven; la ficha y los
  // asistentes no. Medido en el plan de la F4: al volver a `#/eventos/checkout` un evento pagado
  // pasaba a «gratis», sin filas de asistentes y con el `eventId` vacío. Se simula la recarga como
  // la hace el navegador: la misma sesión persistida, leída por una instancia NUEVA del elemento.
  it('recarga en checkout: lo pagado sigue pagado, con una fila por entrada y el evento de la línea', async () => {
    const almacen = installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    const pagado = component.events().find((e) => e.mode === 'general' && e.fromAmount > 0);
    component.openEvent(pagado!);
    await flushMicrotasks();
    component.startSelection();
    component.incrementQty();
    component.proceedToCart();
    await flushMicrotasks();
    component.goToCheckout();
    fixture.detectChanges();
    const eventId = component.checkoutInstrument()['eventId'];
    expect(eventId).toBeTruthy();

    // El scope lleva el número de instancia del módulo, que en una página recargada vuelve a
    // empezar: acá se copia la sesión al de la instancia siguiente.
    const sesion = almacen.get(`syn.txn.session.eventos.${component.instanceId}`);
    expect(sesion).toBeTruthy();
    const siguiente = component.instanceId + 1;
    TestBed.resetTestingModule();
    almacen.set(`syn.txn.session.eventos.${siguiente}`, sesion!);
    window.location.hash = '#/eventos/checkout';
    await createComponent();
    fixture.detectChanges();

    expect(component.instanceId).toBe(siguiente);
    expect(component.view()).toBe('checkout');
    expect(component.detail()).toBeNull();
    expect(component.checkoutConfig().submitLabel).toBe('Pagar y confirmar');
    expect(component.checkoutInstrument()).toMatchObject({ eventId, provider: 'eventos' });
    expect(component.attendees()).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.eventos__attendee')).toHaveLength(2);
  });

  it('los pasos son asistentes → revisar en lo pagado y en lo gratis: no hay un método de pago que no viaja', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.openEvent(component.events().find((e) => e.fromAmount > 0)!);
    await flushMicrotasks();
    expect(component.isFreeEvent()).toBe(false);
    expect(component.checkoutConfig().steps.map((paso) => paso.id)).toEqual(['asistentes', 'revisar']);

    component.openEvent(component.events().find((e) => e.fromAmount <= 0)!);
    await flushMicrotasks();
    expect(component.isFreeEvent()).toBe(true);
    expect(component.checkoutConfig().steps.map((paso) => paso.id)).toEqual(['asistentes', 'revisar']);
    expect(component.checkoutConfig().submitLabel).toBe('Confirmar registro');
  });

  // ── filter: SH-1 criteria filters the catalogue by category ──────────────────
  it('filters the catalogue by category through the discovery criteria (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const before = component.events().length;
    const category = component.homeCategories()[0].value;
    component.openCategory(category);
    await flushMicrotasks();

    const after = component.events();
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.every((event) => event.category === category)).toBe(true);
    expect(component.hasActiveFilters()).toBe(true);
  });

  // ── idempotent: re-priming the same tier keeps a single order line ───────────
  it('keeps a single order line when the selection is re-primed (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const event =
      component.events().find((e) => e.mode === 'general' && e.fromAmount > 0) ??
      component.events()[0];
    component.openEvent(event);
    await flushMicrotasks();

    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();
    component.backToEvent();
    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();

    expect(component.cartItems().length).toBe(1);
  });

  // ── reserved seating: seat-map selection drives the ticket count ──────────────
  it('uses the seat selection to drive the ticket count for reserved events', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const reserved = component.events().find((e) => e.mode === 'reserved');
    expect(reserved).toBeDefined();
    component.openEvent(reserved!);
    await flushMicrotasks();
    expect(component.isReserved()).toBe(true);

    component.startSelection();
    component.onSeatSelect(new CustomEvent('seatselect', { detail: { selected: ['A1', 'A2'] } }));
    expect(component.ticketCount()).toBe(2);
    expect(component.canProceedSelection()).toBe(true);
  });

  // ── wallet (SH-10): a purchase surfaces in "mis tickets" + transfer ──────────
  async function compraEnLaBilletera(borde: ReturnType<typeof bordeDeEventos>): Promise<string> {
    installMemoryStorage();
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();

    await purchaseFirstGeneralEvent();
    component.goToWallet();
    await flushMicrotasks();

    expect(component.view()).toBe('wallet');
    // La billetera lleva la entrada que emitió el servidor, no una de esta pestaña.
    expect(component.wallet().map((ticket) => ticket.id)).toContain('tkt_77_1');
    expect(component.walletCredentials().length).toBe(component.wallet().length);
    return 'tkt_77_1';
  }

  it('surfaces the purchase in the SH-10 wallet and transfers a ticket', async () => {
    const ticketId = await compraEnLaBilletera(bordeDeEventos());

    component.openTransfer(ticketId);
    component.transferTo.set('nuevo@example.com');
    component.confirmTransfer();
    await flushMicrotasks();

    const transferred = component.wallet().find((t) => t.id === ticketId);
    expect(transferred?.status).toBe('transferred');
  });

  // ── UI#92: una entrada que no se transfirió sigue siendo de quien la tenía ───
  it('con la transferencia caída la entrada sigue «Válida», el formulario abierto y se dice una vez', async () => {
    const ticketId = await compraEnLaBilletera(bordeDeEventos({ caidas: ['POST /ticket/{id}/transfer'] }));

    component.openTransfer(ticketId);
    component.transferTo.set('nuevo@example.com');
    component.confirmTransfer();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.wallet().find((t) => t.id === ticketId)?.status).toBe('valid');
    expect(component.transferTicketId()).toBe(ticketId);
    expect(component.transferTo()).toBe('nuevo@example.com');
    expect(alertas()).toEqual(['No pudimos transferir la entrada: sigue a tu nombre. Intenta de nuevo.']);
  });

  // ── organizer console (SH-5): dashboard aforo + check-in Válido/Ya-usado ─────
  it('loads the SH-5 organizer console and checks in a valid e-ticket idempotently', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEventos().fetchDoble);
    await createComponent();

    // First purchase to issue a recognisable e-ticket for the check-in.
    await purchaseFirstGeneralEvent();
    // T9: se entra con el TOKEN del QR, no con el id (que la UI imprime bajo el código).
    const ticketQr = component.tickets()[0].qr;

    component.setRole('organizer');
    await flushMicrotasks();
    expect(component.manage()).not.toBeNull();
    expect(component.soldPercent()).toBeGreaterThanOrEqual(0);
    expect(component.consoleKpis().length).toBeGreaterThan(0);
    expect(component.portfolioRows().length).toBeGreaterThan(0);

    component.onManagerSectionChange('checkin');
    component.checkinCode.set(ticketQr);
    component.submitCheckin();
    await flushMicrotasks();
    expect(component.lastScan()?.status).toBe('valid');
    expect(component.checkedInCount()).toBeGreaterThan(0);

    // Idempotent: a second scan of the same ticket → already-used.
    component.checkinCode.set(ticketQr);
    component.submitCheckin();
    await flushMicrotasks();
    expect(component.lastScan()?.status).toBe('already-used');
  });

  // ── UI#92: sin respuesta del servidor la puerta no da veredicto ──────────────
  it('con el POST /checkin caído no dice «Válido» ni «Inválido»: lo dice y deja el código', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEventos({ caidas: ['POST /checkin'] }).fetchDoble);
    await createComponent();
    await purchaseFirstGeneralEvent();
    const ticketQr = component.tickets()[0].qr;
    const validadas: unknown[] = [];
    component.checkedin.subscribe((payload) => validadas.push(payload));

    component.setRole('organizer');
    await flushMicrotasks();
    component.onManagerSectionChange('checkin');
    const antes = component.checkedInCount();
    component.checkinCode.set(ticketQr);
    component.submitCheckin();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.lastScan()).toBeNull();
    expect(component.checkedInCount()).toBe(antes);
    expect(validadas).toEqual([]);
    expect(component.checkinCode()).toBe(ticketQr);
    expect(alertas()).toEqual(['No pudimos validar la entrada: el servidor no respondió. Vuelve a escanearla.']);
  });

  // ── create event (SH-6): authoring wizard publishes an event ─────────────────
  async function llenarEventoNuevo(): Promise<void> {
    component.setRole('organizer');
    await flushMicrotasks();
    component.openCreateEvent();
    expect(component.managerView()).toBe('create');

    component.onCreateDraftChange({
      title: 'Festival Synergos 2026',
      city: 'Bogotá',
      startsAt: '2026-10-01T20:00',
      tierName: 'General',
      tierAmount: '80000',
      capacity: '500',
    });
    expect(component.createValidity()['publicar']).toBe(true);
  }

  it('publishes a new event through the SH-6 authoring wizard', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEventos().fetchDoble);
    await createComponent();
    await llenarEventoNuevo();

    component.onCreatePublished(component.createDraft());
    await flushMicrotasks();
    // El slug que devolvió `CreateEventResponse`, no el que `slugify` sacaría del título.
    expect(component.createResultSlug()).toBe('festival-synergos-2026-en-bogota');
  });

  // ── UI#92: un evento que no se creó no sale como «Evento publicado» ──────────
  it('con el POST /event caído no dice «Evento publicado» y el borrador sobrevive', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeEventos({ caidas: ['POST /event'] }).fetchDoble);
    await createComponent();
    await llenarEventoNuevo();

    component.onCreatePublished(component.createDraft());
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.createResultSlug()).toBe('');
    expect(component.createDraft()['title']).toBe('Festival Synergos 2026');
    expect(alertas()).toEqual(['No pudimos publicar el evento. Intenta de nuevo.']);
  });

  // ── hash router: deep-links a view + the organizer console ───────────────────
  it('deep-links views and the organizer console through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goToWallet();
    expect(window.location.hash).toBe('#/eventos/mis-tickets');

    component.setRole('organizer');
    expect(window.location.hash).toContain('/organizador');
  });

  // ── degradation: catalogue falls back to a visible mock catalogue ─────────────
  it('degrades to a visible mock catalogue when the events endpoint is unavailable', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component.events().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── T2-Eventos: la consola del organizador exige ROL ─────────────────────────
  // El bug que cierra: los 9 endpoints eran anónimos. Cualquiera abría el panel y veía
  // la lista de ASISTENTES con sus datos, publicaba eventos y quemaba entradas ajenas.
  async function bootOrganizer(status: 401 | 403): Promise<void> {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/manage/')) {
        return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: 'x' }) } as Response);
      }
      return Promise.reject(new Error('offline'));
    }));
    await createComponent();
    component.setRole('organizer');
    await flushMicrotasks();
  }

  it('pide iniciar sesión cuando el panel del organizador responde 401 (no mock)', async () => {
    await bootOrganizer(401);

    expect(component.organizerAccess()).toBe('anon');
    // Lo que importa: NINGÚN asistente a la vista.
    expect(component.manage()).toBeNull();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.eventos__denied-title');
    expect(panel?.textContent).toContain('Inicia sesión como organizador');
    expect(component.loginUrl()).toContain('/account/login?returnUrl=');
  });

  it('dice sin-permiso cuando responde 403 (el login no ayuda)', async () => {
    await bootOrganizer(403);

    expect(component.organizerAccess()).toBe('forbidden');
    expect(component.manage()).toBeNull();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.eventos__denied-title');
    expect(panel?.textContent).toContain('no tiene permiso de organizador');
    // 403: iniciar sesión NO ayuda → no se ofrece el enlace de login.
    expect((fixture.nativeElement as HTMLElement).querySelector('.eventos__denied a')).toBeNull();
  });

  // ── T7 Ola B: la consola ESCUCHA el canal del evento ─────────────────────────
  // El backend ya publicaba cada check-in (ADR 0111) y no había nadie escuchando.
  // jsdom no trae EventSource, así que se instala uno falso que además deja
  // comprobar lo que más importa: que la conexión se CIERRE.
  interface FakeSource {
    url: string;
    closed: boolean;
    emit(event: string, data: unknown): void;
  }

  function installFakeEventSource(): FakeSource[] {
    const created: FakeSource[] = [];
    class FakeEventSource {
      readonly #listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
      closed = false;
      constructor(readonly url: string) {
        created.push(this as unknown as FakeSource);
      }
      addEventListener(type: string, handler: (e: MessageEvent<string>) => void): void {
        this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), handler]);
      }
      close(): void {
        this.closed = true;
      }
      emit(type: string, data: unknown): void {
        for (const h of this.#listeners.get(type) ?? []) {
          h({ data: JSON.stringify(data) } as MessageEvent<string>);
        }
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    return created;
  }

  /** Abre la consola con el panel cargado (manage OK) y devuelve los streams creados. */
  async function bootOrganizerWithManage(): Promise<FakeSource[]> {
    const sources = installFakeEventSource();
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/manage/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            attendees: [
              { ticketId: 'TKT-1', name: 'Ada', email: 'a@b.co', tier: 'VIP', seat: '', state: 'pending' },
              { ticketId: 'TKT-2', name: 'Grace', email: 'g@b.co', tier: 'GEN', seat: '', state: 'pending' },
            ],
            capacity: 100,
            sold: 2,
          }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    }));
    await createComponent();
    component.setRole('organizer');
    await flushMicrotasks();
    return sources;
  }

  it('abre el canal del evento al cargar la consola', async () => {
    const sources = await bootOrganizerWithManage();

    expect(sources.length).toBe(1);
    expect(sources[0].url).toContain('/api/realtime/stream');
    expect(sources[0].url).toContain(encodeURIComponent('eventos:checkin:'));
    // Aún no dice "en vivo": el servidor no ha confirmado el canal.
    expect(component.liveConnected()).toBe(false);
  });

  it('un check-in de OTRA puerta actualiza la consola sin recargar', async () => {
    const sources = await bootOrganizerWithManage();
    const before = component.checkedInCount();

    sources[0].emit('ready', {});
    sources[0].emit('checkin', { status: 'valid', ticketId: 'TKT-1', attendee: 'Ada' });
    await flushMicrotasks();

    expect(component.liveConnected()).toBe(true);
    expect(component.checkedInCount()).toBe(before + 1);
    expect(component.manage()!.attendees.find((a) => a.ticketId === 'TKT-1')!.state).toBe('checked-in');
    // La otra fila no se toca.
    expect(component.manage()!.attendees.find((a) => a.ticketId === 'TKT-2')!.state).toBe('pending');
  });

  it('el eco del propio check-in NO infla el contador (idempotente)', async () => {
    const sources = await bootOrganizerWithManage();
    sources[0].emit('ready', {});

    sources[0].emit('checkin', { status: 'valid', ticketId: 'TKT-1', attendee: 'Ada' });
    await flushMicrotasks();
    const afterFirst = component.checkedInCount();

    // Mismo ticket otra vez (eco, o el operador que ya lo marcó): no vuelve a sumar.
    sources[0].emit('checkin', { status: 'valid', ticketId: 'TKT-1', attendee: 'Ada' });
    sources[0].emit('checkin', { status: 'already-used', ticketId: 'TKT-2', attendee: 'Grace' });
    await flushMicrotasks();

    expect(component.checkedInCount()).toBe(afterFirst);
  });

  it('cierra el canal al volver a la cara de asistente', async () => {
    const sources = await bootOrganizerWithManage();
    expect(sources[0].closed).toBe(false);

    component.setRole('attendee');
    await flushMicrotasks();

    // Sin esto queda una conexión abierta por cada ida y vuelta.
    expect(sources[0].closed).toBe(true);
    expect(component.liveConnected()).toBe(false);
  });

  it('un payload corrupto no tumba el stream', async () => {
    const sources = await bootOrganizerWithManage();
    sources[0].emit('ready', {});

    // Emitir algo que no es el shape esperado: no debe lanzar ni cambiar nada.
    sources[0].emit('checkin', { status: 'valid' }); // sin ticketId
    await flushMicrotasks();

    expect(component.checkedInCount()).toBe(0);
    expect(component.liveConnected()).toBe(true);
  });

  // ── ADR 0137 (CMS#194): la configuración de negocio llega del sitio, no del bundle ──────
  //
  // La comisión era `DEFAULT_FEE_PERCENT = 12` compilada acá, y ningún motor del CMS la cobraba:
  // el carrito sumaba un 12 % que el checkout no cobraba. Ahora la manda el CMS desde
  // `Synergos:Features:Eventos`, la MISMA que cobran sus motores.

  it('abre la cara que eligió el editor: el config llega después del constructor', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    await createComponent({ ...NEGOCIO_DEL_CMS, role: 'organizer' });

    expect(component.role()).toBe('organizer');
  });

  it('suma la comisión del sitio con la regla de los motores del CMS', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent({ ...NEGOCIO_DEL_CMS, feePercent: 8.5 });

    await ponerEntradasEnCarrito();

    const subtotal = component.cartSubtotalMinor();
    expect(subtotal).toBeGreaterThan(0);
    expect(component.feesMinor()).toBe(comisionEnMenores(subtotal, 8.5));
    expect(component.cartSummary().find((f) => f.id === 'fees')?.label).toBe('Cargos por servicio (8,5 %)');
  });

  it('sin comisión configurada no inventa una', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent({ apiBase: NEGOCIO_DEL_CMS.apiBase });

    await ponerEntradasEnCarrito();

    expect(component.feesMinor()).toBe(0);
    expect(component.cartSummary().some((f) => f.id === 'fees')).toBe(false);
    expect(component.cartTotalMinor()).toBe(component.cartSubtotalMinor());
  });

  it('sin la base de la API no llama a nada y degrada a la muestra, visible', async () => {
    installMemoryStorage();
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);

    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    expect(component.events().length).toBeGreaterThan(0);
  });

  it('liquida al organizador con la comisión de la plataforma del sitio, y sin ella no pinta un neto', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent({ ...NEGOCIO_DEL_CMS, platformFeePercent: 7.5 });
    const panel = { attendees: [], capacity: 10, sold: 1, revenue: 1_000_000, portfolio: [] };

    component.manage.set(panel);

    expect(component.payout()).toEqual({ porcentaje: '7,5 %', comision: 75_000, neto: 925_000 });

    TestBed.resetTestingModule();
    await createComponent({ apiBase: NEGOCIO_DEL_CMS.apiBase });
    component.manage.set(panel);
    expect(component.payout()).toBeNull();
  });
});

describe('EventosApiClient', () => {
  function createClient(): EventosApiClient {
    TestBed.configureTestingModule({ providers: [EventosApiClient] });
    return TestBed.inject(EventosApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live catalogue response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              events: [
                { id: 'X1', title: 'Evento X', fromAmount: 99_000, currency: 'COP', city: 'Bogotá' },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.events(
      '/api/eventos',
      { q: '', category: '', city: '', sort: 'relevance' },
      'COP',
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('X1');
    expect(client.degraded).toBe(false);
  });

  const CONTEXTO = { eventId: 'evt_1', eventTitle: 'Evento X', venueName: 'Ágora', startsAt: '2026-08-14T09:00:00' };

  it('emite las entradas que devuelve el borde, las siembra en la billetera y valida en la puerta', async () => {
    vi.stubGlobal('fetch', bordeDeEventos().fetchDoble);
    const client = createClient();

    const confirmation = await client.confirm(
      '/api/eventos',
      'evord_77',
      [{ name: 'Ada Lovelace', email: 'ada@example.com', document: 'CC9' }],
      CONTEXTO,
    );
    expect(confirmation.tickets.map((ticket) => ticket.qr)).toEqual(['QR-SERVIDOR-77-1']);
    const id = confirmation.tickets[0].id;
    // T9: la credencial es el token del QR, no el id.
    const qr = confirmation.tickets[0].qr;

    // The confirmed ticket is now in the wallet ("mis tickets").
    const wallet = await client.tickets('/api/eventos', 'ada@example.com');
    expect(wallet.tickets.some((t) => t.id === id)).toBe(true);

    // Transfer invalidates the origin.
    const transfer = await client.transfer('/api/eventos', id, 'nuevo@b.co');
    expect(transfer.status).toBe('transferred');
    const walletAfter = await client.tickets('/api/eventos', 'ada@example.com');
    expect(walletAfter.tickets.find((t) => t.id === id)?.status).toBe('transferred');

    // Check-in: lo decide el SERVIDOR — primero válida, después ya usada, lo ajeno inválido.
    expect((await client.checkin('/api/eventos', qr)).status).toBe('valid');
    expect((await client.checkin('/api/eventos', qr)).status).toBe('already-used');
    expect((await client.checkin('/api/eventos', 'NOPE')).status).toBe('invalid');
  });

  // ── EL QUE MUERDE: con la red caída no hay entradas, ni transferencia, ni veredicto ─
  it('con la red caída confirmar, transferir y validar LANZAN y no fabrican nada', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();
    const fallo = { name: 'EventosWriteFailedError' };

    await expect(
      client.confirm('/api/eventos', 'evord_77', [{ name: 'Ada', email: 'a@b.co', document: 'CC9' }], CONTEXTO),
    ).rejects.toMatchObject({ ...fallo, endpoint: 'POST /api/eventos/confirm' });
    await expect(client.transfer('/api/eventos', 'tkt_77_1', 'nuevo@b.co')).rejects.toMatchObject(fallo);
    await expect(client.checkin('/api/eventos', 'QR-SERVIDOR-77-1')).rejects.toMatchObject(fallo);
    await expect(
      client.checkout('/api/eventos', 'evt_1', [{ tier: 'vip', qty: 1 }], [], { name: 'Ada', email: 'a@b.co' }, 'COP'),
    ).rejects.toMatchObject({ ...fallo, endpoint: 'POST /api/eventos/checkout' });

    // Ninguna escritura caída enciende el cartel de «datos de ejemplo»…
    expect(client.degraded).toBe(false);
    // …y la billetera (una LECTURA, que sí degrada) no lleva ninguna entrada de esta orden.
    const wallet = await client.tickets('/api/eventos', 'a@b.co');
    expect(wallet.tickets.some((ticket) => ticket.orderRef === 'evord_77')).toBe(false);
  });

  it('returns a free checkout when the order total is zero (free case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          // `CheckoutResponse` de una orden de total cero: sin sesión de pago.
          json: () =>
            Promise.resolve({
              orderRef: 'evord_free_1',
              paymentSessionId: '',
              amount: 0,
              amountFormatted: '$ 0',
              currency: 'COP',
              free: true,
            }),
        } as Response),
      ),
    );
    const client = createClient();

    const checkout = await client.checkout(
      '/api/eventos',
      'EVT-FREE',
      [{ tier: 'free', qty: 1 }],
      [],
      { name: 'Ada', email: 'a@b.co' },
      'COP',
    );

    expect(checkout).toEqual({ orderRef: 'evord_free_1', paymentSessionId: '', amount: 0, currency: 'COP', free: true });
  });

  it('normalises a manage response with aforo + portfolio (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              attendees: [
                { ticketId: 'TKT-1', name: 'Ada', email: 'a@b.co', tier: 'VIP', seat: '', state: 'pending' },
              ],
              capacity: 100,
              sold: 42,
              revenue: 5_000_000,
              portfolio: [{ id: 'EVT-1', title: 'Evento X', sold: 42, capacity: 100, revenue: 5_000_000 }],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.manage('/api/eventos', 'EVT-1');

    expect(result.capacity).toBe(100);
    expect(result.sold).toBe(42);
    expect(result.revenue).toBe(5_000_000);
    expect(result.portfolio).toHaveLength(1);
    expect(client.degraded).toBe(false);
  });

  /**
   * El mapa lo dibuja `<synergos-seat-map>`, no este módulo: aquí la carga solo
   * pasa de largo. Lo que el parser no copie se pierde EN SILENCIO —el mapa
   * nunca ve la clave y no hay error en ningún lado—, así que el paso a través
   * se verifica campo por campo.
   */
  it('el mapa de asientos del CMS pasa COMPLETO hacia el componente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              event: { id: 'EVT-9', title: 'Vuelo demo', fromAmount: 1, currency: 'COP' },
              venue: {
                zones: [
                  {
                    id: 'z1',
                    name: 'Cabina',
                    amount: 0,
                    seatmap: {
                      // Un widebody trae DOS pasillos. Leído como entero, este
                      // arreglo daba 0 y la cabina salía sin ninguno.
                      aisleAfterColumns: [3, 6],
                      rows: [
                        {
                          rowNumber: 20,
                          serviceClass: 'business',
                          // Su sección tiene otra distribución que el resto.
                          aisleAfterColumns: [1],
                          seats: [
                            {
                              id: '20A',
                              type: 'window',
                              available: true,
                              price: 90_000,
                              features: ['exit-row', 'extra-legroom'],
                            },
                            { id: '20B', type: 'middle', available: false },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            }),
        } as Response),
      ),
    );
    const client = createClient();

    const seatmap = (await client.event('/api/eventos', 'EVT-9', 'COP')).venue.zones[0].seatmap;

    expect(client.degraded).toBe(false);
    expect(seatmap.aisleAfterColumns).toEqual([3, 6]);
    expect(seatmap.rows[0].aisleAfterColumns).toEqual([1]);
    expect(seatmap.rows[0].serviceClass).toBe('business');
    expect(seatmap.rows[0].seats[0].type).toBe('window');
    expect(seatmap.rows[0].seats[0].features).toEqual(['exit-row', 'extra-legroom']);
    // Una butaca sin rasgos no arrastra una clave muerta.
    expect(seatmap.rows[0].seats[1].features).toBeUndefined();
  });

  it('el pasillo como número suelto sigue pasando: es la forma anterior', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              event: { id: 'EVT-8', title: 'Teatro', fromAmount: 1, currency: 'COP' },
              venue: {
                zones: [
                  {
                    id: 'z1',
                    name: 'Platea',
                    amount: 0,
                    seatmap: {
                      aisleAfterColumns: 3,
                      rows: [{ rowNumber: 1, seats: [{ id: '1A', type: 'window' }] }],
                    },
                  },
                ],
              },
            }),
        } as Response),
      ),
    );
    const client = createClient();

    const detail = await client.event('/api/eventos', 'EVT-8', 'COP');

    expect(detail.venue.zones[0].seatmap.aisleAfterColumns).toBe(3);
  });

  const EVENTO_NUEVO = {
    title: 'Mi Evento',
    category: 'Conferencia',
    city: 'Cali',
    venueName: 'Centro',
    startsAt: '2026-09-01T10:00',
    mode: 'general' as const,
    capacity: 200,
    tiers: [{ name: 'General', amount: 50_000, capacity: 200 }],
  };

  it('degrades the wallet to a visible mock (a READ)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const wallet = await client.tickets('/api/eventos', 'demo@b.co');
    expect(client.degraded).toBe(true);
    expect(wallet.tickets.length).toBeGreaterThan(0);
  });

  it('crea el evento con el id y el slug del servidor; caído, lanza (UI#92)', async () => {
    vi.stubGlobal('fetch', bordeDeEventos().fetchDoble);
    const client = createClient();
    expect(await client.createEvent('/api/eventos', EVENTO_NUEVO)).toEqual({
      id: 'evt_77',
      slug: 'festival-synergos-2026-en-bogota',
      status: 'draft',
    });

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await expect(client.createEvent('/api/eventos', EVENTO_NUEVO)).rejects.toMatchObject({
      name: 'EventosWriteFailedError',
    });
  });
});
// ══ #195 · LOS ESTADOS DE VENTA DE UNA LOCALIDAD ═══════════════════════════════
//
// El CMS publica en cada `tiers[]` de `GET /event/{id}` `onSale` (calculado con la misma regla
// que su checkout), `saleOpensAt` (incluido) y `saleClosesAt` (exclusivo), y la UI vendía toda
// localidad. `!onSale` antes de abrir es «Aún no está a la venta»; cualquier otro `!onSale`
// —cerrada, o evento pasado— es «Venta cerrada»; ninguno de los dos tiene botón de compra. La
// fecha que se lee es `saleWindow`. Sin `onSale` (un CMS de antes) se vende, como hoy.
describe('EventosElementComponent · estados de venta de una localidad (#195)', () => {
  let fixture: ComponentFixture<EventosElementComponent>;
  let component: EventosElementComponent;

  const VIP_AUN_NO = {
    id: 'vip',
    code: 'vip',
    name: 'VIP',
    amount: 420_000,
    currency: 'COP',
    capacity: 50,
    remaining: 10,
    maxPerOrder: 4,
    perks: [],
    saleWindow: 'Hasta el 14 de agosto',
    featured: true,
    saleOpensAt: '2026-08-01T00:00:00-05:00',
    saleClosesAt: '2026-08-15T00:00:00-05:00',
    onSale: false,
  };
  const GENERAL = {
    id: 'general',
    name: 'General',
    amount: 120_000,
    currency: 'COP',
    remaining: 200,
    maxPerOrder: 6,
    perks: [],
    saleWindow: 'Hasta el día del evento',
    featured: false,
    onSale: true,
  };

  /** Un borde que sólo sabe del evento `evt_195`, con las localidades que se le den. */
  function bordeConLocalidades(tiers: readonly Record<string, unknown>[]): ReturnType<typeof vi.fn> {
    return vi.fn((url: RequestInfo | URL) => {
      const ruta = new URL(String(url), 'http://borde.test').pathname;
      if (ruta.endsWith('/event/evt_195')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              event: {
                id: 'evt_195',
                title: 'Festival de la venta',
                fromAmount: 120_000,
                currency: 'COP',
                mode: 'general',
                status: 'on-sale',
                startsAt: '2026-09-20T20:00:00-05:00',
              },
              tiers,
            }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
  }

  /** Abre la ficha con el reloj fijado en `ahora`. */
  async function abrirFicha(tiers: readonly Record<string, unknown>[], ahora: string): Promise<void> {
    vi.stubGlobal('fetch', bordeConLocalidades(tiers));
    await TestBed.configureTestingModule({
      imports: [EventosElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        EventosApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: EventosFulfillmentStrategy, multi: true },
        { provide: EVENTOS_RELOJ, useValue: () => Date.parse(ahora) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EventosElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', NEGOCIO_DEL_CMS);
    fixture.detectChanges();
    await flushMicrotasks();
    component.navigate('event', 'evt_195');
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

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const botonDeCompra = (): HTMLButtonElement | null =>
    host().querySelector<HTMLButtonElement>('.eventos__btn--primary.eventos__btn--block');
  const tarjeta = (id: string): { estado: string; radio: HTMLInputElement | null; texto: string } => {
    const etiquetas = Array.from(host().querySelectorAll<HTMLElement>('.eventos__tier'));
    const etiqueta = etiquetas.find((el) => el.querySelector('.eventos__tier-name')?.textContent?.trim() === id) ?? null;
    return {
      estado: etiqueta?.getAttribute('data-sale') ?? '',
      radio: etiqueta?.querySelector('input[type="radio"]') ?? null,
      texto: etiqueta?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
  };

  it('sin localidades no hay botón de compra (empty)', async () => {
    await abrirFicha([], '2026-07-15T12:00:00-05:00');

    expect(component.detail()?.event.id).toBe('evt_195');
    expect(component.selectedTier()).toBeNull();
    expect(botonDeCompra()).toBeNull();
  });

  it('a la venta se compra, y una localidad sin `onSale` (un CMS de antes) también (happy)', async () => {
    const { onSale: _sinOnSale, ...generalDeAntes } = GENERAL;
    void _sinOnSale;
    await abrirFicha([GENERAL, { ...generalDeAntes, id: 'general-2', name: 'General 2' }], '2026-07-15T12:00:00-05:00');

    expect(component.tiers().map((tier) => component.tierSaleState(tier))).toEqual(['a-la-venta', 'a-la-venta']);
    expect(tarjeta('General 2').radio?.disabled).toBe(false);
    expect(botonDeCompra()?.textContent?.trim()).toBe('Elegir cantidad');
    expect(tarjeta('General').texto).toContain('Quedan');
  });

  it('antes de abrir dice «Aún no está a la venta», con su `saleWindow`, y no se compra', async () => {
    await abrirFicha([VIP_AUN_NO], '2026-07-15T12:00:00-05:00');

    const vip = tarjeta('VIP');
    expect(vip.estado).toBe('aun-no');
    expect(vip.texto).toContain('Aún no está a la venta');
    expect(vip.texto).toContain('Hasta el 14 de agosto');
    expect(vip.texto).not.toContain('Quedan');
    expect(vip.radio?.disabled).toBe(true);
    expect(component.selectedTier()).toBeNull();
    expect(botonDeCompra()).toBeNull();
  });

  // Las dos frases salen del diccionario, sección `Events.Sale` que declara `EventosProps`: con el
  // bridge, el texto que publicó la página; sin él, el respaldo es-CO de arriba.
  it('con el bridge, las dos frases son las claves `Events.Sale` que publicó la página', async () => {
    (window as { synergos?: unknown }).synergos = {
      i18n: {
        culture: 'en-US',
        defaultCulture: 'es-CO',
        keys: { 'Events.Sale.NotYet': 'Not on sale yet', 'Events.Sale.Closed': 'Sales closed' },
      },
    };
    try {
      await abrirFicha([VIP_AUN_NO, { ...VIP_AUN_NO, id: 'pasado', name: 'Pasado', saleOpensAt: undefined }], '2026-07-15T12:00:00-05:00');

      expect(tarjeta('VIP').texto).toContain('Not on sale yet');
      expect(tarjeta('Pasado').texto).toContain('Sales closed');
      expect(tarjeta('VIP').texto).not.toContain('Aún no está a la venta');
    } finally {
      delete (window as { synergos?: unknown }).synergos;
    }
  });

  it('pasada la ventana —o con el evento pasado— dice «Venta cerrada», y no se compra', async () => {
    await abrirFicha([VIP_AUN_NO, { ...VIP_AUN_NO, id: 'pasado', name: 'Pasado', saleOpensAt: undefined, saleClosesAt: undefined }], '2026-08-20T12:00:00-05:00');

    expect(tarjeta('VIP').estado).toBe('cerrada');
    expect(tarjeta('VIP').texto).toContain('Venta cerrada');
    // Sin apertura y con `onSale: false` (evento pasado): cerrada, nunca «aún no».
    expect(tarjeta('Pasado').estado).toBe('cerrada');
    expect(botonDeCompra()).toBeNull();
  });

  it('con una localidad que aún no abre y otra a la venta, se compra la que se vende aunque la otra sea la destacada', async () => {
    await abrirFicha([VIP_AUN_NO, GENERAL], '2026-07-15T12:00:00-05:00');

    expect(component.selectedTier()?.id).toBe('general');
    expect(tarjeta('VIP').estado).toBe('aun-no');
    expect(botonDeCompra()).not.toBeNull();
    component.selectTier(component.tiers()[0]);
    component.startSelection();
    // Elegir la que no se vende no la compra: la selección sigue en la que sí.
    expect(component.selectedTier()?.id).toBe('general');
  });
});
