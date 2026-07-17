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
  DetailShellComponent,
  DiscoveryShellComponent,
  ResultsMapComponent,
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
  type DetailMedia,
  type DetailSpec,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type DiscoverySortOption,
  type GeoPoint as MapGeoPoint,
  type ResultsMapConfig,
  type TrackingStage,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { RealtyApiClient } from './realty-api.client';
import { calculateMortgage } from './mortgage.calc';
import {
  REALTY_FLOW,
  type AgendaVisit,
  type AgentDeskResult,
  type AgentLead,
  type Amenity,
  type ContactInfo,
  type Facet,
  type Listing,
  type ListingDetail,
  type MortgageResult,
  type Operation,
  type PortfolioListing,
  type PropertyType,
  type PublishListingRequest,
  type RealtyRole,
  type ResultsLayout,
  type SavedSearch,
  type SearchCriteria,
  type SortKey,
  type Visit,
  type VisitMode,
  type VisitSelectionPayload,
  type VisitSlot,
  type VisitStep,
  type AgentView,
  type RealtyView,
} from './realty.model';

/**
 * Runtime config for the CMS element <c>elementSynRealty</c>.
 *
 * Propiedades **v2** — the real estate marketplace portal (Zillow + Idealista +
 * Metrocuadrado, doc 21 §2.7) rebuilt as a **role-switch, hash-routed multi-page
 * SPA** and the Ola-4 consumer of the reusable shell catalogue `@synergos/shells`:
 *
 *  - **DEMANDA (público):** SH-1 `syn-discovery-shell` + **SH-8 `syn-results-map`
 *    lista↔mapa** (facetas es-CO: operación · tipo · precio · habitaciones · ciudad
 *    · estrato; geo del API) → SH-2 `syn-detail-shell` (galería/lightbox · specs ·
 *    mapa · vecindario · **calculadora de hipoteca** en el slot del CTA) → agendar
 *    visita (SH-3 `syn-checkout-wizard` sobre el motor, **pago OFF**) + contactar/
 *    lead → SH-4 `syn-account-shell` (favoritos+comparar · búsquedas guardadas+
 *    alertas · mis visitas · mensajes).
 *  - **AGENTE (role-switch):** SH-5 `syn-console-shell` (cartera KPIs, listados,
 *    leads mini-CRM, agenda, analítica) + SH-6 `syn-authoring-wizard` (publicar
 *    inmueble: datos→fotos→precio→ubicación/pin→publicar).
 *
 * 100% composable: no business is hardcoded; every knob comes from CMS props
 * (`apiBase`/`currency`/`config` JSON) and the data always comes from the API with
 * visible mock degradation. The shells stay domain-free (contrato D3) — the module
 * only feeds data, templates and its `RealtyFulfillmentStrategy` (pago apagado).
 */
export interface RealtyRuntimeConfig {
  /** Base URL of the realty API. Default `/api/realty`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `realty`. */
  readonly scope?: string;
  /** Initial cara. Default `demand`. */
  readonly role?: RealtyRole;
  /** Initial operation: `sale` (venta) or `rent` (arriendo). Default `sale`. */
  readonly operation?: Operation;
  /** Initial results layout: `split` · `list` · `map`. Default `split`. */
  readonly layout?: ResultsLayout;
  /** Default annual mortgage rate (E.A. %) seeded in the calculator. Default `12`. */
  readonly defaultRate?: number;
}

/** Typed event map for the transaction bus (realty ↔ visit ↔ lead ↔ IA). */
interface RealtyBus extends Record<string, unknown> {
  readonly visitscheduled: { readonly visitId: string; readonly listingId: string };
  readonly leadsubmitted: { readonly leadId: string; readonly listingId: string };
}

const DEFAULT_API_BASE = '/api/realty';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'realty';
const DEFAULT_ROLE: RealtyRole = 'demand';
const DEFAULT_OPERATION: Operation = 'sale';
const DEFAULT_LAYOUT: ResultsLayout = 'split';
const DEFAULT_RATE = 12;
const MAX_SCHEDULE_ROWS = 12;
const SESSION_TTL_MS = 30 * 60 * 1000;

const ROLES: readonly { key: RealtyRole; label: string }[] = [
  { key: 'demand', label: 'Buscar' },
  { key: 'agent', label: 'Soy agente' },
];

const OPERATIONS: readonly { key: Operation; label: string }[] = [
  { key: 'sale', label: 'Comprar' },
  { key: 'rent', label: 'Arrendar' },
];

const SORT_OPTIONS: readonly DiscoverySortOption[] = [
  { key: 'relevance', label: 'Destacados' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
  { key: 'area-desc', label: 'Mayor área' },
];

const CLEAN_CRITERIA: DiscoveryCriteria = { term: '', facets: {}, sort: 'relevance', page: 1 };

const VISIT_STEPS: readonly VisitStep[] = ['mode', 'slot', 'contact', 'review'];

/** The agent sections addressable inside the SH-5 console (order = sidebar). */
const AGENT_SECTIONS: readonly AgentView[] = ['portfolio', 'leads', 'agenda', 'analytics'];

const TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  oficina: 'Oficina',
  local: 'Local',
  lote: 'Lote',
};

function sanitizeConfig(value: Partial<RealtyRuntimeConfig>): RealtyRuntimeConfig {
  return omitUndefinedProperties<RealtyRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
    role: coerceRole(value.role),
    operation: coerceOperation(value.operation),
    layout: coerceLayout(value.layout),
    defaultRate: coerceRate(value.defaultRate),
  });
}

function coerceRole(value: unknown): RealtyRole | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'demand' || raw === 'agent' ? raw : undefined;
}

function coerceOperation(value: unknown): Operation | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'sale' || raw === 'rent' ? raw : undefined;
}

function coerceLayout(value: unknown): ResultsLayout | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw === 'split' || raw === 'list' || raw === 'map' ? raw : undefined;
}

function coerceRate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

let realtyInstanceId = 0;

