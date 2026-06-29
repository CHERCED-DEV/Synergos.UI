import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { RealtyApiClient } from './realty-api.client';
import { calculateMortgage } from './mortgage.calc';
import {
  type Amenity,
  type ContactInfo,
  type Facet,
  type Listing,
  type ListingDetail,
  type MortgageResult,
  type Operation,
  type PropertyType,
  type ResultsLayout,
  type SearchCriteria,
  type SortKey,
  type Visit,
  type VisitMode,
  type VisitSlot,
  type VisitStep,
  type RealtyView,
} from './realty.model';

/**
 * Runtime config for the CMS element <c>elementSynRealty</c>.
 *
 * The Propiedades vertical as a real estate marketplace portal — búsqueda facetada
 * con resultados lista ↔ mapa, ficha de propiedad (galería · specs · mapa ·
 * calculadora de hipoteca · agendar visita · contacto/lead), favoritos/shortlist y
 * cuenta. La transacción central es **agendar visita + lead (sin pago)**; la
 * hipoteca se calcula en vivo, puro cliente.
 */
export interface RealtyRuntimeConfig {
  /** Base URL of the realty API. Default `/api/realty`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Initial operation: `sale` (venta) or `rent` (arriendo). Default `sale`. */
  readonly operation?: Operation;
  /** Initial results layout: `split` · `list` · `map`. Default `split`. */
  readonly layout?: ResultsLayout;
  /** Default annual mortgage rate (E.A. %) seeded in the calculator. Default `12`. */
  readonly defaultRate?: number;
}

const DEFAULT_API_BASE = '/api/realty';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_OPERATION: Operation = 'sale';
const DEFAULT_LAYOUT: ResultsLayout = 'split';
const DEFAULT_RATE = 12;
const MAX_SCHEDULE_ROWS = 12;

const OPERATIONS: readonly { key: Operation; label: string }[] = [
  { key: 'sale', label: 'Comprar' },
  { key: 'rent', label: 'Arrendar' },
];

const TYPES: readonly { key: PropertyType | ''; label: string }[] = [
  { key: '', label: 'Todos los tipos' },
  { key: 'apartamento', label: 'Apartamento' },
  { key: 'casa', label: 'Casa' },
  { key: 'oficina', label: 'Oficina' },
  { key: 'local', label: 'Local' },
  { key: 'lote', label: 'Lote' },
];

const BED_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Todas' },
  { value: 1, label: '1+' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
];

const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Destacados' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
  { key: 'newest', label: 'Más recientes' },
  { key: 'area-desc', label: 'Mayor área' },
];

const VISIT_STEPS: readonly VisitStep[] = ['mode', 'slot', 'contact', 'review'];

function sanitizeConfig(value: Partial<RealtyRuntimeConfig>): RealtyRuntimeConfig {
  return omitUndefinedProperties<RealtyRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    operation: coerceOperation(value.operation),
    layout: coerceLayout(value.layout),
    defaultRate: coerceRate(value.defaultRate),
  });
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
  imports: [],
  templateUrl: './realty.html',
  styleUrl: './realty.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements may be hydrated by the CMS shell.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-realty' },
})
export class RealtyElementComponent {
  readonly #api = inject(RealtyApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<RealtyRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<RealtyRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly operationInput = input<string | undefined>(undefined, { alias: 'operation' });
  readonly layoutInput = input<string | undefined>(undefined, { alias: 'layout' });
  readonly defaultRateInput = input<string | number | undefined>(undefined, {
    alias: 'defaultRate',
  });

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

  readonly instanceId = (realtyInstanceId += 1);
  readonly fieldId = `syn-realty-${this.instanceId}`;
  readonly operations = OPERATIONS;
  readonly types = TYPES;
  readonly bedOptions = BED_OPTIONS;
  readonly sortOptions = SORT_OPTIONS;
  readonly visitSteps = VISIT_STEPS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly viewchange = output<RealtyView>();
  readonly listingselect = output<string>();
  readonly visitscheduled = output<{ visitId: string; listingId: string }>();
  readonly leadsubmitted = output<{ leadId: string; listingId: string }>();
  readonly favoritechange = output<number>();

  // ─── Shell state ────────────────────────────────────────────────────────────
  readonly view = signal<RealtyView>('search');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly filtersOpen = signal(false);

  // ─── Search / filters ─────────────────────────────────────────────────────────
  readonly operation = signal<Operation>(DEFAULT_OPERATION);
  readonly layout = signal<ResultsLayout>(DEFAULT_LAYOUT);
  readonly searchTerm = signal('');
  readonly filterType = signal('');
  readonly filterBeds = signal(0);
  readonly filterLocation = signal('');
  readonly filterMinPrice = signal(0);
  readonly filterMaxPrice = signal(0);
  readonly sort = signal<SortKey>('relevance');
  readonly searchAsIMove = signal(false);

