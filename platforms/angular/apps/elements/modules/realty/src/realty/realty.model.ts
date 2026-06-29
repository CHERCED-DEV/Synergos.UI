/**
 * Domain model for the Propiedades vertical's <c>&lt;synergos-realty&gt;</c> — a real
 * estate marketplace portal (Zillow / Idealista / Metrocuadrado-style), the demand
 * side: search + map → property detail → mortgage → schedule visit / contact agent →
 * favorites.
 *
 * Caso especial del marco (propiedades-app-spec §1): la transacción central NO es un
 * pago. El "checkout" es **agendar una visita** (slot reservable del agente) y
 * **generar un lead** (captura de intención). Por eso este módulo no enruta por la
 * transaction-engine — persiste intención vía <c>RealtyApiClient</c> y calcula la
 * hipoteca puro en cliente.
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

/** The high-level phase / route the portal is in. */
export type RealtyView =
  | 'search' // split list + map (home del dominio)
  | 'pdp' // property detail
  | 'mortgage' // standalone mortgage calculator
  | 'favorites' // shortlist + compare
  | 'visit' // schedule-a-visit wizard
  | 'confirmation' // visit / lead confirmed
  | 'account'; // mis visitas / mis leads

/** Layout of the search results: list-only, map-only, or split. */
export type ResultsLayout = 'split' | 'list' | 'map';

/** Operation: venta (sale) vs arriendo (rent). */
export type Operation = 'sale' | 'rent';

/** Property type — CO-first taxonomy. */
export type PropertyType = 'apartamento' | 'casa' | 'lote' | 'oficina' | 'local';

/** Catalogue sort options for the results list. Maps 1:1 to the API `sort` param. */
export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'newest' | 'area-desc';

/** Listing lifecycle state (drives the "reservado/vendido" badge). */
export type ListingStatus = 'active' | 'reserved' | 'sold';

/** Visit modality. */
export type VisitMode = 'in-person' | 'video';

/** Visit lifecycle (motor: recurso reservable con hold-timeout). */
export type VisitStatus = 'held' | 'confirmed' | 'cancelled' | 'done' | 'no-show';

/** The schedule-a-visit wizard step. */
export type VisitStep = 'mode' | 'slot' | 'contact' | 'review';

// ─── Geo ──────────────────────────────────────────────────────────────────────

/** Geo position + human address of a listing (pre-seeded; no geocoder in demo). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
  readonly neighborhood: string;
  readonly city: string;
}

/** A viewport / bounding box of the map, handed to the search as geo-bounds. */
export interface MapBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

// ─── Specs (CO-specific: estrato, área privada/construida) ──────────────────────

/** Key specs of a property — Colombian market shape. */
export interface PropertySpecs {
  /** Bedrooms (habitaciones). */
  readonly beds: number;
  /** Bathrooms (baños). */
  readonly baths: number;
  /** Built area in m² (área construida). */
  readonly areaBuilt: number;
  /** Private area in m² (área privada). */
  readonly areaPrivate: number;
  /** Parking spaces (parqueaderos). */
  readonly parking: number;
  /** Socio-economic stratum 1–6 (estrato). */
  readonly stratum: number;
  /** Age in years (antigüedad). */
  readonly ageYears: number;
  /** Floor / level (piso). */
  readonly floor: number;
}

// ─── Listing ────────────────────────────────────────────────────────────────────

/**
 * One property card / summary as returned by `GET /api/realty/listings`. `price` is
 * in **major units** of `currency` (es-CO formatted in the view).
 */
export interface Listing {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly operation: Operation;
  readonly type: PropertyType;
  /** Price in major units (venta total / canon mensual de arriendo). */
  readonly price: number;
  readonly currency: string;
  readonly geo: GeoPoint;
  readonly specs: PropertySpecs;
  readonly status: ListingStatus;
  readonly featured: boolean;
  /** ISO date of publication. */
  readonly publishedAt: string;
  /** Lead/cover image URL (optional — view degrades to a placeholder). */
  readonly cover: string;
  /** Short freeform chips (e.g. "Nuevo", "Rebajado", "Estrato 4"). */
  readonly badges: readonly string[];
}

