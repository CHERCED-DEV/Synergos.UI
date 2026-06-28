import type { SessionData, SessionItem } from '../models/session-data';

/**
 * The Strategy seam of the transaction engine.
 *
 * Ports NewShore's `JourneySelectionStrategyProvider` / `IStrategy<TReq,TRes>`
 * pattern (`NS.Booking.UI.SharedV2/.../contracts/`) and generalises it from
 * "how to pick a journey" to the **full transactional lifecycle**
 * `search → select → pay → confirm`, varied per niche **without `if`/forks**.
 *
 * Every transactional vertical (Booking / Tienda / Eventos / Propiedades /
 * Educación / Healthcare) provides one concrete `IFulfillmentStrategy`. The
 * `FulfillmentStrategyProvider` picks the right one from the current
 * `SessionData` (by `flow`/item kind); the `FulfillmentContext` is what
 * consumers call — they never know which strategy answered.
 *
 * Each method is async (returns a `Promise`) because real implementations call
 * server seams over HTTP. Stub strategies resolve from seeded data so the demo
 * works offline. The engine itself stays RxJS-free.
 */

/** A normalised search request handed to a strategy. */
export interface FulfillmentSearchQuery {
  /** Flow the search belongs to (`'booking'`, `'storefront'`, …). */
  readonly flow: string;
  /** Free-form, kind-specific search criteria (dates, destination, filters). */
  readonly criteria: Readonly<Record<string, unknown>>;
  /** ISO currency for price hints in results. */
  readonly currency?: string;
}

/**
 * A search result candidate — the pre-cart shape. Generalises NewShore's
 * `TravelProduct`. `selection` is the payload that becomes a `SessionItem`.
 */
export interface FulfillmentProduct<TSelection = Readonly<Record<string, unknown>>> {
  readonly productRef: string;
  readonly kind: string;
  readonly label: string;
  /** Unit price in minor units of the search currency. */
  readonly amount: number;
  /** Kind-specific payload carried forward into the cart line. */
  readonly selection: TSelection;
  /** Optional UI metadata (rating, badges, thumbnail…) — opaque to the engine. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** What a `select` produced — the cart line plus any reconciled pricing delta. */
export interface FulfillmentSelection {
  readonly item: SessionItem;
}

/** A request to put the selected items on hold + take payment for the whole cart. */
export interface FulfillmentPayRequest {
  readonly session: SessionData;
  /** Opaque PSP payload (token, instrument id, 3DS nonce…). */
  readonly instrument: Readonly<Record<string, unknown>>;
}

/** Outcome of a pay attempt. */
export interface FulfillmentPayResult {
  readonly accepted: boolean;
  /** Provider/PSP reference for the capture. */
  readonly reference?: string;
  /** Human-readable failure reason when `accepted` is false. */
  readonly reason?: string;
}

/** A confirmed line (voucher/PNR/e-ticket/enrolment) returned per item. */
export interface FulfillmentVoucher {
  readonly itemId: string;
  readonly reference: string;
  readonly status: string;
  /** Kind-specific confirmation detail (seat, QR, link…). */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** Aggregate confirmation for the whole cart. */
export interface FulfillmentConfirmation {
  readonly confirmed: boolean;
  readonly vouchers: readonly FulfillmentVoucher[];
  readonly reason?: string;
}

/**
 * The per-niche transactional behaviour. Implementations are pure behaviour
 * objects (no state) registered via DI multi-providers — `useExisting`/`useClass`
 * with `multi: true` on `FULFILLMENT_STRATEGIES`.
 */
export interface IFulfillmentStrategy {
  /** Stable id used for selection + diagnostics (`'booking'`, `'storefront'`, …). */
  readonly id: string;

  /**
   * Returns `true` if this strategy fulfils the given session/flow. The provider
   * uses this to pick exactly one strategy — keep it cheap and side-effect-free.
   */
  supports(session: SessionData): boolean;

  /** Step 1 — search the catalogue/availability for the query. */
  search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]>;

  /** Step 2 — turn a chosen product into a cart line (may hold inventory). */
  select(product: FulfillmentProduct, session: SessionData): Promise<FulfillmentSelection>;

  /** Step 3 — take a single payment for the whole cart. */
  pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult>;

  /** Step 4 — confirm every held line, returning a voucher per item. */
  confirm(session: SessionData): Promise<FulfillmentConfirmation>;
}

/**
 * Base class for concrete strategies. Implements `supports` against a declared
 * `flow` and forces subclasses to implement the four lifecycle steps. Extending
 * this is optional — any object satisfying `IFulfillmentStrategy` works — but it
 * removes the most common boilerplate (the `supports` check) and documents the
 * contract for each vertical.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class BookingFulfillmentStrategy extends FulfillmentStrategyBase {
 *   readonly id = 'booking';
 *   protected readonly flow = 'booking';
 *   readonly #api = inject(BookingApi);
 *   async search(q: FulfillmentSearchQuery) { return this.#api.search(q); }
 *   async select(p, s) { return { item: toItem(p) }; }
 *   async pay(r) { return this.#api.pay(r); }
 *   async confirm(s) { return this.#api.confirm(s); }
 * }
 * ```
 */
export abstract class FulfillmentStrategyBase implements IFulfillmentStrategy {
  /** Stable strategy id. */
  abstract readonly id: string;

  /** The `SessionData.flow` value this strategy claims. */
  protected abstract readonly flow: string;

  supports(session: SessionData): boolean {
    return session.flow === this.flow;
  }

  abstract search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]>;
  abstract select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection>;
  abstract pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult>;
  abstract confirm(session: SessionData): Promise<FulfillmentConfirmation>;
}