  readonly listings = signal<readonly Listing[]>([]);
  readonly facets = signal<readonly Facet[]>([]);
  readonly total = signal(0);
  readonly searched = signal(false);
  readonly hoveredListingId = signal('');

  // ─── PDP ─────────────────────────────────────────────────────────────────────
  readonly detail = signal<ListingDetail | null>(null);
  readonly galleryIndex = signal(0);
  readonly lightboxOpen = signal(false);
  readonly pdpTab = signal<'description' | 'amenities' | 'location'>('description');

  // ─── Favorites / shortlist ─────────────────────────────────────────────────────
  readonly favoriteIds = signal<readonly string[]>([]);
  readonly compareMode = signal(false);

  // ─── Mortgage calculator (live, pure client) ────────────────────────────────
  readonly mortgagePrice = signal(0);
  readonly mortgageDown = signal(0);
  readonly mortgageTermMonths = signal(240);
  readonly mortgageRate = signal(DEFAULT_RATE);
  readonly mortgageServerResult = signal<MortgageResult | null>(null);

  // ─── Visit wizard (reservable agent slot — NO payment) ────────────────────────
  readonly visitListing = signal<Listing | null>(null);
  readonly visitStep = signal<VisitStep>('mode');
  readonly visitMode = signal<VisitMode>('in-person');
  readonly visitDate = signal('');
  readonly visitTime = signal('');
  readonly visitName = signal('');
  readonly visitEmail = signal('');
  readonly visitPhone = signal('');

  // ─── Lead (contact agent) ──────────────────────────────────────────────────────
  readonly leadOpen = signal(false);
  readonly leadName = signal('');
  readonly leadEmail = signal('');
  readonly leadPhone = signal('');
  readonly leadMessage = signal('');

  // ─── Confirmation + account ─────────────────────────────────────────────────────
  readonly confirmedVisit = signal<Visit | null>(null);
  readonly confirmedLeadId = signal('');
  readonly myVisits = signal<readonly Visit[]>([]);
  readonly myLeads = signal<readonly { leadId: string; listingTitle: string }[]>([]);

  // ─── Derived ──────────────────────────────────────────────────────────────────
  readonly degraded = computed(() => {
    void this.searched();
    void this.view();
    void this.detail();
    void this.confirmedVisit();
    return this.#api.degraded;
  });

  readonly favoriteCount = computed(() => this.favoriteIds().length);

  readonly favoriteListings = computed(() => {
    const ids = new Set(this.favoriteIds());
    return this.listings().filter((listing) => ids.has(listing.id));
  });

  readonly hasActiveFilters = computed(
    () =>
      this.filterType() !== '' ||
      this.filterBeds() > 0 ||
      this.filterLocation().trim() !== '' ||
      this.filterMinPrice() > 0 ||
      this.filterMaxPrice() > 0 ||
      this.searchTerm().trim() !== '',
  );

  /** Live mortgage result — server value if present, else pure client calc. */
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

  // ─── Visit validity ────────────────────────────────────────────────────────────
  readonly visitNameValid = computed(() => this.visitName().trim().length >= 2);
  readonly visitEmailValid = computed(() => /.+@.+\..+/.test(this.visitEmail().trim()));
  readonly visitPhoneValid = computed(() => this.visitPhone().trim().length >= 7);
  readonly visitSlotValid = computed(
    () => this.visitDate().trim() !== '' && this.visitTime().trim() !== '',
  );
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

