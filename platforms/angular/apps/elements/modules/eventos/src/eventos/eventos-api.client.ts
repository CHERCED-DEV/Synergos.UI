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
  type CreateEventRequest,
  type CreateEventResult,
  type EventArtist,
  type EventDetail,
  type EventMode,
  type EventStatus,
  type EventSummary,
  type ETicket,
  type ManageResult,
  type ManagedAttendee,
  type PortfolioEvent,
  type SeatMapPayload,
  type TicketTier,
  type TransferResult,
  type VenueZone,
  type WalletResult,
  type WalletTicket,
  type WalletTicketStatus,
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
 * **Graceful degradation — sólo de LECTURAS:** if a read endpoint is not yet wired
 * (network error / non-OK), the client falls back to visible **mock data** and logs a
 * `TODO`. Every mock path flips the `degraded` flag so the shell can surface a "datos de
 * ejemplo" notice.
 *
 * **Las ESCRITURAS no degradan** (UI#92, reglas 4, 9, 14 y 38): abrir la orden, emitir
 * las entradas, transferir una, crear un evento y validar en la puerta LANZAN
 * {@link EventosWriteFailedError} cuando el borde no contesta. Devolvían una orden
 * `MOCK-<ts>` con su `psp_mock_…`, entradas con un QR «firmado» en el navegador, una
 * transferencia hecha, un `EVT-<ts>` y un «Válido» contra las entradas de mentira — o
 * sea: se cobraba contra una sesión de pago inventada, el asistente se iba con un QR que
 * la puerta no reconoce y la puerta dejaba pasar con el servidor caído.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
/**
 * El backend exige sesión (401). NO es una degradación: es un hueco de identidad, y la
 * UI debe ofrecer iniciar sesión en vez de inventar datos.
 */
export class EventosUnauthorizedError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 401 ${url}`);
    this.name = 'EventosUnauthorizedError';
  }
}

/**
 * Hay sesión, pero la cuenta NO tiene rol de organizador (403). Iniciar sesión otra vez
 * no ayuda: hace falta que un admin dé el permiso.
 */
export class EventosForbiddenError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 403 ${url}`);
    this.name = 'EventosForbiddenError';
  }
}

/** Discriminado por `name`, no `instanceof` (no cruza bundles). */
export function isEventosUnauthorized(error: unknown): error is EventosUnauthorizedError {
  return error instanceof Error && error.name === 'EventosUnauthorizedError';
}

/** Discriminado por `name`, no `instanceof` (no cruza bundles). */
export function isEventosForbidden(error: unknown): error is EventosForbiddenError {
  return error instanceof Error && error.name === 'EventosForbiddenError';
}

/**
 * Una ESCRITURA que no quedó en el servidor. **Lanza; no devuelve nada que parezca un
 * acuse** (UI#92). El gemelo de `AcademyWriteFailedError` (CMS#117) y de
 * `RealtyWriteFailedError` (UI#95). **No enciende `degraded`**: ese cartel dice «estás
 * viendo datos de ejemplo», y una entrada no es un ejemplo — es la prueba con la que
 * alguien va a intentar entrar (regla 14).
 */
export class EventosWriteFailedError extends Error {
  constructor(
    readonly endpoint: string,
    override readonly cause: unknown,
  ) {
    super(`Eventos write "${endpoint}" did not reach the server.`);
    this.name = 'EventosWriteFailedError';
  }
}

