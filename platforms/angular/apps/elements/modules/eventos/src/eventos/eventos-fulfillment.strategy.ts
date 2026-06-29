import { Injectable, inject } from '@angular/core';
import {
  FulfillmentStrategyBase,
  type FulfillmentConfirmation,
  type FulfillmentPayRequest,
  type FulfillmentPayResult,
  type FulfillmentProduct,
  type FulfillmentSearchQuery,
  type FulfillmentSelection,
  type SessionData,
  type SessionItem,
} from '@synergos/transaction-engine';
import { EventosApiClient } from './eventos-api.client';
import {
  EVENTOS_FLOW,
  EVENTOS_KIND,
  type Attendee,
  type Buyer,
  type CatalogCriteria,
  type CheckoutItem,
  type EventSummary,
  type TierSelectionPayload,
} from './eventos.model';

/** Criteria the shell hands the strategy on `search`. */
interface EventosSearchCriteria {
  readonly apiBase: string;
  readonly criteria: CatalogCriteria;
}

/** PSP instrument the shell hands the strategy on `pay`. */
interface EventosPayInstrument {
  readonly apiBase: string;
  readonly eventId: string;
  readonly attendees: readonly Attendee[];
  readonly buyer: Buyer;
}

/**
 * The Eventos vertical's concrete <c>IFulfillmentStrategy</c> for the `eventos`
 * flow — the **only place** ticketing-specific transactional behaviour lives. The
 * shell calls the engine's <c>FulfillmentContext</c> and never knows this class
 * answered; the provider routes by `flow === 'eventos'`.
 *
 * `search`/`select`/`pay`/`confirm` map onto the backend contract via
 * <c>EventosApiClient</c>, which degrades to mock data when an endpoint is not yet
 * wired so the full lifecycle works offline. The cart is multi-line (one line per
 * tier selection; reserved-seating carries its seat ids); "confirmed" means the
 * e-tickets (QR) are issued. Free events resolve `pay` to an accepted no-op.
 */
@Injectable()
export class EventosFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = EVENTOS_FLOW;
  protected readonly flow = EVENTOS_FLOW;

  readonly #api = inject(EventosApiClient);

  /** Step 1 — catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<EventosSearchCriteria>;
    const apiBase = criteria.apiBase ?? '/api/eventos';
    const catalogCriteria: CatalogCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      city: '',
      sort: 'relevance',
    };
    const result = await this.#api.events(apiBase, catalogCriteria, query.currency ?? 'COP');
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
        unitAmount: Math.round(payload.amount * 100),
      },
      amount: Math.round(payload.amount * 100),
      quantity,
    };
    return { item };
  }

  /** Step 3 — one PSP order for the whole cart (or free order). */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<EventosPayInstrument>;
    const apiBase = instrument.apiBase ?? '/api/eventos';
    const eventId =
      instrument.eventId ?? (request.session.items[0]?.productRef ?? '');
    const attendees = instrument.attendees ?? [];
    const buyer: Buyer = instrument.buyer ?? { name: '', email: '' };
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const items = toCheckoutItems(request.session);
    const fallbackAmount = request.session.pricing.totalAmount / 100;
    const currency = request.session.pricing.currency;

    const checkout = await this.#api.checkout(
      apiBase,
      eventId,
      items,
      attendees,
      buyer,
      fallbackAmount,
      currency,
    );
    return { accepted: true, reference: checkout.orderRef };
  }

  /** Step 4 — confirm the order, issuing one e-ticket (QR) per attendee/seat. */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    const attendees = (session.parties ?? []).map(
      (party): Attendee => ({
        name: party.fullName,
        email: party.email ?? '',
        document: typeof party.details?.['document'] === 'string' ? party.details['document'] : '',
      }),
    );
    const items = toCheckoutItems(session);
    const confirmation = await this.#api.confirm('/api/eventos', orderRef, attendees, items);
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

/** Expand the cart into the checkout contract's `items` (one per seat, else qty). */
function toCheckoutItems(session: SessionData): readonly CheckoutItem[] {
  const items: CheckoutItem[] = [];
  for (const line of session.items) {
    const selection = line.selection as Record<string, unknown>;
    const tier = typeof selection['tierId'] === 'string' ? selection['tierId'] : line.productRef;
    const seats = Array.isArray(selection['seats']) ? (selection['seats'] as string[]) : [];
    if (seats.length > 0) {
      for (const seat of seats) {
        items.push({ tier, seat, qty: 1 });
      }
    } else {
      items.push({ tier, qty: Math.max(1, line.quantity) });
    }
  }
  return items;
}