/** A selectable amenity/characteristic shown in the PDP. */
export interface Amenity {
  readonly key: string;
  readonly label: string;
}

/** A real estate agent / agency contact, surfaced in the agent-contact-card. */
export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly agency: string;
  readonly phone: string;
  readonly email: string;
  /** Avatar URL (optional — view degrades to initials). */
  readonly photo: string;
  readonly rating: number;
  readonly listingsCount: number;
}

/** The full PDP payload as returned by `GET /api/realty/listing/{id}`. */
export interface ListingDetail {
  readonly listing: Listing;
  readonly description: string;
  readonly specs: PropertySpecs;
  readonly amenities: readonly Amenity[];
  /** Gallery image URLs (optional — view degrades to placeholders). */
  readonly gallery: readonly string[];
  readonly location: GeoPoint;
  readonly agent: Agent;
}

// ─── Faceted search ──────────────────────────────────────────────────────────

/** A facet group (operación / tipo / habitaciones…) with selectable values. */
export interface Facet {
  /** Stable key used in the search query. */
  readonly key: string;
  readonly label: string;
  readonly values: readonly FacetValue[];
}

/** One selectable value within a facet group, with a result count. */
export interface FacetValue {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

/** `GET /api/realty/listings` response. */
export interface SearchResult {
  readonly listings: readonly Listing[];
  readonly facets: readonly Facet[];
  readonly total: number;
}

/** The active query the search drives with. */
export interface SearchCriteria {
  readonly q: string;
  readonly operation: Operation;
  readonly type: string;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly beds: number;
  readonly location: string;
  readonly sort: SortKey;
  /** Geo-bounds for "buscar al mover el mapa" (empty = whole catalogue). */
  readonly bounds?: MapBounds;
}

// ─── Visit (scheduling — reusable resource/hold of the motor) ───────────────────

/** Contact captured for a visit / lead. */
export interface ContactInfo {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

/** An available agent slot for a visit. */
export interface VisitSlot {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** HH:mm 24h. */
  readonly time: string;
}

/** `POST /api/realty/visit` request body. */
export interface VisitRequest {
  readonly listingId: string;
  readonly slot: VisitSlot;
  readonly contact: ContactInfo;
  readonly mode: VisitMode;
}

/** `POST /api/realty/visit` response — the booked visit. */
export interface Visit {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly slot: VisitSlot;
  readonly mode: VisitMode;
  readonly status: VisitStatus;
  readonly contact: ContactInfo;
}

// ─── Lead (degenerate confirm — intent without slot) ────────────────────────────

/** `POST /api/realty/lead` request body. */
export interface LeadRequest {
  readonly listingId: string;
  readonly contact: ContactInfo;
  readonly message: string;
}

/** `POST /api/realty/lead` response. */
export interface LeadResult {
  readonly leadId: string;
  readonly listingId: string;
  readonly status: string;
}

// ─── Mortgage (pure client-side, deterministic) ─────────────────────────────────

/** `POST /api/realty/mortgage` request body — also the pure-client input. */
export interface MortgageRequest {
  /** Property price in major units. */
  readonly price: number;
  /** Down payment in major units (cuota inicial). */
  readonly downPayment: number;
  /** Term in months (plazo). */
  readonly termMonths: number;
  /** Annual nominal rate as a percentage (tasa E.A. aprox), e.g. 12.5. */
  readonly annualRate: number;
}

/** One row of the amortization schedule. */
export interface AmortizationRow {
  readonly period: number;
  readonly payment: number;
  readonly principal: number;
  readonly interest: number;
  readonly balance: number;
}

/** Result of a mortgage scenario — `POST /api/realty/mortgage` response shape. */
export interface MortgageResult {
  /** Monthly payment (cuota fija) in major units. */
  readonly monthly: number;
  /** Total interest paid over the life of the loan, major units. */
  readonly totalInterest: number;
  /** Principal financed (price − down payment), major units. */
  readonly principal: number;
  /** Total paid (principal + interest), major units. */
  readonly totalPaid: number;
  /** Optional amortization schedule (first N rows for display). */
  readonly schedule?: readonly AmortizationRow[];
}
