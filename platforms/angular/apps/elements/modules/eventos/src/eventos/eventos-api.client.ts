import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type Attendee,
  type Buyer,
  type CatalogCriteria,
  type CatalogResult,
  type CheckInResult,
  type CheckoutItem,
  type CheckoutResult,
  type ConfirmResult,
  type EventDetail,
  type EventMode,
  type EventStatus,
  type EventSummary,
  type ETicket,
  type ManageResult,
  type ManagedAttendee,
  type SeatMapPayload,
  type TicketTier,
  type VenueZone,
} from './eventos.model';

/**
 * Thin HTTP client over the Eventos backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/eventos/events?q=`                          → `{ events:[...] }`
 *  - `GET  /api/eventos/event/{id}`                         → `{ event, tiers:[...], seatmap }`
 *  - `POST /api/eventos/checkout` `{ eventId, items, attendees }` → `{ orderRef, paymentSessionId, amount, currency }`
 *  - `POST /api/eventos/confirm`  `{ orderRef }`            → `{ status, tickets:[{id, qr}] }`
 *  - `GET  /api/eventos/manage/{eventId}`                   → `{ attendees:[...], capacity, sold }`
 *  - `POST /api/eventos/checkin`  `{ ticketId }`            → `{ status }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. Every mock path flips the
 * `degraded` flag so the shell can surface a "datos de ejemplo" notice.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class EventosApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  /** Last issued tickets, kept so the mock check-in can recognise valid codes. */
  #lastTickets: readonly ETicket[] = [];
  /** Codes already used in this mock session (for the "ya usado" path). */
  readonly #usedCodes = new Set<string>();

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Catalogue search ────────────────────────────────────────────────────────

  async events(apiBase: string, criteria: CatalogCriteria, currency: string): Promise<CatalogResult> {
    const query = this.toCatalogQuery(criteria);
    const url = `${apiBase}/events${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeCatalog(data, currency);
      if (result && (result.events.length > 0 || isRecord(data))) {
        return result;
      }
      throw new Error('events-shape');
    } catch (error) {
      this.markDegraded('GET /api/eventos/events', error);
      return mockCatalog(criteria, currency);
    }
  }

  // ─── Event detail ─────────────────────────────────────────────────────────────

  async event(apiBase: string, id: string, currency: string): Promise<EventDetail> {
    const url = `${apiBase}/event/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(data, currency);
      if (detail) {
        return detail;
      }
      throw new Error('event-shape');
    } catch (error) {
      this.markDegraded('GET /api/eventos/event/{id}', error);
      return mockDetail(id, currency);
    }
  }

  // ─── Checkout (open one PSP session for the order) ───────────────────────────

  async checkout(
    apiBase: string,
    eventId: string,
    items: readonly CheckoutItem[],
    attendees: readonly Attendee[],
    buyer: Buyer,
    fallbackAmount: number,
    currency: string,
  ): Promise<CheckoutResult> {
    const url = `${apiBase}/checkout`;
    try {
      const data = await this.postJson(url, { eventId, items, attendees, buyer });
      const result = normalizeCheckout(data, currency);
      if (result) {
        return result;
      }
      throw new Error('checkout-shape');
    } catch (error) {
      this.markDegraded('POST /api/eventos/checkout', error);
      const free = fallbackAmount <= 0;
      return {
        orderRef: `${free ? 'FREE' : 'MOCK'}-${Date.now().toString(36).toUpperCase()}`,
        paymentSessionId: free ? '' : `psp_mock_${Math.random().toString(36).slice(2, 10)}`,
        amount: fallbackAmount,
        currency,
        free,
      };
    }
  }

  // ─── Confirm (issue e-tickets) ───────────────────────────────────────────────

  async confirm(
    apiBase: string,
    orderRef: string,
    attendees: readonly Attendee[],
    items: readonly CheckoutItem[],
  ): Promise<ConfirmResult> {
    const url = `${apiBase}/confirm`;
    try {
      const data = await this.postJson(url, { orderRef });
      const confirmation = normalizeConfirm(data);
      if (confirmation) {
        this.#lastTickets = confirmation.tickets;
        return confirmation;
      }
      throw new Error('confirm-shape');
    } catch (error) {
      this.markDegraded('POST /api/eventos/confirm', error);
      const tickets = mockTickets(orderRef, attendees, items);
      this.#lastTickets = tickets;
      return { status: 'confirmed', tickets };
    }
  }

  // ─── Manage (organizer operational view) ─────────────────────────────────────

  async manage(apiBase: string, eventId: string): Promise<ManageResult> {
    const url = `${apiBase}/manage/${encodeURIComponent(eventId)}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeManage(data);
      if (result) {
        return result;
      }
      throw new Error('manage-shape');
    } catch (error) {
      this.markDegraded('GET /api/eventos/manage/{eventId}', error);
      return mockManage(eventId);
    }
  }

  // ─── Check-in (validate an e-ticket) ─────────────────────────────────────────

  async checkin(apiBase: string, ticketId: string): Promise<CheckInResult> {
    const url = `${apiBase}/checkin`;
    try {
      const data = await this.postJson(url, { ticketId });
      const result = normalizeCheckin(data);
      if (result) {
        return result;
      }
      throw new Error('checkin-shape');
    } catch (error) {
      this.markDegraded('POST /api/eventos/checkin', error);
      return this.mockCheckin(ticketId);
    }
  }

  /**
   * Mock validation: recognises a code if it matches a recently issued e-ticket
   * (by id or qr payload), is idempotent-aware (second scan → already-used), and
   * rejects anything unknown.
   */
  private mockCheckin(code: string): CheckInResult {
    const trimmed = code.trim();
    const match = this.#lastTickets.find(
      (ticket) => ticket.id === trimmed || ticket.qr === trimmed,
    );
    if (!match) {
      return { status: 'invalid' };
    }
    if (this.#usedCodes.has(match.id)) {
      return { status: 'already-used', ticketId: match.id, attendee: match.attendee };
    }
    this.#usedCodes.add(match.id);
    return { status: 'valid', ticketId: match.id, attendee: match.attendee };
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(url: string): Promise<unknown> {
    return this.request(url, { method: 'GET' });
  }

  private postJson(url: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request(url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  private toCatalogQuery(criteria: CatalogCriteria): string {
    const params = new URLSearchParams();
    if (criteria.q) {
      params.set('q', criteria.q);
    }
    if (criteria.category) {
      params.set('category', criteria.category);
    }
    if (criteria.city) {
      params.set('city', criteria.city);
    }
    if (criteria.sort && criteria.sort !== 'relevance') {
      params.set('sort', criteria.sort);
    }
    return params.toString();
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Eventos API responds.
    this.#logger.warn(`Eventos API "${endpoint}" unavailable — using mock data.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

function readMode(value: unknown): EventMode {
  return readString(value).toLowerCase() === 'reserved' ? 'reserved' : 'general';
}

function readStatus(value: unknown): EventStatus {
  const raw = readString(value).toLowerCase();
  if (raw === 'upcoming' || raw === 'sold-out' || raw === 'past') {
    return raw;
  }
  return 'on-sale';
}

function readSeatMap(value: unknown): SeatMapPayload {
  if (!isRecord(value) || !Array.isArray(value['rows'])) {
    return { rows: [] };
  }
  const aisle = readNumber(value['aisleAfterColumns']);
  return {
    rows: value['rows']
      .map((row) => (isRecord(row) ? row : null))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => ({
        rowNumber: typeof row['rowNumber'] === 'number' ? row['rowNumber'] : readString(row['rowNumber']),
        seats: Array.isArray(row['seats'])
          ? row['seats']
              .map((seat) => (isRecord(seat) ? seat : null))
              .filter((seat): seat is Record<string, unknown> => seat !== null)
              .map((seat) => ({
                id: readString(seat['id']),
                type: readString(seat['type']) || undefined,
                available: seat['available'] !== false,
                price: readNumber(seat['price']) || undefined,
              }))
          : [],
      })),
    aisleAfterColumns: aisle > 0 ? aisle : undefined,
  };
}

