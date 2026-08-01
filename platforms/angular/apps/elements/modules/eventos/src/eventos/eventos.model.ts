/**
 * Domain model for the Eventos vertical's <c>&lt;synergos-eventos&gt;</c> — a real
 * enterprise events platform (Ticketmaster + Eventbrite, doc 21 §2.6 +
 * `deep-research/eventos.md`) rebuilt **v2** as a hash-routed multi-page SPA that
 * consumes the reusable shell catalogue `@synergos/shells`:
 *
 *  - **ASISTENTE:** SH-1 discovery (catálogo+categorías+geo+fecha) → SH-2 ficha
 *    (hero+countdown+tiers, perfil artista/venue) → selección (seat-map con
 *    price-levels / GA) → carrito+fees → SH-3 checkout → SH-10 wallet (e-ticket
 *    QR + transferir) → SH-4 "mis tickets".
 *  - **ORGANIZADOR (role-switch):** SH-5 console (cartera, KPIs, asistentes,
 *    check-in scan Válido/Ya-usado/Inválido, payout) + SH-6 crear evento.
 *
 * The asistente cara funnels the chosen Event × Tier (× Seat) into the engine's
 * vertical-agnostic <c>SessionItem[]</c> cart behind a single <c>Pricing</c>, then
 * one checkout — exactly the storefront's <c>seleccionar → pagar → confirmar</c>.
 * Here a cart line is a ticket (one per attendee/seat or per general-admission
 * unit) and "confirmed" means the e-tickets (QR firmado) are issued. The
 * organizador cara reads aggregate metrics + validates e-tickets by QR (check-in).
 *
 * Pure TS (no Angular imports) so it can be shared, serialised, and unit-tested.
 */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The flow id the engine routes on — one strategy owns it. */
export const EVENTOS_FLOW = 'eventos';

/** Every eventos cart line is a `ticket` kind for the engine. */
export const EVENTOS_KIND: SessionItemKind = 'ticket';

/** Which cara of the app the user is on (role-switch). */
export type EventosRole = 'attendee' | 'organizer';

/**
 * The high-level phase / route within the ASISTENTE cara (drives the hash router
 * `#/eventos/...`). `wallet` renders SH-10 (mis tickets + e-ticket QR + transfer);
 * `account` renders SH-4 ("mis tickets" bandeja + tracking).
 */
export type EventosView =
  | 'catalog' // SH-1 discovery: search + facets + grid
  | 'event' // SH-2 detail: hero, countdown, tiers, artist/venue
  | 'select' // tier/quantity (general) or seat-map (reserved)
  | 'cart' // carrito + fees + hold countdown
  | 'checkout' // SH-3 wizard: attendees → pago → revisar
  | 'confirmed' // order + e-ticket QR per attendee
  | 'wallet' // SH-10 credential-wallet: e-tickets + transfer/resell
  | 'account'; // SH-4 account-shell: mis tickets bandeja + tracking

/**
 * The high-level phase / route within the ORGANIZADOR cara. Rendered inside the
 * SH-5 console-shell as its active section; `create` swaps to the SH-6 wizard.
 */
export type ManagerView =
  | 'portfolio' // cartera multi-evento (KPIs + tabla de eventos)
  | 'dashboard' // KPIs de un evento (vendidos/aforo/ingresos/check-ins)
  | 'attendees' // filterable attendee table
  | 'checkin' // QR scan / manual code → Válido | Ya usado | Inválido
  | 'payout' // settlement / liquidación
  | 'create'; // SH-6 authoring wizard: crear evento

/** How the event sells tickets — drives the selección mode. */
export type EventMode = 'general' | 'reserved';

/** Event lifecycle relative to "now". */
export type EventStatus = 'upcoming' | 'on-sale' | 'sold-out' | 'past';

/** Catalogue sort options. Maps 1:1 to the API `sort` query param. */
export type EventosSortKey = 'relevance' | 'date-asc' | 'price-asc' | 'price-desc' | 'popular';

// ─── Catalogue: events ───────────────────────────────────────────────────────

/**
 * One event card / summary as returned by `GET /api/eventos/events`. `fromAmount`
 * is in **major units** of `currency` (es-CO formatted in the view); the engine
 * cart stores minor units. `fromAmount === 0` marks a free event.
 */
export interface EventSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string;
  /** Lead price (cheapest tier) in major units. `0` → gratis. */
  readonly fromAmount: number;
  readonly currency: string;
  readonly category: string;
  readonly city: string;
  readonly venueName: string;
  /** ISO start date-time of the (first) session. */
  readonly startsAt: string;
  readonly mode: EventMode;
  readonly status: EventStatus;
  /** 0–100 percentage of capacity sold (aforo). */
  readonly soldPercent: number;
  /** Cover image URL (optional — view degrades to a placeholder). */
  readonly cover: string;
  /** Short freeform chips (e.g. "Presencial", "Aforo limitado"). */
  readonly badges: readonly string[];
}

