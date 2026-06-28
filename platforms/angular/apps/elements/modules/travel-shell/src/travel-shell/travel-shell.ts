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
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { TravelApiClient } from './travel-api.client';
import {
  TRAVEL_FLOW,
  TRAVEL_PRODUCTS,
  type CarCriteria,
  type FlightCriteria,
  type HotelCriteria,
  type PaxRoom,
  type TravelGuest,
  type TravelOffer,
  type TravelProduct,
} from './travel.model';

/**
 * Runtime config for the CMS element <c>elementSynTravelShell</c>.
 *
 * The Booking vertical as a real multi-product travel app (Hoteles · Vuelos ·
 * Autos), reusing the shared <c>@synergos/transaction-engine</c> for the unified
 * cart, single checkout and cross-island coordination.
 */
export interface TravelShellRuntimeConfig {
  /** Base URL of the travel API. Default `/api/travel`. */
  readonly apiBase?: string;
  /** ISO currency for price display. Default `COP`. */
  readonly currency?: string;
  /** Storage scope for the session (typically the siteRoot). Default `travel`. */
  readonly scope?: string;
}

/** The high-level phase the shell is in. */
export type TravelPhase = 'shop' | 'checkout' | 'confirmation';

/** Typed event map for the transaction bus (wizard ↔ cart ↔ checkout ↔ IA). */
interface TravelBus extends Record<string, unknown> {
  readonly cartUpdated: { readonly count: number; readonly total: number };
  readonly bookingconfirmed: { readonly orderRef: string; readonly code: string };
}

const DEFAULT_API_BASE = '/api/travel';
const DEFAULT_CURRENCY = 'COP';
const DEFAULT_SCOPE = 'travel';
const SESSION_TTL_MS = 30 * 60 * 1000;