@Injectable()
export class EventosApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  /** La billetera de la sesión: las entradas que el SERVIDOR emitió en esta pestaña. */
  #walletTickets: readonly WalletTicket[] = [];

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Catalogue search ────────────────────────────────────────────────────────

  async events(apiBase: string, criteria: CatalogCriteria, currency: string): Promise<CatalogResult> {
    const query = this.toCatalogQuery(criteria);
    const url = `${apiBase}/events${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(apiBase, url);
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
      const data = await this.getJson(apiBase, url);
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

  /**
   * Abre la orden y su sesión de pago. **Lanza si el borde no la abrió** (UI#92).
   *
   * Devolvía una orden `MOCK-<ts>` —o `FREE-<ts>`— con un `psp_mock_…`, y la estrategia
   * contestaba `accepted: true`: el asistente seguía a confirmar contra una orden que el
   * servidor no conoce. **Sin `fallbackAmount`**: era la fabricación escrita en la firma
   * (regla 19) — el total lo calcula el borde, con su comisión (CMS#194), justamente para
   * no confiarle el precio al navegador.
   */
  async checkout(
    apiBase: string,
    eventId: string,
    items: readonly CheckoutItem[],
    attendees: readonly Attendee[],
    buyer: Buyer,
    currency: string,
  ): Promise<CheckoutResult> {
    const url = `${apiBase}/checkout`;
    try {
      const data = await this.postJson(apiBase, url, { eventId, items, attendees, buyer });
      const result = normalizeCheckout(data, currency);
      if (result) {
        return result;
      }
      throw new Error('checkout-shape');
    } catch (error) {
      this.writeFailed('POST /api/eventos/checkout', error);
    }
  }

  // ─── Confirm (issue e-tickets) ───────────────────────────────────────────────

  /**
   * Captura y emite las entradas. **Lanza si el borde no las emitió** (UI#92).
   *
   * Fabricaba una entrada por asistente con un QR «firmado» en el navegador y la sembraba
   * en «mis entradas»: es la regla 14 en su forma más cara — la entrada es lo que alguien
   * enseña en la puerta, y la puerta no la iba a reconocer. Las que siembra la billetera
   * son sólo las que el servidor devolvió.
   */
  async confirm(
    apiBase: string,
    orderRef: string,
    attendees: readonly Attendee[],
    context?: ConfirmContext,
  ): Promise<ConfirmResult> {
    const url = `${apiBase}/confirm`;
    try {
      const data = await this.postJson(apiBase, url, { orderRef });
      const confirmation = normalizeConfirm(data);
      if (confirmation) {
        this.seedWallet(confirmation.tickets, attendees, orderRef, context);
        return confirmation;
      }
      throw new Error('confirm-shape');
    } catch (error) {
      this.writeFailed('POST /api/eventos/confirm', error);
    }
  }

  /** Append the issued tickets to the in-memory wallet ("mis tickets"). */
  private seedWallet(
    tickets: readonly ETicket[],
    attendees: readonly Attendee[],
    orderRef: string,
    context?: ConfirmContext,
  ): void {
    const holder = attendees[0]?.email || context?.buyer?.email || 'invitado@synergos';
    const seeded: WalletTicket[] = tickets.map((ticket, index) => ({
      id: ticket.id,
      qr: ticket.qr,
      eventId: context?.eventId ?? '',
      eventTitle: context?.eventTitle ?? ticket.tier ?? 'Evento',
      venueName: context?.venueName ?? '',
      startsAt: context?.startsAt ?? '',
      tier: ticket.tier ?? '',
      seat: ticket.seat ?? '',
      holder: attendees[index]?.name || holder,
      orderRef,
      status: 'valid',
    }));
    this.#walletTickets = [...seeded, ...this.#walletTickets];
  }

  // ─── Wallet ("mis tickets", holder-scoped) ────────────────────────────────────

  /**
   * "Mis entradas" — las del member de la SESIÓN.
   *
   * El `?holder=<email>` desapareció (T9): listaba las entradas de cualquiera y, con
   * ellas, **el token de su QR** — o sea, permitía entrar en su lugar. La identidad la
   * resuelve el servidor desde la cookie; `holder` solo se usa para el modo degradado.
   */
  async tickets(apiBase: string, holder: string): Promise<WalletResult> {
    const url = `${apiBase}/tickets`;
    try {
      const data = await this.getJson(apiBase, url);
      const result = normalizeWallet(data);
      if (result) {
        this.#walletTickets = result.tickets;
        return result;
      }
      throw new Error('tickets-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/eventos/tickets', error);
      // Prefer the in-session wallet (a mock purchase just happened); else seed.
      const tickets = this.#walletTickets.length > 0 ? this.#walletTickets : mockWallet(holder);
      this.#walletTickets = tickets;
      return { tickets };
    }
  }

  // ─── Transfer a ticket (invalidate origin) ────────────────────────────────────

  /**
   * Regala la entrada. **Lanza si el borde no la transfirió** (UI#92): la daba por
   * transferida en local, y quien la regalaba creía que su amigo ya podía entrar con ella
   * mientras el QR de verdad seguía siendo el suyo.
   */
  async transfer(apiBase: string, ticketId: string, to: string): Promise<TransferResult> {
    const url = `${apiBase}/ticket/${encodeURIComponent(ticketId)}/transfer`;
    try {
      const data = await this.postJson(apiBase, url, { to });
      const result = normalizeTransfer(data, ticketId, to);
      if (result) {
        this.applyTransfer(ticketId);
        return result;
      }
      throw new Error('transfer-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.writeFailed('POST /api/eventos/ticket/{id}/transfer', error);
    }
  }

  /** Mark the source ticket transferred in the in-memory wallet. */
  private applyTransfer(ticketId: string): void {
    this.#walletTickets = this.#walletTickets.map((ticket) =>
      ticket.id === ticketId ? { ...ticket, status: 'transferred' as WalletTicketStatus } : ticket,
    );
  }

  // ─── Create event (organizer authoring) ───────────────────────────────────────

  /**
   * Publica el evento. **Lanza si el borde no lo creó** (UI#92): acuñaba un `EVT-<ts>` y la
   * consola decía «Evento publicado» con una página pública que no existía — el defecto
   * que el propio CMS describe en `EventDraftRequest` («no se notaba porque el cliente lo
   * tapa con un id inventado»).
   */
  async createEvent(apiBase: string, request: CreateEventRequest): Promise<CreateEventResult> {
    const url = `${apiBase}/event`;
    try {
      const data = await this.postJson(apiBase, url, request);
      const result = normalizeCreate(data, request);
      if (result) {
        return result;
      }
      throw new Error('create-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.writeFailed('POST /api/eventos/event', error);
    }
  }

  // ─── Manage (organizer operational view) ─────────────────────────────────────

  async manage(apiBase: string, eventId: string): Promise<ManageResult> {
    const url = `${apiBase}/manage/${encodeURIComponent(eventId)}`;
    try {
      const data = await this.getJson(apiBase, url);
      const result = normalizeManage(data);
      if (result) {
        return result;
      }
      throw new Error('manage-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.markDegraded('GET /api/eventos/manage/{eventId}', error);
      return mockManage(eventId);
    }
  }

  // ─── Check-in (validate an e-ticket) ─────────────────────────────────────────

  /**
   * Valida y quema la entrada en la puerta. **Lanza si el borde no contestó** (UI#92).
   *
   * Validaba contra las entradas que esta misma pestaña había fabricado y contestaba
   * «Válido» o «Ya usado» con el servidor caído: la puerta dejaba pasar sin que nada
   * quedara quemado, así que la misma entrada podía volver a entrar por la puerta de al
   * lado. Y al revés, una entrada buena salía «Inválida» —culpando al asistente— cuando lo
   * que fallaba era la red. Sin respuesta del servidor no hay veredicto.
   */
  async checkin(apiBase: string, ticketId: string): Promise<CheckInResult> {
    const url = `${apiBase}/checkin`;
    try {
      const data = await this.postJson(apiBase, url, { ticketId });
      const result = normalizeCheckin(data);
      if (result) {
        return result;
      }
      throw new Error('checkin-shape');
    } catch (error) {
      this.rethrowIfAuthError(error);
      this.writeFailed('POST /api/eventos/checkin', error);
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(apiBase: string, url: string): Promise<unknown> {
    return this.request(apiBase, url, { method: 'GET' });
  }

  private postJson(apiBase: string, url: string, body: unknown): Promise<unknown> {
    return this.request(apiBase, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** Re-lanza 401/403: la UI del organizador los trata como estado, no como caída. */
  private rethrowIfAuthError(error: unknown): void {
    if (isEventosUnauthorized(error) || isEventosForbidden(error)) {
      throw error;
    }
  }

  /**
   * Sin `apiBase` no se llama a nada —ni a una ruta del propio sitio, que podría ser de otra
   * cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
   * compilada. Se rechaza y cada llamada degrada a su muestra, visible.
   */
  private request(apiBase: string, url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    if (!apiBase) {
      return Promise.reject(new Error('sin-api'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) => {
      // 401/403 NO son "el backend no está": son huecos de acceso. Degradarlos a datos
      // de ejemplo le mostraría la consola del organizador —con los asistentes— a quien
      // no debe verla.
      if (response.status === 401) {
        return Promise.reject(new EventosUnauthorizedError(url));
      }
      if (response.status === 403) {
        return Promise.reject(new EventosForbiddenError(url));
      }
      return response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`));
    });
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

  /**
   * Una ESCRITURA que no llegó. **No marca `degraded` y no devuelve nada**: el cartel de
   * «datos de ejemplo» es de las LECTURAS, y aquí no hay ejemplo que enseñar.
   */
  private writeFailed(endpoint: string, error: unknown): never {
    this.#logger.warn(`Eventos API "${endpoint}" unavailable — nothing was saved.`, error);
    throw new EventosWriteFailedError(endpoint, error);
  }
}

