import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FULFILLMENT_STRATEGIES, SessionStore } from '@synergos/transaction-engine';
import { CheckoutWizardComponent } from '@synergos/shells';
import { EventosApiClient } from './eventos-api.client';
import { EventosFulfillmentStrategy } from './eventos-fulfillment.strategy';
import { EVENTOS_RELOJ, EventosElementComponent } from './eventos';
import { comisionEnMenores } from './eventos-comision';
import { asentar } from '../../../../../../tools/asentar';
import { EVENTOS_SYNHOST } from '@synergos/contracts';
import { aMenores, definirCoordinador } from '@synergos/vitals-core';

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

/** Un rechazo con la forma del de verdad: problem+json con `code` y `transient`, y `title` = la frase HTTP. */
interface RechazoDelBorde {
  readonly status: number;
  readonly code: string;
  readonly transient?: boolean;
  readonly title?: string;
}

/** Lo que el borde vio de cada petición. */
interface PeticionVista {
  readonly clave: string;
  readonly url: string;
  readonly llave: string | null;
  readonly correlacion: string | null;
  readonly cuerpo: Record<string, unknown>;
}

/**
 * El borde de la compra por la PUERTA (ADR 0140 F4) y de las escrituras que siguen en el
 * controller, con la forma del de verdad y apagable por clave (UI#92; reglas 16, 18 y 38).
 *
 *  - `POST abrir` → `/api/flujos/eventos.compra/abrir`: 201 `TicketPurchaseResponse` (la saga
 *    `pta-77`, `Running`, con el total DEL SERVIDOR y lo apartado). La misma llave devuelve la
 *    misma saga, y una saga deshecha se reabre con ella: lo que hace el orquestador.
 *  - `POST cerrar` → `/api/flujos/eventos.compra/cerrar?id=…`: 200 `Completed`.
 *  - `POST asistentes` y `GET entradas` → el artefacto, `/api/eventos/compras/{id}/…`.
 *  - `POST /ticket/{id}/transfer`, `POST /event` y `POST /checkin`, como antes. El check-in lleva
 *    ESTADO: `valid`, después `already-used`, y lo que no emitió es `invalid`.
 *
 * `caidas` apaga una clave (la red no contesta); `rechazos` pone en cola los «no» de una clave, uno
 * por llamada, y después contesta bien. Todo es un `Response` de verdad: el transporte lee sus
 * cabeceras. **Lo que se mira no lo puede producir el respaldo de antes** (regla 7): la saga
 * `pta-77`, la entrada `tkt_77_1` con el QR `QR-SERVIDOR-77-1` y el evento `evt_77`.
 *
 * Las LECTURAS que no se declaran caen como hasta ahora (catálogo de muestra con su cartel). La
 * ruta vieja (`/checkout`, `/confirm`) no la sirve: el UI no vuelve a ella, y si la pidiera el
 * `afterEach` del bloque lo pone en rojo.
 */