function sanitizeConfig(value: Partial<TravelShellRuntimeConfig>): TravelShellRuntimeConfig {
  return omitUndefinedProperties<TravelShellRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    scope: coerceTrimmedStringInput(value.scope),
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

let travelShellInstanceId = 0;

@Component({
  selector: 'sg-travel-shell',
  standalone: true,
  imports: [],
  templateUrl: './travel-shell.html',
  styleUrl: './travel-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-pax-selector> …).
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

  readonly instanceId = (travelShellInstanceId += 1);
  readonly fieldId = `syn-travel-shell-${this.instanceId}`;
  readonly products = TRAVEL_PRODUCTS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly cartchange = output<number>();
  readonly bookingconfirmed = output<{ orderRef: string; code: string }>();

  // ─── UI state ───────────────────────────────────────────────────────────────
  readonly phase = signal<TravelPhase>('shop');
  readonly activeProduct = signal<TravelProduct>('hotel');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly cartOpen = signal(false);

  // Search criteria — hotel
  readonly hotelDestination = signal('');
  readonly hotelCheckIn = signal('');
  readonly hotelCheckOut = signal('');
  readonly hotelRooms = signal<readonly PaxRoom[]>([{ adults: 2, childAges: [] }]);

  // Search criteria — flight
  readonly flightOrigin = signal('');
  readonly flightDestination = signal('');
  readonly flightDepart = signal('');
  readonly flightReturn = signal('');
  readonly flightRooms = signal<readonly PaxRoom[]>([{ adults: 1, childAges: [] }]);

  // Search criteria — car
  readonly carLocation = signal('');
  readonly carPickUp = signal('');
  readonly carDropOff = signal('');

  // Results
  readonly offers = signal<readonly TravelOffer[]>([]);
  readonly searched = signal(false);

  // Checkout
  readonly guestName = signal('');
  readonly guestEmail = signal('');
  readonly orderRef = signal('');
  readonly confirmationCode = signal('');
  readonly confirmedVouchers = signal<readonly { title: string; reference: string }[]>([]);

  // ─── Derived cart state (from the engine store) ─────────────────────────────
  readonly cartItems = this.#store.items;
  readonly cartCount = this.#store.itemCount;
  readonly hasCart = this.#store.hasItems;
  readonly cartTotalMinor = computed(() => this.#store.pricing().totalAmount);
  readonly cartTotalLabel = computed(() =>
    this.formatPrice(this.cartTotalMinor() / 100, this.#store.pricing().currency || this.currency()),
  );
  readonly degraded = computed(() => {
    // Recompute on each search/checkout; the flag is set by the API client.
    void this.searched();
    void this.phase();
    return this.#api.degraded;
  });

  readonly liveConflict = this.#store.liveSessionConflict;

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

  readonly guestNameValid = computed(() => this.guestName().trim().length >= 2);
  readonly guestEmailValid = computed(() => /.+@.+\..+/.test(this.guestEmail().trim()));
  readonly guestValid = computed(() => this.guestNameValid() && this.guestEmailValid());

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

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(cartWidget);
      this.#bus.destroy();
    });
  }

  // ─── Product tabs ────────────────────────────────────────────────────────────
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
        return 'Hoteles';
      case 'flight':
        return 'Vuelos';
      case 'car':
        return 'Autos';
    }
  }

  productIcon(product: TravelProduct): string {
    switch (product) {
      case 'hotel':
        return '\u{1F3E8}';
      case 'flight':
        return '\u{2708}\u{FE0F}';
      case 'car':
        return '\u{1F697}';
    }
  }

  // ─── Pax-selector bridges ────────────────────────────────────────────────────
  onHotelOccupancyChange(event: Event): void {
    this.hotelRooms.set(normalizeRooms((event as CustomEvent<unknown>).detail));
  }

  onFlightOccupancyChange(event: Event): void {
    this.flightRooms.set(normalizeRooms((event as CustomEvent<unknown>).detail));
  }

  // ─── Native input bindings ───────────────────────────────────────────────────
  bind(setter: (value: string) => void): (event: Event) => void {
    return (event: Event) => setter((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ─── Step 1 → 2: search the active product ───────────────────────────────────
  search(): void {
    if (!this.canSearch() || this.loading()) {
      return;
    }
    const product = this.activeProduct();
    const criteria = this.criteriaFor(product);

    this.loading.set(true);
    this.errorMessage.set('');
    this.searched.set(true);

    // Dedup concurrent identical searches via the orchestrator.
    const requestId = `search:${product}:${JSON.stringify(criteria)}`;
    this.#orchestrator
      .callApi(requestId, () =>
        this.#fulfillment.search({
          flow: TRAVEL_FLOW,
          currency: this.currency(),
          criteria: { product, apiBase: this.apiBase(), criteria },
        }),
      )
      .then((products) => {
        this.offers.set(
          products.map((entry) => ({
            offerId: entry.productRef,
            product,
            title: entry.label,
            subtitle: this.metaString(entry.meta, 'subtitle'),
            amount: entry.amount,
            currency: this.metaString(entry.meta, 'currency') || this.currency(),
            badges: this.metaStringArray(entry.meta, 'badges'),
            detail: entry.selection,
          })),
        );
        this.loading.set(false);
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set('No pudimos buscar disponibilidad. Intenta de nuevo.');
        void error;
      });
  }

  // ─── Step 2: add an offer to the unified cart ────────────────────────────────
  addToCart(offer: TravelOffer): void {
    const session = this.#store.getValidSession();
    void this.#fulfillment
      .select(
        {
          productRef: offer.offerId,
          kind: offer.product,
          label: offer.title,
          amount: offer.amount,
          selection: { ...offer.detail, subtitle: offer.subtitle, currency: offer.currency },
          meta: { subtitle: offer.subtitle, badges: offer.badges },
        },
        session,
      )
      .then((selection) => {
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

  itemLabel(item: SessionItem): string {
    return item.label;
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

  toggleCart(): void {
    this.cartOpen.update((open) => !open);
  }

  // ─── Cart → checkout ─────────────────────────────────────────────────────────
  goToCheckout(): void {
    if (!this.hasCart()) {
      return;
    }
    this.errorMessage.set('');
    this.phase.set('checkout');
    this.cartOpen.set(false);
  }

  backToShop(): void {
    this.phase.set('shop');
    this.errorMessage.set('');
  }

  // ─── Single payment for the whole cart ───────────────────────────────────────
  pay(): void {
    if (!this.guestValid() || !this.hasCart() || this.loading()) {
      return;
    }
    const guest: TravelGuest = { name: this.guestName().trim(), email: this.guestEmail().trim() };
    this.loading.set(true);
    this.errorMessage.set('');
    this.#store.setStatus('paying');

    const session = this.#store.getValidSession();
    // FulfillmentContext routes pay → confirm to the travel strategy.
    this.#fulfillment
      .pay({ session, instrument: { apiBase: this.apiBase(), guest } })
      .then((result) => {
        if (!result.accepted || !result.reference) {
          throw new Error('payment-rejected');
        }
        this.orderRef.set(result.reference);
        // Record the order ref on the session so confirm() can read it.
        const paid = {
          ...this.#store.getValidSession(),
          payments: [
            {
              id: `pay-${Date.now().toString(36)}`,
              amount: this.cartTotalMinor(),
              provider: 'travel-psp',
              status: 'captured' as const,
              reference: result.reference,
            },
          ],
          status: 'paying' as const,
        };
        this.#store.setSession(paid);
        return this.#fulfillment.confirm(this.#store.getValidSession());
      })
      .then((confirmation) => {
        if (!confirmation.confirmed) {
          throw new Error('not-confirmed');
        }
        this.confirmationCode.set(confirmation.vouchers[0]?.reference || this.orderRef());
        this.confirmedVouchers.set(
          confirmation.vouchers.map((voucher) => ({
            title: this.voucherTitle(voucher.detail),
            reference: voucher.reference,
          })),
        );
        this.#store.setStatus('confirmed');
        this.loading.set(false);
        this.phase.set('confirmation');
        const payload = { orderRef: this.orderRef(), code: this.confirmationCode() };
        this.bookingconfirmed.emit(payload);
        this.#bus.publish('bookingconfirmed', payload);
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set('No pudimos completar el pago. Intenta de nuevo.');
        this.#store.setStatus('building');
        void error;
      });
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
    this.errorMessage.set('');
    this.phase.set('shop');
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
        } satisfies HotelCriteria;
      case 'flight':
        return {
          origin: this.flightOrigin().trim(),
          destination: this.flightDestination().trim(),
          departDate: this.flightDepart(),
          returnDate: this.flightReturn(),
          rooms: this.flightRooms(),
        } satisfies FlightCriteria;
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

  private metaString(meta: Readonly<Record<string, unknown>> | undefined, key: string): string {
    const value = meta?.[key];
    return typeof value === 'string' ? value : '';
  }

  private metaStringArray(
    meta: Readonly<Record<string, unknown>> | undefined,
    key: string,
  ): readonly string[] {
    const value = meta?.[key];
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  }

  private voucherTitle(detail: Readonly<Record<string, unknown>> | undefined): string {
    const value = detail?.['title'];
    return typeof value === 'string' ? value : 'Reserva';
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