function normalizeEvent(value: unknown, fallbackCurrency: string): EventSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim() || readString(value['code']).trim();
  const title = readString(value['title']).trim() || readString(value['name']).trim();
  if (!id || !title) {
    return null;
  }
  return {
    id,
    slug: readString(value['slug']).trim() || id,
    title,
    subtitle: readString(value['subtitle']).trim() || readString(value['description']).trim(),
    fromAmount: readNumber(value['fromAmount'] ?? value['price'] ?? value['amount']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
    category: readString(value['category']).trim(),
    city: readString(value['city']).trim(),
    venueName: readString(value['venueName'] ?? value['venue']).trim(),
    startsAt: readString(value['startsAt'] ?? value['startDate'] ?? value['date']).trim(),
    mode: readMode(value['mode']),
    status: readStatus(value['status']),
    soldPercent: clampPercent(readNumber(value['soldPercent'])),
    cover: readString(value['cover']).trim() || readString(value['image']).trim(),
    badges: readStringArray(value['badges']),
  };
}

function normalizeCatalog(value: unknown, fallbackCurrency: string): CatalogResult | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['events'])
      ? value['events']
      : isRecord(value) && Array.isArray(value['items'])
        ? value['items']
        : null;
  if (!list) {
    return null;
  }
  return {
    events: list
      .map((entry) => normalizeEvent(entry, fallbackCurrency))
      .filter((event): event is EventSummary => event !== null),
  };
}

