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
import { RealtyApiClient } from './realty-api.client';
import {
  REALTY_FLOW,
  REALTY_KIND,
  type ContactInfo,
  type Listing,
  type SearchCriteria,
  type VisitMode,
  type VisitSelectionPayload,
  type VisitSlot,
} from './realty.model';

/** Criteria the portal hands the strategy on `search` (carried in the query). */
interface RealtySearchCriteria {
  readonly apiBase: string;
  readonly criteria: SearchCriteria;
}

/** "Instrument" the visit wizard hands the strategy on `pay` — NO real payment. */
interface RealtyVisitInstrument {
  readonly apiBase: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly slot: VisitSlot;
  readonly mode: VisitMode;
  readonly contact: ContactInfo;
}

/**
 * The Propiedades vertical's concrete <c>IFulfillmentStrategy</c> for the `realty`
 * flow — the **only place** realty-specific transactional behaviour lives, and the
 * proof that the shared engine is general enough to drive a **non-payment**
 * transaction (doc 21 §1.1 punto 5 + §2.7: "el pago es un paso apagable").
 *
 * The reservable resource here is a **visit slot** (habitación ≈ asiento ≈ médico ≈
 * **visita**), held via the engine like any other. `search`/`select`/`pay`/`confirm`
 * map onto the backend contract via <c>RealtyApiClient</c>, which degrades to mock
 * data when an endpoint is not yet wired so the full lifecycle works offline. The
 * **`pay` step is OFF**: it resolves to an accepted no-op (a synthetic reference)
 * so the checkout wizard advances to `confirm`, where the visit is actually booked
 * (`POST /api/realty/visit`). The portal calls the engine's <c>FulfillmentContext</c>
 * and never knows this class answered; the provider routes by `flow === 'realty'`.
 */
@Injectable()
export class RealtyFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = REALTY_FLOW;
  protected readonly flow = REALTY_FLOW;

  readonly #api = inject(RealtyApiClient);

  /** Step 1 — search the listings catalogue. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<RealtySearchCriteria>;
    const apiBase = criteria.apiBase ?? '/api/realty';
    const searchCriteria: SearchCriteria = criteria.criteria ?? {
      q: '',
      operation: 'sale',
      type: '',
      minPrice: 0,
      maxPrice: 0,
      beds: 0,
      location: '',
      sort: 'relevance',
    };
    const result = await this.#api.listings(apiBase, searchCriteria, query.currency ?? 'COP');
    return result.listings.map((listing) => this.toProduct(listing));
  }

  /**
   * Step 2 — turn the chosen listing + slot into a single-visit cart line. The id
   * is deterministic per listing so re-selecting the same listing replaces (never
   * duplicates) the line — the engine's idempotent-by-id `addItem` contract. The
   * amount is 0: a visit costs nothing (pago OFF).
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const raw = product.selection as Record<string, unknown>;
    const payload = product.selection as unknown as VisitSelectionPayload;
    const item: SessionItem = {
      id: `${REALTY_KIND}:${payload.listingId}`,
      kind: REALTY_KIND,
      productRef: payload.listingId,
      label: `Visita · ${payload.listingTitle}`,
      selection: {
        apiBase: readString(raw['apiBase']) || '/api/realty',
        listingId: payload.listingId,
        listingTitle: payload.listingTitle,
        slotDate: payload.slot.date,
        slotTime: payload.slot.time,
        mode: payload.mode,
        contactName: payload.contact.name,
        contactEmail: payload.contact.email,
        contactPhone: payload.contact.phone,
      },
      amount: 0,
      quantity: 1,
    };
    return { item };
  }

  /**
   * Step 3 — **pago apagado**. There is no PSP: agendar una visita es gratis, así
   * que aceptamos con una referencia sintética para que el wizard avance a
   * `confirm`, donde se agenda la visita de verdad.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    return { accepted: true, reference: `VISIT-${Date.now().toString(36).toUpperCase()}` };
  }

  /** Step 4 — confirm the reservation: actually book the visit slot (NO payment). */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const line = session.items[0];
    if (!line) {
      return { confirmed: false, vouchers: [] };
    }
    const selection = line.selection as Record<string, unknown>;
    const apiBase = readString(selection['apiBase']) || '/api/realty';
    const listingId = readString(selection['listingId']);
    const listingTitle = readString(selection['listingTitle']);
    const slot: VisitSlot = {
      date: readString(selection['slotDate']),
      time: readString(selection['slotTime']),
    };
    const contact: ContactInfo = {
      name: readString(selection['contactName']),
      email: readString(selection['contactEmail']),
      phone: readString(selection['contactPhone']),
    };
    const mode: VisitMode = readString(selection['mode']) === 'video' ? 'video' : 'in-person';

    const visit = await this.#api.scheduleVisit(
      apiBase,
      { listingId, slot, contact, mode },
      listingTitle,
    );
    return {
      confirmed: visit.status === 'confirmed' || visit.status === 'held',
      vouchers: [
        {
          itemId: line.id,
          reference: visit.id,
          status: visit.status,
          detail: {
            visitId: visit.id,
            listingId: visit.listingId,
            listingTitle: visit.listingTitle,
            date: visit.slot.date,
            time: visit.slot.time,
            mode: visit.mode,
          },
        },
      ],
    };
  }

  private toProduct(listing: Listing): FulfillmentProduct {
    return {
      productRef: listing.id,
      kind: REALTY_KIND,
      label: listing.title,
      // A visit is free — the amount is the listing price only as informational meta.
      amount: 0,
      selection: { ...listing },
      meta: {
        subtitle: listing.subtitle,
        badges: listing.badges,
        currency: listing.currency,
        price: listing.price,
        operation: listing.operation,
        geo: listing.geo,
      },
    };
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
