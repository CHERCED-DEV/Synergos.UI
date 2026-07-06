/**
 * Domain model for the Booking vertical's <c>&lt;synergos-travel-shell&gt;</c> —
 * **travel-shell v2**: a full multi-page travel app (Estadías · Vuelos · Autos)
 * faithful to a real OTA (búsqueda por producto → resultados ricos → ficha →
 * carrito multi-ítem → checkout único → mis viajes), rebuilt as a consumer of the
 * shared shell catalogue `@synergos/shells` (SH-1/2/3/4/8/10) over the
 * `@synergos/transaction-engine`.
 *
 * The app speaks three product languages on the search/results side (hotel geo,
 * flight fare families, car categories), but funnels every add into the engine's
 * vertical-agnostic <c>SessionItem[]</c> cart behind a single <c>Pricing</c>, then
 * a single checkout. These types describe only the pre-cart, product-specific
 * shapes; once an offer is chosen it becomes an opaque <c>SessionItem.selection</c>
 * the engine never inspects.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The three travel products the app sells. Maps 1:1 to a `SessionItemKind`. */
export type TravelProduct = 'hotel' | 'flight' | 'car';

/** The flow id the engine routes on — one strategy owns it. */
export const TRAVEL_FLOW = 'travel';

/** All products, in tab order. */
export const TRAVEL_PRODUCTS: readonly TravelProduct[] = ['hotel', 'flight', 'car'];

/** A `SessionItem.kind` is just the product id for travel lines. */
export function productToKind(product: TravelProduct): SessionItemKind {
  return product;
}

/**
 * The high-level page / route the app is in (hash deep-linkable under
 * `#/<scope>/…`). travel-shell v2 is a multi-page SPA, not a 3-step wizard.
 */
export type TravelView =
  | 'home' // multi-tab search (Estadías · Vuelos · Autos)
  | 'flights' // flight results + fare families + seat map
  | 'stays' // stay results (SH-8 list↔map)
  | 'stay' // one stay's rich detail (SH-2) → room × rate
  | 'cart' // travel cart (multi-ítem: hotel + vuelo + auto)
  | 'checkout' // SH-3 wizard over the engine
  | 'confirmation' // SH-10 credential wallet (voucher + PNR)
  | 'account'; // SH-4: mis viajes + timeline + cancelar + wallet

/** Account sections rendered inside SH-4. */
export type TravelAccountSection = 'viajes' | 'credenciales' | 'perfil';

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

// ─── Geo (SH-8 results map) ───────────────────────────────────────────────────

/** A geographic coordinate (decimal degrees). Aligns with SH-8's `GeoPoint`. */
export interface TravelGeo {
  readonly lat: number;
  readonly lng: number;
}

// ─── Fare families (flights) ─────────────────────────────────────────────────

/**
 * One purchasable fare family on a flight option (Basic / Classic / Flex), each
 * with its own total price and included perks. The user picks one before seats.
 */
export interface FareFamily {
  readonly id: string;
  readonly label: string;
  /** Total price for the fare in major units of `currency`. */
  readonly amount: number;
  readonly currency: string;
  /** Included perks ("Equipaje de mano", "Cambios sin costo"…). */
  readonly perks: readonly string[];
  /** Marketing highlight ("Más popular"). */
  readonly badge?: string;
}

// ─── Offers (normalised result shape) ────────────────────────────────────────

/**
 * A normalised offer card. The app renders these per product; `product` drives
 * the product-specific metadata shown and the `kind` of the resulting cart line.
 *
 * Product-specific extras are optional so the one shape carries all three:
 *  - `geo` — hotels (SH-8 map pin);
 *  - `fareFamilies` — flights (fare selection before seats);
 *  - `stayId` — hotels (deep-link to the SH-2 rich detail).
 */