function normalizeTier(value: unknown, fallbackCurrency: string): TicketTier | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim() || readString(value['label']).trim();
  if (!id && !name) {
    return null;
  }
  return {
    id: id || `tier-${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Entrada',
    description: readString(value['description']).trim(),
    amount: readNumber(value['amount'] ?? value['price']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
    remaining: Math.trunc(readNumber(value['remaining'])),
    maxPerOrder: Math.max(1, Math.trunc(readNumber(value['maxPerOrder']) || 6)),
    perks: readStringArray(value['perks']),
    saleWindow: readString(value['saleWindow']).trim(),
    zoneId: readString(value['zoneId']).trim() || undefined,
    featured: readBoolean(value['featured']),
  };
}

function normalizeZone(value: unknown, fallbackCurrency: string): VenueZone | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const name = readString(value['name']).trim();
  if (!id && !name) {
    return null;
  }
  void fallbackCurrency;
  return {
    id: id || `zone-${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Zona',
    amount: readNumber(value['amount'] ?? value['price']),
    seatmap: readSeatMap(value['seatmap']),
  };
}

function normalizeDetail(value: unknown, fallbackCurrency: string): EventDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const event = normalizeEvent(value['event'] ?? value, fallbackCurrency);
  if (!event) {
    return null;
  }
  const rawTiers = Array.isArray(value['tiers']) ? value['tiers'] : [];
  const rawSessions = Array.isArray(value['sessions']) ? value['sessions'] : [];
  const rawVenue = isRecord(value['venue']) ? value['venue'] : {};
  const rawZones = Array.isArray(rawVenue['zones']) ? rawVenue['zones'] : [];
  const organizer = isRecord(value['organizer']) ? value['organizer'] : {};
  return {
    event,
    description: readString(value['description']).trim() || event.subtitle,
    highlights: readStringArray(value['highlights']),
    tiers: rawTiers
      .map((entry) => normalizeTier(entry, fallbackCurrency))
      .filter((tier): tier is TicketTier => tier !== null),
    sessions: rawSessions
      .map((entry) => (isRecord(entry) ? entry : null))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({
        id: readString(entry['id']).trim() || `ses-${Math.random().toString(36).slice(2, 8)}`,
        time: readString(entry['time']).trim(),
        title: readString(entry['title']).trim() || 'Sesión',
        speaker: readString(entry['speaker']).trim(),
      })),
    organizer: {
      name: readString(organizer['name']).trim() || 'Organizador Synergos',
      headline: readString(organizer['headline']).trim(),
      avatar: readString(organizer['avatar']).trim(),
    },
    venue: {
      name: readString(rawVenue['name']).trim() || event.venueName || 'Venue',
      address: readString(rawVenue['address']).trim(),
      city: readString(rawVenue['city']).trim() || event.city,
      zones: rawZones
        .map((entry) => normalizeZone(entry, fallbackCurrency))
        .filter((zone): zone is VenueZone => zone !== null),
    },
  };
}

