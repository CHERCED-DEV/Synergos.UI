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

/** Criteria the shell hands the strategy on `search` (carried in the query). */
interface TravelSearchCriteria {
  readonly product: TravelProduct;
  readonly apiBase: string;
  readonly criteria: Readonly<Record<string, unknown>>;
}

/** PSP instrument the shell hands the strategy on `pay`. */
interface TravelPayInstrument {
  readonly apiBase: string;
  readonly guest: TravelGuest;
}

/**
 * The Booking vertical's concrete <c>IFulfillmentStrategy</c> for the `travel`
 * flow — the **only place** product-specific transactional behaviour lives. The
 * shell calls the engine's <c>FulfillmentContext</c> and never knows this class
 * answered; the provider routes by `flow === 'travel'`.
 *
 * `search`/`select`/`pay`/`confirm` map onto the backend contract via
 * <c>TravelApiClient</c>, which degrades to mock data when an endpoint is not yet
 * wired so the full lifecycle works offline.
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

  /** Step 2 — turn a chosen offer into a heterogeneous cart line. */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const item: SessionItem = {
      // Deterministic id per offer → re-selecting the same offer is idempotent.
      id: `${product.kind}:${product.productRef}`,
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
    // Persist the order ref on the session payment record via the reference.
    return {
      accepted: true,
      reference: checkout.orderRef,
    };
  }

  /** Step 4 — confirm every held line, returning a voucher per item. */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    const lines = this.toLines(session);
    const confirmation = await this.#api.confirm('/api/travel', orderRef, lines);
    const itemByProduct = new Map(session.items.map((item) => [item.kind, item.id]));
    return {
      confirmed: confirmation.status.toLowerCase() === 'confirmed',
      vouchers: confirmation.items.map((entry) => ({
        itemId: itemByProduct.get(entry.product) ?? entry.product,
        reference: entry.reference,
        status: confirmation.status,
        detail: { title: entry.title, product: entry.product },
      })),
    };
  }

  private toProduct(offer: TravelOffer): FulfillmentProduct {
    return {
      productRef: offer.offerId,
      kind: offer.product,
      label: offer.title,
      amount: offer.amount,
      selection: { ...offer.detail, currency: offer.currency, subtitle: offer.subtitle },
      meta: { subtitle: offer.subtitle, badges: offer.badges, currency: offer.currency },
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
