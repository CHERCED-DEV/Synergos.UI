import { Injectable, inject } from '@angular/core';
import {
  FulfillmentStrategyBase,
  SessionStore,
  type FulfillmentConfirmation,
  type FulfillmentPayRequest,
  type FulfillmentPayResult,
  type FulfillmentProduct,
  type FulfillmentSearchQuery,
  type FulfillmentSelection,
  type SessionData,
  type SessionItem,
  type SessionParty,
} from '@synergos/transaction-engine';
import type { BffEventos } from '@synergos/contracts';
import { EventosApiClient } from './eventos-api.client';
import {
  EVENTOS_FLOW,
  EVENTOS_KIND,
  type Attendee,
  type CatalogCriteria,
  type EventSummary,
  type TierSelectionPayload,
} from './eventos.model';
import { aMenores, abrirCompraDeEventos, cerrarCompraDeEventos } from '@synergos/vitals-core';

/** Criteria the shell hands the strategy on `search`. */
interface EventosSearchCriteria {
  readonly apiBase: string;
  readonly criteria: CatalogCriteria;
}

/**
 * Lo que el asistente SH-3 le pasa a la estrategia en `pay` Y en `confirm` (ADR 0140 F4).
 *
 * `host` es el `<synergos-eventos>` de ESTA compra: desde él se encuentra, por ancestro, su
 * `<synergos-flujo>`. Viaja por llamada porque hay UNA estrategia por página (la app se crea una
 * vez por etiqueta) y un campo suyo cruzaría dos instancias (regla 60).
 */
interface EventosPayInstrument {
  readonly host: Element;
  readonly apiBase: string;
  readonly attendees: readonly Attendee[];
  /** El evento de la compra, para la billetera ("mis tickets"). */
  readonly eventId?: string;
  readonly eventTitle?: string;
  readonly venueName?: string;
  readonly startsAt?: string;
}

/**
 * The Eventos vertical's concrete <c>IFulfillmentStrategy</c> for the `eventos`
 * flow — the **only place** ticketing-specific transactional behaviour lives. The
 * shell calls the engine's <c>FulfillmentContext</c> and never knows this class
 * answered; the provider routes by `flow === 'eventos'`.
 *
 * **La compra va por la puerta** (ADR 0140 F4): `pay` la ABRE —aparta y autoriza— y anota los
 * asistentes; `confirm` la CIERRA —captura— y pide las entradas. Abrir y cerrar no salen de acá:
 * se le piden al `<synergos-flujo>` ancestro del elemento, que las lleva a la puerta con el
 * cliente generado. Sin coordinador la compra contesta que no, con `cliente.sin_coordinador`, y
 * **nunca vuelve a la ruta vieja** (`/api/eventos/checkout|confirm`): dos caminos para la misma
 * intención abren dos órdenes, y el retiro exige cero usos. Los rechazos vuelven como su `code`.
 */