function normalizeCheckout(value: unknown, fallbackCurrency: string): CheckoutResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const orderRef = readString(value['orderRef']).trim() || readString(value['id']).trim();
  if (!orderRef) {
    return null;
  }
  const amount = readNumber(value['amount']);
  return {
    orderRef,
    paymentSessionId: readString(value['paymentSessionId']).trim() || readString(value['sessionId']).trim(),
    amount,
    currency: readString(value['currency']).trim() || fallbackCurrency,
    free: amount <= 0 || readBoolean(value['free']),
  };
}

function normalizeTicket(value: unknown): ETicket | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const qr = readString(value['qr']).trim() || id;
  if (!id && !qr) {
    return null;
  }
  return {
    id: id || qr,
    qr,
    attendee: readString(value['attendee']).trim() || undefined,
    tier: readString(value['tier']).trim() || undefined,
    seat: readString(value['seat']).trim() || undefined,
  };
}

function normalizeConfirm(value: unknown): ConfirmResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawTickets = Array.isArray(value['tickets']) ? value['tickets'] : [];
  const tickets = rawTickets
    .map((entry) => normalizeTicket(entry))
    .filter((ticket): ticket is ETicket => ticket !== null);
  if (tickets.length === 0 && value['status'] === undefined) {
    return null;
  }
  return {
    status: readString(value['status']).trim() || 'confirmed',
    tickets,
  };
}

function normalizeAttendee(value: unknown): ManagedAttendee | null {
  if (!isRecord(value)) {
    return null;
  }
  const ticketId = readString(value['ticketId'] ?? value['id']).trim();
  if (!ticketId) {
    return null;
  }
  return {
    ticketId,
    name: readString(value['name']).trim() || 'Asistente',
    email: readString(value['email']).trim(),
    tier: readString(value['tier']).trim(),
    seat: readString(value['seat']).trim(),
    state: readString(value['state']).toLowerCase() === 'checked-in' ? 'checked-in' : 'pending',
  };
}

function normalizeManage(value: unknown): ManageResult | null {
  if (!isRecord(value) || !Array.isArray(value['attendees'])) {
    return null;
  }
  return {
    attendees: value['attendees']
      .map((entry) => normalizeAttendee(entry))
      .filter((attendee): attendee is ManagedAttendee => attendee !== null),
    capacity: Math.trunc(readNumber(value['capacity'])),
    sold: Math.trunc(readNumber(value['sold'])),
  };
}

