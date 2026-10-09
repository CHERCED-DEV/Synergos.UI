import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FulfillmentContext,
  OrchestratorService,
  SessionStore,
  TransactionEventBusService,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  CartShellComponent,
  type CartAction,
  type CartLine,
  type CartShellConfig,
  type CartSummaryRow,
  ConfirmationShellComponent,
  type ConfirmationAction,
  type ConfirmationShellConfig,
  type ConfirmationStep,
  AuthoringWizardComponent,
  CheckoutWizardComponent,
  ConsoleShellComponent,
  CredentialWalletComponent,
  DetailShellComponent,
  DiscoveryShellComponent,
  TrackingTimelineComponent,
  type AccountShellConfig,
  type AuthoringWizardConfig,
  type CheckoutWizardConfig,
  AVISOS_DE_UN_COBRO,
  type CheckoutWizardResult,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  type CredentialWalletConfig,
  type DetailMedia,
  type DetailSpec,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type DiscoverySortOption,
  type TrackingStage,
  type WalletCredential,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  SynSkeletonComponent,
  SynErrorStateComponent,
} from '@synergos/shared';
import type { EventosProps } from '@synergos/contracts';
import { comisionEnMenores } from './eventos-comision';
import { EventosApiClient, isEventosForbidden, isEventosUnauthorized } from './eventos-api.client';

/**
 * El reloj de la ficha: la hora contra la que se decide si una localidad «aún no» abre (#195).
 * Inyectable para que los specs fijen el instante; en la página es `Date.now`.
 */
export const EVENTOS_RELOJ = new InjectionToken<() => number>('EVENTOS_RELOJ', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});
import { subscribeToChannel, type RealtimeSubscription } from './realtime-stream';
import {
  EVENTOS_FLOW,
  type Attendee,
  type Buyer,
  type CatalogCriteria,
  type CheckInOutcome,
  type CheckInResult,
  type CreateEventRequest,
  type CreateTierDraft,
  type EventDetail,
  type EventMode,
  type EventStatus,
  type EventSummary,
  type EventosRole,
  type EventosSortKey,
  type EventosView,
  type ETicket,
  type ManageResult,
  type ManagedAttendee,
  type ManagerView,
  type PortfolioEvent,
  type ScanRecord,
  type TicketTier,
  type TierSelectionPayload,
  type VenueZone,
  type WalletTicket,
  type TierSaleState,
} from './eventos.model';
import { baseDeRuta, mismaRuta, segmentosDeRuta, formatearImporte, aMenores, desdeMenores, t } from '@synergos/vitals-core';

/**
 * Runtime config for the CMS element <c>elementSynEventos</c>.
 *
 * Eventos **v2** — the enterprise events platform (Ticketmaster + Eventbrite,
 * doc 21 §2.6) rebuilt as a **hash-routed multi-page SPA** and the Ola-3 consumer
 * of the reusable shell catalogue `@synergos/shells`:
 *
 *  - **ASISTENTE:** SH-1 `syn-discovery-shell` (catálogo+categorías+geo+fecha) →
 *    SH-2 `syn-detail-shell` (hero+countdown+tiers, perfil artista/venue) →
 *    selección (`<synergos-seat-map>` con price-levels / GA) → carrito+fees →
 *    SH-3 `syn-checkout-wizard` → SH-10 `syn-credential-wallet` (e-ticket QR +
 *    transferir) → SH-4 `syn-account-shell` ("mis tickets" + tracking).
 *  - **ORGANIZADOR (role-switch):** SH-5 `syn-console-shell` (cartera, KPIs
 *    vendidos/aforo/ingresos, asistentes, check-in scan Válido/Ya-usado/Inválido,
 *    payout) + SH-6 `syn-authoring-wizard` (crear evento: tiers/aforo → publicar).
 *
 * El `config` que manda el CMS tiene la forma de `EventosProps`, GENERADO del record C# (ADR
 * 0135): lo que escribe el editor —título, subtítulo, cara inicial— y la configuración de NEGOCIO
 * del sitio —dónde vive la API y las dos comisiones—, que sale de `Synergos:Features:Eventos` y
 * el editor no ve (ADR 0137, CMS#194). Ninguna de las dos comisiones está compilada acá: la que
 * el carrito muestra es la que los motores del CMS cobran, de la MISMA fuente. La moneda no es
 * configuración: llega con cada importe del catálogo. Los datos vienen siempre de la API, con
 * degradación visible a la muestra. Los shells quedan sin dominio (contrato D3).
 */
export type EventosConfig = Partial<EventosProps>;

/** Typed event map for the transaction bus (eventos ↔ checkout ↔ check-in ↔ IA). */
interface EventosBus extends Record<string, unknown> {
  readonly purchased: { readonly eventId: string; readonly orderRef: string; readonly tickets: number };
  readonly checkedin: { readonly eventId: string; readonly ticketId: string };
}

/** El prefijo de las rutas por hash (`#/eventos/e/<id>`): es de runtime, no de negocio. */
const DEFAULT_SCOPE = 'eventos';
const DEFAULT_ROLE: EventosRole = 'attendee';
const DEFAULT_HEADING = 'Vive los mejores eventos, sin complicarte';
const DEFAULT_SUBHEADING =
  'Conciertos, deportes, teatro y festivales · e-ticket con QR · check-in ágil';
const SESSION_TTL_MS = 30 * 60 * 1000;

const ROLES: readonly { key: EventosRole; label: string }[] = [
  { key: 'attendee', label: 'Asistente' },
  { key: 'organizer', label: 'Organizador' },
];

const SORT_OPTIONS: readonly DiscoverySortOption[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'date-asc', label: 'Próximos primero' },
  { key: 'popular', label: 'Más populares' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
];

const CLEAN_CRITERIA: DiscoveryCriteria = { term: '', facets: {}, sort: 'relevance', page: 1 };

/** The manager sections addressable inside the SH-5 console (order = sidebar). */
const MANAGER_SECTIONS: readonly ManagerView[] = [
  'portfolio',
  'dashboard',
  'attendees',
  'checkin',
  'payout',
];

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeEventosConfig(value: EventosConfig): EventosConfig {
  return omitUndefinedProperties<EventosProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    role: normalizeRole(value.role),
    apiBase: coerceTrimmedStringInput(value.apiBase),
    feePercent: normalizeFee(value.feePercent),
    platformFeePercent: normalizeFee(value.platformFeePercent),
  });
}

function normalizeRole(value: unknown): EventosRole | undefined {
  return value === 'organizer' || value === 'attendee' ? value : undefined;
}

function normalizeFee(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) && num >= 0 && num <= 100 ? num : undefined;
}

/** La moneda de las entradas del carrito: la trajo su localidad desde el catálogo. */
function monedaDelCarrito(items: readonly { readonly selection?: unknown }[]): string {
  const seleccion = items[0]?.selection as Readonly<Record<string, unknown>> | undefined;
  const moneda = seleccion?.['currency'];
  return typeof moneda === 'string' ? moneda.trim() : '';
}

let eventosInstanceId = 0;

