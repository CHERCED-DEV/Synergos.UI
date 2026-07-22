import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { EventosApiClient, isEventosForbidden, isEventosUnauthorized } from './eventos-api.client';
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
} from './eventos.model';

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
 * 100% composable: no business is hardcoded; every knob comes from CMS props
 * (`apiBase`/`currency`/`config` JSON) and the data always comes from the API
 * with visible mock degradation. The shells stay domain-free (contrato D3) — the
 * module only feeds data, templates and its `EventosFulfillmentStrategy`.
 */
export interface EventosRuntimeConfig {
  /** Base URL of the eventos API. Default `/api/eventos`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `eventos`. */
  readonly scope?: string;
  /** Initial cara. Default `attendee`. */
  readonly role?: EventosRole;
  /** Optional event id/slug to deep-link the organizer dashboard to. */
  readonly eventId?: string;
  /** Service-fee percentage applied on the ticket subtotal. Default 12. */
  readonly feePercent?: number;
  /** Catalog hero heading. Default `Vive los mejores eventos, sin complicarte`. */
  readonly heading?: string;
  /** Catalog hero subheading rendered under the title. */
  readonly subheading?: string;
}

/** Typed event map for the transaction bus (eventos ↔ checkout ↔ check-in ↔ IA). */
interface EventosBus extends Record<string, unknown> {
  readonly purchased: { readonly eventId: string; readonly orderRef: string; readonly tickets: number };
  readonly checkedin: { readonly eventId: string; readonly ticketId: string };
}

const DEFAULT_API_BASE = '/api/eventos';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'eventos';
const DEFAULT_ROLE: EventosRole = 'attendee';
const DEFAULT_FEE_PERCENT = 12;
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

function sanitizeConfig(value: Partial<EventosRuntimeConfig>): EventosRuntimeConfig {
  return omitUndefinedProperties<EventosRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
    role: normalizeRole(value.role),
    eventId: coerceTrimmedStringInput(value.eventId),
    feePercent: normalizeFee(value.feePercent),
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
  });
}

function normalizeRole(value: unknown): EventosRole | undefined {
  return value === 'organizer' || value === 'attendee' ? value : undefined;
}