function normalizeCheckin(value: unknown): CheckInResult | null {
  if (!isRecord(value) || value['status'] === undefined) {
    return null;
  }
  const raw = readString(value['status']).toLowerCase();
  const status = raw === 'valid' || raw === 'already-used' || raw === 'invalid' ? raw : 'invalid';
  return {
    status,
    ticketId: readString(value['ticketId']).trim() || undefined,
    attendee: readString(value['attendee']).trim() || undefined,
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// ─── Mock data (visible degradation when the backend is not yet wired) ─────────

const MOCK_CATEGORIES = ['Conferencia', 'Concierto', 'Festival', 'Teatro', 'Deportes', 'Taller'];
const MOCK_CITIES = ['Bogotá', 'Medellín', 'Cali', 'Cartagena', 'Barranquilla'];

export const EVENTOS_MOCK_CATEGORIES = MOCK_CATEGORIES;
export const EVENTOS_MOCK_CITIES = MOCK_CITIES;

function mockCatalog(criteria: CatalogCriteria, currency: string): CatalogResult {
  const all = mockEvents(currency);
  const term = criteria.q.trim().toLowerCase();
  let events = term
    ? all.filter(
        (event) =>
          event.title.toLowerCase().includes(term) ||
          event.category.toLowerCase().includes(term) ||
          event.city.toLowerCase().includes(term),
      )
    : all;
  if (criteria.category) {
    events = events.filter((event) => event.category === criteria.category);
  }
  if (criteria.city) {
    events = events.filter((event) => event.city === criteria.city);
  }
  return { events: sortMock(events, criteria.sort) };
}

function sortMock(events: readonly EventSummary[], sort: CatalogCriteria['sort']): EventSummary[] {
  const copy = [...events];
  switch (sort) {
    case 'date-asc':
      return copy.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    case 'price-asc':
      return copy.sort((a, b) => a.fromAmount - b.fromAmount);
    case 'price-desc':
      return copy.sort((a, b) => b.fromAmount - a.fromAmount);
    case 'popular':
      return copy.sort((a, b) => b.soldPercent - a.soldPercent);
    default:
      return copy;
  }
}

function mockEvents(currency: string): readonly EventSummary[] {
  const base: ReadonlyArray<Omit<EventSummary, 'currency'>> = [
    {
      id: 'EVT-1',
      slug: 'cumbre-tech-bogota-2026',
      title: 'Cumbre Tech Bogotá 2026',
      subtitle: 'La conferencia de tecnología más grande de la región',
      fromAmount: 180_000,
      category: 'Conferencia',
      city: 'Bogotá',
      venueName: 'Centro de Convenciones Ágora',
      startsAt: '2026-08-14T09:00:00',
      mode: 'general',
      status: 'on-sale',
      soldPercent: 62,
      cover: '',
      badges: ['Presencial', 'Networking', 'Aforo limitado'],
    },
    {
      id: 'EVT-2',
      slug: 'noche-sinfonica-teatro-colon',
      title: 'Noche Sinfónica · Teatro Colón',
      subtitle: 'Gala de la Orquesta Filarmónica con asientos numerados',
      fromAmount: 95_000,
      category: 'Concierto',
      city: 'Bogotá',
      venueName: 'Teatro Colón',
      startsAt: '2026-07-20T19:30:00',
      mode: 'reserved',
      status: 'on-sale',
      soldPercent: 78,
      cover: '',
      badges: ['Asientos numerados', 'Palco disponible'],
    },
    {
      id: 'EVT-3',
      slug: 'festival-sabor-medellin',
      title: 'Festival Sabor Medellín',
      subtitle: 'Gastronomía, música en vivo y experiencias al aire libre',
      fromAmount: 0,
      category: 'Festival',
      city: 'Medellín',
      venueName: 'Parque Norte',
      startsAt: '2026-09-05T12:00:00',
      mode: 'general',
      status: 'on-sale',
      soldPercent: 40,
      cover: '',
      badges: ['Gratis', 'Familiar', 'Aire libre'],
    },
    {
      id: 'EVT-4',
      slug: 'clasico-futbol-cali',
      title: 'Clásico de Fútbol · Estadio Pascual',
      subtitle: 'El partido de la temporada con tribuna numerada',
      fromAmount: 60_000,
      category: 'Deportes',
      city: 'Cali',
      venueName: 'Estadio Pascual Guerrero',
      startsAt: '2026-07-12T16:00:00',
      mode: 'reserved',
      status: 'on-sale',
      soldPercent: 88,
      cover: '',
      badges: ['Tribuna numerada', '¡Últimas localidades!'],
    },
    {
      id: 'EVT-5',
      slug: 'taller-ux-cartagena',
      title: 'Taller intensivo de UX & Producto',
      subtitle: 'Dos días de práctica con mentores de la industria',
      fromAmount: 320_000,
      category: 'Taller',
      city: 'Cartagena',
      venueName: 'Hub Creativo Getsemaní',
      startsAt: '2026-08-28T08:30:00',
      mode: 'general',
      status: 'on-sale',
      soldPercent: 25,
      cover: '',
      badges: ['Cupos limitados', 'Certificado'],
    },
    {
      id: 'EVT-6',
      slug: 'obra-teatro-barranquilla',
      title: 'Obra de Teatro · La Casa de Bernarda',
      subtitle: 'Temporada especial con elenco invitado',
      fromAmount: 70_000,
      category: 'Teatro',
      city: 'Barranquilla',
      venueName: 'Teatro Amira de la Rosa',
      startsAt: '2026-07-26T20:00:00',
      mode: 'reserved',
      status: 'on-sale',
      soldPercent: 55,
      cover: '',
      badges: ['Asientos numerados'],
    },
  ];
  return base.map((event) => ({ ...event, currency }));
}

function mockSeatmap(zonePrefix: string, price: number): SeatMapPayload {
  const rows = [1, 2, 3, 4].map((rowNumber) => ({
    rowNumber,
    seats: ['A', 'B', 'C', 'D', 'E', 'F'].map((letter, index) => ({
      id: `${zonePrefix}-${rowNumber}${letter}`,
      type: index === 0 || index === 5 ? 'window' : index === 1 || index === 4 ? 'aisle' : 'middle',
      // Sprinkle a few taken seats so the map looks real.
      available: !((rowNumber + index) % 7 === 0),
      price,
    })),
  }));
  return { rows, aisleAfterColumns: 3 };
}

function mockDetail(id: string, currency: string): EventDetail {
  const event = mockEvents(currency).find((entry) => entry.id === id || entry.slug === id) ?? mockEvents(currency)[0];
  const reserved = event.mode === 'reserved';
  const tiers: readonly TicketTier[] = reserved
    ? [
        {
          id: `${event.id}-platea`,
          name: 'Platea',
          description: 'Las mejores ubicaciones, cerca del escenario',
          amount: Math.round(event.fromAmount * 2.2),
          currency,
          remaining: 24,
          maxPerOrder: 6,
          perks: ['Asiento numerado', 'Acceso prioritario', 'Programa de mano'],
          saleWindow: 'Hasta agotar existencias',
          zoneId: `${event.id}-z-platea`,
          featured: true,
        },
        {
          id: `${event.id}-balcon`,
          name: 'Balcón',
          description: 'Vista panorámica del escenario',
          amount: event.fromAmount || 95_000,
          currency,
          remaining: 48,
          maxPerOrder: 6,
          perks: ['Asiento numerado'],
          saleWindow: 'Hasta agotar existencias',
          zoneId: `${event.id}-z-balcon`,
          featured: false,
        },
      ]
    : [
        {
          id: `${event.id}-early`,
          name: 'Early bird',
          description: 'Precio especial por tiempo limitado',
          amount: Math.round((event.fromAmount || 180_000) * 0.8),
          currency,
          remaining: 12,
          maxPerOrder: 4,
          perks: ['Entrada general', 'Precio promocional'],
          saleWindow: 'Termina pronto',
          featured: false,
        },
        {
          id: `${event.id}-general`,
          name: 'General',
          description: 'Acceso completo al evento',
          amount: event.fromAmount || 180_000,
          currency,
          remaining: 240,
          maxPerOrder: 8,
          perks: ['Entrada general', 'Acceso a todas las charlas'],
          saleWindow: 'Hasta el día del evento',
          featured: true,
        },
        {
          id: `${event.id}-vip`,
          name: 'VIP',
          description: 'La mejor experiencia, con beneficios exclusivos',
          amount: Math.round((event.fromAmount || 180_000) * 2.5),
          currency,
          remaining: 30,
          maxPerOrder: 4,
          perks: ['Acceso VIP', 'Zona lounge', 'Coffee + almuerzo', 'Kit de bienvenida'],
          saleWindow: 'Cupos limitados',
          featured: false,
        },
      ];
  if (event.fromAmount === 0) {
    return {
      event,
      description: mockDescription(),
      highlights: mockHighlights(),
      tiers: [
        {
          id: `${event.id}-free`,
          name: 'Entrada gratuita',
          description: 'Regístrate sin costo y asegura tu cupo',
          amount: 0,
          currency,
          remaining: 500,
          maxPerOrder: 4,
          perks: ['Acceso general', 'Confirmación con QR'],
          saleWindow: 'Hasta agotar cupos',
          featured: true,
        },
      ],
      sessions: mockSessions(),
      organizer: mockOrganizer(),
      venue: { name: event.venueName, address: 'Cra. 0 # 0-00', city: event.city, zones: [] },
    };
  }
  return {
    event,
    description: mockDescription(),
    highlights: mockHighlights(),
    tiers,
    sessions: mockSessions(),
    organizer: mockOrganizer(),
    venue: {
      name: event.venueName,
      address: 'Cra. 0 # 0-00',
      city: event.city,
      zones: reserved
        ? [
            {
              id: `${event.id}-z-platea`,
              name: 'Platea',
              amount: Math.round(event.fromAmount * 2.2),
              seatmap: mockSeatmap(`${event.id}-PL`, Math.round(event.fromAmount * 2.2)),
            },
            {
              id: `${event.id}-z-balcon`,
              name: 'Balcón',
              amount: event.fromAmount || 95_000,
              seatmap: mockSeatmap(`${event.id}-BA`, event.fromAmount || 95_000),
            },
          ]
        : [],
    },
  };
}

function mockDescription(): string {
  return (
    'Evento de demostración. La descripción real, la agenda completa, el mapa del ' +
    'venue y la galería se cargan desde el catálogo del CMS cuando el motor de ' +
    'eventos responde. Vive una experiencia presencial cuidada de principio a fin.'
  );
}

function mockHighlights(): readonly string[] {
  return [
    'Experiencia presencial con aforo controlado',
    'Confirmación inmediata con e-ticket QR',
    'Check-in ágil el día del evento',
    'Soporte y reembolso según política del organizador',
  ];
}

function mockSessions(): EventSession[] {
  return [
    { id: 's1', time: '09:00', title: 'Registro y bienvenida', speaker: '' },
    { id: 's2', time: '10:00', title: 'Keynote de apertura', speaker: 'Camila Restrepo' },
    { id: 's3', time: '12:30', title: 'Panel: el futuro del producto', speaker: 'Equipo Synergos' },
    { id: 's4', time: '15:00', title: 'Talleres simultáneos', speaker: 'Mentores invitados' },
  ];
}

function mockOrganizer(): EventOrganizer {
  return {
    name: 'Synergos Live',
    headline: 'Productora de eventos · +120 eventos realizados',
    avatar: '',
  };
}

type EventOrganizer = EventDetail['organizer'];
type EventSession = EventDetail['sessions'][number];

function mockTickets(
  orderRef: string,
  attendees: readonly Attendee[],
  items: readonly CheckoutItem[],
): readonly ETicket[] {
  // One e-ticket per attendee; if no attendees captured, one per unit/qty.
  if (attendees.length > 0) {
    return attendees.map((attendee, index) => {
      const item = items[Math.min(index, Math.max(0, items.length - 1))];
      const id = `TKT-${orderRef}-${index + 1}`;
      return {
        id,
        qr: signedQr(id, orderRef, attendee.document || attendee.email),
        attendee: attendee.name,
        tier: item?.tier,
        seat: item?.seat,
      };
    });
  }
  const total = items.reduce((sum, item) => sum + Math.max(1, item.qty), 0) || 1;
  return Array.from({ length: total }, (_unused, index) => {
    const id = `TKT-${orderRef}-${index + 1}`;
    return {
      id,
      qr: signedQr(id, orderRef, ''),
      tier: items[0]?.tier,
      seat: items[0]?.seat,
    };
  });
}

/**
 * Mock "signed" QR payload. The real issuer (`IETicketIssuer`) signs server-side
 * with an HMAC so the payload is non-forgeable; here we just encode a stable,
 * recognisable blob so the demo check-in can validate it.
 */
function signedQr(ticketId: string, orderRef: string, subject: string): string {
  const sig = `${ticketId}.${orderRef}.${subject}`
    .split('')
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
    .toString(36)
    .toUpperCase();
  return `SYN1|${ticketId}|${orderRef}|${sig}`;
}

/** A seeded operational view for the organizer cara (aforo + asistentes). */
function mockManage(eventId: string): ManageResult {
  const names = [
    'María González',
    'Julián Pérez',
    'Camila Rodríguez',
    'Andrés Gómez',
    'Laura Méndez',
    'Diego Torres',
    'Valentina Ruiz',
    'Sebastián Díaz',
  ];
  const tiers = ['General', 'VIP', 'Early bird', 'Platea'];
  const attendees: ManagedAttendee[] = names.map((name, index) => ({
    ticketId: `TKT-${eventId}-${index + 1}`,
    name,
    email: `${name.split(' ')[0].toLowerCase()}@example.com`,
    tier: tiers[index % tiers.length],
    seat: index % 4 === 3 ? `A${index + 1}` : '',
    state: index < 3 ? 'checked-in' : 'pending',
  }));
  return { attendees, capacity: 500, sold: 312 };
}
