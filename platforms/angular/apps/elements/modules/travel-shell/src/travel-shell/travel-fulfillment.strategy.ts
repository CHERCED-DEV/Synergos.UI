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
import { TravelApiClient } from './travel-api.client';
import {
  TRAVEL_FLOW,
  type TravelCheckoutLine,
  type TravelGuest,
  type TravelOffer,
  type TravelProduct,
} from './travel.model';

/** Criteria the app hands the strategy on `search` (carried in the query). */
interface TravelSearchCriteria {
  readonly product: TravelProduct;
  readonly apiBase: string;
  readonly criteria: Readonly<Record<string, unknown>>;
}

/** PSP instrument the app hands the strategy on `pay`. */
interface TravelPayInstrument {
  readonly apiBase: string;
  readonly guest: TravelGuest;
}

/**
 * The Booking vertical's concrete <c>IFulfillmentStrategy</c> for the `travel`
 * flow — the **only place** product-specific transactional behaviour lives. The
 * app calls the engine's <c>FulfillmentContext</c> and never knows this class
 * answered; the provider routes by `flow === 'travel'`.
 *
 * `search`/`select`/`pay`/`confirm` map onto the backend contract via
 * <c>TravelApiClient</c>, which degrades to mock data when an endpoint is not yet
 * wired so the full lifecycle works offline. A cart line is heterogeneous: a
 * hotel (room × rate), a flight (fare family + seat) and a car live side by side
 * under one <c>Pricing</c> and one checkout.
 */
@Injectable()
export class TravelFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = TRAVEL_FLOW;
  protected readonly flow = TRAVEL_FLOW;

  readonly #api = inject(TravelApiClient);

  /** Step 1 — search the chosen product's availability. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<TravelSearchCriteria>;
    const product = criteria.product ?? 'hotel';
    const apiBase = criteria.apiBase ?? '/api/travel';
    const offers = await this.#api.search(
      apiBase,
      product,
      criteria.criteria ?? {},
      query.currency ?? 'COP',
    );
    return offers.map((offer) => this.toProduct(offer));
  }

  /**
   * Step 2 — turn a chosen offer into a heterogeneous cart line. The app builds
   * the `FulfillmentProduct` (already carrying the fare/seat/room selection in
   * `selection`), so the strategy just wraps it into a deterministic line whose
   * id includes the chosen fare/rate so a hotel booked at two rates is two lines.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const item: SessionItem = {
      // Deterministic id per offer+variant → re-selecting the same offer is idempotent.
      id: this.lineId(product),
      kind: product.kind,
      productRef: product.productRef,
      label: product.label,
      selection: product.selection,
      // Engine pricing is in minor units; offers carry major units.
      amount: Math.round(product.amount * 100),
      quantity: 1,
    };
    return { item };
  }

  /** Step 3 — one PSP checkout for the whole mixed cart. */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<TravelPayInstrument>;
    const apiBase = instrument.apiBase ?? '/api/travel';
    const guest: TravelGuest = instrument.guest ?? { name: '', email: '' };
    const lines = this.toLines(request.session);
    const fallbackAmount = request.session.pricing.totalAmount / 100;
    const currency = request.session.pricing.currency;

    const checkout = await this.#api.checkout(apiBase, lines, guest, fallbackAmount, currency);
    // Persist the api base on the reference-bearing session so confirm() reuses it.
    return {
      accepted: true,
      reference: checkout.orderRef,
    };
  }

  /** Step 4 — confirm every held line, returning a voucher/PNR per item. */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    const apiBase = this.apiBaseOf(session);
    const lines = this.toLines(session);
    const confirmation = await this.#api.confirm(apiBase, orderRef, lines);
    // Match confirmed items back to cart lines by their (product, offerId) pair so
    // heterogeneous lines of the same product still map to the right voucher.
    const itemByKey = new Map(
      session.items.map((item) => [`${item.kind}:${item.productRef}`, item.id]),
    );
    const lineByProduct = new Map(session.items.map((item) => [item.kind, item.id]));
    return {
      confirmed: confirmation.status.toLowerCase() === 'confirmed',
      vouchers: confirmation.items.map((entry, index) => {
        const byKey = itemByKey.get(`${entry.product}:${lines[index]?.offerId ?? ''}`);
        const itemId = byKey ?? lineByProduct.get(entry.product) ?? entry.product;
        return {
          itemId,
          reference: entry.reference,
          status: confirmation.status,
          detail: {
            title: entry.title,
            subtitle: entry.subtitle ?? '',
            product: entry.product,
            reservationId: entry.reservationId,
            confirmationCode: confirmation.confirmationCode,
          },
        };
      }),
    };
  }

  private lineId(product: FulfillmentProduct): string {
    const selection = product.selection as Record<string, unknown>;
    const variant =
      readString(selection['fareId']) ||
      readString(selection['rateId']) ||
      readString(selection['seat']);
    return variant
      ? `${product.kind}:${product.productRef}:${variant}`
      : `${product.kind}:${product.productRef}`;
  }

  private apiBaseOf(session: SessionData): string {
    const first = session.items[0]?.selection as Record<string, unknown> | undefined;
    return readString(first?.['apiBase']) || '/api/travel';
  }

  private toProduct(offer: TravelOffer): FulfillmentProduct {
    return {
      productRef: offer.offerId,
      kind: offer.product,
      label: offer.title,
      amount: offer.amount,
      selection: { ...offer.detail, currency: offer.currency, subtitle: offer.subtitle },
      meta: {
        subtitle: offer.subtitle,
        badges: offer.badges,
        currency: offer.currency,
        geo: offer.geo,
        fareFamilies: offer.fareFamilies,
        stayId: offer.stayId,
        rating: offer.rating,
      },
    };
  }

  private toLines(session: SessionData): readonly TravelCheckoutLine[] {
    return session.items.map((item) => ({
      product: item.kind as TravelProduct,
      offerId: item.productRef,
      detail: item.selection,
    }));
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