@Component({
  selector: 'sg-realty',
  standalone: true,
  imports: [
    DiscoveryShellComponent,
    ResultsMapComponent,
    DetailShellComponent,
    CheckoutWizardComponent,
    AccountShellComponent,
    TrackingTimelineComponent,
    ConsoleShellComponent,
    AuthoringWizardComponent,
  ],
  templateUrl: './realty.html',
  styleUrl: './realty.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-lightbox-gallery>, <synergos-map-pin>).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-realty' },
})
export class RealtyElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<RealtyBus>>(TransactionEventBusService);
  readonly #api = inject(RealtyApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<RealtyRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<RealtyRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly operationInput = input<string | undefined>(undefined, { alias: 'operation' });
  readonly layoutInput = input<string | undefined>(undefined, { alias: 'layout' });
  readonly defaultRateInput = input<string | number | undefined>(undefined, { alias: 'defaultRate' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.currencyInput()), this.config()?.currency, DEFAULT_CURRENCY),
  );
  readonly scope = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), this.config()?.scope, DEFAULT_SCOPE),
  );
  readonly initialRole = computed<RealtyRole>(() =>
    resolveConfigValue(coerceRole(this.roleInput()), this.config()?.role, DEFAULT_ROLE),
  );
  readonly initialOperation = computed<Operation>(() =>
    resolveConfigValue(coerceOperation(this.operationInput()), this.config()?.operation, DEFAULT_OPERATION),
  );
  readonly initialLayout = computed<ResultsLayout>(() =>
    resolveConfigValue(coerceLayout(this.layoutInput()), this.config()?.layout, DEFAULT_LAYOUT),
  );
  readonly initialRate = computed(() =>
    resolveConfigValue(coerceRate(this.defaultRateInput()), this.config()?.defaultRate, DEFAULT_RATE),
  );

  readonly instanceId = (realtyInstanceId += 1);
  readonly fieldId = `syn-realty-${this.instanceId}`;
  readonly roles = ROLES;
  readonly operations = OPERATIONS;
  readonly sortOptions = SORT_OPTIONS;
  readonly visitSteps = VISIT_STEPS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly listingselect = output<string>();
  readonly visitscheduled = output<{ visitId: string; listingId: string }>();
  readonly leadsubmitted = output<{ leadId: string; listingId: string }>();
  readonly favoritechange = output<number>();

  // ─── Role / shell state ──────────────────────────────────────────────────────
  readonly role = signal<RealtyRole>(DEFAULT_ROLE);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  #suppressedHash = '';

  // ─── DEMANDA state ───────────────────────────────────────────────────────────
  readonly view = signal<RealtyView>('search');

  // Search (SH-1 discovery + SH-8 map)
  readonly operation = signal<Operation>(DEFAULT_OPERATION);
  readonly layout = signal<ResultsLayout>(DEFAULT_LAYOUT);
  readonly criteria = signal<DiscoveryCriteria>(CLEAN_CRITERIA);
  readonly listings = signal<readonly Listing[]>([]);
  readonly facets = signal<readonly Facet[]>([]);
  readonly total = signal(0);
  readonly searched = signal(false);

  // PDP (SH-2 detail)
  readonly detail = signal<ListingDetail | null>(null);
  readonly accountSection = signal<'favorites' | 'saved' | 'visits' | 'messages'>('favorites');

  // Favorites / shortlist / compare (P11)
  readonly favoriteIds = signal<readonly string[]>([]);
  readonly compareMode = signal(false);

  // Saved searches + alerts (P11)
  readonly savedSearches = signal<readonly SavedSearch[]>([]);
  readonly savedLoaded = signal(false);

  // Mortgage calculator (live, pure client)
  readonly mortgagePrice = signal(0);
  readonly mortgageDown = signal(0);
  readonly mortgageTermMonths = signal(240);
  readonly mortgageRate = signal(DEFAULT_RATE);
  readonly mortgageServerResult = signal<MortgageResult | null>(null);

  // Visit wizard (SH-3 over engine — pago OFF)
  readonly visitListing = signal<Listing | null>(null);
  readonly visitMode = signal<VisitMode>('in-person');
  readonly visitDate = signal('');
  readonly visitTime = signal('');
  readonly visitName = signal('');
  readonly visitEmail = signal('');
  readonly visitPhone = signal('');

  // Lead (contact agent)
  readonly leadOpen = signal(false);
  readonly leadName = signal('');
  readonly leadEmail = signal('');
  readonly leadPhone = signal('');
  readonly leadMessage = signal('');

  // Confirmation + account
  readonly confirmedVisit = signal<Visit | null>(null);
  readonly confirmedLeadId = signal('');
  readonly myVisits = signal<readonly Visit[]>([]);
  readonly trackingByRef = signal<Readonly<Record<string, readonly TrackingStage[]>>>({});

  // ─── AGENTE state ────────────────────────────────────────────────────────────
  readonly agentView = signal<AgentView>('portfolio');
  readonly desk = signal<AgentDeskResult | null>(null);
  readonly deskLoaded = signal(false);
  readonly leadFilter = signal('');
  readonly publishing = signal(false);
  readonly publishResultId = signal('');
  readonly createDraft = signal<Readonly<Record<string, unknown>>>({});

  // ─── Engine-derived state ────────────────────────────────────────────────────
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    void this.searched();
    void this.view();
    void this.detail();
    void this.desk();
    void this.savedSearches();
    void this.confirmedVisit();
    return this.#api.degraded;
  });

  // ─── Search derived (SH-1 facets + SH-8 geo) ─────────────────────────────────
  readonly discoveryFacets = computed<readonly DiscoveryFacet[]>(() =>
    this.facets().map((facet) => ({
      key: facet.key,
      label: facet.label,
      // El kind VIAJA: es lo que hace que `beds` se pinte como radio (los tramos son pisos
      // "3+ habitaciones", no valores exactos). Sin él, el shell cae a MultiSelect.
      kind: facet.kind,
      values: facet.values.map((value) => ({ value: value.value, label: value.label, count: value.count })),
    })),
  );

  readonly hasActiveFilters = computed(() => {
    const active = this.criteria();
    return active.term.trim() !== '' || Object.values(active.facets).some((v) => v.length > 0);
  });

  /** Geo accessor for SH-8 — maps a listing to a lat/lng point. */
  readonly geoOf = (listing: Listing): MapGeoPoint | null =>
    listing.geo.lat !== 0 || listing.geo.lng !== 0
      ? { lat: listing.geo.lat, lng: listing.geo.lng }
      : null;

  /** Compact pin label for SH-8 (e.g. "$850 M" / "$2,3 M"). */
  readonly pinLabelOf = (listing: Listing): string => this.pinLabel(listing);

  readonly resultsMapConfig = computed<ResultsMapConfig>(() => ({
    layout: this.layout(),
    listLabel: 'Lista',
    splitLabel: 'Dividido',
    mapLabel: 'Mapa',
    mapAriaLabel: 'Mapa de propiedades',
    searchAreaLabel: 'Buscar en esta zona',
    searchAsIMoveLabel: 'Buscar al mover el mapa',
    emptyMessage: 'No encontramos propiedades en esta zona. Ajusta la búsqueda o los filtros.',
    loadingMessage: 'Cargando propiedades…',
  }));

  // ─── PDP derived (SH-2) ──────────────────────────────────────────────────────
  readonly pdpMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.detail();
    if (!detail) {
      return [];
    }
    const urls = detail.gallery.length > 0 ? detail.gallery : detail.listing.cover ? [detail.listing.cover] : [];
    return urls.map((url) => ({ url, alt: detail.listing.title }));
  });

  readonly pdpSpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.detail();
    if (!detail) {
      return [];
    }
    const specs = detail.specs;
    const rows: DetailSpec[] = [
      { label: 'Operación', value: detail.listing.operation === 'rent' ? 'En arriendo' : 'En venta' },
      { label: 'Tipo', value: this.typeLabel(detail.listing.type) },
      { label: 'Habitaciones', value: specs.beds > 0 ? String(specs.beds) : '—' },
      { label: 'Baños', value: specs.baths > 0 ? String(specs.baths) : '—' },
      { label: 'Área construida', value: specs.areaBuilt > 0 ? this.formatArea(specs.areaBuilt) : '—' },
      { label: 'Área privada', value: specs.areaPrivate > 0 ? this.formatArea(specs.areaPrivate) : '—' },
      { label: 'Parqueaderos', value: String(specs.parking) },
      { label: 'Estrato', value: specs.stratum > 0 ? String(specs.stratum) : '—' },
      { label: 'Antigüedad', value: specs.ageYears > 0 ? `${specs.ageYears} años` : 'Nuevo' },
      { label: 'Ubicación', value: [detail.location.neighborhood, detail.location.city].filter(Boolean).join(', ') || '—' },
    ];
    return rows;
  });

  /** Single-pin location map for the PDP (reuses SH-8 in map-only mode). */
  readonly pdpMapConfig: ResultsMapConfig = {
    layout: 'map',
    showToggle: false,
    showControls: false,
    mapAriaLabel: 'Ubicación de la propiedad',
  };

  readonly pdpMapItems = computed<readonly Listing[]>(() => {
    const listing = this.detail()?.listing;
    return listing ? [listing] : [];
  });

  // ─── Mortgage (live, pure client) ────────────────────────────────────────────
  readonly mortgageResult = computed<MortgageResult>(() => {
    const server = this.mortgageServerResult();
    if (server) {
      return server;
    }
    return calculateMortgage(
      {
        price: this.mortgagePrice(),
        downPayment: this.mortgageDown(),
        termMonths: this.mortgageTermMonths(),
        annualRate: this.mortgageRate(),
      },
      MAX_SCHEDULE_ROWS,
    );
  });

  readonly downPaymentPct = computed(() => {
    const price = this.mortgagePrice();
    return price > 0 ? Math.round((this.mortgageDown() / price) * 100) : 0;
  });

  // ─── Favorites derived ────────────────────────────────────────────────────────
  readonly favoriteCount = computed(() => this.favoriteIds().length);

  readonly favoriteListings = computed(() => {
    const ids = new Set(this.favoriteIds());
    return this.listings().filter((listing) => ids.has(listing.id));
  });

  // ─── Visit validity (SH-3 steps) ─────────────────────────────────────────────
  readonly visitNameValid = computed(() => this.visitName().trim().length >= 2);
  readonly visitEmailValid = computed(() => /.+@.+\..+/.test(this.visitEmail().trim()));
  readonly visitPhoneValid = computed(() => this.visitPhone().trim().length >= 7);
  readonly visitSlotValid = computed(() => this.visitDate().trim() !== '' && this.visitTime().trim() !== '');
  readonly visitContactValid = computed(
    () => this.visitNameValid() && this.visitEmailValid() && this.visitPhoneValid(),
  );

  readonly leadValid = computed(
    () =>
      this.leadName().trim().length >= 2 &&
      /.+@.+\..+/.test(this.leadEmail().trim()) &&
      this.leadMessage().trim().length >= 5,
  );

  /** Agent slots for the next 7 days × 4 daily windows (demo availability). */
  readonly availableSlots = computed<readonly VisitSlot[]>(() => {
    void this.visitListing();
    const slots: VisitSlot[] = [];
    const times = ['09:00', '11:00', '14:00', '16:00'];
    const today = new Date();
    for (let day = 1; day <= 7; day += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + day);
      const iso = date.toISOString().slice(0, 10);
      for (const time of times) {
        slots.push({ date: iso, time });
      }
    }
    return slots;
  });

  readonly availableDays = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    for (const slot of this.availableSlots()) {
      seen.add(slot.date);
    }
    return [...seen];
  });

  // ─── Visit checkout (SH-3 wizard — pago apagado; the visit form IS the wizard) ─
  readonly visitCheckoutConfig: CheckoutWizardConfig = {
    steps: [
      { id: 'mode', label: 'Modalidad' },
      { id: 'slot', label: 'Fecha y hora' },
      { id: 'contact', label: 'Tus datos' },
      { id: 'agendar', label: 'Confirmar' },
    ],
    stepsLabel: 'Pasos para agendar la visita',
    summaryHeading: 'Tu visita',
    submitLabel: 'Agendar visita',
    processingLabel: 'Agendando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
  };

  /** Per-step gating for the SH-3 visit wizard. */
  readonly visitCheckoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    mode: true,
    slot: this.visitSlotValid(),
    contact: this.visitContactValid(),
    agendar: this.visitSlotValid() && this.visitContactValid(),
  }));

  /** Instrument handed to the strategy's `pay` (no PSP token — pago OFF). */
  readonly visitInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    apiBase: this.apiBase(),
    provider: 'realty-visit',
    listingId: this.visitListing()?.id ?? '',
    listingTitle: this.visitListing()?.title ?? '',
  }));

  // ─── Account (SH-4) ──────────────────────────────────────────────────────────
  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mi cuenta',
    navLabel: 'Secciones de la cuenta',
    inboxEmptyMessage: 'Todavía no tienes visitas agendadas.',
    inboxLoadingMessage: 'Cargando tus visitas…',
    detailPlaceholder: 'Selecciona una visita para ver el detalle y su seguimiento.',
    sections: [
      { id: 'favorites', label: 'Favoritos y comparar', badge: this.favoriteCount() || undefined },
      { id: 'saved', label: 'Búsquedas guardadas', badge: this.savedAlertCount() || undefined },
      { id: 'visits', label: 'Mis visitas', kind: 'inbox', badge: this.myVisits().length || undefined },
      { id: 'messages', label: 'Mensajes' },
    ],
  }));

  readonly savedAlertCount = computed(() =>
    this.savedSearches().reduce((sum, search) => sum + search.newMatches, 0),
  );

  // ─── Agent console (SH-5) ────────────────────────────────────────────────────
  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Consola del agente',
    navLabel: 'Secciones del agente',
    kpisLabel: 'Indicadores de la cartera',
    filtersLabel: 'Filtros',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay filas en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      { id: 'portfolio', label: 'Cartera', kind: 'table', badge: this.desk()?.portfolio.length || undefined },
      { id: 'leads', label: 'Leads', kind: 'table', badge: this.desk()?.leads.length || undefined },
      { id: 'agenda', label: 'Agenda', kind: 'custom', badge: this.desk()?.agenda.length || undefined },
      { id: 'analytics', label: 'Analítica', kind: 'custom' },
    ],
  }));

  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() => {
    const desk = this.desk();
    if (!desk) {
      return [];
    }
    const active = desk.portfolio.filter((listing) => listing.status === 'active').length;
    return [
      { id: 'listings', label: 'Publicaciones activas', value: this.formatCount(active), hint: `${desk.portfolio.length} en total` },
      { id: 'views', label: 'Visitas al listado', value: this.formatCount(desk.totalViews), trend: 'up', delta: '+12%' },
      { id: 'leads', label: 'Leads', value: this.formatCount(desk.totalLeads), hint: `${this.newLeadsCount()} nuevos` },
      { id: 'revenue', label: 'Valor en cartera', value: this.formatPrice(desk.totalRevenue, this.currency()) },
    ];
  });

  readonly newLeadsCount = computed(
    () => this.desk()?.leads.filter((lead) => lead.status === 'new').length ?? 0,
  );

  readonly portfolioColumns: readonly ConsoleColumn[] = [
    { key: 'title', label: 'Inmueble' },
    { key: 'operation', label: 'Operación' },
    { key: 'price', label: 'Precio', align: 'end' },
    { key: 'views', label: 'Vistas', align: 'end' },
    { key: 'leads', label: 'Leads', align: 'end' },
    { key: 'status', label: 'Estado' },
  ];

  readonly leadColumns: readonly ConsoleColumn[] = [
    { key: 'name', label: 'Prospecto' },
    { key: 'listing', label: 'Inmueble' },
    { key: 'message', label: 'Mensaje' },
    { key: 'status', label: 'Estado' },
  ];

  readonly portfolioActions: readonly ConsoleRowAction[] = [{ id: 'open', label: 'Ver', kind: 'default' }];
  readonly leadActions: readonly ConsoleRowAction[] = [
    { id: 'contact', label: 'Contactar', kind: 'primary' },
    { id: 'won', label: 'Ganado', kind: 'default' },
  ];
  readonly noActions: readonly ConsoleRowAction[] = [];

  readonly filteredLeads = computed<readonly AgentLead[]>(() => {
    const term = this.leadFilter().trim().toLowerCase();
    const list = this.desk()?.leads ?? [];
    if (!term) {
      return list;
    }
    return list.filter(
      (lead) =>
        lead.name.toLowerCase().includes(term) ||
        lead.email.toLowerCase().includes(term) ||
        lead.listingTitle.toLowerCase().includes(term),
    );
  });

  /** Union row type so the generic SH-5 console unifies `TRow` across sections. */
  readonly consoleRows = computed<readonly (PortfolioListing | AgentLead)[]>(() =>
    this.agentView() === 'leads' ? this.filteredLeads() : (this.desk()?.portfolio ?? []),
  );

  readonly consoleColumns = computed<readonly ConsoleColumn[]>(() =>
    this.agentView() === 'leads' ? this.leadColumns : this.portfolioColumns,
  );

  readonly consoleActions = computed<readonly ConsoleRowAction[]>(() => {
    if (this.agentView() === 'leads') {
      return this.leadActions;
    }
    if (this.agentView() === 'portfolio') {
      return this.portfolioActions;
    }
    return this.noActions;
  });

  // ─── Publish inmueble (SH-6 authoring) ────────────────────────────────────────
  readonly publishConfig: AuthoringWizardConfig = {
    heading: 'Publicar inmueble',
    steps: [
      { id: 'datos', label: 'Datos' },
      { id: 'fotos', label: 'Fotos' },
      { id: 'precio', label: 'Precio' },
      { id: 'ubicacion', label: 'Ubicación' },
      { id: 'publicar', label: 'Publicar' },
    ],
    stepsLabel: 'Pasos para publicar el inmueble',
    backLabel: 'Atrás',
    nextLabel: 'Continuar',
    publishLabel: 'Publicar inmueble',
    publishingLabel: 'Publicando…',
    draftScope: `realty-publish.${this.instanceId}`,
  };

  readonly publishValidity = computed<Readonly<Record<string, boolean>>>(() => {
    const draft = this.createDraft();
    const title = this.draftString(draft, 'title');
    const city = this.draftString(draft, 'city');
    const price = this.draftString(draft, 'price');
    const lat = this.draftString(draft, 'lat');
    const lng = this.draftString(draft, 'lng');
    return {
      datos: title.trim().length >= 3 && city.trim().length >= 2,
      fotos: true,
      precio: Number(price) > 0,
      ubicacion: Number(lat) !== 0 && Number(lng) !== 0,
      publicar: true,
    };
  });

  constructor() {
    this.role.set(this.initialRole());
    this.operation.set(this.initialOperation());
    this.layout.set(this.initialLayout());
    this.mortgageRate.set(this.initialRate());

    // Bind the unified session (visit hold) to this origin and rehydrate.
    this.#store.init({
      scope: `realty.${this.instanceId}`,
      flow: REALTY_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
    });
    this.#bus.scope(`realty-${this.instanceId}`);

    const widget = this.#orchestrator.register('realty-search', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/inmueble/<id>, #/<scope>/agente…).
    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });

    if (this.role() === 'agent') {
      void this.loadDesk().then(() => this.applyHash());
    } else {
      void this.runSearch().then(() => this.applyHash());
    }
  }

  // ─── Role switch ─────────────────────────────────────────────────────────────
  setRole(role: RealtyRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    this.errorMessage.set('');
    if (role === 'agent') {
      if (!this.desk()) {
        void this.loadDesk();
      }
      this.writeHash('agent', this.agentView());
    } else {
      if (this.listings().length === 0) {
        void this.runSearch();
      }
      this.navigate('search');
    }
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  bindNumber(setter: (value: number) => void): (event: Event) => void {
    return (event: Event) => {
      const raw = (event.target as HTMLInputElement | null)?.value ?? '';
      const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
      setter(Number.isFinite(parsed) ? parsed : 0);
    };
  }

  private eventValue(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement | null)?.value ?? '';
  }

  // ─── Router (signals + hash deep-links) ─────────────────────────────────────
  navigate(view: RealtyView, param = ''): void {
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  goToSearch(): void {
    this.detail.set(null);
    this.navigate('search');
  }

  goToAccount(): void {
    this.accountSection.set('favorites');
    this.navigate('account');
  }

  private applyRoute(view: RealtyView, param: string): void {
    this.errorMessage.set('');
    switch (view) {
      case 'pdp':
        if (param && param !== this.detail()?.listing.id) {
          void this.loadListing(param);
        } else {
          this.view.set('pdp');
        }
        return;
      case 'account':
        this.view.set('account');
        this.loadSaved();
        return;
      case 'confirmation':
        if (!this.confirmedVisit() && !this.confirmedLeadId()) {
          this.view.set('search');
          return;
        }
        this.view.set('confirmation');
        return;
      default:
        this.view.set(view);
    }
  }

  private routeHash(view: RealtyView, param: string): string {
    const base = `#/${this.scope()}`;
    switch (view) {
      case 'search':
        return base;
      case 'pdp':
        return `${base}/inmueble/${encodeURIComponent(param)}`;
      case 'mortgage':
        return `${base}/hipoteca`;
      case 'visit':
        return `${base}/agendar`;
      case 'confirmation':
        return `${base}/confirmacion`;
      case 'account':
        return `${base}/cuenta`;
      default:
        return base;
    }
  }

  private writeHash(view: RealtyView | 'agent', param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const base = `#/${this.scope()}`;
    const hash =
      view === 'agent'
        ? `${base}/agente${param ? `/${param}` : ''}`
        : this.routeHash(view as RealtyView, param);
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
        this.role.set('demand');
        this.applyRoute('search', '');
        return;
      case 'inmueble':
        this.role.set('demand');
        this.applyRoute('pdp', decodeURIComponent(tail));
        return;
      case 'hipoteca':
        this.role.set('demand');
        this.applyRoute('mortgage', '');
        return;
      case 'agendar':
        this.applyRoute(this.detail() ? 'visit' : 'search', '');
        return;
      case 'confirmacion':
        this.applyRoute('confirmation', '');
        return;
      case 'cuenta':
        this.role.set('demand');
        this.applyRoute('account', '');
        return;
      case 'agente':
        this.role.set('agent');
        if ((AGENT_SECTIONS as readonly string[]).includes(tail)) {
          this.agentView.set(tail as AgentView);
        }
        if (!this.desk()) {
          void this.loadDesk();
        }
        return;
      default:
        this.applyRoute('search', '');
    }
  }

  // ─── Search (SH-1 + SH-8 wiring) ─────────────────────────────────────────────
  setOperation(operation: Operation): void {
    if (this.operation() === operation) {
      return;
    }
    this.operation.set(operation);
    void this.runSearch();
  }

  onCriteriaChange(criteria: DiscoveryCriteria): void {
    this.criteria.set(criteria);
    void this.runSearch();
  }

  onLayoutChange(layout: ResultsLayout): void {
    this.layout.set(layout);
  }

  /** "Buscar en esta zona" (SH-8 boundschange) — re-query. */
  onBoundsChange(): void {
    void this.runSearch();
  }

  #searchPending = false;

  private async runSearch(): Promise<void> {
    if (this.loading()) {
      this.#searchPending = true;
      return;
    }
    const active = this.criteria();
    const facetPick = (key: string): string => (active.facets[key] ?? [])[0] ?? '';
    const criteria: SearchCriteria = {
      q: active.term.trim(),
      operation: this.operation(),
      type: facetPick('type'),
      minPrice: 0,
      maxPrice: 0,
      beds: Number(facetPick('beds')) || 0,
      location: facetPick('city'),
      sort: (active.sort as SortKey) || 'relevance',
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.view.set('search');
    const requestId = `listings:${JSON.stringify(criteria)}`;
    try {
      const result = await this.#orchestrator.callApi(requestId, () =>
        this.#api.listings(this.apiBase(), criteria, this.currency()),
      );
      this.listings.set(result.listings);
      this.facets.set(result.facets);
      this.total.set(result.total);
      this.searched.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar las propiedades. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
      if (this.#searchPending) {
        this.#searchPending = false;
        void this.runSearch();
      }
    }
  }

  /** Pin label = compact price (e.g. "$850 M" / "$2,3 M") for the map markers. */
  pinLabel(listing: Listing): string {
    const price = listing.price;
    if (price >= 1_000_000_000) {
      return `$${(price / 1_000_000_000).toFixed(1).replace('.', ',')} MM`;
    }
    if (price >= 1_000_000) {
      return `$${Math.round(price / 1_000_000)} M`;
    }
    return this.formatPrice(price, listing.currency || this.currency());
  }

  // ─── PDP (SH-2 wiring) ───────────────────────────────────────────────────────
  openListing(listing: Listing): void {
    this.listingselect.emit(listing.id);
    this.navigate('pdp', listing.id);
  }

  private async loadListing(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`listing:${id}`, () =>
        this.#api.listing(this.apiBase(), id, this.currency()),
      );
      this.detail.set(detail);
      this.mortgagePrice.set(detail.listing.price);
      this.mortgageDown.set(Math.round(detail.listing.price * 0.3));
      this.mortgageServerResult.set(null);
      this.view.set('pdp');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir la propiedad. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Favorites / shortlist ─────────────────────────────────────────────────────
  isFavorite(id: string): boolean {
    return this.favoriteIds().includes(id);
  }

  toggleFavorite(id: string): void {
    this.favoriteIds.update((ids) =>
      ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id],
    );
    this.favoritechange.emit(this.favoriteCount());
  }

  removeFavorite(id: string): void {
    this.favoriteIds.update((ids) => ids.filter((entry) => entry !== id));
    this.favoritechange.emit(this.favoriteCount());
  }

  toggleCompare(): void {
    this.compareMode.update((on) => !on);
  }

  // ─── Saved searches ──────────────────────────────────────────────────────────
  private loadSaved(): void {
    if (this.savedLoaded()) {
      return;
    }
    const user = this.visitEmail().trim() || 'invitado@synergos';
    void this.#api.savedSearches(this.apiBase(), user).then((result) => {
      this.savedSearches.set(result.searches);
      this.savedLoaded.set(true);
    });
  }

  saveCurrentSearch(): void {
    const active = this.criteria();
    const facetPick = (key: string): string => (active.facets[key] ?? [])[0] ?? '';
    const criteria: SearchCriteria = {
      q: active.term.trim(),
      operation: this.operation(),
      type: facetPick('type'),
      minPrice: 0,
      maxPrice: 0,
      beds: Number(facetPick('beds')) || 0,
      location: facetPick('city'),
      sort: (active.sort as SortKey) || 'relevance',
    };
    const label = this.searchLabel(criteria);
    void this.#api
      .saveSearch(this.apiBase(), { label, operation: this.operation(), criteria, alert: true })
      .then((saved) => this.savedSearches.update((list) => [saved, ...list]));
  }

  private searchLabel(criteria: SearchCriteria): string {
    const parts: string[] = [criteria.operation === 'rent' ? 'Arriendo' : 'Venta'];
    if (criteria.type) {
      parts.push(this.typeLabel(criteria.type as PropertyType));
    }
    if (criteria.location) {
      parts.push(`en ${criteria.location}`);
    }
    if (criteria.beds > 0) {
      parts.push(`${criteria.beds}+ hab`);
    }
    if (criteria.q) {
      parts.push(`"${criteria.q}"`);
    }
    return parts.join(' · ');
  }

  toggleAlert(id: string): void {
    this.savedSearches.update((list) =>
      list.map((search) => (search.id === id ? { ...search, alert: !search.alert } : search)),
    );
  }

  // ─── Mortgage ──────────────────────────────────────────────────────────────────
  goToMortgage(): void {
    if (this.mortgagePrice() === 0) {
      const sample = this.detail()?.listing ?? this.listings()[0];
      if (sample) {
        this.mortgagePrice.set(sample.price);
        this.mortgageDown.set(Math.round(sample.price * 0.3));
      }
    }
    this.navigate('mortgage');
  }

  setMortgageTerm(months: number): void {
    this.mortgageTermMonths.set(Math.max(12, Math.trunc(months)));
    this.mortgageServerResult.set(null);
  }

  setMortgagePrice(value: number): void {
    this.mortgagePrice.set(Math.max(0, value));
    this.mortgageServerResult.set(null);
  }

  setMortgageDown(value: number): void {
    this.mortgageDown.set(Math.max(0, value));
    this.mortgageServerResult.set(null);
  }

  setMortgageRate(value: number): void {
    this.mortgageRate.set(Math.max(0, value));
    this.mortgageServerResult.set(null);
  }

  // ─── Visit wizard (SH-3 over engine — pago OFF) ──────────────────────────────
  startVisit(): void {
    const listing = this.detail()?.listing ?? null;
    if (!listing) {
      return;
    }
    this.visitListing.set(listing);
    this.visitMode.set('in-person');
    this.visitDate.set('');
    this.visitTime.set('');
    this.#store.reset();
    this.navigate('visit');
  }

  /** As the SH-3 wizard advances, keep the engine cart in sync with the choice. */
  onVisitStepChange(stepId: string): void {
    if ((stepId === 'contact' || stepId === 'agendar') && this.visitSlotValid()) {
      void this.selectVisitIntoCart();
    }
  }

  setVisitMode(mode: VisitMode): void {
    this.visitMode.set(mode);
  }

  selectSlot(slot: VisitSlot): void {
    this.visitDate.set(slot.date);
    this.visitTime.set(slot.time);
  }

  isSlotSelected(slot: VisitSlot): boolean {
    return this.visitDate() === slot.date && this.visitTime() === slot.time;
  }

  slotsForDay(date: string): readonly VisitSlot[] {
    return this.availableSlots().filter((slot) => slot.date === date);
  }

  private async selectVisitIntoCart(): Promise<void> {
    const listing = this.visitListing();
    if (!listing) {
      return;
    }
    const session = this.#store.getValidSession();
    const contact: ContactInfo = {
      name: this.visitName().trim(),
      email: this.visitEmail().trim(),
      phone: this.visitPhone().trim(),
    };
    const payload: VisitSelectionPayload = {
      listingId: listing.id,
      listingTitle: listing.title,
      slot: { date: this.visitDate(), time: this.visitTime() },
      mode: this.visitMode(),
      contact,
    };
    const selection = await this.#fulfillment.select(
      {
        productRef: listing.id,
        kind: 'visit',
        label: listing.title,
        amount: 0,
        selection: {
          ...(payload as unknown as Readonly<Record<string, unknown>>),
          apiBase: this.apiBase(),
        },
      },
      session,
    );
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: 0,
      balanceDue: 0,
      breakdown: [],
    });
  }

  onVisitCompleted(result: CheckoutWizardResult): void {
    const voucher = result.vouchers[0];
    const detail = voucher?.detail ?? {};
    const listing = this.visitListing();
    const visit: Visit = {
      id: typeof detail['visitId'] === 'string' ? detail['visitId'] : result.reference,
      listingId: listing?.id ?? '',
      listingTitle: listing?.title ?? '',
      slot: { date: this.visitDate(), time: this.visitTime() },
      mode: this.visitMode(),
      status: 'confirmed',
      contact: {
        name: this.visitName().trim(),
        email: this.visitEmail().trim(),
        phone: this.visitPhone().trim(),
      },
    };
    this.confirmedVisit.set(visit);
    this.confirmedLeadId.set('');
    this.myVisits.update((visits) => [visit, ...visits]);
    this.#store.reset();
    this.navigate('confirmation');
    const payload = { visitId: visit.id, listingId: visit.listingId };
    this.visitscheduled.emit(payload);
    this.#bus.publish('visitscheduled', payload);
  }

  onVisitFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos agendar la visita. Intenta de nuevo.');
  }

  backToPdp(): void {
    this.navigate('pdp', this.detail()?.listing.id ?? '');
  }

  // ─── Lead (contact agent) ──────────────────────────────────────────────────────
  openLead(): void {
    const listing = this.detail()?.listing;
    if (!listing) {
      return;
    }
    this.leadMessage.set(`Hola, me interesa la propiedad "${listing.title}". Quisiera más información.`);
    this.leadOpen.set(true);
  }

  closeLead(): void {
    this.leadOpen.set(false);
  }

  submitLead(): void {
    const listing = this.detail()?.listing;
    if (!listing || !this.leadValid() || this.loading()) {
      return;
    }
    const contact: ContactInfo = {
      name: this.leadName().trim(),
      email: this.leadEmail().trim(),
      phone: this.leadPhone().trim(),
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.#api
      .submitLead(
        this.apiBase(),
        { listingId: listing.id, contact, message: this.leadMessage().trim() },
        listing.title,
      )
      .then((lead) => {
        this.confirmedLeadId.set(lead.leadId);
        this.confirmedVisit.set(null);
        this.leadOpen.set(false);
        this.loading.set(false);
        this.deskLoaded.set(false);
        this.navigate('confirmation');
        const payload = { leadId: lead.leadId, listingId: listing.id };
        this.leadsubmitted.emit(payload);
        this.#bus.publish('leadsubmitted', payload);
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set('No pudimos enviar tu mensaje. Intenta de nuevo.');
        void error;
      });
  }

  // ─── Account (SH-4) ──────────────────────────────────────────────────────────
  onAccountSectionChange(sectionId: string): void {
    if (sectionId === 'favorites' || sectionId === 'saved' || sectionId === 'visits' || sectionId === 'messages') {
      this.accountSection.set(sectionId);
    }
  }

  onVisitTicketSelect(visit: Visit): void {
    if (this.trackingByRef()[visit.id]) {
      return;
    }
    const stages: TrackingStage[] = [
      { id: 'requested', label: 'Visita solicitada', state: 'done' },
      { id: 'confirmed', label: 'Confirmada por el agente', state: 'done' },
      {
        id: 'done',
        label: 'Visita realizada',
        state: visit.status === 'done' ? 'done' : 'pending',
      },
    ];
    this.trackingByRef.update((map) => ({ ...map, [visit.id]: stages }));
  }

  trackingStages(visitId: string): readonly TrackingStage[] {
    return this.trackingByRef()[visitId] ?? [];
  }

  // ─── AGENTE console (SH-5) ───────────────────────────────────────────────────
  onAgentSectionChange(sectionId: string): void {
    if ((AGENT_SECTIONS as readonly string[]).includes(sectionId)) {
      this.agentView.set(sectionId as AgentView);
      this.writeHash('agent', sectionId);
    }
  }

  private async loadDesk(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.#orchestrator.callApi('agent-desk', () =>
        this.#api.agentDesk(this.apiBase(), 'agent'),
      );
      this.desk.set(result);
      this.deskLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar la consola del agente. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  reloadDesk(): void {
    this.deskLoaded.set(false);
    void this.loadDesk();
  }

  setLeadFilter(event: Event): void {
    this.leadFilter.set(this.eventValue(event));
  }

  onConsoleAction(event: ConsoleRowActionEvent<PortfolioListing | AgentLead>): void {
    if (event.sectionId === 'portfolio' && event.actionId === 'open') {
      const row = event.row as PortfolioListing;
      this.setRole('demand');
      this.openListing({ ...MOCK_MINIMAL, id: row.id, title: row.title } as unknown as Listing);
      return;
    }
    if (event.sectionId === 'leads') {
      const row = event.row as AgentLead;
      const nextStatus = event.actionId === 'won' ? 'won' : 'contacted';
      this.desk.update((desk) =>
        desk
          ? {
              ...desk,
              leads: desk.leads.map((lead) =>
                lead.id === row.id ? { ...lead, status: nextStatus } : lead,
              ),
            }
          : desk,
      );
    }
  }

  openPublish(): void {
    this.agentView.set('publish');
    this.publishResultId.set('');
    this.writeHash('agent', 'publish');
  }

  // ─── Publish inmueble (SH-6 authoring wizard) ────────────────────────────────
  onPublishDraftChange(draft: Readonly<Record<string, unknown>>): void {
    this.createDraft.set(draft);
  }

  onPublishExit(): void {
    this.agentView.set('portfolio');
    this.writeHash('agent', 'portfolio');
  }

  onPublished(draft: Readonly<Record<string, unknown>>): void {
    const request: PublishListingRequest = {
      title: this.draftString(draft, 'title'),
      operation: this.draftString(draft, 'operation') === 'rent' ? 'rent' : 'sale',
      type: (this.draftString(draft, 'type') as PropertyType) || 'apartamento',
      price: Number(this.draftString(draft, 'price')) || 0,
      city: this.draftString(draft, 'city'),
      neighborhood: this.draftString(draft, 'neighborhood'),
      address: this.draftString(draft, 'address'),
      lat: Number(this.draftString(draft, 'lat')) || 0,
      lng: Number(this.draftString(draft, 'lng')) || 0,
      beds: Number(this.draftString(draft, 'beds')) || 0,
      baths: Number(this.draftString(draft, 'baths')) || 0,
      areaBuilt: Number(this.draftString(draft, 'areaBuilt')) || 0,
      stratum: Number(this.draftString(draft, 'stratum')) || 0,
    };
    this.publishing.set(true);
    void this.#api
      .publishListing(this.apiBase(), request, this.currency())
      .then((result) => {
        this.publishResultId.set(result.id);
        this.publishing.set(false);
        this.deskLoaded.set(false);
        void this.loadDesk();
      })
      .catch(() => this.publishing.set(false));
  }

  /** Drop a pin on the mini-map inside the SH-6 ubicación step. */
  dropPin(patch: (values: Readonly<Record<string, unknown>>) => void, event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    // Project the click back onto the demo Bogotá frame (same span as the pins).
    const lng = -74.12 + (xPct / 100) * 0.18;
    const lat = 4.6 + (1 - yPct / 100) * 0.18;
    patch({ lat: lat.toFixed(5), lng: lng.toFixed(5) });
  }

  hasPin(draft: Readonly<Record<string, unknown>>): boolean {
    return Number(this.draftString(draft, 'lat')) !== 0 && Number(this.draftString(draft, 'lng')) !== 0;
  }

  pinPct(draft: Readonly<Record<string, unknown>>, axis: 'x' | 'y'): number {
    const lat = Number(this.draftString(draft, 'lat'));
    const lng = Number(this.draftString(draft, 'lng'));
    if (axis === 'x') {
      return clampPct(((lng + 74.12) / 0.18) * 100);
    }
    return clampPct((1 - (lat - 4.6) / 0.18) * 100);
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

  // ─── Start over ──────────────────────────────────────────────────────────────
  startOver(): void {
    this.confirmedVisit.set(null);
    this.confirmedLeadId.set('');
    this.detail.set(null);
    this.errorMessage.set('');
    this.navigate('search');
  }

  // ─── Labels / helpers ─────────────────────────────────────────────────────────
  priceLabel(listing: Listing): string {
    const formatted = this.formatPrice(listing.price, listing.currency || this.currency());
    return listing.operation === 'rent' ? `${formatted}/mes` : formatted;
  }

  operationLabel(operation: Operation): string {
    return operation === 'rent' ? 'En arriendo' : 'En venta';
  }

  typeLabel(type: PropertyType): string {
    return TYPE_LABELS[type] ?? type;
  }

  statusLabel(status: Listing['status']): string {
    switch (status) {
      case 'reserved':
        return 'Reservado';
      case 'sold':
        return 'Vendido';
      default:
        return 'Disponible';
    }
  }

  leadStatusLabel(status: AgentLead['status']): string {
    switch (status) {
      case 'contacted':
        return 'Contactado';
      case 'visit':
        return 'En visita';
      case 'won':
        return 'Ganado';
      case 'lost':
        return 'Perdido';
      default:
        return 'Nuevo';
    }
  }

  visitModeLabel(mode: VisitMode): string {
    return mode === 'video' ? 'Video-tour' : 'Visita presencial';
  }

  amenityList(): readonly Amenity[] {
    return this.detail()?.amenities ?? [];
  }

  agendaList(): readonly AgendaVisit[] {
    return this.desk()?.agenda ?? [];
  }

  formatPrice(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
    }
  }

  formatArea(value: number): string {
    return `${new Intl.NumberFormat('es-CO').format(value)} m²`;
  }

  formatCount(value: number): string {
    try {
      return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
    } catch {
      return String(value);
    }
  }

  formatDate(iso: string): string {
    if (!iso) {
      return '';
    }
    try {
      return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(
        new Date(`${iso}T00:00:00`),
      );
    } catch {
      return iso;
    }
  }
}

/** Minimal listing stub used only to deep-link a portfolio row into the PDP loader. */
const MOCK_MINIMAL = {
  subtitle: '',
  operation: 'sale',
  type: 'apartamento',
  price: 0,
  currency: 'COP',
  geo: { lat: 0, lng: 0, address: '', neighborhood: '', city: '' },
  specs: { beds: 0, baths: 0, areaBuilt: 0, areaPrivate: 0, parking: 0, stratum: 0, ageYears: 0, floor: 0 },
  status: 'active',
  featured: false,
  publishedAt: '',
  cover: '',
  badges: [],
} as const;

function clampPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.min(96, Math.max(4, value));
}