/** A ticket tier (General/VIP/Early-bird) for an event. */
export interface TicketTier {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Tier price in major units. `0` → gratis. */
  readonly amount: number;
  readonly currency: string;
  /** Units still available for this tier (aforo del tier). */
  readonly remaining: number;
  /** Max tickets per order for this tier. */
  readonly maxPerOrder: number;
  /** Inclusions / perks shown on the tier card. */
  readonly perks: readonly string[];
  /** Sale window close hint, already formatted ("Hasta el 12 jul"). */
  readonly saleWindow: string;
  /** For reserved-seating events: the venue zone this tier maps to. */
  readonly zoneId?: string;
  /** Highlight the recommended tier. */
  readonly featured: boolean;
}

/** A single agenda / session entry on the event PDP. */
export interface EventSession {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly speaker: string;
}

/** The event organizer (host) — shown on the PDP + dashboard header. */
export interface EventOrganizer {
  readonly name: string;
  readonly headline: string;
  readonly avatar: string;
}

/** The performing artist / act profile (perfil artista de la ficha SH-2). */
export interface EventArtist {
  readonly name: string;
  readonly headline: string;
  readonly followers: number;
}

/** The venue, with optional reserved-seating zones. */
export interface EventVenue {
  readonly name: string;
  readonly address: string;
  readonly city: string;
  /** Reserved-seating zones (empty for general admission). */
  readonly zones: readonly VenueZone[];
}

/** A reserved-seating zone (maps to a tier + a seat-map layout). */
export interface VenueZone {
  readonly id: string;
  readonly name: string;
  /** Per-seat price in major units for this zone. */
  readonly amount: number;
  /** `seatmap` payload for `<synergos-seat-map>` (rows + seats). */
  readonly seatmap: SeatMapPayload;
}

/**
 * The seat-map layout payload handed to `<synergos-seat-map>`.
 *
 * Este módulo NO lo interpreta: lo recibe del CMS y se lo pasa al mapa. Por eso
 * la forma tiene que seguir al contrato del mapa — lo que este tipo no declare,
 * el parser lo descarta y no llega a la pantalla.
 */
export interface SeatMapPayload {
  readonly rows: readonly SeatMapRow[];
  /**
   * Dónde van los pasillos, por índice de columna 1-based. Un widebody trae dos
   * (`[3, 6]`); un número suelto es la forma anterior y se sigue aceptando.
   */
  readonly aisleAfterColumns?: number | readonly number[];
}

export interface SeatMapRow {
  readonly rowNumber: number | string;
  readonly seats: readonly SeatMapSeat[];
  /** Clase de servicio de la fila. El mapa abre una sección cuando cambia. */
  readonly serviceClass?: string;
}

export interface SeatMapSeat {
  readonly id: string;
  /** POSICIÓN de la butaca. El confort viaja en `features`. */
  readonly type?: string;
  readonly available?: boolean;
  readonly price?: number;
  /** Rasgos: `extra-legroom`, `exit-row`, … Vocabulario abierto. */
  readonly features?: readonly string[];
}

/** The full event-page payload as returned by `GET /api/eventos/event/{id}`. */
export interface EventDetail {
  readonly event: EventSummary;
  readonly description: string;
  /** "Por qué asistir" / highlight bullets. */
  readonly highlights: readonly string[];
  readonly tiers: readonly TicketTier[];
  readonly sessions: readonly EventSession[];
  readonly organizer: EventOrganizer;
  readonly artist: EventArtist;
  readonly venue: EventVenue;
}

// ─── Catalogue search ────────────────────────────────────────────────────────

/** `GET /api/eventos/events` response. */
export interface CatalogResult {
  readonly events: readonly EventSummary[];
}

/** The active query the catalogue drives the search with. */
export interface CatalogCriteria {
  readonly q: string;
  readonly category: string;
  readonly city: string;
  readonly sort: EventosSortKey;
}

// ─── Selection (tier / seat) ─────────────────────────────────────────────────

/** A buyer's chosen line before it becomes a cart `SessionItem`. */
export interface TierSelectionPayload {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly tierId: string;
  readonly tierName: string;
  /** Unit price in major units. */
  readonly amount: number;
  readonly currency: string;
  readonly quantity: number;
  /** Seat ids for reserved-seating events (empty for general admission). */
  readonly seats: readonly string[];
  readonly cover: string;
}

// ─── Attendees / buyer (checkout) ────────────────────────────────────────────

/** Attendee contact captured per ticket. */
export interface Attendee {
  readonly name: string;
  readonly email: string;
  readonly document: string;
}

/** The buyer (payer) of the order. */
export interface Buyer {
  readonly name: string;
  readonly email: string;
}

// ─── Checkout contract (API) ─────────────────────────────────────────────────

/** One item in the `POST /api/eventos/checkout` request body. */
export interface CheckoutItem {
  readonly tier: string;
  readonly seat?: string;
  readonly qty: number;
}