function normalizeFee(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) && num >= 0 && num <= 100 ? num : undefined;
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
export class EventosElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<EventosBus>>(TransactionEventBusService);
  readonly #api = inject(EventosApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<EventosRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<EventosRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly eventIdInput = input<string | undefined>(undefined, { alias: 'eventId' });
  readonly feePercentInput = input<string | number | undefined>(undefined, { alias: 'feePercent' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.currencyInput()),
      this.config()?.currency,
      DEFAULT_CURRENCY,
    ),
  );
  readonly scope = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.scopeInput()),
      this.config()?.scope,
      DEFAULT_SCOPE,
    ),
  );
  readonly initialRole = computed<EventosRole>(() =>
    resolveConfigValue(normalizeRole(this.roleInput()), this.config()?.role, DEFAULT_ROLE),
  );
  readonly deepLinkEventId = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.eventIdInput()), this.config()?.eventId, ''),
  );
  readonly feePercent = computed(() =>
    resolveConfigValue(normalizeFee(this.feePercentInput()), this.config()?.feePercent, DEFAULT_FEE_PERCENT),
  );
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
  readonly paymentMethod = signal<'card' | 'pse'>('card');

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
   * Acceso a la CONSOLA DEL ORGANIZADOR (panel, crear evento, check-in), que ahora exige
   * rol. `'anon'` (401) → ofrecer login; `'forbidden'` (403) → el login NO ayuda, hace
   * falta que un admin dé el permiso. Distinto de `degraded`: aquí no hay nada que
   * degradar, y pintar datos de ejemplo mostraría asistentes a quien no debe verlos.
   */
  readonly organizerAccess = signal<'ok' | 'anon' | 'forbidden'>('ok');
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
    if (categories.length > 0) {
      facets.push({ key: 'category', label: 'Categoría', values: categories });
    }
    if (cities.length > 0) {
      facets.push({ key: 'city', label: 'Ciudad', values: cities });
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

  readonly selectedTier = computed<TicketTier | null>(() => {
    const tiers = this.tiers();
    const id = this.selectedTierId();
    return (
      tiers.find((tier) => tier.id === id) ??
      tiers.find((tier) => tier.featured) ??
      tiers[0] ??
      null
    );
  });

  readonly isReserved = computed(() => this.detail()?.event.mode === 'reserved');
  readonly isFreeEvent = computed(() => (this.detail()?.event.fromAmount ?? 0) <= 0);

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
  readonly feesMinor = computed(() => Math.round((this.cartSubtotalMinor() * this.feePercent()) / 100));
  readonly cartTotalMinor = computed(() => this.cartSubtotalMinor() + this.feesMinor());
  readonly cartSubtotalLabel = computed(() =>
    this.formatPrice(this.cartSubtotalMinor() / 100, this.currency()),
  );
  readonly feesLabel = computed(() => this.formatPrice(this.feesMinor() / 100, this.currency()));
  readonly cartTotalLabel = computed(() => this.formatPrice(this.cartTotalMinor() / 100, this.currency()));

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

  /** Pasos apagables por config: asistentes → [pago] → revisar. Pago OFF si gratis. */
  readonly checkoutConfig = computed<CheckoutWizardConfig>(() => {
    const steps = [
      { id: 'asistentes', label: 'Asistentes' },
      ...(this.isFreeEvent() ? [] : [{ id: 'pago', label: 'Pago' }]),
      { id: 'revisar', label: 'Confirmar' },
    ];
    return {
      steps,
      summaryHeading: 'Tu orden',
      submitLabel: this.isFreeEvent() ? 'Confirmar registro' : 'Pagar y confirmar',
      processingLabel: 'Procesando…',
      nextLabel: 'Continuar',
      backLabel: 'Atrás',
    };
  });

  readonly checkoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    asistentes: this.attendeesValid() && this.buyerValid(),
    pago: true,
    revisar: true,
  }));

  readonly checkoutInstrument = computed<Readonly<Record<string, unknown>>>(() => {
    const detail = this.detail();
    return {
      apiBase: this.apiBase(),
      eventId: detail?.event.id ?? '',
      eventTitle: detail?.event.title ?? '',
      venueName: detail?.venue.name ?? detail?.event.venueName ?? '',
      startsAt: detail?.event.startsAt ?? '',
      attendees: this.attendees().map((a) => ({
        name: a.name.trim(),
        email: a.email.trim(),
        document: a.document.trim(),
      })),
      buyer: { name: this.buyerName().trim(), email: this.buyerEmail().trim() } as Buyer,
      provider: this.isFreeEvent()
        ? 'eventos-free'
        : this.paymentMethod() === 'pse'
          ? 'eventos-pse'
          : 'eventos-card',
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
    this.role.set(this.initialRole());

    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `eventos.${this.instanceId}`,
      flow: EVENTOS_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
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

    // Open the right cara, then honour a deep link.
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
      default:
        this.view.set(view);
    }
  }

  private routeHash(view: EventosView, param: string): string {
    const base = `#/${this.scope()}`;
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
    const base = `#/${this.scope()}`;
    const hash =
      view === 'organizer'
        ? `${base}/organizador${param ? `/${param}` : ''}`
        : this.routeHash(view as EventosView, param);
    if (window.location.hash !== hash) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  private applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (hash === this.#suppressedHash) {
      this.#suppressedHash = '';
      return;
    }
    const base = `#/${this.scope()}`;
    if (hash !== base && !hash.startsWith(`${base}/`)) {
      return;
    }
    const segments = hash.slice(base.length).split('/').filter((s) => s !== '');
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.role.set('attendee');
        this.applyRoute('catalog', '');
        return;
      case 'e':
        this.role.set('attendee');
        this.applyRoute('event', decodeURIComponent(tail));
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

  tierPriceLabel(tier: TicketTier): string {
    return tier.amount <= 0 ? 'Gratis' : this.formatPrice(tier.amount, tier.currency || this.currency());
  }

  startSelection(): void {
    if (!this.selectedTier()) {
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

  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
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

  onCheckoutFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos completar la compra. Intenta de nuevo.');
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
    void this.#api.transfer(this.apiBase(), ticketId, to).then(() => {
      this.wallet.update((list) =>
        list.map((ticket) =>
          ticket.id === ticketId ? { ...ticket, status: 'transferred' } : ticket,
        ),
      );
      this.transferTicketId.set('');
      this.transferTo.set('');
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
      this.lastScan.set({ status: 'invalid' });
      void error;
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
        this.handleOrganizerDenied(error);
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
    const fees = Math.round((subtotal * this.feePercent()) / 100);
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

  formatPrice(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
    }
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