/** Event context threaded into `confirm` so the mock wallet reads meaningfully. */
export interface ConfirmContext {
  readonly eventId?: string;
  readonly eventTitle?: string;
  readonly venueName?: string;
  readonly startsAt?: string;
  readonly buyer?: Buyer;
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

/**
 * Posiciones de pasillo del CMS. Acepta el arreglo (un widebody trae dos) y el
 * número suelto de la forma anterior.
 *
 * <b>Un arreglo vacío se conserva como vacío</b>, no se colapsa a `undefined`.
 * En una FILA las dos cosas son distintas: `[]` es "esta fila no tiene ningún
 * pasillo" —una sección de suites dentro de un widebody— y la ausencia es "usa
 * los del mapa". Colapsarlas dejaría la sección corta dibujada con los pasillos
 * de la larga, que es justo el defecto que esto viene a cerrar.
 */
function readAisleColumns(value: unknown): readonly number[] | number | undefined {
  if (Array.isArray(value)) {
    return value.map(readNumber).filter((n) => n > 0);
  }
  const single = readNumber(value);
  return single > 0 ? single : undefined;
}

/**
 * Traduce la carga `seatmap` del CMS.
 *
 * <b>Esto es un PASO A TRAVÉS, no una interpretación.</b> Este módulo no dibuja
 * el mapa: se lo pasa a `<synergos-seat-map>`, que sí sabe. Lo que no se copie
 * aquí se pierde en silencio — el mapa nunca ve la clave y no hay error en
 * ningún lado. Por eso cada campo nuevo del contrato tiene que aparecer también
 * en esta función.
 */
function readSeatMap(value: unknown): SeatMapPayload {
  if (!isRecord(value) || !Array.isArray(value['rows'])) {
    return { rows: [] };
  }
  return {
    rows: value['rows']
      .map((row) => (isRecord(row) ? row : null))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => ({
        rowNumber: typeof row['rowNumber'] === 'number' ? row['rowNumber'] : readString(row['rowNumber']),
        serviceClass: readString(row['serviceClass']) || undefined,
        aisleAfterColumns: readAisleColumns(row['aisleAfterColumns']),
        seats: Array.isArray(row['seats'])
          ? row['seats']
              .map((seat) => (isRecord(seat) ? seat : null))
              .filter((seat): seat is Record<string, unknown> => seat !== null)
              .map((seat) => {
                const features = readStringArray(seat['features']);
                return {
                  id: readString(seat['id']),
                  type: readString(seat['type']) || undefined,
                  available: seat['available'] !== false,
                  price: readNumber(seat['price']) || undefined,
                  // Vacío se omite: el mapa trata la ausencia igual que la
                  // lista vacía, y así no va una clave muerta por butaca.
                  features: features.length > 0 ? features : undefined,
                };
              })
          : [],
      })),
    aisleAfterColumns: readAisleColumns(value['aisleAfterColumns']),
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
    // #195: las dos fechas sólo existen si el servidor las manda, y `onSale` sólo si lo sabe.
    saleOpensAt: readString(value['saleOpensAt']).trim() || null,
    saleClosesAt: readString(value['saleClosesAt']).trim() || null,
    onSale: typeof value['onSale'] === 'boolean' ? value['onSale'] : null,
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
  const artist = isRecord(value['artist']) ? value['artist'] : {};
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
    artist: {
      name: readString(artist['name']).trim() || event.title,
      headline: readString(artist['headline']).trim(),
      followers: Math.trunc(readNumber(artist['followers'])),
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

function normalizePortfolioEvent(value: unknown): PortfolioEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim();
  if (!id && !title) {
    return null;
  }
  return {
    id: id || title,
    title: title || 'Evento',
    startsAt: readString(value['startsAt'] ?? value['date']).trim(),
    city: readString(value['city']).trim(),
    capacity: Math.trunc(readNumber(value['capacity'])),
    sold: Math.trunc(readNumber(value['sold'])),
    revenue: readNumber(value['revenue']),
    status: readStatus(value['status']),
  };
}

function normalizeManage(value: unknown): ManageResult | null {
  if (!isRecord(value) || !Array.isArray(value['attendees'])) {
    return null;
  }
  const rawPortfolio = Array.isArray(value['portfolio']) ? value['portfolio'] : [];
  return {
    attendees: value['attendees']
      .map((entry) => normalizeAttendee(entry))
      .filter((attendee): attendee is ManagedAttendee => attendee !== null),
    capacity: Math.trunc(readNumber(value['capacity'])),
    sold: Math.trunc(readNumber(value['sold'])),
    revenue: readNumber(value['revenue']),
    portfolio: rawPortfolio
      .map((entry) => normalizePortfolioEvent(entry))
      .filter((entry): entry is PortfolioEvent => entry !== null),
  };
}

function normalizeWalletTicket(value: unknown): WalletTicket | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id'] ?? value['ticketId']).trim();
  if (!id) {
    return null;
  }
  const rawStatus = readString(value['status']).toLowerCase();
  const status: WalletTicketStatus =
    rawStatus === 'transferred' || rawStatus === 'used' || rawStatus === 'past'
      ? rawStatus
      : 'valid';
  return {
    id,
    qr: readString(value['qr']).trim() || id,
    eventId: readString(value['eventId']).trim(),
    eventTitle: readString(value['eventTitle'] ?? value['event']).trim() || 'Evento',
    venueName: readString(value['venueName'] ?? value['venue']).trim(),
    startsAt: readString(value['startsAt'] ?? value['date']).trim(),
    tier: readString(value['tier']).trim(),
    seat: readString(value['seat']).trim(),
    holder: readString(value['holder']).trim(),
    orderRef: readString(value['orderRef']).trim(),
    status,
  };
}

function normalizeWallet(value: unknown): WalletResult | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['tickets'])
      ? value['tickets']
      : null;
  if (!list) {
    return null;
  }
  return {
    tickets: list
      .map((entry) => normalizeWalletTicket(entry))
      .filter((ticket): ticket is WalletTicket => ticket !== null),
  };
}

