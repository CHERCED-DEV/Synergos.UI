/**
 * Domain model for the Booking vertical's <c>&lt;synergos-travel-shell&gt;</c> —
 * a multi-product travel app (Hoteles · Vuelos · Autos), faithful to NewShore's
 * multi-product cart.
 *
 * The shell speaks three product languages on the search/results side, but funnels
 * everything into the engine's vertical-agnostic <c>SessionItem[]</c> cart behind a
 * single <c>Pricing</c>, then a single checkout. These types describe only the
 * pre-cart, product-specific shapes; once an offer is chosen it becomes an opaque
 * <c>SessionItem.selection</c> the engine never inspects.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The three travel products the shell sells. Maps 1:1 to a `SessionItemKind`. */
export type TravelProduct = 'hotel' | 'flight' | 'car';

/** The flow id the engine routes on — one strategy owns it. */
export const TRAVEL_FLOW = 'travel';

/** All products, in tab order. */
export const TRAVEL_PRODUCTS: readonly TravelProduct[] = ['hotel', 'flight', 'car'];

/** A `SessionItem.kind` is just the product id for travel lines. */
export function productToKind(product: TravelProduct): SessionItemKind {
  return product;
}

// ─── Search criteria (per product) ───────────────────────────────────────────

/** Occupancy as emitted by `<synergos-pax-selector>` (rooms → adults + child ages). */
export interface PaxRoom {
  readonly adults: number;
  readonly childAges: readonly number[];
}

/** Hotel search: destination + stay dates + occupancy. */
export interface HotelCriteria {
  readonly destination: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly rooms: readonly PaxRoom[];
}

/** Flight search: O&D + travel dates + occupancy. */
export interface FlightCriteria {
  readonly origin: string;
  readonly destination: string;
  readonly departDate: string;
  readonly returnDate: string;
  readonly rooms: readonly PaxRoom[];
}

/** Car search: pickup location + rental window. */
export interface CarCriteria {
  readonly location: string;
  readonly pickUp: string;
  readonly dropOff: string;
}

export type TravelCriteria = HotelCriteria | FlightCriteria | CarCriteria;

// ─── Offers (normalised result shape) ────────────────────────────────────────

/**
 * A normalised offer card. The shell renders these uniformly; `product` drives the
 * product-specific metadata shown and the `kind` of the resulting cart line.
 */
export interface TravelOffer {
  readonly offerId: string;
  readonly product: TravelProduct;
  /** Primary headline (hotel name / route / car model). */
  readonly title: string;
  /** Secondary line (board / cabin & duration / category & transmission). */
  readonly subtitle: string;
  /** Total price in major units of `currency` (es-CO formatted in the view). */
  readonly amount: number;
  readonly currency: string;
  /** Short freeform detail chips (e.g. "Reembolsable", "Equipaje incluido"). */
  readonly badges: readonly string[];
  /** Carried into the cart line untouched (opaque to the engine). */
  readonly detail: Readonly<Record<string, unknown>>;
}

// ─── Checkout contract (API) ─────────────────────────────────────────────────

/** Guest contact captured once for the whole cart. */
export interface TravelGuest {
  readonly name: string;
  readonly email: string;
}

/** One line in the checkout request body. */
export interface TravelCheckoutLine {
  readonly product: TravelProduct;
  readonly offerId: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** `POST /api/travel/checkout` response — opens a single PSP session for the cart. */
export interface TravelCheckoutResult {
  readonly orderRef: string;
  readonly paymentSessionId: string;
  readonly amount: number;
  readonly currency: string;
}

/** `POST /api/travel/confirm` response — the unified confirmation. */
export interface TravelConfirmation {
  readonly status: string;
  readonly confirmationCode: string;
  readonly items: readonly TravelConfirmedItem[];
}

/** One confirmed line in the confirmation summary. */
export interface TravelConfirmedItem {
  readonly product: TravelProduct;
  readonly title: string;
  readonly reference: string;
}
