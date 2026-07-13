import { NgTemplateOutlet } from '@angular/common';
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
  type SessionItem,
} from '@synergos/transaction-engine';
import {
  AccountShellComponent,
  CheckoutWizardComponent,
  CredentialWalletComponent,
  DetailShellComponent,
  ResultsMapComponent,
  TrackingTimelineComponent,
  type AccountShellConfig,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
  type CredentialWalletConfig,
  type DetailMedia,
  type DetailSpec,
  type GeoBounds,
  type GeoPoint,
  type TrackingStage,
  type WalletCredential,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { TravelApiClient, mockSeatMap } from './travel-api.client';
import {
  TRAVEL_FLOW,
  TRAVEL_PRODUCTS,
  type CancelReceipt,
  type CarCriteria,
  type FareFamily,
  type FlightCriteria,
  type HotelCriteria,
  type PaxRoom,
  type StayDetail,
  type StayRate,
  type TravelAccountSection,
  type TravelGeo,
  type TravelGuest,
  type TravelOffer,
  type TravelProduct,
  type TravelTrip,
  type TravelView,
} from './travel.model';

/**
 * Runtime config for the CMS element <c>elementSynTravelShell</c>.
 *
 * travel-shell **v2** — the Booking vertical as a full multi-page travel app
 * (Estadías · Vuelos · Autos) rebuilt as a **consumer of the reusable shell
 * catalogue** `@synergos/shells`: SH-8 `syn-results-map` (stay list↔map), SH-2
 * `syn-detail-shell` (rich stay ficha), SH-3 `syn-checkout-wizard` (single
 * checkout over the engine), SH-4 `syn-account-shell` + `syn-tracking-timeline`
 * (mis viajes) and SH-10 `syn-credential-wallet` (voucher + PNR). It embeds the
 * published `<synergos-pax-selector>` and `<synergos-seat-map>` custom elements.
 * The app only contributes domain data, templates and its
 * `TravelFulfillmentStrategy` — the shells stay domain-free (contrato D3).
 */
export interface TravelShellRuntimeConfig {
  /** Base URL of the travel API. Default `/api/travel`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `travel`. */
  readonly scope?: string;
  /** Traveler id used to load "mis viajes". Optional. */
  readonly traveler?: string;
}

/** Typed event map for the transaction bus (search ↔ cart ↔ checkout ↔ IA). */
interface TravelBus extends Record<string, unknown> {
  readonly cartUpdated: { readonly count: number; readonly total: number };
  readonly bookingconfirmed: { readonly orderRef: string; readonly code: string };
}

/** A confirmed voucher/PNR surfaced in the SH-10 wallet after checkout. */
interface ConfirmedVoucher {
  readonly product: TravelProduct;
  readonly title: string;
  readonly subtitle: string;
  readonly reference: string;
  readonly reservationId: string;
}

const DEFAULT_API_BASE = '/api/travel';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'travel';
const SESSION_TTL_MS = 30 * 60 * 1000;
const ACCOUNT_SECTIONS: readonly TravelAccountSection[] = ['viajes', 'credenciales', 'perfil'];

function sanitizeConfig(value: Partial<TravelShellRuntimeConfig>): TravelShellRuntimeConfig {
  return omitUndefinedProperties<TravelShellRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
    traveler: coerceTrimmedStringInput(value.traveler),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRooms(value: unknown): readonly PaxRoom[] {
  const source = isRecord(value) ? value['rooms'] : value;
  if (!Array.isArray(source)) {
    return [{ adults: 2, childAges: [] }];
  }
  const rooms = source
    .map((entry): PaxRoom | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const adults = Math.max(1, Math.trunc(Number(entry['adults']) || 1));
      const rawAges = Array.isArray(entry['childAges']) ? entry['childAges'] : [];
      const childAges = rawAges
        .map((age) => Number(age))
        .filter((age) => Number.isFinite(age))
        .map((age) => Math.max(0, Math.trunc(age)));
      return { adults, childAges };
    })
    .filter((room): room is PaxRoom => room !== null);
  return rooms.length > 0 ? rooms : [{ adults: 2, childAges: [] }];
}

function paxCount(rooms: readonly PaxRoom[]): number {
  return rooms.reduce((sum, room) => sum + room.adults + room.childAges.length, 0);
}

let travelShellInstanceId = 0;

@Component({
  selector: 'sg-travel-shell',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ResultsMapComponent,
    DetailShellComponent,
    CheckoutWizardComponent,
    AccountShellComponent,
    TrackingTimelineComponent,
    CredentialWalletComponent,
  ],
  templateUrl: './travel-shell.html',
  styleUrl: './travel-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-pax-selector>, <synergos-seat-map>).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-travel-shell' },
})
export class TravelShellElementComponent {
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<TravelBus>>(TransactionEventBusService);
  readonly #api = inject(TravelApiClient);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<TravelShellRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TravelShellRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly travelerInput = input<string | undefined>(undefined, { alias: 'traveler' });

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
  readonly traveler = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.travelerInput()),
      this.config()?.traveler,
      '',
    ),
  );

  readonly instanceId = (travelShellInstanceId += 1);
  readonly fieldId = `syn-travel-shell-${this.instanceId}`;
  readonly products = TRAVEL_PRODUCTS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly cartchange = output<number>();
  readonly bookingconfirmed = output<{ orderRef: string; code: string }>();

  // ─── Router (signals + hash deep-links) ─────────────────────────────────────
  readonly view = signal<TravelView>('home');
  readonly activeProduct = signal<TravelProduct>('hotel');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly cartOpen = signal(false);
  #suppressedHash = '';

  // ─── Search criteria — hotel ────────────────────────────────────────────────
  readonly hotelDestination = signal('');
  readonly hotelCheckIn = signal('');
  readonly hotelCheckOut = signal('');
  readonly hotelRooms = signal<readonly PaxRoom[]>([{ adults: 2, childAges: [] }]);

  // ─── Search criteria — flight ───────────────────────────────────────────────
  readonly flightOrigin = signal('');
  readonly flightDestination = signal('');
  readonly flightDepart = signal('');
  readonly flightReturn = signal('');
  readonly flightRooms = signal<readonly PaxRoom[]>([{ adults: 1, childAges: [] }]);

  // ─── Search criteria — car ──────────────────────────────────────────────────
  readonly carLocation = signal('');
  readonly carPickUp = signal('');
  readonly carDropOff = signal('');

  // ─── Results ─────────────────────────────────────────────────────────────────
  readonly offers = signal<readonly TravelOffer[]>([]);
  readonly searched = signal(false);

  // ─── Flights: fare family + seat selection ──────────────────────────────────
  readonly selectedFlightId = signal('');
  readonly selectedFareId = signal('');
  readonly selectedSeats = signal<readonly string[]>([]);
  readonly seatMapJson = signal('');

  readonly selectedFlight = computed<TravelOffer | null>(() => {
    const id = this.selectedFlightId();
    return this.offers().find((offer) => offer.offerId === id) ?? null;
  });
  readonly fareFamilies = computed<readonly FareFamily[]>(
    () => this.selectedFlight()?.fareFamilies ?? [],
  );
  readonly selectedFare = computed<FareFamily | null>(() => {
    const families = this.fareFamilies();
    return families.find((fare) => fare.id === this.selectedFareId()) ?? families[0] ?? null;
  });

  // ─── Stays: SH-8 map + SH-2 detail ──────────────────────────────────────────
  readonly stayOffers = computed<readonly TravelOffer[]>(() =>
    this.offers().filter((offer) => offer.product === 'hotel'),
  );
  readonly stay = signal<StayDetail | null>(null);
  readonly selectedRateId = signal('');

  readonly selectedRate = computed<StayRate | null>(() => {
    const detail = this.stay();
    if (!detail) {
      return null;
    }
    return detail.rates.find((rate) => rate.id === this.selectedRateId()) ?? detail.rates[0] ?? null;
  });

  readonly stayMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.stay();
    if (!detail) {
      return [];
    }
    return detail.images.map((url) => ({ url, alt: detail.title }));
  });

  readonly staySpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.stay();
    if (!detail) {
      return [];
    }
    const specs: DetailSpec[] = [
      { label: 'Dirección', value: detail.address || '—' },
      { label: 'Calificación', value: detail.rating ? `${detail.rating} / 5` : '—' },
      ...detail.specs.map((spec) => ({ label: spec.label, value: spec.value })),
    ];
    return specs;
  });

  readonly stayPriceLabel = computed(() => {
    const rate = this.selectedRate();
    const detail = this.stay();
    if (!rate || !detail) {
      return '';
    }
    return this.formatPrice(rate.amount, rate.currency || detail.currency || this.currency());
  });

  // Geo accessor for SH-8 (aligned with GeoPoint | null).
  readonly stayGeoOf = (offer: TravelOffer): GeoPoint | null => {
    const geo = offer.geo;
    return geo ? { lat: geo.lat, lng: geo.lng } : null;
  };
  readonly stayPinLabelOf = (offer: TravelOffer): string => this.compactPrice(offer.amount, offer.currency);

  // ─── Checkout (SH-3 inputs) ─────────────────────────────────────────────────
  readonly guestName = signal('');
  readonly guestEmail = signal('');
  readonly paymentMethod = signal<'card' | 'pse'>('card');

  readonly guestNameValid = computed(() => this.guestName().trim().length >= 2);
  readonly guestEmailValid = computed(() => /.+@.+\..+/.test(this.guestEmail().trim()));
  readonly guestValid = computed(() => this.guestNameValid() && this.guestEmailValid());

  readonly checkoutConfig: CheckoutWizardConfig = {
    steps: [
      { id: 'viajeros', label: 'Viajeros' },
      { id: 'pago', label: 'Pago' },
      { id: 'revisar', label: 'Revisar' },
    ],
    summaryHeading: 'Tu viaje',
    submitLabel: 'Pagar y reservar',
    processingLabel: 'Procesando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
  };

  readonly checkoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    viajeros: this.guestValid(),
    pago: true,
    revisar: true,
  }));

  readonly checkoutInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    apiBase: this.apiBase(),
    guest: { name: this.guestName().trim(), email: this.guestEmail().trim() } satisfies TravelGuest,
    provider: this.paymentMethod() === 'pse' ? 'travel-pse' : 'travel-card',
  }));

  // ─── Confirmation (SH-10 wallet) ────────────────────────────────────────────
  readonly orderRef = signal('');
  readonly confirmationCode = signal('');
  readonly confirmedVouchers = signal<readonly ConfirmedVoucher[]>([]);

  readonly confirmationCredentials = computed<readonly WalletCredential[]>(() =>
    this.confirmedVouchers().map((voucher) => this.toCredential(voucher, this.orderRef())),
  );

  readonly walletConfig: CredentialWalletConfig = {
    heading: 'Tus credenciales de viaje',
    emptyMessage: 'Todavía no tienes credenciales.',
    referenceLabel: 'Reserva',
    expandLabel: 'Ver QR y detalle',
    collapseLabel: 'Ocultar detalle',
  };

  // ─── Account (SH-4 inputs) ──────────────────────────────────────────────────
  readonly accountSection = signal<TravelAccountSection>('viajes');
  readonly trips = signal<readonly TravelTrip[]>([]);
  readonly tripsLoaded = signal(false);
  readonly tripsLoading = signal(false);
  readonly cancelByRef = signal<Readonly<Record<string, CancelReceipt>>>({});

  readonly walletCredentials = computed<readonly WalletCredential[]>(() => {
    const credentials: WalletCredential[] = [];
    for (const trip of this.trips()) {
      for (const item of trip.items) {
        credentials.push(this.tripItemToCredential(trip, item));
      }
    }
    return credentials;
  });

  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mi cuenta de viajes',
    navLabel: 'Secciones de la cuenta',
    inboxEmptyMessage: 'Todavía no tienes viajes reservados.',
    inboxLoadingMessage: 'Cargando tus viajes…',
    detailPlaceholder: 'Selecciona un viaje para ver el itinerario y su seguimiento.',
    sections: [
      { id: 'viajes', label: 'Mis viajes', kind: 'inbox' },
      { id: 'credenciales', label: 'Credenciales', badge: this.walletCredentials().length || undefined },
      { id: 'perfil', label: 'Mis datos' },
    ],
  }));

  // ─── Derived cart state (from the engine store) ─────────────────────────────
  readonly cartItems = this.#store.items;
  readonly cartCount = this.#store.itemCount;
  readonly hasCart = this.#store.hasItems;
  readonly cartTotalMinor = computed(() => this.#store.pricing().totalAmount);
  readonly cartTotalLabel = computed(() =>
    this.formatPrice(this.cartTotalMinor() / 100, this.#store.pricing().currency || this.currency()),
  );
  readonly liveConflict = this.#store.liveSessionConflict;
  readonly degraded = computed(() => {
    // Recompute on each navigation/data load; the flag is set by the API client.
    void this.searched();
    void this.view();
    void this.stay();
    void this.trips();
    return this.#api.degraded;
  });

  /** Cross-sell hint for the cart (nudge the traveler to complete the trip). */
  readonly crossSell = computed<TravelProduct | null>(() => {
    if (!this.hasCart()) {
      return null;
    }
    const kinds = new Set(this.cartItems().map((item) => item.kind));
    if (!kinds.has('flight')) {
      return 'flight';
    }
    if (!kinds.has('hotel')) {
      return 'hotel';
    }
    if (!kinds.has('car')) {
      return 'car';
    }
    return null;
  });

  // ─── Search validity ─────────────────────────────────────────────────────────
  readonly canSearchHotel = computed(
    () =>
      this.hotelDestination().trim().length > 1 &&
      this.datesValid(this.hotelCheckIn(), this.hotelCheckOut()),
  );
  readonly canSearchFlight = computed(
    () =>
      this.flightOrigin().trim().length > 1 &&
      this.flightDestination().trim().length > 1 &&
      this.datesValid(this.flightDepart(), this.flightReturn(), true),
  );
  readonly canSearchCar = computed(
    () =>
      this.carLocation().trim().length > 1 &&
      this.datesValid(this.carPickUp(), this.carDropOff()),
  );
  readonly canSearch = computed(() => {
    switch (this.activeProduct()) {
      case 'hotel':
        return this.canSearchHotel();
      case 'flight':
        return this.canSearchFlight();
      case 'car':
        return this.canSearchCar();
    }
  });

  // Pax payloads for the embedded selectors.
  readonly hotelPaxJson = computed(() => JSON.stringify({ rooms: this.hotelRooms() }));
  readonly flightPaxJson = computed(() => JSON.stringify({ rooms: this.flightRooms() }));

  constructor() {
    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `travel.${this.instanceId}`,
      flow: TRAVEL_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
    });
    this.#bus.scope(`travel-${this.instanceId}`);

    // Register the cart widget so the orchestrator tracks page readiness.
    const cartWidget = this.#orchestrator.register('travel-cart', { order: 0 });
    this.#orchestrator.setStatus(cartWidget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/vuelos, #/<scope>/cuenta/...).
    const onHashChange = (): void => this.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(cartWidget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    });

    // Honour a deep link on boot.
    this.applyHash();
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Product tabs (home) ──────────────────────────────────────────────────────
  selectProduct(product: TravelProduct): void {
    if (this.activeProduct() === product) {
      return;
    }
    this.activeProduct.set(product);
    this.offers.set([]);
    this.searched.set(false);
    this.errorMessage.set('');
  }

  productLabel(product: TravelProduct): string {
    switch (product) {
      case 'hotel':
        return 'Estadías';
      case 'flight':
        return 'Vuelos';
      case 'car':
        return 'Autos';
    }
  }

  // ─── Pax-selector bridges ────────────────────────────────────────────────────
  onHotelOccupancyChange(event: Event): void {
    this.hotelRooms.set(normalizeRooms((event as CustomEvent<unknown>).detail));
  }

  onFlightOccupancyChange(event: Event): void {
    this.flightRooms.set(normalizeRooms((event as CustomEvent<unknown>).detail));
  }

  // ─── Router ──────────────────────────────────────────────────────────────────
  navigate(view: TravelView, param = ''): void {
    if (view === 'checkout' && !this.hasCart()) {
      view = 'cart';
    }
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  goHome(): void {
    this.navigate('home');
  }

  goToCart(): void {
    this.cartOpen.set(false);
    this.navigate('cart');
  }

  goToCheckout(): void {
    if (!this.hasCart()) {
      return;
    }
    this.cartOpen.set(false);
    this.navigate('checkout');
  }

  goToAccount(section: TravelAccountSection = 'viajes'): void {
    this.navigate('account', section);
  }

  private applyRoute(view: TravelView, param: string): void {
    this.errorMessage.set('');
    switch (view) {
      case 'stay':
        if (param && param !== this.stay()?.id) {
          void this.loadStay(param);
        }
        this.view.set('stay');
        return;
      case 'account': {
        const section = (ACCOUNT_SECTIONS as readonly string[]).includes(param)
          ? (param as TravelAccountSection)
          : 'viajes';
        this.accountSection.set(section);
        this.view.set('account');
        this.loadAccountSection(section);
        return;
      }
      case 'confirmation':
        if (!this.confirmationCode()) {
          this.view.set('home');
          return;
        }
        this.view.set('confirmation');
        return;
      case 'flights':
      case 'stays':
        // Guard: results pages need a prior search of the matching product.
        this.view.set(view);
        return;
      default:
        this.view.set(view);
    }
  }

  private routeHash(view: TravelView, param: string): string {
    const base = `#/${this.scope()}`;
    switch (view) {
      case 'home':
        return base;
      case 'flights':
        return `${base}/vuelos`;
      case 'stays':
        return `${base}/estadias`;
      case 'stay':
        return `${base}/estadia/${encodeURIComponent(param)}`;
      case 'cart':
        return `${base}/carrito`;
      case 'checkout':
        return `${base}/checkout`;
      case 'confirmation':
        return `${base}/confirmacion`;
      case 'account':
        return `${base}/cuenta${param ? `/${param}` : ''}`;
      default:
        return base;
    }
  }

  private writeHash(view: TravelView, param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = this.routeHash(view, param);
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
    const segments = hash
      .slice(base.length)
      .split('/')
      .filter((segment) => segment !== '');
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('home', '');
        return;
      case 'vuelos':
        this.applyRoute('flights', '');
        return;
      case 'estadias':
        this.applyRoute('stays', '');
        return;
      case 'estadia':
        this.applyRoute('stay', decodeURIComponent(tail));
        return;
      case 'carrito':
        this.applyRoute('cart', '');
        return;
      case 'checkout':
        this.applyRoute(this.hasCart() ? 'checkout' : 'cart', '');
        return;
      case 'confirmacion':
        this.applyRoute('confirmation', '');
        return;
      case 'cuenta':
        this.applyRoute('account', tail);
        return;
      default:
        this.applyRoute('home', '');
    }
  }

  // ─── Search ────────────────────────────────────────────────────────────────
  search(): void {
    if (!this.canSearch() || this.loading()) {
      return;
    }
    const product = this.activeProduct();
    void this.runSearch(product).then(() => {
      this.navigate(product === 'flight' ? 'flights' : product === 'hotel' ? 'stays' : 'flights');
    });
  }

  private async runSearch(product: TravelProduct): Promise<void> {
    const criteria = this.criteriaFor(product);
    this.loading.set(true);
    this.errorMessage.set('');
    this.searched.set(true);

    // Dedup concurrent identical searches via the orchestrator.
    const requestId = `search:${product}:${JSON.stringify(criteria)}`;
    try {
      const products = await this.#orchestrator.callApi(requestId, () =>
        this.#fulfillment.search({
          flow: TRAVEL_FLOW,
          currency: this.currency(),
          criteria: { product, apiBase: this.apiBase(), criteria },
        }),
      );
      this.offers.set(
        products.map((entry) => ({
          offerId: entry.productRef,
          product,
          title: entry.label,
          subtitle: this.metaString(entry.meta, 'subtitle'),
          amount: entry.amount,
          currency: this.metaString(entry.meta, 'currency') || this.currency(),
          badges: this.metaStringArray(entry.meta, 'badges'),
          geo: this.metaGeo(entry.meta),
          fareFamilies: this.metaFares(entry.meta),
          stayId: this.metaString(entry.meta, 'stayId') || entry.productRef,
          rating: this.metaNumber(entry.meta, 'rating'),
          detail: entry.selection,
        })),
      );
      // Auto-select the first flight + fare so the fare board is live immediately.
      if (product === 'flight') {
        const first = this.offers()[0];
        if (first) {
          this.selectedFlightId.set(first.offerId);
          this.selectedFareId.set(first.fareFamilies?.[0]?.id ?? '');
          this.selectedSeats.set([]);
          this.seatMapJson.set(JSON.stringify(mockSeatMap()));
        }
      }
    } catch (error) {
      this.errorMessage.set('No pudimos buscar disponibilidad. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  /** SH-8 "buscar en esta zona" — re-run the hotel search (geo re-query hook). */
  onStayBoundsChange(bounds: GeoBounds): void {
    void bounds;
    void this.runSearch('hotel');
  }

  // ─── Flights: fare + seat ──────────────────────────────────────────────────
  selectFlight(offer: TravelOffer): void {
    this.selectedFlightId.set(offer.offerId);
    this.selectedFareId.set(offer.fareFamilies?.[0]?.id ?? '');
    this.selectedSeats.set([]);
    this.seatMapJson.set(JSON.stringify(mockSeatMap()));
  }

  selectFare(fare: FareFamily): void {
    this.selectedFareId.set(fare.id);
  }

  onSeatSelect(event: Event): void {
    const detail = (event as CustomEvent<{ selected?: readonly string[] }>).detail;
    const selected = Array.isArray(detail?.selected)
      ? detail.selected.filter((seat): seat is string => typeof seat === 'string')
      : [];
    this.selectedSeats.set(selected);
  }

  farePriceLabel(fare: FareFamily): string {
    return this.formatPrice(fare.amount, fare.currency || this.currency());
  }

  addFlightToCart(): void {
    const flight = this.selectedFlight();
    const fare = this.selectedFare();
    if (!flight || !fare) {
      return;
    }
    const seats = this.selectedSeats();
    const seatLabel = seats.length > 0 ? ` · Asiento ${seats.join(', ')}` : '';
    const selection: Record<string, unknown> = {
      ...flight.detail,
      apiBase: this.apiBase(),
      currency: fare.currency || this.currency(),
      subtitle: `${flight.subtitle} · ${fare.label}${seatLabel}`,
      fareId: fare.id,
      fareLabel: fare.label,
      seat: seats.join(','),
    };
    this.commitToCart({
      productRef: flight.offerId,
      kind: 'flight',
      label: `${flight.title} · ${fare.label}`,
      amount: fare.amount,
      selection,
      meta: { subtitle: selection['subtitle'], badges: fare.perks },
    });
  }

  // ─── Cars ──────────────────────────────────────────────────────────────────
  addCarToCart(offer: TravelOffer): void {
    this.commitToCart({
      productRef: offer.offerId,
      kind: 'car',
      label: offer.title,
      amount: offer.amount,
      selection: {
        ...offer.detail,
        apiBase: this.apiBase(),
        currency: offer.currency || this.currency(),
        subtitle: offer.subtitle,
      },
      meta: { subtitle: offer.subtitle, badges: offer.badges },
    });
  }

  // ─── Stays: SH-8 → SH-2 ────────────────────────────────────────────────────
  openStay(offer: TravelOffer): void {
    this.navigate('stay', offer.stayId ?? offer.offerId);
  }

  backToStays(): void {
    this.stay.set(null);
    this.navigate('stays');
  }

  selectRate(rate: StayRate): void {
    this.selectedRateId.set(rate.id);
  }

  addStayToCart(): void {
    const detail = this.stay();
    const rate = this.selectedRate();
    if (!detail || !rate) {
      return;
    }
    const subtitle = `${rate.roomLabel} · ${rate.rateLabel}`;
    this.commitToCart({
      productRef: detail.id,
      kind: 'hotel',
      label: detail.title,
      amount: rate.amount,
      selection: {
        title: detail.title,
        subtitle,
        apiBase: this.apiBase(),
        currency: rate.currency || detail.currency || this.currency(),
        rateId: rate.id,
        rateLabel: rate.rateLabel,
        roomLabel: rate.roomLabel,
        refundable: rate.refundable,
      },
      meta: { subtitle, badges: rate.perks },
    });
  }

  private async loadStay(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const detail = await this.#orchestrator.callApi(`stay:${id}`, () =>
        this.#api.stay(this.apiBase(), id, this.currency()),
      );
      this.stay.set(detail);
      this.selectedRateId.set(detail.rates[0]?.id ?? '');
    } catch (error) {
      this.errorMessage.set('No pudimos abrir el alojamiento. Intenta de nuevo.');
      void error;
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Cart wiring (engine) ────────────────────────────────────────────────────
  private commitToCart(product: {
    productRef: string;
    kind: TravelProduct;
    label: string;
    amount: number;
    selection: Readonly<Record<string, unknown>>;
    meta: Readonly<Record<string, unknown>>;
  }): void {
    const session = this.#store.getValidSession();
    void this.#fulfillment.select(product, session).then((selection) => {
      this.#store.addItem(selection.item);
      this.reprice();
      this.cartOpen.set(true);
      this.emitCartUpdate();
    });
  }

  removeFromCart(itemId: string): void {
    this.#store.removeItem(itemId);
    this.reprice();
    this.emitCartUpdate();
  }

  toggleCart(): void {
    this.cartOpen.update((open) => !open);
  }

  continueShopping(): void {
    this.navigate('home');
  }

  /** Cross-sell CTA in the cart — jump to the missing product's search tab. */
  addCrossSell(): void {
    const product = this.crossSell();
    if (!product) {
      return;
    }
    this.selectProduct(product);
    this.cartOpen.set(false);
    this.navigate('home');
  }

  itemSubtitle(item: SessionItem): string {
    return this.metaString(item.selection, 'subtitle');
  }

  itemProduct(item: SessionItem): TravelProduct {
    return item.kind as TravelProduct;
  }

  itemPriceLabel(item: SessionItem): string {
    return this.formatPrice(item.amount / 100, this.#store.pricing().currency || this.currency());
  }

  offerPriceLabel(offer: TravelOffer): string {
    return this.formatPrice(offer.amount, offer.currency || this.currency());
  }

  ratePriceLabel(rate: StayRate): string {
    return this.formatPrice(rate.amount, rate.currency || this.currency());
  }

  crossSellLabel(): string {
    switch (this.crossSell()) {
      case 'flight':
        return 'Agrega un vuelo a tu viaje';
      case 'hotel':
        return 'Suma una estadía a tu viaje';
      case 'car':
        return 'Añade un auto para moverte';
      default:
        return '';
    }
  }

  // ─── Checkout (SH-3 wiring) ──────────────────────────────────────────────────
  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }

  onCheckoutCompleted(result: CheckoutWizardResult): void {
    this.orderRef.set(result.reference);
    const code = this.voucherConfirmationCode(result.vouchers) || result.reference;
    this.confirmationCode.set(code);
    this.confirmedVouchers.set(
      result.vouchers.map((voucher) => ({
        product: this.voucherProduct(voucher.detail),
        title: this.voucherString(voucher.detail, 'title') || 'Reserva',
        subtitle: this.voucherString(voucher.detail, 'subtitle'),
        reference: voucher.reference,
        reservationId: this.voucherString(voucher.detail, 'reservationId') || voucher.reference,
      })),
    );
    this.tripsLoaded.set(false);
    this.navigate('confirmation');
    const payload = { orderRef: result.reference, code };
    this.bookingconfirmed.emit(payload);
    this.#bus.publish('bookingconfirmed', payload);
    this.emitCartUpdate();
  }

  onCheckoutFailed(reason: string): void {
    void reason;
    this.errorMessage.set('No pudimos completar el pago. Intenta de nuevo.');
  }

  // ─── Account (SH-4 wiring) ───────────────────────────────────────────────────
  onAccountSectionChange(sectionId: string): void {
    const section = (ACCOUNT_SECTIONS as readonly string[]).includes(sectionId)
      ? (sectionId as TravelAccountSection)
      : 'viajes';
    this.accountSection.set(section);
    this.writeHash('account', section);
    this.loadAccountSection(section);
  }

  private loadAccountSection(section: TravelAccountSection): void {
    if ((section === 'viajes' || section === 'credenciales') && !this.tripsLoaded()) {
      void this.loadTrips();
    }
  }

  private async loadTrips(): Promise<void> {
    this.tripsLoading.set(true);
    try {
      const trips = await this.#api.trips(this.apiBase(), this.traveler(), this.currency());
      this.trips.set(trips);
      this.tripsLoaded.set(true);
    } catch (error) {
      this.errorMessage.set('No pudimos cargar tus viajes.');
      void error;
    } finally {
      this.tripsLoading.set(false);
    }
  }

  onTripSelect(trip: TravelTrip): void {
    void trip;
  }

  tripStages(trip: TravelTrip): readonly TrackingStage[] {
    if (this.cancelByRef()[trip.ref]) {
      return [
        { id: 'booked', label: 'Reserva confirmada', state: 'done' },
        { id: 'cancelled', label: 'Reserva cancelada', state: 'current' },
      ];
    }
    const order: readonly { id: string; label: string; date?: string }[] = [
      { id: 'booked', label: 'Reserva confirmada', date: trip.startDate },
      { id: 'checkin', label: 'Check-in disponible', date: trip.startDate },
      { id: 'inprogress', label: 'Viaje en curso' },
      { id: 'completed', label: 'Viaje completado', date: trip.endDate },
    ];
    const reached =
      trip.status === 'completed'
        ? 4
        : trip.status === 'inprogress'
          ? 3
          : trip.status === 'cancelled'
            ? 1
            : 1;
    return order.map((stage, index) => ({
      ...stage,
      state: index < reached - 1 ? 'done' : index === reached - 1 ? 'current' : 'pending',
    }));
  }

  tripCredentials(trip: TravelTrip): readonly WalletCredential[] {
    return trip.items.map((item) => this.tripItemToCredential(trip, item));
  }

  canCancel(trip: TravelTrip): boolean {
    return trip.status === 'upcoming' && !this.cancelByRef()[trip.ref];
  }

  cancelReceipt(ref: string): CancelReceipt | null {
    return this.cancelByRef()[ref] ?? null;
  }

  cancelTrip(trip: TravelTrip): void {
    if (!this.canCancel(trip)) {
      return;
    }
    void this.#api.cancel(this.apiBase(), trip.ref).then((receipt) => {
      this.cancelByRef.update((map) => ({ ...map, [trip.ref]: receipt }));
      this.trips.update((list) =>
        list.map((entry) =>
          entry.ref === trip.ref ? { ...entry, status: 'cancelled' as const } : entry,
        ),
      );
    });
  }

  tripTotalLabel(trip: TravelTrip): string {
    return this.formatPrice(trip.total, trip.currency || this.currency());
  }

  tripStatusLabel(status: TravelTrip['status']): string {
    switch (status) {
      case 'upcoming':
        return 'Próximo';
      case 'inprogress':
        return 'En curso';
      case 'completed':
        return 'Completado';
      case 'cancelled':
        return 'Cancelado';
    }
  }

  // ─── Start a fresh transaction after confirmation ────────────────────────────
  startOver(): void {
    this.#store.reset();
    this.offers.set([]);
    this.searched.set(false);
    this.guestName.set('');
    this.guestEmail.set('');
    this.orderRef.set('');
    this.confirmationCode.set('');
    this.confirmedVouchers.set([]);
    this.stay.set(null);
    this.errorMessage.set('');
    this.navigate('home');
    this.emitCartUpdate();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private criteriaFor(product: TravelProduct): Readonly<Record<string, unknown>> {
    switch (product) {
      case 'hotel':
        return {
          destination: this.hotelDestination().trim(),
          checkIn: this.hotelCheckIn(),
          checkOut: this.hotelCheckOut(),
          rooms: this.hotelRooms(),
          pax: paxCount(this.hotelRooms()),
        } satisfies HotelCriteria & { pax: number };
      case 'flight':
        return {
          origin: this.flightOrigin().trim(),
          destination: this.flightDestination().trim(),
          departDate: this.flightDepart(),
          returnDate: this.flightReturn(),
          rooms: this.flightRooms(),
          pax: paxCount(this.flightRooms()),
        } satisfies FlightCriteria & { pax: number };
      case 'car':
        return {
          location: this.carLocation().trim(),
          pickUp: this.carPickUp(),
          dropOff: this.carDropOff(),
        } satisfies CarCriteria;
    }
  }

  private datesValid(start: string, end: string, allowEqual = false): boolean {
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return false;
    }
    return allowEqual ? endTime >= startTime : endTime > startTime;
  }

  private toCredential(voucher: ConfirmedVoucher, orderRef: string): WalletCredential {
    return {
      id: voucher.reservationId || voucher.reference,
      kind: this.productLabel(voucher.product),
      title: voucher.title,
      subtitle: voucher.subtitle || undefined,
      reference: voucher.reservationId || voucher.reference,
      status: { label: 'Confirmada', tone: 'positive' },
      fields: [
        { label: 'Producto', value: this.productLabel(voucher.product) },
        { label: 'Localizador', value: voucher.reservationId || voucher.reference },
        { label: 'Orden', value: orderRef },
      ],
      qrData: voucher.reservationId || voucher.reference,
    };
  }

  private tripItemToCredential(trip: TravelTrip, item: TravelTrip['items'][number]): WalletCredential {
    const cancelled = this.cancelByRef()[trip.ref] || trip.status === 'cancelled';
    return {
      id: item.reservationId,
      kind: this.productLabel(item.product),
      title: item.title,
      subtitle: item.subtitle || undefined,
      reference: item.reservationId,
      status: cancelled
        ? { label: 'Cancelada', tone: 'negative' }
        : trip.status === 'completed'
          ? { label: 'Usada', tone: 'neutral' }
          : { label: 'Confirmada', tone: 'positive' },
      issuedAt: trip.startDate,
      fields: [
        { label: 'Viaje', value: trip.title },
        { label: 'Destino', value: trip.destination },
        { label: 'Localizador', value: item.reservationId },
      ],
      qrData: item.reservationId,
    };
  }

  /** Recompute aggregate pricing from the cart lines (single source of truth). */
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

  private emitCartUpdate(): void {
    const count = this.#store.itemCount();
    this.cartchange.emit(count);
    this.#bus.publish('cartUpdated', { count, total: this.cartTotalMinor() });
  }

  private compactPrice(amount: number, currency: string): string {
    const value = amount >= 1_000_000 ? `${Math.round(amount / 100_000) / 10}M` : `${Math.round(amount / 1000)}k`;
    void currency;
    return `$${value}`;
  }

  private metaString(meta: Readonly<Record<string, unknown>> | undefined, key: string): string {
    const value = meta?.[key];
    return typeof value === 'string' ? value : '';
  }

  private metaNumber(
    meta: Readonly<Record<string, unknown>> | undefined,
    key: string,
  ): number | undefined {
    const value = meta?.[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private metaStringArray(
    meta: Readonly<Record<string, unknown>> | undefined,
    key: string,
  ): readonly string[] {
    const value = meta?.[key];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private metaGeo(meta: Readonly<Record<string, unknown>> | undefined): TravelGeo | undefined {
    const value = meta?.['geo'];
    if (!isRecord(value)) {
      return undefined;
    }
    const lat = Number(value['lat']);
    const lng = Number(value['lng']);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  }

  private metaFares(
    meta: Readonly<Record<string, unknown>> | undefined,
  ): readonly FareFamily[] | undefined {
    const value = meta?.['fareFamilies'];
    return Array.isArray(value) ? (value as readonly FareFamily[]) : undefined;
  }

  private voucherString(
    detail: Readonly<Record<string, unknown>> | undefined,
    key: string,
  ): string {
    const value = detail?.[key];
    return typeof value === 'string' ? value : '';
  }

  private voucherProduct(detail: Readonly<Record<string, unknown>> | undefined): TravelProduct {
    const value = detail?.['product'];
    return value === 'flight' || value === 'car' ? value : 'hotel';
  }

  private voucherConfirmationCode(
    vouchers: readonly { detail?: Readonly<Record<string, unknown>> }[],
  ): string {
    const value = vouchers[0]?.detail?.['confirmationCode'];
    return typeof value === 'string' ? value : '';
  }

  private formatPrice(amount: number, currency: string): string {
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
}