  constructor() {
    // Seed config-driven defaults once, then open the portal on a fresh search.
    const cfg = this.config();
    this.operation.set(coerceOperation(this.operationInput()) ?? cfg?.operation ?? DEFAULT_OPERATION);
    this.layout.set(coerceLayout(this.layoutInput()) ?? cfg?.layout ?? DEFAULT_LAYOUT);
    this.mortgageRate.set(coerceRate(this.defaultRateInput()) ?? cfg?.defaultRate ?? DEFAULT_RATE);
    void this.runSearch();
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

  // ─── Operation / layout toggles ───────────────────────────────────────────────
  setOperation(operation: Operation): void {
    if (this.operation() === operation) {
      return;
    }
    this.operation.set(operation);
    void this.runSearch();
  }

  setLayout(layout: ResultsLayout): void {
    this.layout.set(layout);
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  setType(type: string): void {
    this.filterType.set(type);
    void this.runSearch();
  }

  setBeds(beds: number): void {
    this.filterBeds.set(beds);
    void this.runSearch();
  }

  setSort(value: string): void {
    const next = SORT_OPTIONS.find((option) => option.key === value)?.key ?? 'relevance';
    this.sort.set(next);
    void this.runSearch();
  }

  toggleSearchAsIMove(): void {
    this.searchAsIMove.update((on) => !on);
  }

  submitSearch(): void {
    void this.runSearch();
  }

  applyPriceFilter(): void {
    void this.runSearch();
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.filterType.set('');
    this.filterBeds.set(0);
    this.filterLocation.set('');
    this.filterMinPrice.set(0);
    this.filterMaxPrice.set(0);
    void this.runSearch();
  }

  /** "Buscar en esta zona" — re-query within the current map viewport (demo bounds). */
  searchThisArea(): void {
    void this.runSearch();
  }

  /** Coalesce rapid filter clicks: a search fired while one is in flight re-runs after. */
  #searchPending = false;

  private async runSearch(): Promise<void> {
    if (this.loading()) {
      // Don't drop the click — remember the latest criteria and re-run when free.
      this.#searchPending = true;
      return;
    }
    const criteria: SearchCriteria = {
      q: this.searchTerm().trim(),
      operation: this.operation(),
      type: this.filterType(),
      minPrice: Math.max(0, this.filterMinPrice()),
      maxPrice: Math.max(0, this.filterMaxPrice()),
      beds: Math.max(0, this.filterBeds()),
      location: this.filterLocation().trim(),
      sort: this.sort(),
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.view.set('search');
    try {
      const result = await this.#api.listings(this.apiBase(), criteria, this.currency());
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

  // ─── Map ↔ list sync ───────────────────────────────────────────────────────────
  hoverListing(id: string): void {
    this.hoveredListingId.set(id);
  }

  clearHover(): void {
    this.hoveredListingId.set('');
  }

  isHovered(id: string): boolean {
    return this.hoveredListingId() === id;
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

  /** Project a listing's geo onto a 0–100% position within the demo map frame. */
  pinX(listing: Listing): number {
    return clampPct(((listing.geo.lng + 74.12) / 0.18) * 100);
  }

  pinY(listing: Listing): number {
    return clampPct((1 - (listing.geo.lat - 4.6) / 0.18) * 100);
  }

  // ─── PDP ─────────────────────────────────────────────────────────────────────
  openListing(listing: Listing): void {
    this.listingselect.emit(listing.id);
    void this.loadListing(listing.id);
  }

  backToSearch(): void {
    this.view.set('search');
    this.detail.set(null);
    this.lightboxOpen.set(false);
    this.errorMessage.set('');
    this.emitViewChange();
  }

  setPdpTab(tab: 'description' | 'amenities' | 'location'): void {
    this.pdpTab.set(tab);
  }

  private async loadListing(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#api.listing(this.apiBase(), id, this.currency());
      this.detail.set(detail);
      this.galleryIndex.set(0);
      this.pdpTab.set('description');
      // Seed the mortgage calculator from the property price (30% down default).
      this.mortgagePrice.set(detail.listing.price);
      this.mortgageDown.set(Math.round(detail.listing.price * 0.3));
      this.mortgageServerResult.set(null);
      this.view.set('pdp');
      this.emitViewChange();
    } catch (error) {
      this.errorMessage.set('No pudimos abrir la propiedad. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Gallery / lightbox ────────────────────────────────────────────────────────
  galleryCount(): number {
    return Math.max(1, this.detail()?.gallery.length ?? 0);
  }

  openLightbox(index: number): void {
    this.galleryIndex.set(index);
    this.lightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  galleryNext(): void {
    const count = this.galleryCount();
    this.galleryIndex.update((index) => (index + 1) % count);
  }

  galleryPrev(): void {
    const count = this.galleryCount();
    this.galleryIndex.update((index) => (index - 1 + count) % count);
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

  goToFavorites(): void {
    this.view.set('favorites');
    this.compareMode.set(false);
    this.errorMessage.set('');
    this.emitViewChange();
  }

  toggleCompare(): void {
    this.compareMode.update((on) => !on);
  }

  removeFavorite(id: string): void {
    this.favoriteIds.update((ids) => ids.filter((entry) => entry !== id));
    this.favoritechange.emit(this.favoriteCount());
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
    this.view.set('mortgage');
    this.errorMessage.set('');
    this.emitViewChange();
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

  /** Optional server recompute (the seam); the live value already shows the client calc. */
  async recomputeMortgageServer(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.#api.mortgage(this.apiBase(), {
        price: this.mortgagePrice(),
        downPayment: this.mortgageDown(),
        termMonths: this.mortgageTermMonths(),
        annualRate: this.mortgageRate(),
      });
      this.mortgageServerResult.set(result);
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Visit wizard ──────────────────────────────────────────────────────────────
  startVisit(): void {
    const listing = this.detail()?.listing ?? null;
    if (!listing) {
      return;
    }
    this.visitListing.set(listing);
    this.visitStep.set('mode');
    this.visitMode.set('in-person');
    this.visitDate.set('');
    this.visitTime.set('');
    this.view.set('visit');
    this.errorMessage.set('');
    this.emitViewChange();
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

  nextVisitStep(): void {
    const step = this.visitStep();
    if (step === 'mode') {
      this.visitStep.set('slot');
    } else if (step === 'slot') {
      if (!this.visitSlotValid()) {
        return;
      }
      this.visitStep.set('contact');
    } else if (step === 'contact') {
      if (!this.visitContactValid()) {
        return;
      }
      this.visitStep.set('review');
    }
  }

  previousVisitStep(): void {
    const step = this.visitStep();
    const index = VISIT_STEPS.indexOf(step);
    if (index <= 0) {
      // Back out of the wizard to the PDP.
      this.view.set('pdp');
      this.emitViewChange();
      return;
    }
    this.visitStep.set(VISIT_STEPS[index - 1]);
  }

  confirmVisit(): void {
    const listing = this.visitListing();
    if (!listing || !this.visitSlotValid() || !this.visitContactValid() || this.loading()) {
      return;
    }
    const contact: ContactInfo = {
      name: this.visitName().trim(),
      email: this.visitEmail().trim(),
      phone: this.visitPhone().trim(),
    };
    const slot: VisitSlot = { date: this.visitDate(), time: this.visitTime() };
    this.loading.set(true);
    this.errorMessage.set('');
    this.#api
      .scheduleVisit(
        this.apiBase(),
        { listingId: listing.id, slot, contact, mode: this.visitMode() },
        listing.title,
      )
      .then((visit) => {
        this.confirmedVisit.set(visit);
        this.confirmedLeadId.set('');
        this.myVisits.update((visits) => [visit, ...visits]);
        this.loading.set(false);
        this.view.set('confirmation');
        this.visitscheduled.emit({ visitId: visit.id, listingId: visit.listingId });
        this.emitViewChange();
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set('No pudimos agendar la visita. Intenta de nuevo.');
        void error;
      });
  }

  // ─── Lead (contact agent) ──────────────────────────────────────────────────────
  openLead(): void {
    const listing = this.detail()?.listing;
    if (!listing) {
      return;
    }
    this.leadMessage.set(
      `Hola, me interesa la propiedad "${listing.title}". Quisiera más información.`,
    );
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
      .submitLead(this.apiBase(), {
        listingId: listing.id,
        contact,
        message: this.leadMessage().trim(),
      })
      .then((lead) => {
        this.confirmedLeadId.set(lead.leadId);
        this.confirmedVisit.set(null);
        this.myLeads.update((leads) => [
          { leadId: lead.leadId, listingTitle: listing.title },
          ...leads,
        ]);
        this.leadOpen.set(false);
        this.loading.set(false);
        this.view.set('confirmation');
        this.leadsubmitted.emit({ leadId: lead.leadId, listingId: listing.id });
        this.emitViewChange();
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set('No pudimos enviar tu mensaje. Intenta de nuevo.');
        void error;
      });
  }

  // ─── Account ─────────────────────────────────────────────────────────────────
  goToAccount(): void {
    this.view.set('account');
    this.errorMessage.set('');
    this.emitViewChange();
  }

  startOver(): void {
    this.confirmedVisit.set(null);
    this.confirmedLeadId.set('');
    this.view.set('search');
    this.detail.set(null);
    this.errorMessage.set('');
    this.emitViewChange();
  }

  // ─── Labels / helpers ─────────────────────────────────────────────────────────
  priceLabel(listing: Listing): string {
    const formatted = this.formatPrice(listing.price, listing.currency || this.currency());
    return listing.operation === 'rent' ? `${formatted}/mes` : formatted;
  }

  operationLabel(operation: Operation): string {
    return operation === 'rent' ? 'En arriendo' : 'En venta';
  }

  operationSummaryLabel(): string {
    return this.operation() === 'rent' ? 'en arriendo' : 'en venta';
  }

  typeLabel(type: PropertyType): string {
    return TYPES.find((entry) => entry.key === type)?.label ?? type;
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

  visitModeLabel(mode: VisitMode): string {
    return mode === 'video' ? 'Video-tour' : 'Visita presencial';
  }

  amenityList(): readonly Amenity[] {
    return this.detail()?.amenities ?? [];
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

  formatArea(value: number): string {
    return `${new Intl.NumberFormat('es-CO').format(value)} m²`;
  }

  formatDate(iso: string): string {
    if (!iso) {
      return '';
    }
    try {
      return new Intl.DateTimeFormat('es-CO', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date(`${iso}T00:00:00`));
    } catch {
      return iso;
    }
  }

  private emitViewChange(): void {
    this.viewchange.emit(this.view());
  }
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.min(96, Math.max(4, value));
}