function normalizeTransfer(value: unknown, ticketId: string, to: string): TransferResult | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    status: readString(value['status']).trim() || 'transferred',
    to: readString(value['to']).trim() || to,
    ticketId: readString(value['ticketId']).trim() || ticketId,
  };
}

function normalizeCreate(value: unknown, request: CreateEventRequest): CreateEventResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    slug: readString(value['slug']).trim() || slugify(request.title),
    status: readString(value['status']).trim() || 'draft',
  };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || `evento-${Date.now().toString(36)}`
  );
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
          saleOpensAt: null,
          saleClosesAt: null,
          onSale: null,
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
          saleOpensAt: null,
          saleClosesAt: null,
          onSale: null,
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
          saleOpensAt: null,
          saleClosesAt: null,
          onSale: null,
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
          saleOpensAt: null,
          saleClosesAt: null,
          onSale: null,
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
          saleOpensAt: null,
          saleClosesAt: null,
          onSale: null,
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
          saleOpensAt: null,
          saleClosesAt: null,
          onSale: null,
          featured: true,
        },
      ],
      sessions: mockSessions(),
      organizer: mockOrganizer(),
      artist: mockArtist(event),
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
    artist: mockArtist(event),
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

function mockArtist(event: EventSummary): EventArtist {
  return {
    name: event.title.split('·')[0].trim() || event.title,
    headline: `Artista destacado · ${event.category}`,
    followers: 12_400 + Math.round(event.soldPercent * 380),
  };
}

