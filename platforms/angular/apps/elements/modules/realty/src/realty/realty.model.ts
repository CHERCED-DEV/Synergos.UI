/**
 * Domain model for the Propiedades vertical's <c>&lt;synergos-realty&gt;</c> — a real
 * estate marketplace portal (Zillow + Idealista + Metrocuadrado, doc 21 §2.7 +
 * `deep-research/propiedades.md`) rebuilt **v2** as a role-switch, hash-routed
 * multi-page SPA that consumes the reusable shell catalogue `@synergos/shells`:
 *
 *  - **DEMANDA (público):** SH-1 discovery + **SH-8 lista↔mapa** (facetas es-CO:
 *    operación · tipo · precio · habitaciones · ciudad/estrato; geo del API) →
 *    SH-2 ficha (galería/lightbox · specs · mapa · vecindario · **calculadora de
 *    hipoteca** en el slot del CTA) → **agendar visita** (motor, recurso reservable
 *    con hold, **SIN pago**) + **contactar/lead** → SH-4 cuenta (favoritos+comparar,
 *    búsquedas guardadas+alertas, mis visitas, mensajes SH-7).
 *  - **AGENTE (role-switch):** SH-5 consola (cartera KPIs, listados, leads mini-CRM,
 *    agenda de visitas, analítica) + SH-6 publicar inmueble (datos→fotos→precio→
 *    ubicación/pin→publicar).
 *
 * Caso especial del marco (spec §1): la transacción central NO es un pago. El
 * "checkout" es **agendar una visita** (slot reservable del agente vía el motor,
 * con el paso de pago APAGADO — valida la generalidad del engine) y **generar un
 * lead** (captura de intención, confirm degenerado sin slot). La hipoteca se
 * calcula puro en cliente, determinista.
 *
 * Pure TS (no Angular imports besides the engine's `SessionItemKind` type) so it
 * can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The flow id the engine routes on — one strategy owns it. */
export const REALTY_FLOW = 'realty';

/** Every realty cart line is a `visit` (a reservable agent slot). */
export const REALTY_KIND: SessionItemKind = 'visit';

/** Which cara of the app the user is on (role-switch). */
export type RealtyRole = 'demand' | 'agent';

/**
 * The high-level phase / route within the DEMANDA cara (drives the hash router
 * `#/realty/...`).
 */
export type RealtyView =
  | 'search' // SH-1 + SH-8 split list↔map (home del dominio)
  | 'pdp' // SH-2 property detail (gallery · specs · map · neighborhood · mortgage)
  | 'mortgage' // standalone mortgage calculator
  | 'visit' // schedule-a-visit wizard (motor, pago OFF)
  | 'confirmation' // visit / lead confirmed
  | 'account'; // SH-4: favoritos+comparar · búsquedas guardadas · mis visitas · mensajes

/**
 * The section within the AGENTE cara. Rendered inside the SH-5 console-shell as
 * its active section; `publish` swaps to the SH-6 authoring wizard.
 */
export type AgentView =
  | 'portfolio' // cartera: listados publicados (tabla + KPIs)
  | 'leads' // mini-CRM: leads entrantes (tabla + estado)
  | 'agenda' // agenda de visitas próximas
  | 'analytics' // analítica del embudo (KPIs + reporte)
  | 'publish'; // SH-6 authoring wizard: publicar inmueble

/** Layout of the search results: list-only, map-only, or split (SH-8). */
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

/** Lead lifecycle in the agent mini-CRM (kanban-lite). */
export type LeadStatus = 'new' | 'contacted' | 'visit' | 'won' | 'lost';

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

/** One point of interest / stat of the neighborhood (SH-2 vecindario block). */
export interface NeighborhoodPoint {
  readonly label: string;
  readonly value: string;
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
  /** Neighborhood stats/points (colegios, transporte, walk-score…). */
  readonly neighborhood: readonly NeighborhoodPoint[];
}

// ─── Faceted search ──────────────────────────────────────────────────────────