@Component({
  selector: 'sg-eventos',
  standalone: true,
  imports: [
    DiscoveryShellComponent,
    DetailShellComponent,
    CheckoutWizardComponent,
    AccountShellComponent,
    ConfirmationShellComponent,
    CartShellComponent,
    TrackingTimelineComponent,
    ConsoleShellComponent,
    AuthoringWizardComponent,
    CredentialWalletComponent,
    SynSkeletonComponent,
    SynErrorStateComponent,
  ],
  templateUrl: './eventos.html',
  styleUrl: './eventos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-seat-map>, <synergos-qr-code>,
  // <synergos-countdown-clock>).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-eventos' },
})
export class EventosElementComponent implements OnInit {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<EventosBus>>(TransactionEventBusService);
  readonly #api = inject(EventosApiClient);
  readonly #reloj = inject(EVENTOS_RELOJ);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<EventosConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<EventosProps>(sanitizeEventosConfig),
  });
  // Los atributos sueltos son la API del tag crudo. Las comisiones NO tienen atributo: una regla
  // de negocio escrita en una plantilla volvería a separar lo que se muestra de lo que se cobra.
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly eventIdInput = input<string | undefined>(undefined, { alias: 'eventId' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  /**
   * Dónde vive la API. Sin ella no se llama a nada y cada vista degrada a su muestra, visible:
   * no hay una base de respaldo compilada (era la tercera copia de `/api/eventos`, ADR 0137).
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  /**
   * La moneda de lo que se muestra: la que trae cada importe del catálogo —la del carrito, la
   * del evento abierto o la de la cartelera—. No es configuración: sería una segunda fuente para
   * un dato del precio. Sin datos todavía, vacía (y `formatPrice` pinta el número solo).
   */
  readonly currency = computed(
    () =>
      monedaDelCarrito(this.#store.items()) ||
      this.detail()?.event.currency ||
      this.events()[0]?.currency ||
      '',
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), undefined, DEFAULT_SCOPE),
  );
  readonly initialRole = computed<EventosRole>(() =>
    resolveConfigValue(normalizeRole(this.roleInput()), normalizeRole(this.config()?.role), DEFAULT_ROLE),
  );
  readonly deepLinkEventId = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.eventIdInput()), undefined, ''),
  );
  /**
   * La comisión de servicio del sitio (ADR 0137): la misma que cobran los motores del CMS. Sin
   * ella no se inventa una: el carrito no suma comisión.
   */
  readonly feePercent = computed(() => this.config()?.feePercent ?? 0);
  /** La comisión de la plataforma sobre lo que se le liquida al organizador; sin ella, no se pinta. */
  readonly platformFeePercent = computed(() => this.config()?.platformFeePercent ?? null);
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      DEFAULT_HEADING,
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      DEFAULT_SUBHEADING,
    ),
  );

  readonly instanceId = (eventosInstanceId += 1);
  readonly fieldId = `syn-eventos-${this.instanceId}`;
  readonly roles = ROLES;
  readonly sortOptions = SORT_OPTIONS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly purchased = output<{ eventId: string; orderRef: string; tickets: number }>();
  readonly checkedin = output<{ eventId: string; ticketId: string }>();

  // ─── Role / shell state ──────────────────────────────────────────────────────
  readonly role = signal<EventosRole>(DEFAULT_ROLE);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  #suppressedHash = '';

  // ─── ASISTENTE state ─────────────────────────────────────────────────────────
  readonly view = signal<EventosView>('catalog');

  // Catalogue (SH-1 discovery)
  readonly criteria = signal<DiscoveryCriteria>(CLEAN_CRITERIA);
  readonly events = signal<readonly EventSummary[]>([]);
  readonly searched = signal(false);

  // Event PDP (SH-2 detail)
  readonly detail = signal<EventDetail | null>(null);

  // Selection
  readonly selectedTierId = signal('');
  readonly quantity = signal(1);
  readonly selectedSeats = signal<readonly string[]>([]);

  // Attendees / buyer (SH-3 checkout steps)
  readonly attendees = signal<readonly Attendee[]>([]);
  readonly buyerName = signal('');
  readonly buyerEmail = signal('');

  // Confirmation
  readonly orderRef = signal('');
  readonly tickets = signal<readonly ETicket[]>([]);

  // Wallet ("mis tickets" — SH-10 + SH-4)
  readonly wallet = signal<readonly WalletTicket[]>([]);
  readonly walletLoaded = signal(false);
  readonly accountSection = signal<'tickets' | 'perfil'>('tickets');
  readonly trackingByRef = signal<Readonly<Record<string, readonly TrackingStage[]>>>({});
  readonly transferTo = signal('');
  readonly transferTicketId = signal('');

  // ─── ORGANIZADOR state ─────────────────────────────────────────────────────────
  readonly managerView = signal<ManagerView>('portfolio');
  readonly manageEventId = signal('');
  readonly manage = signal<ManageResult | null>(null);
  /**
   * La liquidación del organizador con la comisión de la plataforma del sitio (ADR 0137). Era un
   * 10 % escrito en la plantilla. Sin comisión configurada no se pinta un neto: sería inventarlo.
   * Se redondea con la regla de la comisión de servicio.
   */
  readonly payout = computed(() => {
    const data = this.manage();
    const porcentaje = this.platformFeePercent();
    if (!data || porcentaje === null) {
      return null;
    }
    const brutoMinor = aMenores(data.revenue, this.currency());
    const comisionMinor = comisionEnMenores(brutoMinor, porcentaje);
    return {
      porcentaje: `${porcentaje.toLocaleString('es-CO')} %`,
      comision: desdeMenores(comisionMinor, this.currency()),
      neto: desdeMenores(brutoMinor - comisionMinor, this.currency()),
    };
  });
  /**
   * Acceso a la CONSOLA DEL ORGANIZADOR (panel, crear evento, check-in), que ahora exige
   * rol. `'anon'` (401) → ofrecer login; `'forbidden'` (403) → el login NO ayuda, hace
   * falta que un admin dé el permiso. Distinto de `degraded`: aquí no hay nada que
   * degradar, y pintar datos de ejemplo mostraría asistentes a quien no debe verlos.
   */
  readonly organizerAccess = signal<'ok' | 'anon' | 'forbidden'>('ok');

  // ─── Compra confirmada (SH-11) ──────────────────────────────────────────────
  readonly confirmationConfig = computed<ConfirmationShellConfig>(() => ({
    heading: '¡Compra confirmada!',
    summary: 'Tus entradas están listas. También las tienes en «Mis tickets».',
    referenceLabel: 'Número de orden',
    stepsLabel: 'Qué sigue',
    copyLabel: 'Copiar orden',
    copiedLabel: 'Orden copiada',
  }));

  readonly confirmationSteps: readonly ConfirmationStep[] = [
    { id: 'pagado', label: 'Pago recibido', done: true },
    { id: 'entradas', label: 'Tus entradas quedaron emitidas', done: true },
    {
      id: 'puerta',
      label: 'Preséntalas en la entrada',
      detail: 'Basta con el QR en el teléfono; no hace falta imprimir.',
    },
  ];

  readonly confirmationActions: readonly ConfirmationAction[] = [
    { id: 'wallet', label: 'Ver mis tickets', kind: 'primary' },
    { id: 'imprimir', label: 'Imprimir' },
    { id: 'explorar', label: 'Explorar más eventos' },
  ];

  onConfirmationAction(id: string): void {
    if (id === 'wallet') {
      this.goToWallet();
      return;
    }
    if (id === 'imprimir') {
      this.printTickets();
      return;
    }
    this.startOver();
  }
  readonly attendeeFilter = signal('');
  readonly checkinCode = signal('');
  readonly lastScan = signal<CheckInResult | null>(null);
  readonly scanLog = signal<readonly ScanRecord[]>([]);
  readonly checkedInCount = signal(0);
  readonly createResultSlug = signal('');

  // ─── Engine-derived state ────────────────────────────────────────────────────
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    void this.searched();
    void this.view();
    void this.detail();
    void this.manage();
    void this.lastScan();
    void this.wallet();
    return this.#api.degraded;
  });

  // ─── Catalogue derived (SH-1 facets) ─────────────────────────────────────────
  readonly discoveryFacets = computed<readonly DiscoveryFacet[]>(() => {
    const categories = this.facetValues((event) => event.category);
    const cities = this.facetValues((event) => event.city);
    const facets: DiscoveryFacet[] = [];
    // Las dos viajan de a UN valor al backend (`category`/`city` son campos sueltos
    // del criteria, no listas), así que se declaran de valor único: el shell pinta
    // radios y lo que se marca es lo que se filtra. Ofrecer casillas y mandar el
    // primero devolvía menos de lo pedido, sin fallar y sin avisar (#18).
    if (categories.length > 0) {
      facets.push({ key: 'category', label: 'Categoría', kind: 'SingleSelect', values: categories });
    }
    if (cities.length > 0) {
      facets.push({ key: 'city', label: 'Ciudad', kind: 'SingleSelect', values: cities });
    }
    return facets;
  });

  readonly homeCategories = computed(
    () => this.discoveryFacets().find((facet) => facet.key === 'category')?.values ?? [],
  );

  readonly hasActiveFilters = computed(() => {
    const active = this.criteria();
    return active.term.trim() !== '' || Object.values(active.facets).some((v) => v.length > 0);
  });

  // ─── PDP / selection derived ─────────────────────────────────────────────────
  readonly tiers = computed<readonly TicketTier[]>(() => this.detail()?.tiers ?? []);

  /**
   * La localidad que se compra: sólo una que esté a la venta (#195). Una que el servidor dijo que
   * no —aún no abre, o cerró— se ve en la ficha con su estado, pero no se elige ni se compra; si
   * ninguna está a la venta no hay botón de compra.
   */
  readonly selectedTier = computed<TicketTier | null>(() => {
    const tiers = this.tiers().filter((tier) => this.tierSaleState(tier) === 'a-la-venta');
    const id = this.selectedTierId();
    return (
      tiers.find((tier) => tier.id === id) ??
      tiers.find((tier) => tier.featured) ??
      tiers[0] ??
      null
    );
  });

  readonly isReserved = computed(() => this.detail()?.event.mode === 'reserved');
  /**
   * Si lo que se compra es gratis. Con carrito sale de sus LÍNEAS —todas a 0—, que viven en la
   * sesión y sobreviven a la recarga y a la vuelta del login; `detail()` no: al volver queda nulo y
   * un evento pagado pasaba a contarse como gratis, con su «Confirmar registro» (medido en el plan
   * de la F4). Sin carrito, la ficha abierta.
   */
  readonly isFreeEvent = computed(() => {
    const lineas = this.#store.items();
    if (lineas.length > 0) {
      return lineas.every((linea) => linea.amount <= 0);
    }
    return (this.detail()?.event.fromAmount ?? 0) <= 0;
  });

  readonly pdpMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.detail();
    if (!detail || !detail.event.cover) {
      return [];
    }
    return [{ url: detail.event.cover, alt: detail.event.title }];
  });

  readonly pdpSpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.detail();
    if (!detail) {
      return [];
    }
    const event = detail.event;
    const specs: DetailSpec[] = [
      { label: 'Fecha', value: this.formatDate(event.startsAt) || '—' },
      { label: 'Lugar', value: detail.venue.name || event.venueName || '—' },
      { label: 'Ciudad', value: event.city || '—' },
      { label: 'Categoría', value: event.category || '—' },
      { label: 'Modalidad', value: event.mode === 'reserved' ? 'Asientos numerados' : 'Admisión general' },
      { label: 'Organizador', value: detail.organizer.name },
    ];
    return specs;
  });

  /** The venue zone bound to the selected tier (reserved seating). */
  readonly selectedZone = computed<VenueZone | null>(() => {
    const tier = this.selectedTier();
    const zones = this.detail()?.venue.zones ?? [];
    if (!tier?.zoneId) {
      return zones[0] ?? null;
    }
    return zones.find((zone) => zone.id === tier.zoneId) ?? zones[0] ?? null;
  });

  /** The seat-map payload (JSON string) for `<synergos-seat-map>`. */
  readonly seatmapJson = computed(() => {
    const zone = this.selectedZone();
    return zone ? JSON.stringify(zone.seatmap) : '';
  });

  /** Effective number of tickets — seats count for reserved, quantity for general. */
  readonly ticketCount = computed(() =>
    this.isReserved() ? this.selectedSeats().length : this.quantity(),
  );

  readonly selectionAmount = computed(() => {
    const tier = this.selectedTier();
    return tier ? tier.amount * Math.max(0, this.ticketCount()) : 0;
  });

  readonly selectionAmountLabel = computed(() =>
    this.formatPrice(this.selectionAmount(), this.currency()),
  );

  readonly canProceedSelection = computed(() => {
    const tier = this.selectedTier();
    if (!tier) {
      return false;
    }
    return this.ticketCount() >= 1 && this.ticketCount() <= tier.maxPerOrder;
  });

  // ─── Cart + fees (engine) ────────────────────────────────────────────────────
  readonly cartItems = this.#store.items;
  readonly hasCart = this.#store.hasItems;
  readonly cartSubtotalMinor = computed(() =>
    this.#store.items().reduce((sum, item) => sum + item.amount * item.quantity, 0),
  );
  // La regla de los motores del CMS (al par, exacta): `eventos-comision.ts`, cruzada con G-12.
  readonly feesMinor = computed(() => comisionEnMenores(this.cartSubtotalMinor(), this.feePercent()));
  readonly cartTotalMinor = computed(() => this.cartSubtotalMinor() + this.feesMinor());
  readonly cartSubtotalLabel = computed(() =>
    this.formatMinor(this.cartSubtotalMinor()),
  );
  readonly feesLabel = computed(() => this.formatMinor(this.feesMinor()));
  readonly cartTotalLabel = computed(() => this.formatMinor(this.cartTotalMinor()));

  // ─── Checkout (SH-3 inputs) ─────────────────────────────────────────────────
  readonly attendeesValid = computed(
    () =>
      this.attendees().length > 0 &&
      this.attendees().every(
        (attendee) => attendee.name.trim().length >= 2 && /.+@.+\..+/.test(attendee.email.trim()),
      ),
  );

  readonly buyerValid = computed(
    () => this.buyerName().trim().length >= 2 && /.+@.+\..+/.test(this.buyerEmail().trim()),
  );

  /**
   * Asistentes → revisar, en lo pagado y en lo gratis. El paso «pago» con su tarjeta/PSE se fue:
   * el método elegido no viajaba por ninguna ruta, así que la pantalla afirmaba una elección que
   * nadie recibía (T2, «la UI no miente»). La pasarela es del #183.
   */
  readonly checkoutConfig = computed<CheckoutWizardConfig>(() => {
    const steps = [
      { id: 'asistentes', label: 'Asistentes' },
      { id: 'revisar', label: 'Confirmar' },
    ];
    return {
      steps,
      summaryHeading: 'Tu orden',
      submitLabel: this.isFreeEvent() ? 'Confirmar registro' : 'Pagar y confirmar',
      // El fallo lo dice el ASISTENTE, una vez (UI#91). Un evento gratis no cobra, y su
      // aviso no puede hablar de un pago. Sale del diccionario, sección `Events.Purchase`
      // (ADR 0140 F4): el respaldo es el texto es-CO de siempre.
      ...(this.isFreeEvent()
        ? {
            payFailedMessage: t('Events.Purchase.FreeFailed', 'No pudimos completar tu registro. Intenta de nuevo.'),
            confirmFailedMessage: t(
              'Events.Purchase.FreeConfirmPending',
              'Tu registro quedó abierto (referencia {referencia}) pero no pudimos confirmarlo. Vuelve a intentarlo.',
            ),
          }
        : AVISOS_DE_UN_COBRO),
      processingLabel: 'Procesando…',
      nextLabel: 'Continuar',
      backLabel: 'Atrás',
    };
  });

  readonly checkoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    asistentes: this.attendeesValid() && this.buyerValid(),
    revisar: true,
  }));

  /** La selección de la línea del carrito: el evento que se compra, aunque la ficha no esté cargada. */
  readonly #seleccionDelCarrito = computed<Readonly<Record<string, unknown>>>(
    () => (this.#store.items()[0]?.selection as Readonly<Record<string, unknown>> | undefined) ?? {},
  );

  readonly checkoutInstrument = computed<Readonly<Record<string, unknown>>>(() => {
    const detail = this.detail();
    const linea = this.#seleccionDelCarrito();
    // El evento y su título salen de la LÍNEA: tras recargar o volver del login `detail()` es nulo
    // y el `eventId` quedaba vacío. El lugar y la hora, que la línea no lleva, son de la ficha.
    const eventId = typeof linea['eventId'] === 'string' ? linea['eventId'] : (detail?.event.id ?? '');
    const eventTitle = typeof linea['eventTitle'] === 'string' ? linea['eventTitle'] : (detail?.event.title ?? '');
    return {
      apiBase: this.apiBase(),
      eventId,
      eventTitle,
      venueName: detail?.venue.name ?? detail?.event.venueName ?? '',
      startsAt: detail?.event.startsAt ?? '',
      attendees: this.attendees().map((a) => ({
        name: a.name.trim(),
        email: a.email.trim(),
        document: a.document.trim(),
      })),
      buyer: { name: this.buyerName().trim(), email: this.buyerEmail().trim() } as Buyer,
      provider: this.isFreeEvent() ? 'eventos-free' : 'eventos',
    };
  });

  // ─── Account (SH-4 inputs) ──────────────────────────────────────────────────
  readonly upcomingTickets = computed(() =>
    this.wallet().filter((ticket) => ticket.status === 'valid'),
  );
  readonly pastTickets = computed(() =>
    this.wallet().filter((ticket) => ticket.status !== 'valid'),
  );

  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mi cuenta',
    navLabel: 'Secciones de la cuenta',
    inboxEmptyMessage: 'Todavía no tienes entradas. Explora eventos y compra tu entrada.',
    inboxLoadingMessage: 'Cargando tus entradas…',
    detailPlaceholder: 'Selecciona una entrada para ver el detalle y su seguimiento.',
    sections: [
      { id: 'tickets', label: 'Mis entradas', kind: 'inbox', badge: this.wallet().length || undefined },
      { id: 'perfil', label: 'Mis datos' },
    ],
  }));

  // ─── Wallet (SH-10 inputs) ──────────────────────────────────────────────────
  readonly walletConfig = computed<CredentialWalletConfig>(() => ({
    heading: 'Mis entradas',
    emptyMessage: 'Todavía no tienes entradas. Explora eventos y compra tu entrada.',
    listLabel: 'Mis entradas',
    referenceLabel: 'Código',
    expandLabel: 'Ver entrada (QR)',
    collapseLabel: 'Ocultar entrada',
    qrSize: 160,
  }));

  readonly walletCredentials = computed<readonly WalletCredential[]>(() =>
    this.wallet().map((ticket) => ({
      id: ticket.id,
      kind: 'E-ticket',
      title: ticket.eventTitle,
      subtitle: [ticket.venueName, this.formatDateShort(ticket.startsAt)].filter(Boolean).join(' · '),
      reference: ticket.id,
      qrData: ticket.qr,
      issuedAt: ticket.orderRef ? `Orden ${ticket.orderRef}` : '',
      status: {
        label: this.walletStatusLabel(ticket.status),
        tone: ticket.status === 'valid' ? 'positive' : 'neutral',
      },
      fields: [
        { label: 'Tier', value: ticket.tier || 'General' },
        ...(ticket.seat ? [{ label: 'Asiento', value: ticket.seat }] : []),
        { label: 'Titular', value: ticket.holder || '—' },
      ],
    })),
  );

  // ─── Organizer console (SH-5 inputs) ────────────────────────────────────────
  readonly soldPercent = computed(() => {
    const data = this.manage();
    if (!data || data.capacity <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((data.sold / data.capacity) * 100));
  });

  readonly availableCapacity = computed(() => {
    const data = this.manage();
    return data ? Math.max(0, data.capacity - data.sold) : 0;
  });

  readonly checkinRate = computed(() => {
    const data = this.manage();
    if (!data || data.attendees.length === 0) {
      return 0;
    }
    const checkedIn = data.attendees.filter((a) => a.state === 'checked-in').length;
    return Math.round((checkedIn / data.attendees.length) * 100);
  });

  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() => {
    const data = this.manage();
    if (!data) {
      return [];
    }
    return [
      { id: 'sold', label: 'Vendidos', value: this.formatCount(data.sold), hint: `${this.soldPercent()}% del aforo` },
      { id: 'capacity', label: 'Aforo disponible', value: this.formatCount(this.availableCapacity()), hint: `Capacidad ${this.formatCount(data.capacity)}` },
      { id: 'revenue', label: 'Ingresos', value: this.formatPrice(data.revenue, this.currency()), trend: 'up', delta: '+8%' },
      { id: 'checkin', label: 'Check-in', value: `${this.checkinRate()}%`, hint: `${this.checkedInCount()} ingresaron` },
    ];
  });

  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Consola del organizador',
    navLabel: 'Secciones del organizador',
    kpisLabel: 'Indicadores del evento',
    filtersLabel: 'Filtros',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay filas en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      { id: 'portfolio', label: 'Cartera', kind: 'table' },
      { id: 'dashboard', label: 'Dashboard', kind: 'custom' },
      { id: 'attendees', label: 'Asistentes', kind: 'table', badge: this.manage()?.attendees.length || undefined },
      { id: 'checkin', label: 'Check-in', kind: 'custom' },
      { id: 'payout', label: 'Payout', kind: 'custom' },
    ],
  }));

  readonly portfolioColumns: readonly ConsoleColumn[] = [
    { key: 'title', label: 'Evento' },
    { key: 'when', label: 'Fecha' },
    { key: 'sold', label: 'Vendidos', align: 'end' },
    { key: 'revenue', label: 'Ingresos', align: 'end' },
    { key: 'status', label: 'Estado' },
  ];

  readonly attendeeColumns: readonly ConsoleColumn[] = [
    { key: 'name', label: 'Asistente' },
    { key: 'tier', label: 'Tier' },
    { key: 'seat', label: 'Asiento' },
    { key: 'state', label: 'Estado' },
  ];

  readonly portfolioActions: readonly ConsoleRowAction[] = [
    { id: 'open', label: 'Abrir', kind: 'primary' },
  ];
  readonly attendeeActions: readonly ConsoleRowAction[] = [
    { id: 'checkin', label: 'Check-in', kind: 'default' },
  ];
  readonly noActions: readonly ConsoleRowAction[] = [];

  readonly portfolioRows = computed<readonly PortfolioEvent[]>(() => this.manage()?.portfolio ?? []);

  /** Union row type so the generic SH-5 console unifies `TRow` across sections. */
  readonly consoleRows = computed<readonly (PortfolioEvent | ManagedAttendee)[]>(() =>
    this.managerView() === 'attendees' ? this.filteredAttendees() : this.portfolioRows(),
  );

  readonly consoleColumns = computed<readonly ConsoleColumn[]>(() =>
    this.managerView() === 'attendees' ? this.attendeeColumns : this.portfolioColumns,
  );

  readonly consoleActions = computed<readonly ConsoleRowAction[]>(() => {
    if (this.managerView() === 'portfolio') {
      return this.portfolioActions;
    }
    if (this.managerView() === 'attendees') {
      return this.attendeeActions;
    }
    return this.noActions;
  });

  readonly filteredAttendees = computed<readonly ManagedAttendee[]>(() => {
    const term = this.attendeeFilter().trim().toLowerCase();
    const list = this.manage()?.attendees ?? [];
    if (!term) {
      return list;
    }
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        a.tier.toLowerCase().includes(term) ||
        a.ticketId.toLowerCase().includes(term),
    );
  });

  // ─── Create event (SH-6 authoring) ──────────────────────────────────────────
  readonly createConfig: AuthoringWizardConfig = {
    heading: 'Crear evento',
    steps: [
      { id: 'basicos', label: 'Básicos' },
      { id: 'tiers', label: 'Tiers y aforo' },
      { id: 'publicar', label: 'Publicar' },
    ],
    stepsLabel: 'Pasos para crear el evento',
    backLabel: 'Atrás',
    nextLabel: 'Continuar',
    publishLabel: 'Publicar evento',
    publishingLabel: 'Publicando…',
    draftScope: `eventos-create.${this.instanceId}`,
  };

  readonly createDraft = signal<Readonly<Record<string, unknown>>>({});
  readonly createPublishing = signal(false);

  readonly createValidity = computed<Readonly<Record<string, boolean>>>(() => {
    const draft = this.createDraft();
    const title = this.draftString(draft, 'title');
    const city = this.draftString(draft, 'city');
    const startsAt = this.draftString(draft, 'startsAt');
    const tierName = this.draftString(draft, 'tierName');
    const tierAmount = this.draftString(draft, 'tierAmount');
    const capacity = this.draftString(draft, 'capacity');
    return {
      basicos: title.trim().length >= 3 && city.trim().length >= 2 && startsAt.trim().length > 0,
      tiers: tierName.trim().length >= 2 && Number(tierAmount) >= 0 && Number(capacity) >= 1,
      publicar: true,
    };
  });

  constructor() {
    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `eventos.${this.instanceId}`,
      flow: EVENTOS_FLOW,
      ttlMs: SESSION_TTL_MS,
    });
    this.#bus.scope(`eventos-${this.instanceId}`);

    // Register the catalogue widget so the orchestrator tracks page readiness.
    const widget = this.#orchestrator.register('eventos-catalog', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/e/<id>, #/<scope>/mis-tickets…).
    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      // Sin esto queda una conexión SSE abierta por cada montaje del componente.
      this.closeCheckinStream();
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });
  }

  /**
   * Abre la cara que eligió el editor y la carga contra la API del sitio.
   *
   * No va en el constructor: en un custom element los inputs —el `config` del CMS— se aplican
   * DESPUÉS de crear el componente y ANTES del primer ciclo, así que el constructor los ve vacíos.
   * Ahí se abría siempre la cara de asistente aunque el editor eligiera la de organizador, y la
   * primera búsqueda salía con la base de la API compilada en vez de la del sitio (CMS#194).
   */
  ngOnInit(): void {
    this.role.set(this.initialRole());
    if (this.role() === 'organizer') {
      this.manageEventId.set(this.deepLinkEventId());
      void this.loadManage().then(() => this.applyHash());
    } else {
      void this.runSearch().then(() => this.applyHash());
    }
  }

  // ─── Role switch ─────────────────────────────────────────────────────────────

  /**
   * Imagenes cuya carga FALLO. El `@if (...cover)` de la plantilla solo caia al
   * placeholder cuando la URL venia VACIA -- nunca cuando daba 404. Un fallback que
   * solo cubre "no hay URL" no cubre "la URL miente", que es el caso que se ve en
   * pantalla: 32 de las 48 rutas /media/ sembradas no existen en disco.
   */
  readonly #imgFailed = signal<ReadonlySet<string>>(new Set());

  onImageError(key: string): void {
    this.#imgFailed.update((s) => new Set(s).add(key));
  }

  /** true si hay URL y ademas cargo. */
  hasImage(url: string | null | undefined, key: string): boolean {
    return !!url && !this.#imgFailed().has(key);
  }

  setRole(role: EventosRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    this.errorMessage.set('');
    if (role === 'organizer') {
      if (!this.manage()) {
        void this.loadManage();
      }
      this.writeHash('organizer', this.managerView());
    } else {
      // Volver a la cara de asistente cierra el canal: nadie está mirando la consola,
      // y una conexión abierta por cada ida y vuelta se acumula.
      this.closeCheckinStream();
      if (this.events().length === 0) {
        void this.runSearch();
      }
      this.navigate('catalog');
    }
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  private eventValue(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement | null)?.value ?? '';
  }

  // ─── Router (signals + hash deep-links) ─────────────────────────────────────
  navigate(view: EventosView, param = ''): void {
    if (view === 'checkout' && !this.hasCart()) {
      view = 'cart';
    }
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  goToCatalog(): void {
    this.detail.set(null);
    this.navigate('catalog');
  }

  goToWallet(): void {
    this.navigate('wallet');
  }

  goToAccount(): void {
    this.navigate('account');
  }

  private applyRoute(view: EventosView, param: string): void {
    this.errorMessage.set('');
    switch (view) {
      case 'event':
        if (param && param !== this.detail()?.event.slug && param !== this.detail()?.event.id) {
          void this.loadEvent(param);
        } else {
          this.view.set('event');
        }
        return;
      case 'wallet':
        this.view.set('wallet');
        this.loadWallet();
        return;
      case 'account':
        this.accountSection.set('tickets');
        this.view.set('account');
        this.loadWallet();
        return;
      case 'confirmed':
        if (!this.orderRef()) {
          this.view.set('catalog');
          return;
        }
        this.view.set('confirmed');
        return;
      case 'checkout':
        this.sembrarAsistentes();
        this.view.set('checkout');
        return;
      default:
        this.view.set(view);
    }
  }

  /**
   * Una fila de asistente por entrada de la LÍNEA del carrito, conservando lo ya escrito. Se
   * sembraba sólo al pasar por la selección, así que al volver del login o al recargar en
   * `#/…/checkout` quedaban cero filas, el paso no era válido y no había campos para llenarlo: la
   * persona quedaba atascada (medido en el plan de la F4). Los datos de los asistentes no se
   * guardan en `localStorage`: son personales, y re-sembrar cuesta una línea.
   */
  private sembrarAsistentes(): void {
    const entradas = this.#store.items().reduce((suma, linea) => suma + Math.max(0, linea.quantity), 0);
    const previas = this.attendees();
    if (entradas <= 0 || previas.length === entradas) {
      return;
    }
    this.attendees.set(
      Array.from({ length: entradas }, (_sin, indice) => previas[indice] ?? { name: '', email: '', document: '' }),
    );
  }

  private routeHash(view: EventosView, param: string): string {
    const base = baseDeRuta(this.scope());
    switch (view) {
      case 'catalog':
        return base;
      case 'event':
        return `${base}/e/${encodeURIComponent(param)}`;
      case 'select':
        return `${base}/asientos`;
      case 'cart':
        return `${base}/carrito`;
      case 'checkout':
        return `${base}/checkout`;
      case 'confirmed':
        return `${base}/confirmacion`;
      case 'wallet':
        return `${base}/mis-tickets`;
      case 'account':
        return `${base}/cuenta`;
      default:
        return base;
    }
  }

  private writeHash(view: EventosView | 'organizer', param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const base = baseDeRuta(this.scope());
    const hash =
      view === 'organizer'
        ? `${base}/organizador${param ? `/${param}` : ''}`
        : this.routeHash(view as EventosView, param);
    if (!mismaRuta(window.location.hash, hash)) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (mismaRuta(hash, this.#suppressedHash)) {
      this.#suppressedHash = '';
      return;
    }
    const segments = segmentosDeRuta(hash, this.scope());
    if (!segments) {
      return;
    }
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.role.set('attendee');
        this.applyRoute('catalog', '');
        return;
      case 'e':
        this.role.set('attendee');
        this.applyRoute('event', tail);
        return;
      case 'asientos':
        this.applyRoute(this.detail() ? 'select' : 'catalog', '');
        return;
      case 'carrito':
        this.applyRoute('cart', '');
        return;
      case 'checkout':
        this.applyRoute(this.hasCart() ? 'checkout' : 'cart', '');
        return;
      case 'confirmacion':
        this.applyRoute('confirmed', '');
        return;
      case 'mis-tickets':
        this.role.set('attendee');
        this.applyRoute('wallet', '');
        return;
      case 'cuenta':
        this.role.set('attendee');
        this.applyRoute('account', '');
        return;
      case 'organizador':
        this.role.set('organizer');
        if ((MANAGER_SECTIONS as readonly string[]).includes(tail)) {
          this.managerView.set(tail as ManagerView);
        }
        if (!this.manage()) {
          void this.loadManage();
        }
        return;
      default:
        this.applyRoute('catalog', '');
    }
  }

  // ─── Catalogue (SH-1 discovery wiring) ───────────────────────────────────────
  onCriteriaChange(criteria: DiscoveryCriteria): void {
    this.criteria.set(criteria);
    void this.runSearch();
  }

  openCategory(category: string): void {
    this.criteria.set({ ...CLEAN_CRITERIA, facets: { category: [category] } });
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    const active = this.criteria();
    const criteria: CatalogCriteria = {
      q: active.term,
      category: (active.facets['category'] ?? [])[0] ?? '',
      city: (active.facets['city'] ?? [])[0] ?? '',
      sort: (active.sort as EventosSortKey) || 'relevance',
    };
    this.loading.set(true);
    this.errorMessage.set('');
    const requestId = `events:${JSON.stringify(criteria)}`;
    try {
      const result = await this.#orchestrator.callApi(requestId, () =>
        this.#api.events(this.apiBase(), criteria, this.currency()),
      );
      this.events.set(result.events);
      this.searched.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar los eventos. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  eventFromAmountLabel(event: EventSummary): string {
    return event.fromAmount <= 0
      ? 'Gratis'
      : `Desde ${this.formatPrice(event.fromAmount, event.currency || this.currency())}`;
  }

  // ─── Event PDP (SH-2 wiring) ─────────────────────────────────────────────────
  openEvent(event: EventSummary): void {
    this.navigate('event', event.slug || event.id);
  }

  /** Último id/slug de evento solicitado, para reintentar desde el error-state. */
  #pendingEventId = '';

  /** Reintenta abrir el evento tras un error (lo invoca el (retry) de syn-error-state). */
  retryEvent(): void {
    if (this.#pendingEventId) {
      void this.loadEvent(this.#pendingEventId);
    }
  }

  private async loadEvent(id: string): Promise<void> {
    this.#pendingEventId = id;
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`event:${id}`, () =>
        this.#api.event(this.apiBase(), id, this.currency()),
      );
      this.detail.set(detail);
      const featured = detail.tiers.find((tier) => tier.featured) ?? detail.tiers[0] ?? null;
      this.selectedTierId.set(featured?.id ?? '');
      this.quantity.set(1);
      this.selectedSeats.set([]);
      this.view.set('event');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el evento. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Selection ─────────────────────────────────────────────────────────────────
  selectTier(tier: TicketTier): void {
    this.selectedTierId.set(tier.id);
    this.quantity.set(1);
    this.selectedSeats.set([]);
  }

  /**
   * Si la localidad se puede comprar (#195). Lo decide `onSale`, que el servidor calcula con la
   * misma regla que su checkout; las fechas sólo separan «aún no» de «cerrada». Sin `onSale`
   * (un CMS de antes) se vende, como hasta hoy.
   */
  tierSaleState(tier: TicketTier): TierSaleState {
    if (tier.onSale !== false) {
      return 'a-la-venta';
    }
    const abre = tier.saleOpensAt ? Date.parse(tier.saleOpensAt) : Number.NaN;
    return Number.isFinite(abre) && this.#reloj() < abre ? 'aun-no' : 'cerrada';
  }

  /**
   * El rótulo del estado de una localidad que no está a la venta; vacío si lo está. Sale del
   * diccionario, sección `Events.Sale` que declara `EventosProps` (ADR 0136).
   */
  tierSaleLabel(tier: TicketTier): string {
    switch (this.tierSaleState(tier)) {
      case 'aun-no':
        return t('Events.Sale.NotYet', 'Aún no está a la venta');
      case 'cerrada':
        return t('Events.Sale.Closed', 'Venta cerrada');
      default:
        return '';
    }
  }

  tierPriceLabel(tier: TicketTier): string {
    return tier.amount <= 0 ? 'Gratis' : this.formatPrice(tier.amount, tier.currency || this.currency());
  }

  startSelection(): void {
    const tier = this.selectedTier();
    if (!tier || this.tierSaleState(tier) !== 'a-la-venta') {
      return;
    }
    this.navigate('select');
  }

  incrementQty(): void {
    const max = this.selectedTier()?.maxPerOrder ?? 1;
    this.quantity.set(Math.min(max, this.quantity() + 1));
  }

  decrementQty(): void {
    this.quantity.set(Math.max(1, this.quantity() - 1));
  }

  /** Handler for the `<synergos-seat-map>` `seatselect` CustomEvent. */
  onSeatSelect(event: Event): void {
    const detail = (event as CustomEvent<{ selected?: readonly string[] }>).detail;
    const selected = Array.isArray(detail?.selected) ? detail.selected : [];
    this.selectedSeats.set([...selected]);
  }

  backToEvent(): void {
    this.navigate('event', this.detail()?.event.slug || this.detail()?.event.id || '');
  }

  /** Selección confirmed → seed attendee rows + cart line, go to cart. */
  proceedToCart(): void {
    if (!this.canProceedSelection()) {
      return;
    }
    const count = this.ticketCount();
    const previous = this.attendees();
    const rows: Attendee[] = Array.from({ length: count }, (_unused, index) =>
      previous[index] ?? { name: '', email: '', document: '' },
    );
    this.attendees.set(rows);
    void this.selectIntoCart();
    this.navigate('cart');
  }

  private async selectIntoCart(): Promise<void> {
    const detail = this.detail();
    const tier = this.selectedTier();
    if (!detail || !tier) {
      return;
    }
    const session = this.#store.getValidSession();
    const payload: TierSelectionPayload = {
      eventId: detail.event.id,
      eventTitle: detail.event.title,
      tierId: tier.id,
      tierName: tier.name,
      amount: tier.amount,
      currency: tier.currency || this.currency(),
      quantity: this.quantity(),
      seats: this.isReserved() ? this.selectedSeats() : [],
      cover: detail.event.cover,
      // La base viaja en la línea para que `confirm` no tenga que adivinarla (#116).
      apiBase: this.apiBase(),
    };
    const selection = await this.#fulfillment.select(
      {
        productRef: detail.event.id,
        kind: 'ticket',
        label: detail.event.title,
        amount: payload.amount,
        selection: payload as unknown as Readonly<Record<string, unknown>>,
      },
      session,
    );
    // Single-event cart: one tier line per order (replace prior selection).
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.reprice();
  }

  // ─── Carrito: SH-12 `syn-cart-shell` (#22) ──────────────────────────────────
  // El carrito de Eventos es de un solo evento: la selección se REEMPLAZA desde
  // la página del evento, no se edita línea a línea. Por eso sus líneas no
  // llevan paso de cantidad ni botón de quitar — quitar la única línea dejaría
  // a la persona en el vacío sin haber decidido volver.
  readonly cartLines = computed<readonly CartLine[]>(() =>
    this.cartItems().map((item) => ({
      id: item.id,
      label: item.label,
      detail: `${item.quantity} ${item.quantity === 1 ? 'entrada' : 'entradas'}`,
      total: this.formatMinor(item.amount * item.quantity),
      removable: false,
    })),
  );

  /**
   * Los cargos por servicio son una fila propia y no un número sumado al total:
   * quien compra una entrada tiene derecho a ver cuánto de lo que paga NO es la
   * entrada. La pieza sólo las pinta — los importes los calcula este dominio.
   */
  readonly cartSummary = computed<readonly CartSummaryRow[]>(() => {
    const filas: CartSummaryRow[] = [{ id: 'subtotal', label: 'Subtotal', value: this.cartSubtotalLabel() }];
    // Sin comisión configurada no hay fila: la misma regla con la que `reprice()` arma el cobro.
    if (this.feePercent() > 0) {
      filas.push({
        id: 'fees',
        label: `Cargos por servicio (${this.feePercent().toLocaleString('es-CO')} %)`,
        value: this.feesLabel(),
      });
    }
    filas.push({ id: 'total', label: 'Total', value: this.cartTotalLabel(), emphasis: true });
    return filas;
  });

  /**
   * El aforo apartado vence solo. Esta vista se declaraba desde el primer día
   * como «carrito + fees + hold countdown» y el countdown no existía: alguien
   * apartaba butacas, se iba a buscar la tarjeta y volvía a un cupo muerto sin
   * que la pantalla se lo hubiera dicho nunca (#22).
   */
  readonly cartHoldExpiresAt = computed<string | null>(() => {
    const vencimientos = this.cartItems()
      .map((item) => item.expiresAt)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .sort();
    return vencimientos[0] ?? null;
  });

  readonly cartConfig = computed<CartShellConfig>(() => ({
    heading: 'Tu carrito',
    emptyMessage: 'Tu carrito está vacío.',
    holdLabel: 'Tus entradas están apartadas',
    holdExpiredLabel: 'El aforo apartado venció. Vuelve a elegir tus entradas.',
  }));

  readonly cartActions = computed<readonly CartAction[]>(() => [
    { id: 'catalog', label: 'Explorar eventos', visibility: 'empty' },
    { id: 'back', label: 'Volver', visibility: 'filled' },
    { id: 'checkout', label: 'Continuar al pago', kind: 'primary', visibility: 'filled' },
  ]);

  onCartAction(id: string): void {
    switch (id) {
      case 'catalog':
        this.goToCatalog();
        break;
      case 'back':
        this.backToEvent();
        break;
      case 'checkout':
        this.goToCheckout();
        break;
      default:
        break;
    }
  }

  /** Venció el apartado: se repregunta el precio, que es lo que destapa el cupo. */
  onCartHoldExpired(): void {
    this.reprice();
  }

  goToCheckout(): void {
    if (!this.hasCart()) {
      return;
    }
    this.navigate('checkout');
  }

  // ─── Attendee data (SH-3 step content) ───────────────────────────────────────
  setAttendeeField(index: number, field: keyof Attendee, value: string): void {
    this.attendees.update((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  attendeeFieldHandler(index: number, field: keyof Attendee): (event: Event) => void {
    return (event: Event) =>
      this.setAttendeeField(index, field, (event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Checkout (SH-3 wizard callbacks) ────────────────────────────────────────
  onCheckoutCompleted(result: CheckoutWizardResult): void {
    this.orderRef.set(result.reference);
    const issued: ETicket[] = result.vouchers.map((voucher) => ({
      id: voucher.itemId,
      qr: voucher.reference,
      attendee: typeof voucher.detail?.['attendee'] === 'string' ? voucher.detail['attendee'] : undefined,
      tier: typeof voucher.detail?.['tier'] === 'string' ? voucher.detail['tier'] : undefined,
      seat: typeof voucher.detail?.['seat'] === 'string' ? voucher.detail['seat'] : undefined,
    }));
    this.tickets.set(issued);
    this.walletLoaded.set(false);
    this.navigate('confirmed');

    const detail = this.detail();
    const payload = {
      eventId: detail?.event.id ?? '',
      orderRef: result.reference,
      tickets: issued.length,
    };
    this.purchased.emit(payload);
    this.#bus.publish('purchased', payload);
  }

  /** Print the e-tickets (browser print → PDF). */
  printTickets(): void {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  startOver(): void {
    this.#store.reset();
    this.detail.set(null);
    this.selectedTierId.set('');
    this.quantity.set(1);
    this.selectedSeats.set([]);
    this.attendees.set([]);
    this.buyerName.set('');
    this.buyerEmail.set('');
    this.orderRef.set('');
    this.tickets.set([]);
    this.errorMessage.set('');
    this.navigate('catalog');
  }

  // ─── Wallet ("mis tickets" — SH-10 + SH-4) ───────────────────────────────────
  private loadWallet(): void {
    if (this.walletLoaded()) {
      return;
    }
    const holder = this.buyerEmail().trim() || this.attendees()[0]?.email.trim() || '';
    void this.#api.tickets(this.apiBase(), holder).then((result) => {
      this.wallet.set(result.tickets);
      this.walletLoaded.set(true);
    });
  }

  reloadWallet(): void {
    this.walletLoaded.set(false);
    this.loadWallet();
  }

  onTicketSelect(ticket: WalletTicket): void {
    if (this.trackingByRef()[ticket.id]) {
      return;
    }
    const stages: TrackingStage[] = [
      { id: 'purchased', label: 'Compra confirmada', state: 'done' },
      { id: 'issued', label: 'E-ticket emitido', state: 'done' },
      {
        id: 'checkin',
        label: 'Check-in en el evento',
        state: ticket.status === 'used' ? 'done' : 'pending',
      },
    ];
    this.trackingByRef.update((map) => ({ ...map, [ticket.id]: stages }));
  }

  trackingStages(ticketId: string): readonly TrackingStage[] {
    return this.trackingByRef()[ticketId] ?? [];
  }

  openTransfer(ticketId: string): void {
    this.transferTicketId.set(ticketId);
    this.transferTo.set('');
    this.errorMessage.set('');
  }

  cancelTransfer(): void {
    this.transferTicketId.set('');
    this.transferTo.set('');
  }

  confirmTransfer(): void {
    const ticketId = this.transferTicketId();
    const to = this.transferTo().trim();
    if (!ticketId || !/.+@.+\..+/.test(to)) {
      return;
    }
    this.errorMessage.set('');
    void this.#api
      .transfer(this.apiBase(), ticketId, to)
      .then(() => {
        this.wallet.update((list) =>
          list.map((ticket) =>
            ticket.id === ticketId ? { ...ticket, status: 'transferred' } : ticket,
          ),
        );
        this.transferTicketId.set('');
        this.transferTo.set('');
      })
      .catch((error: unknown) => {
        // La entrada NO se movió (UI#92): sigue «Válida» en la billetera, el formulario se
        // queda abierto con el correo escrito y se dice una vez. Antes el cliente la daba
        // por transferida en local y la promesa ni siquiera tenía `catch`.
        void error;
        this.errorMessage.set('No pudimos transferir la entrada: sigue a tu nombre. Intenta de nuevo.');
      });
  }

  walletStatusLabel(status: WalletTicket['status']): string {
    switch (status) {
      case 'valid':
        return 'Válido';
      case 'transferred':
        return 'Transferido';
      case 'used':
        return 'Usado';
      case 'past':
        return 'Pasado';
    }
  }

  // ─── ORGANIZADOR console (SH-5) ──────────────────────────────────────────────
  onManagerSectionChange(sectionId: string): void {
    if ((MANAGER_SECTIONS as readonly string[]).includes(sectionId)) {
      this.managerView.set(sectionId as ManagerView);
      this.writeHash('organizer', sectionId);
    }
  }

  /**
   * Single row-action dispatcher for the SH-5 console. The console shell is
   * generic over `TRow`; because the module swaps `rows`/`columns` per section,
   * a section discriminator on the event keeps the handler type-safe.
   */
  onConsoleAction(event: ConsoleRowActionEvent<PortfolioEvent | ManagedAttendee>): void {
    if (event.sectionId === 'portfolio' && event.actionId === 'open') {
      const row = event.row as PortfolioEvent;
      this.manageEventId.set(row.id);
      this.walletLoaded.set(false);
      void this.loadManage();
      this.managerView.set('dashboard');
      this.writeHash('organizer', 'dashboard');
      return;
    }
    if (event.sectionId === 'attendees' && event.actionId === 'checkin') {
      void this.runCheckin((event.row as ManagedAttendee).ticketId);
    }
  }

  openCreateEvent(): void {
    this.managerView.set('create');
    this.createResultSlug.set('');
    this.writeHash('organizer', 'create');
  }

  private async loadManage(): Promise<void> {
    if (this.loading()) {
      return;
    }
    const eventId = this.manageEventId() || this.deepLinkEventId() || 'EVT-1';
    this.manageEventId.set(eventId);
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#orchestrator.callApi(`manage:${eventId}`, () =>
        this.#api.manage(this.apiBase(), eventId),
      );
      this.manage.set(result);
      this.organizerAccess.set('ok');
      this.checkedInCount.set(
        result.attendees.filter((a) => a.state === 'checked-in').length,
      );
      // T7 Ola B: con el panel ya cargado y autorizado, escuchar el canal del evento.
      this.subscribeToCheckins(eventId);
    } catch (error) {
      if (this.handleOrganizerDenied(error)) {
        return;
      }
      this.errorMessage.set('No pudimos cargar el panel del evento. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Traduce un 401/403 de la consola a `organizerAccess` y VACÍA el panel, para no dejar
   * a la vista datos de asistentes que ya no debe ver. Devuelve `true` si era ese error.
   */
  // ─── T7 Ola B — la consola escucha el canal del evento ──────────────────────
  //
  // El backend ya publicaba cada check-in (ADR 0111) y no había nadie escuchando. Con
  // varias puertas, cada operador ve entrar a la gente sin recargar.

  /** Suscripción viva al canal. Null = no hay ninguna abierta. */
  #checkinStream: RealtimeSubscription | null = null;
  /** Evento cuyo canal se está escuchando, para no reabrir el mismo. */
  #streamedEventId = '';
  /** La conexión se cayó y `EventSource` está reintentando sola. */
  readonly liveDisconnected = signal(false);
  /** Hay canal abierto: la consola puede decir "en vivo" con verdad. */
  readonly liveConnected = signal(false);

  private subscribeToCheckins(eventId: string): void {
    if (!eventId || this.#streamedEventId === eventId) {
      // Ya se está escuchando ESE evento: reabrir sería una conexión de más.
      return;
    }
    this.closeCheckinStream();
    this.#streamedEventId = eventId;
    this.#checkinStream = subscribeToChannel(
      `${this.apiBase().replace(/\/api\/eventos$/, '/api')}/realtime/stream`,
      `eventos:checkin:${eventId}`,
      {
        onOpen: () => {
          this.liveConnected.set(true);
          this.liveDisconnected.set(false);
        },
        onError: () => {
          // No se reconecta a mano: EventSource reintenta solo. Esto solo lo refleja.
          this.liveConnected.set(false);
          this.liveDisconnected.set(true);
        },
        onEvent: (_name, payload) => this.applyLiveCheckin(payload),
      },
    );
  }

  /**
   * Aplica un check-in que ocurrió EN OTRA PUERTA. Es idempotente: si esa fila ya
   * estaba marcada (porque la marcó este mismo operador), no vuelve a sumar — el
   * contador saldría inflado al recibir el eco de la propia acción.
   */
  private applyLiveCheckin(payload: Record<string, unknown>): void {
    const ticketId = typeof payload['ticketId'] === 'string' ? payload['ticketId'] : '';
    if (!ticketId || payload['status'] !== 'valid') {
      // `already-used` no cambia nada: la fila ya estaba marcada.
      return;
    }

    let changed = false;
    this.manage.update((data) => {
      if (!data) {
        return data;
      }
      const attendees = data.attendees.map((a) => {
        if (a.ticketId !== ticketId || a.state === 'checked-in') {
          return a;
        }
        changed = true;
        return { ...a, state: 'checked-in' as const };
      });
      return changed ? { ...data, attendees } : data;
    });

    if (changed) {
      this.checkedInCount.update((count) => count + 1);
    }
  }

  private closeCheckinStream(): void {
    this.#checkinStream?.close();
    this.#checkinStream = null;
    this.#streamedEventId = '';
    this.liveConnected.set(false);
    this.liveDisconnected.set(false);
  }

  private handleOrganizerDenied(error: unknown): boolean {
    const anon = isEventosUnauthorized(error);
    if (!anon && !isEventosForbidden(error)) {
      return false;
    }
    // Sin permiso no se escucha el canal: el servidor lo negaría igual, pero dejar el
    // EventSource reintentando contra un 403 es un bucle de peticiones inútil.
    this.closeCheckinStream();
    this.organizerAccess.set(anon ? 'anon' : 'forbidden');
    this.errorMessage.set('');
    this.manage.set(null);
    this.checkedInCount.set(0);
    // No hace falta anunciar por aria-live: el panel REEMPLAZA la consola con un
    // encabezado propio, así que el lector de pantalla lo encuentra al navegar. (En gov
    // sí hizo falta porque allí el fallo del upload no cambiaba nada en pantalla.)
    return true;
  }

  /**
   * Login del CMS de vuelta a ESTA página. Método y no `computed`: el hash cambia con la
   * navegación y un computed cacheado devolvería el de la primera lectura.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return '/account/login';
    }
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `/account/login?returnUrl=${encodeURIComponent(here)}`;
  }

  reloadManage(): void {
    void this.loadManage();
  }

  setAttendeeFilter(event: Event): void {
    this.attendeeFilter.set(this.eventValue(event));
  }

  // ─── Check-in ────────────────────────────────────────────────────────────────
  onCheckinInput(event: Event): void {
    this.checkinCode.set(this.eventValue(event));
  }

  submitCheckin(): void {
    const code = this.checkinCode().trim();
    if (!code) {
      return;
    }
    void this.runCheckin(code);
  }

  private async runCheckin(code: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#api.checkin(this.apiBase(), code);
      this.lastScan.set(result);
      const attendeeName =
        result.attendee ??
        this.manage()?.attendees.find((a) => a.ticketId === result.ticketId)?.name ??
        '';
      this.scanLog.update((log) =>
        [
          { code, outcome: result.status, attendee: attendeeName, at: new Date().toISOString() },
          ...log,
        ].slice(0, 12),
      );

      if (result.status === 'valid' && result.ticketId) {
        this.manage.update((data) =>
          data
            ? {
                ...data,
                attendees: data.attendees.map((a) =>
                  a.ticketId === result.ticketId ? { ...a, state: 'checked-in' } : a,
                ),
              }
            : data,
        );
        this.checkedInCount.update((count) => count + 1);
        const payload = { eventId: this.manageEventId(), ticketId: result.ticketId };
        this.checkedin.emit(payload);
        this.#bus.publish('checkedin', payload);
      }
      this.checkinCode.set('');
    } catch (error) {
      // Un 401/403 aquí NO significa "entrada inválida": significa que QUIEN ESCANEA no
      // tiene permiso. Marcarlo como inválido culparía a la entrada del asistente.
      if (this.handleOrganizerDenied(error)) {
        return;
      }
      // Y un borde que no contesta TAMPOCO (UI#92): no hay veredicto, ni «Válido» —el
      // cliente lo inventaba contra sus propias entradas— ni «Inválido», que culparía a la
      // entrada. El código se queda en el campo para volver a escanear.
      void error;
      this.lastScan.set(null);
      this.errorMessage.set('No pudimos validar la entrada: el servidor no respondió. Vuelve a escanearla.');
    } finally {
      this.loading.set(false);
    }
  }

  checkinOutcomeLabel(outcome: CheckInOutcome): string {
    switch (outcome) {
      case 'valid':
        return 'Válido';
      case 'already-used':
        return 'Ya usado';
      default:
        return 'Inválido';
    }
  }

  // ─── Create event (SH-6 authoring wizard) ────────────────────────────────────
  onCreateDraftChange(draft: Readonly<Record<string, unknown>>): void {
    this.createDraft.set(draft);
  }

  onCreateExit(): void {
    this.managerView.set('portfolio');
    this.writeHash('organizer', 'portfolio');
  }

  onCreatePublished(draft: Readonly<Record<string, unknown>>): void {
    const tier: CreateTierDraft = {
      name: this.draftString(draft, 'tierName') || 'General',
      amount: Number(this.draftString(draft, 'tierAmount')) || 0,
      capacity: Number(this.draftString(draft, 'capacity')) || 100,
    };
    const request: CreateEventRequest = {
      title: this.draftString(draft, 'title'),
      category: this.draftString(draft, 'category') || 'Conferencia',
      city: this.draftString(draft, 'city'),
      venueName: this.draftString(draft, 'venueName'),
      startsAt: this.draftString(draft, 'startsAt'),
      mode: (this.draftString(draft, 'mode') as EventMode) === 'reserved' ? 'reserved' : 'general',
      capacity: tier.capacity,
      tiers: [tier],
    };
    this.createPublishing.set(true);
    this.errorMessage.set('');
    void this.#api
      .createEvent(this.apiBase(), request)
      .then((result) => {
        this.createResultSlug.set(result.slug);
        this.createPublishing.set(false);
        // Reflect the new event in the cartera + refresh the catalogue.
        this.walletLoaded.set(false);
        void this.runSearch();
      })
      .catch((error: unknown) => {
        this.createPublishing.set(false);
        if (this.handleOrganizerDenied(error)) {
          return;
        }
        // El evento NO se creó (UI#92): el borrador sigue en el asistente y se dice.
        this.errorMessage.set('No pudimos publicar el evento. Intenta de nuevo.');
      });
  }

  private draftString(draft: Readonly<Record<string, unknown>>, key: string): string {
    const value = draft[key];
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  }

  draftPatchHandler(
    patch: (values: Readonly<Record<string, unknown>>) => void,
    field: string,
  ): (event: Event) => void {
    return (event: Event) => patch({ [field]: (event.target as HTMLInputElement | null)?.value ?? '' });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────────
  private facetValues(pick: (event: EventSummary) => string) {
    const counts = new Map<string, number>();
    for (const event of this.events()) {
      const value = pick(event);
      if (value) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es-CO'))
      .map(([value, count]) => ({ value, label: value, count }));
  }

  private reprice(): void {
    const items = this.#store.items();
    const subtotal = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const fees = comisionEnMenores(subtotal, this.feePercent());
    const total = subtotal + fees;
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: [
        ...items.map((item) => ({
          code: `line:${item.id}`,
          label: item.label,
          amount: item.amount * item.quantity,
        })),
        ...(fees > 0 ? [{ code: 'fees', label: 'Cargos por servicio', amount: fees }] : []),
      ],
    });
  }

  /**
   * Un importe con su moneda. Sin centavos cuando no los tiene, y con ellos cuando sí: una
   * comisión de 22.500,12 se cobra así, y pintarla redondeada sería mostrar otra cifra. Sin
   * moneda (todavía no llegó ningún importe del catálogo) se pinta el número solo.
   */
  formatPrice(amount: number, currency: string): string {
    return formatearImporte(amount, currency, { decimales: 2 });
  }

  /** Un importe en unidades menores de la moneda del evento (los del carrito y la comisión). */
  formatMinor(minor: number): string {
    return this.formatPrice(desdeMenores(minor, this.currency()), this.currency());
  }

  formatDate(iso: string): string {
    if (!iso) {
      return '';
    }
    try {
      return new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short' }).format(
        new Date(iso),
      );
    } catch {
      return iso;
    }
  }

  formatDateShort(iso: string): string {
    if (!iso) {
      return '';
    }
    try {
      return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(iso),
      );
    } catch {
      return iso;
    }
  }

  formatCount(value: number): string {
    try {
      return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
    } catch {
      return String(value);
    }
  }
}
