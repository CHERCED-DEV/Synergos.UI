/**
 * Transaction-engine domain model — the **unified, multi-item cart** plus its
 * surrounding transactional state.
 *
 * Generalises NewShore's `Booking` aggregate (`NS.Booking.UI.SharedV2/.../session/
 * session.data.ts`) from an aviation-only PNR into a vertical-agnostic cart that
 * **every** transactional domain reuses (Booking / Tienda / Eventos / Propiedades /
 * Educación / Healthcare). NewShore modelled `journeys[]`; we model `items[]`
 * where each item is a heterogeneous line (flight ≈ hotel ≈ ticket ≈ course ≈
 * appointment) behind one total.
 *
 * Design rules ported from NewShore and adapted to our zoneless/signals world:
 *  - One serialisable state tree per transaction (no NgRx slice graph).
 *  - `CLEAN_*` constants give canonical empty states — a reset always starts from
 *    a known-clean value, never a half-wiped object.
 *  - `getValidSession` (in `SessionStore`) is defensive: corrupt/empty input
 *    collapses to `CLEAN_SESSION_DATA`.
 *
 * The model is intentionally **pure TS** (no Angular imports) so it can be shared,
 * serialised to `localStorage`, and round-tripped against the server API.
 */

/** ISO-8601 string (e.g. `2026-07-01T14:30:00Z`). Use UTC for anything wire-bound. */
export type IsoDateTime = string;

/** A timestamp paired with its UTC counterpart — NewShore's std/stdutc discipline. */
export interface DateTimePair {
  /** Local/display value as authored. */
  readonly local: IsoDateTime;
  /** Authoritative UTC value for comparisons and the wire. */
  readonly utc: IsoDateTime;
}

/** The coarse lifecycle of a transactional session. */
export type SessionStatus =
  /** Empty / never started. */
  | 'empty'
  /** User is building the cart (selecting items). */
  | 'building'
  /** All items held; awaiting payment. */
  | 'held'
  /** Payment in flight. */
  | 'paying'
  /** Fully confirmed (vouchers issued). */
  | 'confirmed'
  /** Expired by TTL or hold-timeout. */
  | 'expired'
  /** Cancelled by the user or by a failed orchestration. */
  | 'cancelled';

/** Per-line discriminator. Open string union — each vertical adds its own kinds. */
export type SessionItemKind = string;

/**
 * One heterogeneous line in the unified cart.
 *
 * `kind` is the polymorphism axis (`'flight' | 'hotel' | 'ticket' | 'course' | …`).
 * `selection` carries the kind-specific payload (fare+seats / room+rate / seat+tier /
 * enrolment) as an opaque record — the engine never inspects it; the domain strategy
 * does. `holdRef` + `expiresAt` model NewShore's per-item hold-timeout.
 */
export interface SessionItem<TSelection = Readonly<Record<string, unknown>>> {
  /** Stable, unique id within the session (dedup + idempotent re-add key). */
  readonly id: string;
  /** Polymorphic line kind chosen by the fulfilling vertical. */
  readonly kind: SessionItemKind;
  /** Catalogue/product reference this line was created from. */
  readonly productRef: string;
  /** Human label for cart/summary rows. */
  readonly label: string;
  /** Kind-specific selection payload — opaque to the engine. */
  readonly selection: TSelection;
  /** Line subtotal in minor units of `Pricing.currency` (e.g. cents/centavos). */
  readonly amount: number;
  /** How many units of this line (default 1). */
  readonly quantity: number;
  /** Provider hold reference, if the line is on hold. */
  readonly holdRef?: string;
  /** Hold-timeout / line expiry; `undefined` when not held. */
  readonly expiresAt?: IsoDateTime;
}

/**
 * Multi-axis price breakdown — directly inspired by NewShore's
 * `pricing.breakdown` (perBooking / perPax / perSegment …). Generalised to named
 * buckets so any vertical with line-items can describe its total.
 */
export interface PriceLine {
  /** Bucket key (`'base' | 'taxes' | 'fees' | 'addon:insurance' | …`). */
  readonly code: string;
  /** Display label. */
  readonly label: string;
  /** Amount in minor units (can be negative for discounts). */
  readonly amount: number;
}

/** Aggregate pricing for the whole cart. Consumed by `IPriceFormatter` (es-CO). */
export interface Pricing {
  /** ISO-4217 currency (e.g. `COP`, `USD`). */
  readonly currency: string;
  /** Grand total in minor units. */
  readonly totalAmount: number;
  /** What is still owed (total − payments captured). */
  readonly balanceDue: number;
  /** Itemised breakdown lines. Sum should equal `totalAmount`. */
  readonly breakdown: readonly PriceLine[];
}

/** A traveller/customer captured once and reused across items in the cart. */
export interface SessionParty {
  readonly id: string;
  readonly fullName: string;
  readonly email?: string;
  /** Free-form, kind-specific details (document, phone, dietary…). */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** A recorded payment attempt/capture against the session total. */
export interface SessionPayment {
  readonly id: string;
  /** Captured amount in minor units. */
  readonly amount: number;
  /** PSP/provider identifier. */
  readonly provider: string;
  readonly status: 'pending' | 'captured' | 'failed' | 'refunded';
  readonly reference?: string;
}

/**
 * The root aggregate persisted per transaction. One serialisable tree; sub-slices
 * are optional and default to clean/empty values.
 */
export interface SessionData {
  /** Opaque id correlating local state with the server session. */
  readonly sessionId: string;
  /** Which transactional flow is running (`'booking' | 'storefront' | …`). */
  readonly flow: string;
  /** Coarse lifecycle status. */
  readonly status: SessionStatus;
  /** The unified multi-item cart. */
  readonly items: readonly SessionItem[];
  /** Aggregate pricing. */
  readonly pricing: Pricing;
  /** Parties (travellers/customers) reused across items. */
  readonly parties: readonly SessionParty[];
  /** Payment records. */
  readonly payments: readonly SessionPayment[];
  /** Epoch ms when the session was created. */
  readonly createdAt: number;
  /** Epoch ms of the last mutation. */
  readonly updatedAt: number;
  /** Epoch ms when the whole session expires (TTL). */
  readonly expiresAt: number;
  /** Owning tab id — multi-tab guard (see `SessionStore`). */
  readonly tabId?: string;
}

/** Canonical empty pricing. */
export const CLEAN_PRICING: Pricing = {
  currency: 'COP',
  totalAmount: 0,
  balanceDue: 0,
  breakdown: [],
};

/**
 * Canonical empty session. Every reset / corrupt-recovery path returns this so the
 * engine never operates on a half-cleared tree (NewShore `CLEAN_SESSION_DATA`).
 */
export const CLEAN_SESSION_DATA: SessionData = {
  sessionId: '',
  flow: '',
  status: 'empty',
  items: [],
  pricing: CLEAN_PRICING,
  parties: [],
  payments: [],
  createdAt: 0,
  updatedAt: 0,
  expiresAt: 0,
};