function bordeDeEventos(
  opciones: {
    readonly caidas?: readonly string[];
    readonly rechazos?: Readonly<Record<string, readonly RechazoDelBorde[]>>;
    readonly total?: number;
  } = {},
): {
  readonly fetchDoble: ReturnType<typeof vi.fn<FetchDoble>>;
  readonly llamadas: (clave: string) => number;
  readonly vistas: () => readonly PeticionVista[];
  readonly encender: (clave: string) => void;
} {
  const caidas = new Set(opciones.caidas ?? []);
  const rechazos = new Map(Object.entries(opciones.rechazos ?? {}).map(([clave, lista]) => [clave, [...lista]]));
  const vistas: PeticionVista[] = [];
  const quemadas = new Set<string>();
  const total = opciones.total ?? 201_600;
  let apartadas: { tier: string; seat: string | null; quantity: number }[] = [];
  let estado = 'Running';
  const responder = (status: number, body: unknown, tipo = 'application/json'): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': tipo } }));
  const compra = () => ({
    id: 'pta-77',
    buyerKind: 'eventos.comprador',
    buyerId: 'm-1',
    eventId: 'evt_1',
    status: estado,
    total: { amount: total, currency: 'COP' },
    held: apartadas,
    pendingCompensations: 0,
    lastError: null,
  });
  const entrada = (indice: number, estadoDeLaEntrada: string) => ({
    id: `tkt_77_${indice}`,
    qr: `QR-SERVIDOR-77-${indice}`,
    eventId: 'evt_1',
    attendeeName: 'Ada Lovelace',
    attendee: 'Ada Lovelace',
    tier: 'General',
    seat: null,
    holderEmail: 'ada@example.com',
    holder: 'ada@example.com',
    status: estadoDeLaEntrada,
    eventTitle: 'Evento del servidor',
    venueName: 'Ágora',
    startsAt: '2026-11-14T20:00:00',
  });
  const claveDe = (metodo: string, ruta: string): string => {
    if (ruta === '/api/flujos/eventos.compra/abrir') return `${metodo} abrir`;
    if (ruta === '/api/flujos/eventos.compra/cerrar') return `${metodo} cerrar`;
    if (/^\/api\/eventos\/compras\/[^/]+\/asistentes$/.test(ruta)) return `${metodo} asistentes`;
    if (/^\/api\/eventos\/compras\/[^/]+\/entradas$/.test(ruta)) return `${metodo} entradas`;
    return `${metodo} ${ruta.replace(/^\/api\/eventos/, '').replace(/^\/ticket\/[^/]+\/transfer$/, '/ticket/{id}/transfer')}`;
  };

  const fetchDoble = vi.fn<FetchDoble>((url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const direccion = new URL(String(url), 'http://borde.test');
    const clave = claveDe(metodo, direccion.pathname);
    const cabeceras = new Headers(init?.headers);
    const cuerpo = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    vistas.push({ clave, url: `${direccion.pathname}${direccion.search}`, llave: cabeceras.get('Idempotency-Key'), correlacion: cabeceras.get('X-Correlation-Id'), cuerpo });
    if (caidas.has(clave)) {
      return Promise.reject(new TypeError('offline'));
    }
    const enCola = rechazos.get(clave)?.shift();
    if (enCola) {
      if (clave === 'POST cerrar' && !enCola.transient) {
        // Cerrar que falla sin ser transitorio DESHACE la saga (el orquestador compensa).
        estado = 'Compensated';
      }
      return responder(
        enCola.status,
        { type: 'about:blank', title: enCola.title ?? 'Conflict', status: enCola.status, detail: enCola.code, code: enCola.code, transient: enCola.transient === true },
        'application/problem+json',
      );
    }
    switch (clave) {
      case 'POST abrir': {
        const lineas = (Array.isArray(cuerpo['lines']) ? cuerpo['lines'] : []) as { quantity: number; tier?: string; seat?: string }[];
        apartadas = lineas.map((l) => ({ tier: l.tier ?? '', seat: l.seat ?? null, quantity: l.quantity }));
        estado = 'Running';
        return responder(201, compra());
      }
      case 'POST asistentes':
        return responder(200, { id: 'pta-77', asistentes: Array.isArray(cuerpo['attendees']) ? cuerpo['attendees'].length : 0 });
      case 'POST cerrar':
        if (estado !== 'Running' && estado !== 'Completed') {
          return responder(409, { title: 'Conflict', status: 409, code: 'eventos.not_confirmable', transient: false }, 'application/problem+json');
        }
        estado = 'Completed';
        return responder(200, compra());
      case 'GET entradas': {
        const cuantas = Math.max(1, apartadas.reduce((n, a) => n + a.quantity, 0));
        return responder(200, { status: 'Confirmed', tickets: Array.from({ length: cuantas }, (_sin, i) => entrada(i + 1, 'valid')) });
      }
      case 'POST /ticket/{id}/transfer':
        return responder(200, {
          ticket: entrada(1, 'transferred'),
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
        const resultado = quemadas.has(codigo) ? 'already-used' : 'valid';
        quemadas.add(codigo);
        return responder(200, { status: resultado, ticketId: 'tkt_77_1', attendee: 'Ada Lovelace' });
      }
      case 'POST /checkout':
      case 'POST /confirm':
        return responder(404, { code: 'ruta.vieja', transient: false });
      default:
        return Promise.reject(new TypeError('offline'));
    }
  });

  return {
    fetchDoble,
    llamadas: (clave) => vistas.filter((vista) => vista.clave === clave).length,
    vistas: () => vistas,
    encender: (clave) => {
      caidas.delete(clave);
    },
  };
}

/**
 * Lo que la compra NO puede pedir nunca: la ruta vieja ni el cupón (ADR 0140 F4). Se mira en
 * CADA spec que puso un `fetch` de mentira, en su `afterEach`.
 */
function rutasViejasPedidas(): string[] {
  const doble = globalThis.fetch as unknown as { mock?: { calls: readonly (readonly unknown[])[] } };
  return (doble.mock?.calls ?? [])
    .map(([url]) => new URL(String(url), 'http://borde.test').pathname)
    .filter((ruta) => /\/(checkout|confirm|promo)$/.test(ruta));
}

describe('EventosElementComponent (v2 sobre shells)', () => {
  let fixture: ComponentFixture<EventosElementComponent>;
  let component: EventosElementComponent;

  /**
   * Monta el elemento como lo monta el CMS: el `config` llega DESPUÉS del constructor y ANTES
   * del primer ciclo. Por defecto, la configuración de negocio que la vista emite con los valores
   * base del sitio (el `ejemplo` del contrato, ADR 0137), sin la cara que eligió esa muestra.
   */
  async function createComponent(config: Record<string, unknown> = NEGOCIO_DEL_CMS, conCoordinador = true): Promise<void> {
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
    // Como lo coloca el CMS (ADR 0140 F4): dentro de su <synergos-flujo>, que la compra
    // encuentra por ancestro y que lleva sus pedidos a la puerta.
    if (conCoordinador) {
      const flujo = document.createElement('synergos-flujo');
      flujo.setAttribute('flujo', 'eventos.compra');
      document.body.appendChild(flujo);
      flujo.appendChild(fixture.nativeElement as HTMLElement);
    }
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // Initial catalogue search runs in the constructor; let it settle.
    await flushMicrotasks();
  }

  beforeAll(() => definirCoordinador());

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    // Ningún spec pide la ruta vieja ni el cupón: la compra va por la puerta (ADR 0140 F4). Se
    // lee ANTES de limpiar (el `fetch` de mentira se va con los globales) y se afirma DESPUÉS, para
    // que un rojo acá no deje sucio el spec siguiente.
    const viejas = rutasViejasPedidas();
    document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    expect(viejas).toEqual([]);
  });

  const alertas = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="alert"]')).map(
      (alerta) => alerta.textContent?.trim() ?? '',
    );

  /** Drive catálogo → SH-2 ficha → selección → carrito → SH-3 wizard → la compra por la puerta. */
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

    component.goToCheckout();
    fixture.detectChanges();

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    // asistentes → revisar → submit.
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
    }
    antesDeEnviar(wizard);
    wizard.next(); // submit → pay (abrir + asistentes) → confirm (cerrar + entradas)
    await flushMicrotasks(60);
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

  // ── happy: catálogo → ficha → carrito(+fees) → SH-3 por la PUERTA → entradas con QR ─
  //
  // La compra va por el `<synergos-flujo>` que envuelve al elemento (ADR 0140 F4): abrir y cerrar
  // por la puerta, los asistentes y las entradas por el artefacto, en ese orden. Lo que se mira es
  // la saga y el QR que emitió el SERVIDOR, la llave de la intención y el total que él cobra.
  it('compra por la puerta: abrir → asistentes → cerrar → entradas, con la llave de la intención y el total del servidor (happy case)', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos();
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const compras: unknown[] = [];
    component.purchased.subscribe((payload) => compras.push(payload));

    let llave = '';
    await purchaseFirstGeneralEvent(() => (llave = TestBed.inject(SessionStore).session().sessionId));

    const escrituras = borde.vistas().filter((vista) => !vista.clave.startsWith('GET /'));
    expect(escrituras.map((vista) => vista.clave)).toEqual(['POST abrir', 'POST asistentes', 'POST cerrar', 'GET entradas']);
    const [abrir, asistentes, cerrar, entradas] = escrituras;
    expect(abrir!.url).toBe('/api/flujos/eventos.compra/abrir');
    expect(llave).not.toBe('');
    expect(abrir!.llave).toBe(llave);
    expect(abrir!.correlacion).toMatch(/^[0-9a-f]{32}$/);
    expect(abrir!.cuerpo).toEqual({ eventId: expect.any(String), lines: [{ quantity: 1, tier: expect.any(String) }] });
    expect(asistentes!.url).toBe('/api/eventos/compras/pta-77/asistentes');
    expect(asistentes!.cuerpo).toEqual({ attendees: [{ name: 'Ada Lovelace', email: 'ada@example.com', document: 'CC123' }] });
    expect(cerrar!.url).toBe('/api/flujos/eventos.compra/cerrar?id=pta-77');
    expect(cerrar!.llave).toBeNull();
    expect(entradas!.url).toBe('/api/eventos/compras/pta-77/entradas');

    expect(component.view()).toBe('confirmed');
    expect(component.orderRef()).toBe('pta-77');
    expect(component.tickets().map((ticket) => ticket.qr)).toEqual(['QR-SERVIDOR-77-1']);
    // El total que se cobra es el del servidor, con su comisión, y es el que la sesión dice.
    expect(TestBed.inject(SessionStore).pricing().totalAmount).toBe(aMenores(201_600, 'COP'));
    expect(compras).toEqual([expect.objectContaining({ orderRef: 'pta-77', tickets: 1 })]);
    expect(window.location.hash).toContain('/confirmacion');
  });

  // ── UI#92: sin compra abierta no hay cobro, ni entradas, ni anuncio ──────────────
  it('con la puerta caída al abrir no cobra ni emite ni cierra: lo dice una vez y no anuncia la compra', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({ caidas: ['POST abrir'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const compras: unknown[] = [];
    component.purchased.subscribe((payload) => compras.push(payload));
    const fallos = motivosDe();

    await purchaseFirstGeneralEvent(fallos.escuchar);

    // La estrategia CONTESTA que no abrió, con el code del transporte; no revienta.
    expect(fallos.motivos).toEqual(['cliente.sin_red']);
    expect(component.view()).not.toBe('confirmed');
    expect(component.tickets()).toEqual([]);
    expect(compras).toEqual([]);
    expect(borde.llamadas('POST asistentes')).toBe(0);
    expect(borde.llamadas('POST cerrar')).toBe(0);
    expect(alertas()).toEqual([asistente().config().payFailedMessage]);
  });

  // ── cerrar que no salió: lo que quedó decide qué se dice y qué se repite ────────
  it('cerrar transitorio (flow.busy): dice lo que quedó apartado; reintentar cierra la MISMA saga, sin otro abrir', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({
      rechazos: { 'POST cerrar': [{ status: 503, code: 'flow.busy', transient: true, title: 'Service Unavailable' }] },
    });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await purchaseFirstGeneralEvent(fallos.escuchar);

    expect(fallos.motivos).toEqual(['flow.busy']);
    expect(component.view()).not.toBe('confirmed');
    // El aviso nombra la compra que SÍ quedó apartada, la del servidor.
    expect(alertas()).toEqual([asistente().config().confirmFailedMessage.replaceAll('{referencia}', 'pta-77')]);

    asistente().next();
    await flushMicrotasks(60);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmed');
    expect(component.tickets().map((ticket) => ticket.qr)).toEqual(['QR-SERVIDOR-77-1']);
    expect(borde.llamadas('POST abrir')).toBe(1);
    expect(borde.vistas().filter((vista) => vista.clave === 'POST cerrar').map((vista) => vista.url)).toEqual([
      '/api/flujos/eventos.compra/cerrar?id=pta-77',
      '/api/flujos/eventos.compra/cerrar?id=pta-77',
    ]);
  });

  it('cerrar que deshace la saga (pago rechazado): no se dice cobrado; reintentar ABRE con la MISMA llave y completa', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({
      rechazos: { 'POST cerrar': [{ status: 402, code: 'payments.payment_declined', title: 'Payment Required' }] },
    });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await purchaseFirstGeneralEvent(fallos.escuchar);

    expect(fallos.motivos).toEqual(['payments.payment_declined']);
    // Un solo aviso, por el code, y sin decir que se cobró: la saga se deshizo.
    expect(alertas()).toEqual(['Tu pago fue rechazado y no se te cobró nada.']);

    asistente().next();
    await flushMicrotasks(60);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmed');
    const abiertas = borde.vistas().filter((vista) => vista.clave === 'POST abrir');
    expect(abiertas).toHaveLength(2);
    // La MISMA intención: el orquestador reabre la saga deshecha en vez de abrir otra.
    expect(abiertas[1]!.llave).toBe(abiertas[0]!.llave);
    expect(borde.llamadas('POST cerrar')).toBe(2);
  });

  it('una sesión que vence a mitad de la compra (401 del artefacto) lleva al panel de sesión, sin cerrar nada', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({
      rechazos: { 'POST asistentes': [{ status: 401, code: 'puerta.sesion_requerida', title: 'Unauthorized' }] },
    });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await purchaseFirstGeneralEvent(fallos.escuchar);
    fixture.detectChanges();

    expect(fallos.motivos).toEqual(['puerta.sesion_requerida']);
    expect(component.view()).toBe('checkout');
    expect(panelDeSesion()).not.toBeNull();
    expect(asistenteMontado()).toBe(false);
    expect(borde.llamadas('POST cerrar')).toBe(0);
  });

  it('sin <synergos-flujo> arriba, la compra dice que no está disponible y no pide nada: ni la puerta ni la ruta vieja', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos();
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent(NEGOCIO_DEL_CMS, false);
    await ponerEntradasEnCarrito();
    component.setAttendeeField(0, 'name', 'Ada Lovelace');
    component.setAttendeeField(0, 'email', 'ada@example.com');
    component.goToCheckout();
    fixture.detectChanges();

    expect(component.sinCoordinador()).toBe(true);
    expect(asistenteMontado()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.eventos__denied')?.textContent).toContain(
      'La compra en línea no está disponible en este momento.',
    );
    // Y la estrategia, si alguien la llamara igual, tampoco sale a la red.
    const [estrategia] = TestBed.inject(FULFILLMENT_STRATEGIES);
    const pago = await estrategia!.pay({
      session: TestBed.inject(SessionStore).getValidSession(),
      instrument: component.checkoutInstrument(),
    });
    expect(pago).toEqual({ accepted: false, reason: 'cliente.sin_coordinador' });
    expect(borde.vistas().filter((vista) => vista.clave.startsWith('POST'))).toEqual([]);
  });

  // ── la traducción por code (ADR 0136): el respaldo es-CO, y con el bridge, la clave ─
  it('un «no» del negocio se dice por su code (inventory.insufficient_stock), una vez y en español', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({
      rechazos: { 'POST abrir': [{ status: 409, code: 'inventory.insufficient_stock', title: 'Conflict' }] },
    });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();

    await purchaseFirstGeneralEvent();

    expect(alertas()).toEqual(['No quedan entradas suficientes para tu selección.']);
    expect(borde.llamadas('POST cerrar')).toBe(0);
  });

  it('con el bridge, el «no» es la clave `Events.Purchase` que publicó la página (t() pinta su respaldo si no llegó)', async () => {
    (window as { synergos?: unknown }).synergos = {
      member: { key: 'm-1', displayName: 'Ada Lovelace', email: 'ada@example.com', roles: [] },
      i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys: { 'Events.Purchase.SoldOut': 'Not enough tickets left.' } },
    };
    try {
      installMemoryStorage();
      const borde = bordeDeEventos({
        rechazos: { 'POST abrir': [{ status: 409, code: 'inventory.insufficient_stock', title: 'Conflict' }] },
      });
      vi.stubGlobal('fetch', borde.fetchDoble);
      await createComponent();

      await purchaseFirstGeneralEvent();

      expect(alertas()).toEqual(['Not enough tickets left.']);
    } finally {
      delete (window as { synergos?: unknown }).synergos;
    }
  });

  it('gratis: sin paso de pago, abrir con total 0 y cerrar sin cobro, y sus entradas', async () => {
    installMemoryStorage();
    const borde = bordeDeEventos({ total: 0 });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    component.openEvent(component.events().find((e) => e.fromAmount <= 0)!);
    await flushMicrotasks();
    component.startSelection();
    component.proceedToCart();
    await flushMicrotasks();
    component.setAttendeeField(0, 'name', 'Ada Lovelace');
    component.setAttendeeField(0, 'email', 'ada@example.com');
    component.goToCheckout();
    fixture.detectChanges();

    expect(component.checkoutConfig().steps.map((paso) => paso.id)).toEqual(['asistentes', 'revisar']);
    expect(component.checkoutConfig().submitLabel).toBe('Confirmar registro');
    const wizard = asistente();
    while (!wizard.isLastStep()) {
      wizard.next();
      fixture.detectChanges();
    }
    wizard.next();
    await flushMicrotasks(60);
    fixture.detectChanges();

    expect(component.view()).toBe('confirmed');
    expect(borde.vistas().filter((vista) => !vista.clave.startsWith('GET /')).map((vista) => vista.clave)).toEqual([
      'POST abrir',
      'POST asistentes',
      'POST cerrar',
      'GET entradas',
    ]);
    expect(TestBed.inject(SessionStore).pricing().totalAmount).toBe(0);
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

  // ── ADR 0140 F4: la compra es de miembros, y la sesión se pide ANTES de pagar ─
  //
  // Lo decide el bridge que el CMS emite por render (`window.synergos.member`): con host y sin
  // miembro, el checkout pinta el panel de sesión en lugar del asistente. Sin host —standalone—
  // no hay panel. Con miembro, el asistente, con la primera fila precargada.
  async function alCheckoutCon(bridge: Record<string, unknown> | undefined): Promise<ReturnType<typeof vi.fn>> {
    if (bridge) {
      (window as { synergos?: unknown }).synergos = bridge;
    }
    installMemoryStorage();
    const red = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', red);
    await createComponent();
    await ponerEntradasEnCarrito();
    component.goToCheckout();
    fixture.detectChanges();
    expect(component.view()).toBe('checkout');
    return red;
  }

  const panelDeSesion = (): HTMLAnchorElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.eventos__denied a[href^="/account/login"]');
  const asistenteMontado = (): boolean => fixture.debugElement.query(By.directive(CheckoutWizardComponent)) !== null;

  it('con el CMS delante y sin miembro, el checkout pide la sesión con el login que vuelve aquí, y no pide nada', async () => {
    try {
      const red = await alCheckoutCon({ member: null });
      const enlace = panelDeSesion();
      expect(enlace).not.toBeNull();
      expect(asistenteMontado()).toBe(false);
      const aqui = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      expect(aqui).toContain('#/eventos/checkout');
      expect(enlace!.getAttribute('href')).toBe(`/account/login?returnUrl=${encodeURIComponent(aqui)}`);
      expect(enlace!.textContent?.trim()).toBe('Iniciar sesión');
      expect(red.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toEqual([]);
    } finally {
      delete (window as { synergos?: unknown }).synergos;
    }
  });

  it('sin host (standalone) no hay panel de sesión: el asistente, como siempre', async () => {
    await alCheckoutCon(undefined);
    expect(panelDeSesion()).toBeNull();
    expect(asistenteMontado()).toBe(true);
  });

  it('con miembro, el asistente con la primera fila precargada con el miembro', async () => {
    try {
      await alCheckoutCon({ member: { key: 'm-1', displayName: 'Ada Lovelace', email: 'ada@ejemplo.co', roles: [] } });
      expect(panelDeSesion()).toBeNull();
      expect(asistenteMontado()).toBe(true);
      expect(component.attendees()[0]).toMatchObject({ name: 'Ada Lovelace', email: 'ada@ejemplo.co' });
    } finally {
      delete (window as { synergos?: unknown }).synergos;
    }
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

  it('anota los asistentes y lee las entradas por el artefacto, las siembra en la billetera y valida en la puerta', async () => {
    const borde = bordeDeEventos();
    vi.stubGlobal('fetch', borde.fetchDoble);
    const client = createClient();
    const ada = [{ name: 'Ada Lovelace', email: 'ada@example.com', document: 'CC9' }];

    const anotados = await client.anotarAsistentes('/api/eventos', 'pta-77', ada);
    expect(anotados.ok).toBe(true);
    expect(borde.vistas().at(-1)).toMatchObject({
      clave: 'POST asistentes',
      url: '/api/eventos/compras/pta-77/asistentes',
      cuerpo: { attendees: ada },
    });
    expect(borde.vistas().at(-1)!.correlacion).toMatch(/^[0-9a-f]{32}$/);

    const entradas = await client.entradas('/api/eventos', 'pta-77', ada, CONTEXTO);
    if (!entradas.ok) throw new Error(`esperaba las entradas: ${entradas.rechazo.code}`);
    expect(borde.vistas().at(-1)).toMatchObject({ clave: 'GET entradas', url: '/api/eventos/compras/pta-77/entradas' });
    expect(entradas.valor.tickets.map((ticket) => ticket.qr)).toEqual(['QR-SERVIDOR-77-1']);
    const id = entradas.valor.tickets[0]!.id;
    // T9: la credencial es el token del QR, no el id.
    const qr = entradas.valor.tickets[0]!.qr;

    // The issued ticket is now in the wallet ("mis tickets"), con la saga como su orden.
    const wallet = await client.tickets('/api/eventos', 'ada@example.com');
    expect(wallet.tickets.find((t) => t.id === id)?.orderRef).toBe('pta-77');

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

  it('un rechazo del artefacto vuelve por su code, con lo que el servidor agregó, y no siembra nada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ title: 'Conflict', status: 409, code: 'eventos.compra_en_curso', transient: false, purchaseStatus: 'Running' }),
            { status: 409, headers: { 'content-type': 'application/problem+json' } },
          ),
        ),
      ),
    );
    const client = createClient();

    const entradas = await client.entradas('/api/eventos', 'pta-77', [], CONTEXTO);

    expect(entradas).toMatchObject({ ok: false, rechazo: { code: 'eventos.compra_en_curso', transient: false, extra: { purchaseStatus: 'Running' } } });
    const wallet = await client.tickets('/api/eventos', 'a@b.co');
    expect(wallet.tickets.some((ticket) => ticket.orderRef === 'pta-77')).toBe(false);
  });

  // ── EL QUE MUERDE: con la red caída no hay entradas, ni transferencia, ni veredicto ─
  it('con la red caída: asistentes y entradas CONTESTAN el rechazo sin fabricar nada; transferir y validar LANZAN', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const client = createClient();
    const fallo = { name: 'EventosWriteFailedError' };

    expect(await client.anotarAsistentes('/api/eventos', 'pta-77', [{ name: 'Ada', email: 'a@b.co', document: 'CC9' }])).toMatchObject({
      ok: false,
      rechazo: { code: 'cliente.sin_red', transient: true },
    });
    expect(await client.entradas('/api/eventos', 'pta-77', [], CONTEXTO)).toMatchObject({ ok: false, rechazo: { code: 'cliente.sin_red' } });
    await expect(client.transfer('/api/eventos', 'tkt_77_1', 'nuevo@b.co')).rejects.toMatchObject(fallo);
    await expect(client.checkin('/api/eventos', 'QR-SERVIDOR-77-1')).rejects.toMatchObject(fallo);

    // Ninguna escritura caída enciende el cartel de «datos de ejemplo»…
    expect(client.degraded).toBe(false);
    // …y la billetera (una LECTURA, que sí degrada) no lleva ninguna entrada de esa compra.
    const wallet = await client.tickets('/api/eventos', 'a@b.co');
    expect(wallet.tickets.some((ticket) => ticket.orderRef === 'pta-77')).toBe(false);
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