/** A facet group (operación / tipo / habitaciones…) with selectable values. */
export interface Facet {
  /** Stable key used in the search query. */
  readonly key: string;
  readonly label: string;
  readonly values: readonly FacetValue[];
  /**
   * Cómo se comporta la faceta al filtrar (`MultiSelect` | `SingleSelect` | `Threshold` |
   * `Range`), tal como la declara el descriptor del backend. El shell decide con esto si
   * pinta checkboxes o radios. Ausente = `MultiSelect`.
   */
  readonly kind?: string;
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

// ─── Visit (scheduling — reusable resource/hold of the motor, pago OFF) ──────────

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

/** The buyer's chosen visit before it becomes a cart `SessionItem`. */
export interface VisitSelectionPayload {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly slot: VisitSlot;
  readonly mode: VisitMode;
  readonly contact: ContactInfo;
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

// ─── Saved searches + alerts (P11 — SH-4 cuenta) ────────────────────────────────

/**
 * A saved search with an optional alert. `GET /api/realty/saved?user=` returns
 * these; `POST /api/realty/saved-search` creates one. `newMatches` is the count of
 * listings that matched since the alert was last seen (scheduled `Match` seam).
 */
export interface SavedSearch {
  readonly id: string;
  /** Human summary of the criteria ("Apartamentos en Chicó, venta, 3+ hab"). */
  readonly label: string;
  readonly operation: Operation;
  /** New matches since last seen (drives the alert badge). */
  readonly newMatches: number;
  /** ISO date the search was saved. */
  readonly createdAt: string;
  /** Whether an email/push alert is on. */
  readonly alert: boolean;
}

/** `GET /api/realty/saved?user=` response. */
export interface SavedResult {
  readonly searches: readonly SavedSearch[];
  /**
   * Los favoritos del member tal como los tiene el SERVIDOR. El backend siempre los
   * emitía; el cliente los tiraba, y por eso un favorito no volvía nunca al recargar.
   *
   * OPCIONAL a propósito, y la diferencia importa: `undefined` significa "esta respuesta
   * no trae la verdad" (el fallback degradado) y la UI conserva lo que ya tenía; `[]`
   * significa "el servidor dice que no tienes ninguno" y la UI vacía. Degradar por
   * AUSENCIA, nunca por NEGACIÓN (ADR 0112).
   */
  readonly favorites?: readonly string[];
}

/** `POST /api/realty/saved-search` request body. */
export interface SavedSearchRequest {
  readonly label: string;
  readonly operation: Operation;
  readonly criteria: SearchCriteria;
  readonly alert: boolean;
}

// ─── Agent cara (SH-5 console + SH-6 authoring) ─────────────────────────────────

/** One listing row in the agent's cartera (SH-5 portfolio table). */
export interface PortfolioListing {
  readonly id: string;
  readonly title: string;
  readonly operation: Operation;
  readonly price: number;
  readonly currency: string;
  readonly status: ListingStatus;
  /** Detail-page views (embudo). */
  readonly views: number;
  /** Leads generated by this listing. */
  readonly leads: number;
  readonly publishedAt: string;
}

/** One lead row in the agent mini-CRM (SH-5 leads table). */
export interface AgentLead {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly message: string;
  readonly status: LeadStatus;
  /** ISO date the lead came in. */
  readonly createdAt: string;
}

/** One upcoming visit in the agent agenda (SH-5 agenda section). */
export interface AgendaVisit {
  readonly id: string;
  readonly listingTitle: string;
  readonly contactName: string;
  readonly slot: VisitSlot;
  readonly mode: VisitMode;
  readonly status: VisitStatus;
}

/**
 * `GET /api/realty/agent/leads?agent=` response — the agent's operational view
 * (cartera + leads + agenda) for the SH-5 console.
 */
export interface AgentDeskResult {
  readonly portfolio: readonly PortfolioListing[];
  readonly leads: readonly AgentLead[];
  readonly agenda: readonly AgendaVisit[];
  /** Aggregate funnel metrics for the analytics KPIs. */
  readonly totalViews: number;
  readonly totalLeads: number;
  readonly totalRevenue: number;
}

/** `POST /api/realty/listing` request body (the SH-6 wizard's published draft). */
export interface PublishListingRequest {
  readonly title: string;
  readonly operation: Operation;
  readonly type: PropertyType;
  readonly price: number;
  readonly city: string;
  readonly neighborhood: string;
  readonly address: string;
  /** Pin dropped on the map (SH-6 ubicación step). */
  readonly lat: number;
  readonly lng: number;
  readonly beds: number;
  readonly baths: number;
  readonly areaBuilt: number;
  readonly stratum: number;
}

/** `POST /api/realty/listing` response — the created listing's id + status. */
export interface PublishListingResult {
  readonly id: string;
  readonly status: ListingStatus | 'draft';
}
