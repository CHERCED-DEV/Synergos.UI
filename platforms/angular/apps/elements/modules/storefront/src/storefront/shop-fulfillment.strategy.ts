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
import { ShopApiClient } from './shop-api.client';
import {
  STOREFRONT_FLOW,
  STOREFRONT_KIND,
  type CheckoutLine,
  type SearchCriteria,
  type ShopCustomer,
  type ShopProduct,
} from './shop.model';

/** Criteria the storefront hands the strategy on `search`. */
interface ShopSearchCriteria {
  readonly apiBase: string;
  readonly criteria: SearchCriteria;
}

/** What the storefront hands the strategy as a `select` candidate. */
export interface ShopSelectionPayload {
  readonly productId: string;
  readonly variantId: string;
  readonly variantLabel: string;
  readonly title: string;
  /** Unit price in major units. */
  readonly unitAmount: number;
  readonly currency: string;
  readonly quantity: number;
  readonly image: string;
  /** Marketplace seller — the cart groups lines per seller. */
  readonly seller?: string;
}

/** PSP instrument the storefront hands the strategy on `pay`. */
interface ShopPayInstrument {
  readonly apiBase: string;
  readonly customer: ShopCustomer;
}

/**
 * The Tienda vertical's concrete <c>IFulfillmentStrategy</c> for the `storefront`
 * flow — the **only place** product-specific transactional behaviour lives. The
 * storefront calls the engine's <c>FulfillmentContext</c> and never knows this
 * class answered; the provider routes by `flow === 'storefront'`.
 *
 * `search`/`select`/`pay`/`confirm` map onto the backend contract via
 * <c>ShopApiClient</c>, which degrades to mock data when an endpoint is not yet
 * wired so the full lifecycle works offline.
 */
@Injectable()
export class ShopFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = STOREFRONT_FLOW;
  protected readonly flow = STOREFRONT_FLOW;

  readonly #api = inject(ShopApiClient);

  /** Step 1 — faceted catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<ShopSearchCriteria>;
    const apiBase = criteria.apiBase ?? '/api/shop';
    const searchCriteria: SearchCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      facets: {},
      sort: 'relevance',
      page: 1,
    };
    const result = await this.#api.search(apiBase, searchCriteria, query.currency ?? 'COP');
    // The storefront needs the facets too; carry them on the first product's meta is
    // wrong — instead we expose facets via a sentinel product. Keep it simple: the
    // shell reads facets from the client directly. Here we only map products.
    return result.products.map((product) => this.toProduct(product));
  }

  /**
   * Step 2 — turn a chosen product+variant into a single cart line carrying the
   * **delta** quantity to add. The shell merges this against the live store line at
   * apply time (so concurrent quick-adds accumulate deterministically), keeping the
   * engine's `addItem` idempotent-by-id contract intact.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const payload = product.selection as unknown as ShopSelectionPayload;
    const quantity = Math.max(1, Math.trunc(payload.quantity || 1));
    const item: SessionItem = {
      // Deterministic id per product+variant → re-selecting targets the same line.
      id: this.lineId(payload),
      kind: STOREFRONT_KIND,
      productRef: payload.productId,
      label: payload.title,
      selection: {
        productId: payload.productId,
        variantId: payload.variantId,
        variantLabel: payload.variantLabel,
        currency: payload.currency,
        image: payload.image,
        seller: payload.seller ?? '',
        unitAmount: Math.round(payload.unitAmount * 100),
      },
      // Engine pricing is in minor units; payload carries major units.
      amount: Math.round(payload.unitAmount * 100),
      quantity,
    };
    return { item };
  }

  /** Step 3 — one PSP checkout for the whole cart. */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<ShopPayInstrument>;
    const apiBase = instrument.apiBase ?? '/api/shop';
    const customer: ShopCustomer = instrument.customer ?? { name: '', email: '' };
    const lines = this.toLines(request.session);
    const fallbackAmount = request.session.pricing.totalAmount / 100;
    const currency = request.session.pricing.currency;

    const checkout = await this.#api.checkout(apiBase, lines, customer, fallbackAmount, currency);
    return {
      accepted: true,
      reference: checkout.orderRef,
    };
  }

  /** Step 4 — confirm the order, returning a voucher per cart line. */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    const lines = this.toLines(session);
    const confirmation = await this.#api.confirm('/api/shop', orderRef, lines);
    const itemByProduct = new Map(session.items.map((item) => [item.productRef, item.id]));
    return {
      confirmed: confirmation.status.toLowerCase() === 'confirmed',
      vouchers: confirmation.items.map((entry) => ({
        itemId: itemByProduct.get(entry.productId) ?? entry.productId,
        reference: entry.reference,
        status: confirmation.status,
        detail: { title: entry.title, qty: entry.qty, orderNumber: confirmation.orderNumber },
      })),
    };
  }

  private lineId(payload: ShopSelectionPayload): string {
    return `${STOREFRONT_KIND}:${payload.productId}:${payload.variantId}`;
  }

  private toProduct(product: ShopProduct): FulfillmentProduct {
    return {
      productRef: product.id,
      kind: STOREFRONT_KIND,
      label: product.title,
      amount: product.amount,
      selection: { ...product },
      meta: {
        subtitle: product.subtitle,
        badges: product.badges,
        currency: product.currency,
        rating: product.rating,
      },
    };
  }

  private toLines(session: SessionData): readonly CheckoutLine[] {
    return session.items.map((item) => {
      const selection = item.selection as Record<string, unknown>;
      return {
        productId: item.productRef,
        variantId: typeof selection['variantId'] === 'string' ? selection['variantId'] : '',
        qty: item.quantity,
      };
    });
  }
}