export interface TravelOffer {
  readonly offerId: string;
  readonly product: TravelProduct;
  /** Primary headline (hotel name / route / car model). */
  readonly title: string;
  /** Secondary line (board / cabin & duration / category & transmission). */
  readonly subtitle: string;
  /** Lead price in major units of `currency` (es-CO formatted in the view). */
  readonly amount: number;
  readonly currency: string;
  /** Short freeform detail chips (e.g. "Reembolsable", "Equipaje incluido"). */
  readonly badges: readonly string[];
  /** Hotel geo for the SH-8 map (omitted for flights/cars). */
  readonly geo?: TravelGeo;
  /** Flight fare families (omitted for hotels/cars). */
  readonly fareFamilies?: readonly FareFamily[];
  /** Hotel stay id to open the SH-2 rich detail (defaults to `offerId`). */
  readonly stayId?: string;
  /** Star rating (hotels) for the card. */
  readonly rating?: number;
  /** Carried into the cart line untouched (opaque to the engine). */
  readonly detail: Readonly<Record<string, unknown>>;
}

// ─── Stay detail (SH-2 rich ficha) ────────────────────────────────────────────

/** One selectable room × rate on the stay detail page. */
export interface StayRate {
  readonly id: string;
  /** Room name ("Habitación Deluxe · Vista al mar"). */
  readonly roomLabel: string;
  /** Rate plan ("Tarifa flexible · Desayuno incluido"). */
  readonly rateLabel: string;
  /** Total price for the whole stay in major units. */
  readonly amount: number;
  readonly currency: string;
  readonly refundable: boolean;
  /** Included perks for this rate. */
  readonly perks: readonly string[];
}

/** `GET /api/travel/stay/{id}` — the rich ficha payload for SH-2. */
export interface StayDetail {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly address: string;
  readonly rating: number;
  readonly reviewCount: number;
  readonly currency: string;
  readonly images: readonly string[];
  readonly amenities: readonly string[];
  /** Label/value specs (check-in, políticas…). */
  readonly specs: readonly StaySpec[];
  readonly rates: readonly StayRate[];
  readonly geo?: TravelGeo;
}

/** One label/value row on the stay's specs panel. */
export interface StaySpec {
  readonly label: string;
  readonly value: string;
}

// ─── Seat map (flights) ───────────────────────────────────────────────────────

/**
 * The `<synergos-seat-map>` layout payload (JSON serialised into the `seatmap`
 * attribute). Kept loose — the seat-map element normalises it defensively.
 */
export interface SeatMapPayload {
  readonly rows: readonly SeatMapRow[];
  readonly aisleAfterColumns?: number;
}

export interface SeatMapRow {
  readonly rowNumber: number;
  readonly seats: readonly SeatMapSeat[];
}

export interface SeatMapSeat {
  readonly id: string;
  readonly type: 'window' | 'aisle' | 'middle' | 'extra-legroom';
  readonly available: boolean;
  readonly price: number;
}

// ─── Checkout contract (API) ─────────────────────────────────────────────────

/** Traveler contact captured once for the whole cart. */
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

/**
 * One confirmed line in the confirmation summary. Carries the per-item
 * `reservationId` (PNR / voucher code) surfaced in the SH-10 wallet.
 */
export interface TravelConfirmedItem {
  readonly product: TravelProduct;
  readonly title: string;
  readonly reference: string;
  /** Per-item verifiable reservation id (PNR / voucher). Defaults to `reference`. */
  readonly reservationId: string;
  readonly subtitle?: string;
}

// ─── Mis viajes (account) ─────────────────────────────────────────────────────

/** Coarse lifecycle status of a trip. */
export type TripStatus = 'upcoming' | 'inprogress' | 'completed' | 'cancelled';

/** One trip line from `GET /api/travel/trips?traveler=`. */
export interface TravelTrip {
  readonly ref: string;
  readonly title: string;
  readonly destination: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: TripStatus;
  readonly total: number;
  readonly currency: string;
  /** The booked items (hotel + flight + car) with their reservation ids. */
  readonly items: readonly TravelTripItem[];
}

/** One booked item inside a trip (feeds the SH-10 wallet + timeline). */
export interface TravelTripItem {
  readonly product: TravelProduct;
  readonly title: string;
  readonly subtitle: string;
  readonly reservationId: string;
}

/** `POST /api/travel/order/{ref}/cancel` response. */
export interface CancelReceipt {
  readonly ref: string;
  readonly status: 'cancelled' | 'pending';
  readonly refundLabel?: string;
}