@Injectable()
export class EventosFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = EVENTOS_FLOW;
  protected readonly flow = EVENTOS_FLOW;

  readonly #api = inject(EventosApiClient);
  readonly #store = inject(SessionStore);

  /** Step 1 — catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<EventosSearchCriteria>;
    const apiBase = criteria.apiBase ?? '';
    const catalogCriteria: CatalogCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      city: '',
      sort: 'relevance',
    };
    const result = await this.#api.events(apiBase, catalogCriteria, query.currency ?? '');
    return result.events.map((event) => this.toProduct(event));
  }

  /**
   * Step 2 — turn a chosen tier (+ optional seats) into a cart line. The line id
   * is deterministic per event+tier so re-selecting the same tier replaces (never
   * duplicates) the line — the engine's `addItem` idempotent-by-id contract. For
   * reserved seating, the seat ids ride in the selection payload and the quantity
   * tracks the number of seats.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const payload = product.selection as unknown as TierSelectionPayload;
    const quantity = Math.max(1, payload.seats.length || payload.quantity);
    const item: SessionItem = {
      id: this.lineId(payload),
      kind: EVENTOS_KIND,
      productRef: payload.eventId,
      label: `${payload.eventTitle} · ${payload.tierName}`,
      selection: {
        eventId: payload.eventId,
        eventTitle: payload.eventTitle,
        tierId: payload.tierId,
        tierName: payload.tierName,
        currency: payload.currency,
        cover: payload.cover,
        seats: [...payload.seats],
        // Engine pricing is in minor units; payload carries major units.
        unitAmount: aMenores(payload.amount, payload.currency),
        apiBase: payload.apiBase ?? '',
      },
      amount: aMenores(payload.amount, payload.currency),
      quantity,
    };
    return { item };
  }

  /**
   * Step 3 — ABRIR la compra por la puerta y anotar sus asistentes.
   *
   * La llave de idempotencia es la de la INTENCIÓN: `SessionData.sessionId`, nueva en cada
   * selección y persistida, así que sobrevive a la recarga y al login. Con la misma llave y una
   * saga en curso el orquestador devuelve esa saga; con una deshecha, la reabre. El total que se
   * cobra es el del servidor —con su comisión—, y la sesión pasa a decirlo: es el que el asistente
   * anota y compara después. Devuelve como referencia el id de la saga.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<EventosPayInstrument>;
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const host = instrument.host;
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    const cuerpo: BffEventos.BuyTicketsRequest = { eventId: eventIdOf(request.session), lines: toLines(request.session) };
    const abierta = await abrirCompraDeEventos(host, cuerpo, request.session.sessionId);
    if (!abierta.ok) {
      return { accepted: false, reason: abierta.rechazo.code };
    }
    const compra = abierta.valor;
    const total = aMenores(compra.importe, compra.moneda);
    const sesion = this.#store.getValidSession();
    const attendees = instrument.attendees ?? [];
    const parties: SessionParty[] = attendees.map((attendee, index) => ({
      id: `att-${index + 1}`,
      fullName: attendee.name,
      email: attendee.email,
      details: { document: attendee.document },
    }));
    this.#store.setSession({
      ...sesion,
      parties,
      pricing: { ...sesion.pricing, currency: compra.moneda, totalAmount: total, balanceDue: total },
    });

    const anotados = await this.#api.anotarAsistentes(instrument.apiBase ?? apiBaseOf(request.session), compra.id, attendees);
    if (!anotados.ok) {
      // La saga queda abierta —apartada y autorizada, sin cobrar—: volver a pulsar abre con la
      // MISMA llave, el orquestador devuelve esa saga, y se anotan otra vez.
      return { accepted: false, reason: anotados.rechazo.code };
    }
    return { accepted: true, reference: compra.id };
  }

  /**
   * Step 4 — CERRAR la compra (captura) y pedir sus entradas.
   *
   * **Si cerrar falla sin ser transitorio, la saga ya se deshizo** (el orquestador compensa y
   * devuelve el rechazo original): reintentar cerrar contestaría `eventos.not_confirmable` para
   * siempre. Por eso el último pago de la sesión se marca `failed`, y el siguiente clic vuelve a
   * `pay`, que abre con la MISMA llave y el orquestador reabre la saga deshecha. Si es transitorio
   * el pago se queda como está y el reintento repite sólo cerrar, que es idempotente.
   */
  override async confirm(
    session: SessionData,
    instrument?: Readonly<Record<string, unknown>>,
  ): Promise<FulfillmentConfirmation> {
    const datos = (instrument ?? {}) as Partial<EventosPayInstrument>;
    const host = datos.host;
    const id = session.payments[session.payments.length - 1]?.reference ?? '';
    if (!(host instanceof Element)) {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    const cerrada = await cerrarCompraDeEventos(host, id);
    if (!cerrada.ok) {
      if (!cerrada.rechazo.transient) {
        this.marcarElPagoFallido();
      }
      return { confirmed: false, reason: cerrada.rechazo.code, vouchers: [] };
    }

    const attendees = (session.parties ?? []).map(
      (party): Attendee => ({
        name: party.fullName,
        email: party.email ?? '',
        document: typeof party.details?.['document'] === 'string' ? party.details['document'] : '',
      }),
    );
    const entradas = await this.#api.entradas(datos.apiBase ?? apiBaseOf(session), id, attendees, {
      eventId: datos.eventId ?? eventIdOf(session),
      eventTitle: datos.eventTitle ?? eventSelectionTitle(session),
      venueName: datos.venueName ?? '',
      startsAt: datos.startsAt ?? '',
    });
    if (!entradas.ok) {
      // La compra quedó cerrada y cobrada: el pago sigue capturado en la sesión, y el reintento
      // repite cerrar (idempotente sobre una compra completa) y vuelve a pedir las entradas.
      return { confirmed: false, reason: entradas.rechazo.code, vouchers: [] };
    }
    const confirmation = entradas.valor;
    return {
      confirmed:
        confirmation.status.toLowerCase() === 'confirmed' ||
        confirmation.status.toLowerCase() === 'paid',
      vouchers: confirmation.tickets.map((ticket) => ({
        itemId: ticket.id,
        reference: ticket.qr,
        status: confirmation.status,
        detail: {
          ticketId: ticket.id,
          qr: ticket.qr,
          attendee: ticket.attendee ?? '',
          tier: ticket.tier ?? '',
          seat: ticket.seat ?? '',
        },
      })),
    };
  }

  /** El último pago de la sesión, `failed`: lo que el servidor deshizo ya no está cobrado. */
  private marcarElPagoFallido(): void {
    const sesion = this.#store.getValidSession();
    const ultimo = sesion.payments.length - 1;
    if (ultimo < 0) {
      return;
    }
    this.#store.setSession({
      ...sesion,
      payments: sesion.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
    });
  }

  private lineId(payload: TierSelectionPayload): string {
    return `${EVENTOS_KIND}:${payload.eventId}:${payload.tierId}`;
  }

  private toProduct(event: EventSummary): FulfillmentProduct {
    return {
      productRef: event.id,
      kind: EVENTOS_KIND,
      label: event.title,
      amount: event.fromAmount,
      selection: { ...event },
      meta: {
        subtitle: event.subtitle,
        badges: event.badges,
        currency: event.currency,
        city: event.city,
        startsAt: event.startsAt,
        mode: event.mode,
      },
    };
  }
}