type EventOrganizer = EventDetail['organizer'];
type EventSession = EventDetail['sessions'][number];

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
  const portfolio: PortfolioEvent[] = [
    { id: eventId, title: 'Cumbre Tech Bogotá 2026', startsAt: '2026-08-14T09:00:00', city: 'Bogotá', capacity: 500, sold: 312, revenue: 56_160_000, status: 'on-sale' },
    { id: 'EVT-2', title: 'Noche Sinfónica · Teatro Colón', startsAt: '2026-07-20T19:30:00', city: 'Bogotá', capacity: 320, sold: 250, revenue: 23_750_000, status: 'on-sale' },
    { id: 'EVT-5', title: 'Taller intensivo de UX & Producto', startsAt: '2026-08-28T08:30:00', city: 'Cartagena', capacity: 80, sold: 20, revenue: 6_400_000, status: 'on-sale' },
  ];
  return { attendees, capacity: 500, sold: 312, revenue: 56_160_000, portfolio };
}

/** A seeded wallet ("mis tickets") when there is no live purchase yet. */
function mockWallet(holder: string): readonly WalletTicket[] {
  const name = holder && holder.includes('@') ? holder.split('@')[0] : holder || 'Invitado';
  return [
    {
      id: 'TKT-DEMO-1',
      qr: 'SYN1|TKT-DEMO-1|ORD-DEMO|A1B2C3',
      eventId: 'EVT-1',
      eventTitle: 'Cumbre Tech Bogotá 2026',
      venueName: 'Centro de Convenciones Ágora',
      startsAt: '2026-08-14T09:00:00',
      tier: 'General',
      seat: '',
      holder: name,
      orderRef: 'ORD-DEMO',
      status: 'valid',
    },
    {
      id: 'TKT-DEMO-2',
      qr: 'SYN1|TKT-DEMO-2|ORD-DEMO|D4E5F6',
      eventId: 'EVT-2',
      eventTitle: 'Noche Sinfónica · Teatro Colón',
      venueName: 'Teatro Colón',
      startsAt: '2026-07-20T19:30:00',
      tier: 'Platea',
      seat: 'A12',
      holder: name,
      orderRef: 'ORD-DEMO',
      status: 'valid',
    },
  ];
}
