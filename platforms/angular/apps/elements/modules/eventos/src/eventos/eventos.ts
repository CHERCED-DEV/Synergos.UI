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
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { EventosApiClient } from './eventos-api.client';
import {
  EVENTOS_FLOW,
  type Attendee,
  type Buyer,
  type CatalogCriteria,
  type CheckInOutcome,
  type CheckInResult,
  type EventDetail,
  type EventSummary,
  type EventosRole,
  type EventosSortKey,
  type EventosView,
  type ETicket,
  type ManageResult,
  type ManagedAttendee,
  type ManagerView,
  type ScanRecord,
  type TicketTier,
  type TierSelectionPayload,
  type VenueZone,
} from './eventos.model';

/**
 * Runtime config for the CMS element <c>elementSynEventos</c>.
 *
 * The Eventos vertical as a real enterprise events platform with two caras —
 * ASISTENTE (catálogo · ficha · selección tier/asiento · checkout · e-ticket QR)
 * and ORGANIZADOR (dashboard · asistentes · check-in por QR · aforo) — reusing the
 * shared <c>@synergos/transaction-engine</c> for the unified ticket checkout and
 * cross-island coordination, plus the published <c>&lt;synergos-seat-map&gt;</c>
 * (reserved seating) and <c>&lt;synergos-qr-code&gt;</c> (e-ticket / scan target).
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
const SESSION_TTL_MS = 30 * 60 * 1000;

const ROLES: readonly { key: EventosRole; label: string }[] = [
  { key: 'attendee', label: 'Asistente' },
  { key: 'organizer', label: 'Organizador' },
];

const SORT_OPTIONS: readonly { key: EventosSortKey; label: string }[] = [
  { key: 'relevance', label: 'Más relevantes' },
  { key: 'date-asc', label: 'Próximos primero' },
  { key: 'popular', label: 'Más populares' },
  { key: 'price-asc', label: 'Menor precio' },
  { key: 'price-desc', label: 'Mayor precio' },
];

function sanitizeConfig(value: Partial<EventosRuntimeConfig>): EventosRuntimeConfig {
  return omitUndefinedProperties<EventosRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
    role: normalizeRole(value.role),
    eventId: coerceTrimmedStringInput(value.eventId),
  });
}

function normalizeRole(value: unknown): EventosRole | undefined {
  return value === 'organizer' || value === 'attendee' ? value : undefined;
}

let eventosInstanceId = 0;

@Component({
  selector: 'sg-eventos',
  standalone: true,
  imports: [],
  templateUrl: './eventos.html',
  styleUrl: './eventos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-seat-map>, <synergos-qr-code>).
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

  // ─── ASISTENTE state ─────────────────────────────────────────────────────────
  readonly view = signal<EventosView>('catalog');

  // Catalogue
  readonly searchTerm = signal('');
  readonly activeCategory = signal('');
  readonly activeCity = signal('');
  readonly sort = signal<EventosSortKey>('relevance');
  readonly events = signal<readonly EventSummary[]>([]);
  readonly searched = signal(false);

  // Event PDP
  readonly detail = signal<EventDetail | null>(null);

  // Selection
  readonly selectedTierId = signal('');
  readonly quantity = signal(1);
  readonly selectedSeats = signal<readonly string[]>([]);

  // Attendees / buyer
  readonly attendees = signal<readonly Attendee[]>([]);
  readonly buyerName = signal('');
  readonly buyerEmail = signal('');
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  // Confirmation
  readonly orderRef = signal('');
  readonly tickets = signal<readonly ETicket[]>([]);

  // ─── ORGANIZADOR state ─────────────────────────────────────────────────────────
  readonly managerView = signal<ManagerView>('dashboard');
  readonly manageEventId = signal('');
  readonly manage = signal<ManageResult | null>(null);
  readonly attendeeFilter = signal('');
  readonly checkinCode = signal('');
  readonly lastScan = signal<CheckInResult | null>(null);
  readonly scanLog = signal<readonly ScanRecord[]>([]);
  readonly checkedInCount = signal(0);

  // ─── Engine-derived state ────────────────────────────────────────────────────
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    void this.searched();
    void this.view();
    void this.detail();
    void this.manage();
    void this.lastScan();
    return this.#api.degraded;
  });

  // ─── Catalogue derived ───────────────────────────────────────────────────────
  readonly categories = computed(() => this.facet((event) => event.category));
  readonly cities = computed(() => this.facet((event) => event.city));

  readonly hasActiveFilters = computed(
    () => !!this.activeCategory() || !!this.activeCity() || !!this.searchTerm().trim(),
  );

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
    if (!tier) {
      return 0;
    }
    return tier.amount * Math.max(0, this.ticketCount());
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

  // ─── Attendees derived ───────────────────────────────────────────────────────
  readonly attendeesValid = computed(() =>
    this.attendees().length > 0 &&
    this.attendees().every(
      (attendee) => attendee.name.trim().length >= 2 && /.+@.+\..+/.test(attendee.email.trim()),
    ),
  );

  readonly buyerValid = computed(
    () => this.buyerName().trim().length >= 2 && /.+@.+\..+/.test(this.buyerEmail().trim()),
  );

  readonly checkoutValid = computed(() => this.attendeesValid() && this.buyerValid());

  // ─── Organizer derived ───────────────────────────────────────────────────────
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

  readonly revenueEstimate = computed(() => {
    const data = this.manage();
    if (!data) {
      return 0;
    }
    // Rough estimate from attendee tier mix (mock-friendly); real KPI comes from API.
    return data.attendees.reduce((sum) => sum + 120_000, 0);
  });

  readonly checkinRate = computed(() => {
    const data = this.manage();
    if (!data || data.attendees.length === 0) {
      return 0;
    }
    const checkedIn = data.attendees.filter((attendee) => attendee.state === 'checked-in').length;
    return Math.round((checkedIn / data.attendees.length) * 100);
  });

  readonly filteredAttendees = computed<readonly ManagedAttendee[]>(() => {
    const term = this.attendeeFilter().trim().toLowerCase();
    const list = this.manage()?.attendees ?? [];
    if (!term) {
      return list;
    }
    return list.filter(
      (attendee) =>
        attendee.name.toLowerCase().includes(term) ||
        attendee.email.toLowerCase().includes(term) ||
        attendee.tier.toLowerCase().includes(term) ||
        attendee.ticketId.toLowerCase().includes(term),
    );
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

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
    });

    // Open the right cara: attendee → catalogue; organizer → dashboard.
    if (this.role() === 'organizer') {
      this.manageEventId.set(this.deepLinkEventId());
      void this.loadManage();
    } else {
      void this.runSearch();
    }
  }

  // ─── Role switch ─────────────────────────────────────────────────────────────
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
    } else if (this.events().length === 0) {
      void this.runSearch();
    }
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  /** Read the current value of a native `<select>`/`<input>` change/input event. */
  private eventValue(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement | null)?.value ?? '';
  }

  // ─── Catalogue ───────────────────────────────────────────────────────────────
  submitSearch(): void {
    void this.runSearch();
  }

  setSort(value: string): void {
    const next = SORT_OPTIONS.find((option) => option.key === value)?.key ?? 'relevance';
    this.sort.set(next);
    void this.runSearch();
  }

  onSortChange(event: Event): void {
    this.setSort(this.eventValue(event));
  }

  onCityChange(event: Event): void {
    this.setCity(this.eventValue(event));
  }

  onCheckinInput(event: Event): void {
    this.setCheckinCode(this.eventValue(event));
  }

  selectCategory(category: string): void {
    this.activeCategory.set(this.activeCategory() === category ? '' : category);
    void this.runSearch();
  }

  setCity(value: string): void {
    this.activeCity.set(value);
    void this.runSearch();
  }

  clearFilters(): void {
    this.activeCategory.set('');
    this.activeCity.set('');
    this.searchTerm.set('');
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    if (this.loading()) {
      return;
    }
    const criteria: CatalogCriteria = {
      q: this.searchTerm().trim(),
      category: this.activeCategory(),
      city: this.activeCity(),
      sort: this.sort(),
    };
    this.loading.set(true);
    this.errorMessage.set('');
    this.view.set('catalog');
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

  // ─── Event PDP ───────────────────────────────────────────────────────────────
  openEvent(event: EventSummary): void {
    void this.loadEvent(event.slug || event.id);
  }

  backToCatalog(): void {
    this.view.set('catalog');
    this.detail.set(null);
    this.errorMessage.set('');
  }

  private async loadEvent(id: string): Promise<void> {
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

  /** CTA on the PDP → open the selección step for the chosen tier. */
  startSelection(): void {
    if (!this.selectedTier()) {
      return;
    }
    this.errorMessage.set('');
    this.view.set('select');
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
    this.view.set('event');
    this.errorMessage.set('');
  }

  /** Selección confirmed → seed attendee rows + cart line, go to attendee data. */
  proceedToAttendees(): void {
    if (!this.canProceedSelection()) {
      return;
    }
    const count = this.ticketCount();
    // Seed one attendee row per ticket, preserving any already-entered data.
    const previous = this.attendees();
    const rows: Attendee[] = Array.from({ length: count }, (_unused, index) =>
      previous[index] ?? { name: '', email: '', document: '' },
    );
    this.attendees.set(rows);
    if (!this.buyerName() && rows[0]?.name) {
      this.buyerName.set(rows[0].name);
    }
    void this.selectIntoCart();
    this.view.set('attendees');
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

  // ─── Attendee data ─────────────────────────────────────────────────────────────
  setAttendeeField(index: number, field: keyof Attendee, value: string): void {
    this.attendees.update((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  attendeeFieldHandler(index: number, field: keyof Attendee): (event: Event) => void {
    return (event: Event) =>
      this.setAttendeeField(index, field, (event.target as HTMLInputElement | null)?.value ?? '');
  }

  backToSelection(): void {
    this.view.set('select');
    this.errorMessage.set('');
  }

  proceedToCheckout(): void {
    if (!this.attendeesValid()) {
      return;
    }
    this.view.set('checkout');
  }

  // ─── Checkout / payment ─────────────────────────────────────────────────────────
  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }

  backToAttendees(): void {
    this.view.set('attendees');
    this.errorMessage.set('');
  }

  /** Confirm CTA — single payment + confirm for the order; issues e-tickets. */
  confirmPurchase(): void {
    if (!this.checkoutValid()) {
      return;
    }
    void this.placeOrder();
  }

  private async placeOrder(): Promise<void> {
    if (this.loading() || !this.#store.hasItems()) {
      return;
    }
    const detail = this.detail();
    if (!detail) {
      return;
    }
    const attendees = this.attendees().map((attendee) => ({
      name: attendee.name.trim(),
      email: attendee.email.trim(),
      document: attendee.document.trim(),
    }));
    const buyer: Buyer = { name: this.buyerName().trim(), email: this.buyerEmail().trim() };

    this.loading.set(true);
    this.errorMessage.set('');
    this.#store.setStatus('paying');

    try {
      // Record parties once so confirm() can issue one e-ticket per attendee.
      const session = {
        ...this.#store.getValidSession(),
        parties: attendees.map((attendee, index) => ({
          id: `att-${index + 1}`,
          fullName: attendee.name,
          email: attendee.email,
          details: { document: attendee.document },
        })),
      };
      this.#store.setSession(session);

      // FulfillmentContext routes pay → confirm to the eventos strategy.
      const payResult = await this.#fulfillment.pay({
        session: this.#store.getValidSession(),
        instrument: {
          apiBase: this.apiBase(),
          eventId: detail.event.id,
          attendees,
          buyer,
        },
      });
      if (!payResult.accepted || !payResult.reference) {
        throw new Error('payment-rejected');
      }

      const paid = {
        ...this.#store.getValidSession(),
        payments: [
          {
            id: `pay-${Date.now().toString(36)}`,
            amount: this.#store.pricing().totalAmount,
            provider: this.isFreeEvent()
              ? 'eventos-free'
              : this.paymentMethod() === 'pse'
                ? 'eventos-pse'
                : 'eventos-card',
            status: 'captured' as const,
            reference: payResult.reference,
          },
        ],
        status: 'paying' as const,
      };
      this.#store.setSession(paid);

      const confirmation = await this.#fulfillment.confirm(this.#store.getValidSession());
      if (!confirmation.confirmed) {
        throw new Error('not-confirmed');
      }

      const issued: ETicket[] = confirmation.vouchers.map((voucher) => ({
        id: voucher.itemId,
        qr: voucher.reference,
        attendee: typeof voucher.detail?.['attendee'] === 'string' ? voucher.detail['attendee'] : undefined,
        tier: typeof voucher.detail?.['tier'] === 'string' ? voucher.detail['tier'] : undefined,
        seat: typeof voucher.detail?.['seat'] === 'string' ? voucher.detail['seat'] : undefined,
      }));

      this.orderRef.set(payResult.reference);
      this.tickets.set(issued);
      this.#store.setStatus('confirmed');
      this.loading.set(false);
      this.view.set('confirmed');

      const payload = { eventId: detail.event.id, orderRef: payResult.reference, tickets: issued.length };
      this.purchased.emit(payload);
      this.#bus.publish('purchased', payload);
    } catch (error) {
      this.loading.set(false);
      this.errorMessage.set('No pudimos completar la compra. Intenta de nuevo.');
      this.#store.setStatus('building');
      void error;
    }
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
    this.view.set('catalog');
  }

  // ─── ORGANIZADOR ─────────────────────────────────────────────────────────────
  setManagerView(view: ManagerView): void {
    this.managerView.set(view);
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
      this.checkedInCount.set(
        result.attendees.filter((attendee) => attendee.state === 'checked-in').length,
      );
    } catch (error) {
      this.errorMessage.set('No pudimos cargar el panel del evento. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  reloadManage(): void {
    void this.loadManage();
  }

  setCheckinCode(value: string): void {
    this.checkinCode.set(value);
  }

  /** Validate the scanned/typed code against the ticket validation seam. */
  submitCheckin(): void {
    const code = this.checkinCode().trim();
    if (!code) {
      return;
    }
    void this.runCheckin(code);
  }

  /** Convenience: scan a known attendee row directly from the table. */
  checkinAttendee(attendee: ManagedAttendee): void {
    void this.runCheckin(attendee.ticketId);
  }

  private async runCheckin(code: string): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.#api.checkin(this.apiBase(), code);
      this.lastScan.set(result);
      const attendeeName =
        result.attendee ??
        this.manage()?.attendees.find((attendee) => attendee.ticketId === result.ticketId)?.name ??
        '';
      this.scanLog.update((log) =>
        [
          {
            code,
            outcome: result.status,
            attendee: attendeeName,
            at: new Date().toISOString(),
          },
          ...log,
        ].slice(0, 12),
      );

      if (result.status === 'valid' && result.ticketId) {
        // Mark the attendee checked-in + bump the live aforo counter.
        this.manage.update((data) =>
          data
            ? {
                ...data,
                attendees: data.attendees.map((attendee) =>
                  attendee.ticketId === result.ticketId
                    ? { ...attendee, state: 'checked-in' }
                    : attendee,
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

  // ─── Helpers ───────────────────────────────────────────────────────────────────
  private facet(pick: (event: EventSummary) => string): readonly string[] {
    const set = new Set<string>();
    for (const event of this.events()) {
      const value = pick(event);
      if (value) {
        set.add(value);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es-CO'));
  }

  private reprice(): void {
    const items = this.#store.items();
    const total = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: items.map((item) => ({
        code: `line:${item.id}`,
        label: item.label,
        amount: item.amount * item.quantity,
      })),
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