/** Ver `TierSelectionPayload.apiBase`: sale de la LÍNEA, que sobrevive a una recarga. */
function apiBaseOf(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const base = selection?.['apiBase'];
  return typeof base === 'string' ? base.trim() : '';
}

/** El evento de la compra, de la LÍNEA del carrito (sobrevive a la recarga y al login). */
function eventIdOf(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const id = selection?.['eventId'];
  return typeof id === 'string' ? id : (session.items[0]?.productRef ?? '');
}

/** Read the event title from the first cart line's selection (best-effort). */
function eventSelectionTitle(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const title = selection?.['eventTitle'];
  return typeof title === 'string' ? title : (session.items[0]?.label ?? '');
}

/**
 * El carrito como las líneas de `BuyTicketsRequest`: una por butaca (cantidad 1) en lo numerado,
 * y una por localidad con su cantidad en la admisión general.
 */
function toLines(session: SessionData): BffEventos.TicketLineRequest[] {
  const lines: BffEventos.TicketLineRequest[] = [];
  for (const line of session.items) {
    const selection = line.selection as Record<string, unknown>;
    const tier = typeof selection['tierId'] === 'string' ? selection['tierId'] : line.productRef;
    const seats = Array.isArray(selection['seats']) ? (selection['seats'] as string[]) : [];
    if (seats.length > 0) {
      for (const seat of seats) {
        lines.push({ quantity: 1, tier, seat });
      }
    } else {
      lines.push({ quantity: Math.max(1, line.quantity), tier });
    }
  }
  return lines;
}