/**
 * `POST /api/eventos/checkout` response. Opens one PSP session for the order. A
 * free order short-circuits to `amount === 0` (no payment needed).
 */
export interface CheckoutResult {
  readonly orderRef: string;
  readonly paymentSessionId: string;
  readonly amount: number;
  readonly currency: string;
  /** `true` when the order total was zero → no payment, order already placed. */
  readonly free: boolean;
}

/** One issued e-ticket — `qr` is the (signed) payload to render + scan. */
export interface ETicket {
  readonly id: string;
  /** Signed QR payload (rendered via `<synergos-qr-code>`, scanned at check-in). */
  readonly qr: string;
  /** Attendee name (when captured). */
  readonly attendee?: string;
  /** Tier / zona label. */
  readonly tier?: string;
  /** Seat label for reserved-seating. */
  readonly seat?: string;
}

/** `POST /api/eventos/confirm` response — the order confirmed + e-tickets issued. */
export interface ConfirmResult {
  readonly status: string;
  readonly tickets: readonly ETicket[];
}

// ─── Wallet / mis tickets (SH-10 + SH-4) ─────────────────────────────────────

/** Lifecycle status of a wallet ticket (drives the SH-10 status pill tone). */
export type WalletTicketStatus = 'valid' | 'transferred' | 'used' | 'past';

/**
 * A ticket held by the current user (`GET /api/eventos/tickets?holder=`). One
 * per attendee/seat; the wallet renders each as a SH-10 credential card with a
 * scannable QR and a transfer action.
 */
export interface WalletTicket {
  readonly id: string;
  readonly qr: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly venueName: string;
  /** ISO start date-time of the event. */
  readonly startsAt: string;
  readonly tier: string;
  readonly seat: string;
  readonly holder: string;
  readonly orderRef: string;
  readonly status: WalletTicketStatus;
}

/** `GET /api/eventos/tickets?holder=` response. */
export interface WalletResult {
  readonly tickets: readonly WalletTicket[];
}

/** `POST /api/eventos/ticket/{id}/transfer` response — origin invalidated. */
export interface TransferResult {
  readonly status: string;
  /** The account/email the ticket was transferred to. */
  readonly to: string;
  /** The (invalidated) source ticket id. */
  readonly ticketId: string;
}

// ─── Organizer (manage) contract (API) ───────────────────────────────────────

/** Check-in state of an attendee's e-ticket. */
export type CheckInState = 'pending' | 'checked-in';

/** One attendee row in the organizer's manage table. */
export interface ManagedAttendee {
  readonly ticketId: string;
  readonly name: string;
  readonly email: string;
  readonly tier: string;
  readonly seat: string;
  readonly state: CheckInState;
}

/**
 * `GET /api/eventos/manage/{eventId}` response — operational view of an event
 * (asistentes + aforo + a small portfolio of the organizer's other events for
 * the SH-5 cartera view).
 */
export interface ManageResult {
  readonly attendees: readonly ManagedAttendee[];
  readonly capacity: number;
  readonly sold: number;
  /** Gross revenue in major units (mock estimate until the reporting seam lands). */
  readonly revenue: number;
  /** The organizer's event portfolio (cartera) for the SH-5 dashboard. */
  readonly portfolio: readonly PortfolioEvent[];
}

/** One event in the organizer's cartera (SH-5 portfolio table). */
export interface PortfolioEvent {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly city: string;
  readonly capacity: number;
  readonly sold: number;
  /** Gross revenue in major units. */
  readonly revenue: number;
  readonly status: EventStatus;
}

/** The validation outcome of a check-in scan. */
export type CheckInOutcome = 'valid' | 'already-used' | 'invalid';

/** `POST /api/eventos/checkin` response. */
export interface CheckInResult {
  readonly status: CheckInOutcome;
  /** The matched ticket id, when found. */
  readonly ticketId?: string;
  /** Human label for the matched attendee, when found. */
  readonly attendee?: string;
}

/** A local record of a check-in scan, for the live scan log. */
export interface ScanRecord {
  readonly code: string;
  readonly outcome: CheckInOutcome;
  readonly attendee: string;
  readonly at: string;
}

// ─── Create event (SH-6 authoring) contract (API) ────────────────────────────

/** `POST /api/eventos/event` request body (the SH-6 wizard's published draft). */
export interface CreateEventRequest {
  readonly title: string;
  readonly category: string;
  readonly city: string;
  readonly venueName: string;
  readonly startsAt: string;
  readonly mode: EventMode;
  readonly capacity: number;
  /** Tiers to seed (name + price + cupo). */
  readonly tiers: readonly CreateTierDraft[];
}

/** One tier row captured in the SH-6 create-event wizard. */
export interface CreateTierDraft {
  readonly name: string;
  readonly amount: number;
  readonly capacity: number;
}

/** `POST /api/eventos/event` response — the created event's id + public slug. */
export interface CreateEventResult {
  readonly id: string;
  readonly slug: string;
  readonly status: string;
}
