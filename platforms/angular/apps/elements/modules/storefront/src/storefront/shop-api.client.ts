import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type CheckoutLine,
  type CheckoutResult,
  type Facet,
  type MessageThread,
  type OrderConfirmation,
  type OrderTracking,
  type ProductCondition,
  type ProductDetail,
  type ProductQuestion,
  type ProductReview,
  type ProductVariant,
  type ReturnReceipt,
  type SearchCriteria,
  type SearchResult,
  type ShipmentStage,
  type ShopCustomer,
  type ShopOrder,
  type ShopProduct,
  type WishlistEntry,
} from './shop.model';

/**
 * Thin HTTP client over the Tienda backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/shop/search?q=&category=&...facets`        → `{ products, facets }`
 *  - `GET  /api/shop/product/{id}`                         → `{ product, variants, reviews, questions }`
 *  - `POST /api/shop/checkout` `{ items, customer }`       → `{ orderRef, paymentSessionId, amount, currency }`
 *  - `POST /api/shop/confirm`  `{ orderRef }`              → `{ status, orderNumber, items }`
 *  - `GET  /api/shop/orders?customer=`                     → `{ orders }`
 *  - `GET  /api/shop/wishlist`                             → `{ items }`
 *  - `POST /api/shop/wishlist` `{ productId, action }`     → `{ items }` (add | remove)
 *  - `GET  /api/shop/order/{ref}/tracking`                 → `{ orderRef, carrier, stages }`
 *  - `POST /api/shop/order/{ref}/return` `{ reason }`      → `{ claimId, status }`
 *  - `GET  /api/shop/messages`                             → `{ threads }` (mensajería v1)
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. Every mock path flips the
 * `degraded` flag so the shell can surface a "datos de ejemplo" notice.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class ShopApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Search (faceted) ────────────────────────────────────────────────────────

  async search(
    apiBase: string,
    criteria: SearchCriteria,
    currency: string,
  ): Promise<SearchResult> {
    const query = this.toSearchQuery(criteria);
    const url = `${apiBase}/search${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeSearch(data, currency);
      // A legitimately empty live result is fine — return it as-is when the shape matches.
      if (result && (result.products.length > 0 || isRecord(data))) {
        return result;
      }
      throw new Error('search-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/search', error);
      return mockSearch(criteria, currency);
    }
  }

  // ─── Product detail ──────────────────────────────────────────────────────────

  async product(apiBase: string, id: string, currency: string): Promise<ProductDetail> {
    const url = `${apiBase}/product/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(data, currency);
      if (detail) {
        return detail;
      }
      throw new Error('product-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/product/{id}', error);
      return mockDetail(id, currency);
    }
  }

  // ─── Checkout (single payment for the whole cart) ────────────────────────────

  async checkout(
    apiBase: string,
    lines: readonly CheckoutLine[],
    customer: ShopCustomer,
    fallbackAmount: number,
    currency: string,
  ): Promise<CheckoutResult> {
    const url = `${apiBase}/checkout`;
    try {
      const data = await this.postJson(url, { items: lines, customer });
      const result = normalizeCheckout(data, currency);
      if (result) {
        return result;
      }
      throw new Error('checkout-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/checkout', error);
      return {
        orderRef: `MOCK-${Date.now().toString(36).toUpperCase()}`,
        paymentSessionId: `psp_mock_${Math.random().toString(36).slice(2, 10)}`,
        amount: fallbackAmount,
        currency,
      };
    }
  }

  // ─── Confirm (place the order) ───────────────────────────────────────────────

  async confirm(
    apiBase: string,
    orderRef: string,
    fallbackLines: readonly CheckoutLine[],
  ): Promise<OrderConfirmation> {
    const url = `${apiBase}/confirm`;
    try {
      const data = await this.postJson(url, { orderRef });
      const confirmation = normalizeConfirmation(data);
      if (confirmation) {
        return confirmation;
      }
      throw new Error('confirm-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/confirm', error);
      return {
        status: 'confirmed',
        orderNumber: orderRef,
        items: fallbackLines.map((line) => ({
          productId: line.productId,
          title: line.productId,
          qty: line.qty,
          reference: `${orderRef}-${line.variantId || line.productId}`,
        })),
      };
    }
  }

  // ─── Orders (history) ────────────────────────────────────────────────────────

  async orders(apiBase: string, customer: string, currency: string): Promise<readonly ShopOrder[]> {
    const query = customer ? `?customer=${encodeURIComponent(customer)}` : '';
    const url = `${apiBase}/orders${query}`;
    try {
      const data = await this.getJson(url);
      const orders = normalizeOrders(data, currency);
      if (orders) {
        return orders;
      }
      throw new Error('orders-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/orders', error);
      return mockOrders(currency);
    }
  }

  // ─── Wishlist (favoritos / listas) ───────────────────────────────────────────

  async wishlist(apiBase: string, currency: string): Promise<readonly WishlistEntry[]> {
    const url = `${apiBase}/wishlist`;
    try {
      const data = await this.getJson(url);
      const entries = normalizeWishlist(data, currency);
      if (entries) {
        return entries;
      }
      throw new Error('wishlist-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/wishlist', error);
      return this.#localWishlist;
    }
  }

  async wishlistMutate(
    apiBase: string,
    entry: WishlistEntry,
    action: 'add' | 'remove',
  ): Promise<readonly WishlistEntry[]> {
    const url = `${apiBase}/wishlist`;
    try {
      const data = await this.postJson(url, { productId: entry.productId, action });
      const entries = normalizeWishlist(data, entry.currency);
      if (entries) {
        return entries;
      }
      throw new Error('wishlist-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/wishlist', error);
      // Local optimistic fallback so the whole favoritos flow works offline.
      const without = this.#localWishlist.filter((line) => line.productId !== entry.productId);
      this.#localWishlist = action === 'add' ? [...without, entry] : without;
      return this.#localWishlist;
    }
  }

  // ─── Tracking (seguimiento de envío) ─────────────────────────────────────────

  async tracking(apiBase: string, orderRef: string, status: string): Promise<OrderTracking> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/tracking`;
    try {
      const data = await this.getJson(url);
      const tracking = normalizeTracking(data, orderRef);
      if (tracking) {
        return tracking;
      }
      throw new Error('tracking-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/order/{ref}/tracking', error);
      return mockTracking(orderRef, status);
    }
  }

  // ─── Returns (devoluciones / reclamos) ───────────────────────────────────────

  async requestReturn(apiBase: string, orderRef: string, reason: string): Promise<ReturnReceipt> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/return`;
    try {
      const data = await this.postJson(url, { reason });
      const receipt = normalizeReturn(data);
      if (receipt) {
        return receipt;
      }
      throw new Error('return-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/order/{ref}/return', error);
      return {
        claimId: `CLM-${Date.now().toString(36).toUpperCase()}`,
        status: 'abierto',
      };
    }
  }

  // ─── Messages (mensajería v1) ────────────────────────────────────────────────

  async messages(apiBase: string): Promise<readonly MessageThread[]> {
    const url = `${apiBase}/messages`;
    try {
      const data = await this.getJson(url);
      const threads = normalizeThreads(data);
      if (threads) {
        return threads;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/messages', error);
      return mockThreads();
    }
  }

  /** Local wishlist store used only while the backend endpoint is missing. */
  #localWishlist: readonly WishlistEntry[] = [];

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

  private toSearchQuery(criteria: SearchCriteria): string {
    const params = new URLSearchParams();
    if (criteria.q) {
      params.set('q', criteria.q);
    }
    if (criteria.category) {
      params.set('category', criteria.category);
    }
    if (criteria.sort && criteria.sort !== 'relevance') {
      params.set('sort', criteria.sort);
    }
    if (criteria.page > 1) {
      params.set('page', String(criteria.page));
    }
    for (const [key, values] of Object.entries(criteria.facets)) {
      if (values.length > 0) {
        params.set(key, values.join(','));
      }
    }
    return params.toString();
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Tienda API responds.
    this.#logger.warn(`Shop API "${endpoint}" unavailable — using mock data.`, error);
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

function readCondition(value: unknown): ProductCondition {
  const raw = readString(value).toLowerCase();
  return raw === 'used' || raw === 'refurbished' ? raw : 'new';
}

function normalizeProduct(value: unknown, fallbackCurrency: string): ShopProduct | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim() || readString(value['sku']).trim();
  const title = readString(value['title']).trim() || readString(value['name']).trim();
  if (!id || !title) {
    return null;
  }
  const amount = readNumber(value['amount'] ?? value['price']);
  const listAmount = readNumber(value['listAmount'] ?? value['listPrice']);
  return {
    id,
    title,
    subtitle: readString(value['subtitle']).trim() || readString(value['description']).trim(),
    amount,
    listAmount: listAmount > amount ? listAmount : undefined,
    currency: readString(value['currency']).trim() || fallbackCurrency,
    brand: readString(value['brand']).trim(),
    category: readString(value['category']).trim(),
    seller: readString(value['seller']).trim() || undefined,
    condition: readCondition(value['condition']),
    freeShipping: readBoolean(value['freeShipping']),
    rating: readNumber(value['rating']),
    reviewCount: Math.trunc(readNumber(value['reviewCount'])),
    inStock: readBoolean(value['inStock'], true),
    images: readStringArray(value['images']),
    badges: readStringArray(value['badges']),
  };
}

function normalizeFacets(value: unknown): readonly Facet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): Facet | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const key = readString(entry['key']).trim();
      if (!key) {
        return null;
      }
      const rawValues = Array.isArray(entry['values']) ? entry['values'] : [];
      return {
        key,
        label: readString(entry['label']).trim() || key,
        values: rawValues
          .map((facetValue) => {
            if (!isRecord(facetValue)) {
              return null;
            }
            const facetRaw = readString(facetValue['value']).trim();
            if (!facetRaw) {
              return null;
            }
            return {
              value: facetRaw,
              label: readString(facetValue['label']).trim() || facetRaw,
              count: Math.trunc(readNumber(facetValue['count'])),
            };
          })
          .filter((facetValue): facetValue is Facet['values'][number] => facetValue !== null),
      };
    })
    .filter((facet): facet is Facet => facet !== null);
}

function normalizeSearch(value: unknown, fallbackCurrency: string): SearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawProducts = Array.isArray(value['products'])
    ? value['products']
    : Array.isArray(value['items'])
      ? value['items']
      : [];
  return {
    products: rawProducts
      .map((entry) => normalizeProduct(entry, fallbackCurrency))
      .filter((product): product is ShopProduct => product !== null),
    facets: normalizeFacets(value['facets']),
  };
}

function normalizeVariant(value: unknown, fallbackAmount: number): ProductVariant | null {
  if (!isRecord(value)) {
    return null;
  }
  const variantId = readString(value['variantId']).trim() || readString(value['id']).trim();
  if (!variantId) {
    return null;
  }
  const attributesRaw = isRecord(value['attributes']) ? value['attributes'] : {};
  const attributes: Record<string, string> = {};
  for (const [key, attrValue] of Object.entries(attributesRaw)) {
    attributes[key] = readString(attrValue);
  }
  const stock = Math.trunc(readNumber(value['stock']));
  return {
    variantId,
    label: readString(value['label']).trim() || variantId,
    attributes,
    amount: readNumber(value['amount'] ?? value['price']) || fallbackAmount,
    inStock: readBoolean(value['inStock'], stock > 0),
    stock,
  };
}

function normalizeReview(value: unknown): ProductReview | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const body = readString(value['body']).trim() || readString(value['text']).trim();
  if (!id && !body) {
    return null;
  }
  return {
    id: id || `rev-${Math.random().toString(36).slice(2, 8)}`,
    author: readString(value['author']).trim() || 'Anónimo',
    rating: readNumber(value['rating']),
    title: readString(value['title']).trim(),
    body,
    date: readString(value['date']).trim(),
  };
}

function normalizeQuestion(value: unknown): ProductQuestion | null {
  if (!isRecord(value)) {
    return null;
  }
  const question = readString(value['question']).trim() || readString(value['text']).trim();
  if (!question) {
    return null;
  }
  const answer = readString(value['answer']).trim();
  return {
    id: readString(value['id']).trim() || `q-${Math.random().toString(36).slice(2, 8)}`,
    author: readString(value['author']).trim() || 'Comprador',
    question,
    answer: answer || undefined,
    date: readString(value['date']).trim(),
  };
}

function normalizeDetail(value: unknown, fallbackCurrency: string): ProductDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const product = normalizeProduct(value['product'] ?? value, fallbackCurrency);
  if (!product) {
    return null;
  }
  const rawVariants = Array.isArray(value['variants']) ? value['variants'] : [];
  const rawReviews = Array.isArray(value['reviews']) ? value['reviews'] : [];
  const rawQuestions = Array.isArray(value['questions']) ? value['questions'] : [];
  return {
    product,
    description: readString(value['description']).trim() || product.subtitle,
    variants: rawVariants
      .map((entry) => normalizeVariant(entry, product.amount))
      .filter((variant): variant is ProductVariant => variant !== null),
    reviews: rawReviews
      .map((entry) => normalizeReview(entry))
      .filter((review): review is ProductReview => review !== null),
    questions: rawQuestions
      .map((entry) => normalizeQuestion(entry))
      .filter((question): question is ProductQuestion => question !== null),
  };
}

function normalizeCheckout(value: unknown, fallbackCurrency: string): CheckoutResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const orderRef = readString(value['orderRef']).trim() || readString(value['id']).trim();
  const paymentSessionId =
    readString(value['paymentSessionId']).trim() || readString(value['sessionId']).trim();
  if (!orderRef || !paymentSessionId) {
    return null;
  }
  return {
    orderRef,
    paymentSessionId,
    amount: readNumber(value['amount']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
  };
}

function normalizeConfirmation(value: unknown): OrderConfirmation | null {
  if (!isRecord(value)) {
    return null;
  }
  const orderNumber = readString(value['orderNumber']).trim() || readString(value['code']).trim();
  if (!orderNumber) {
    return null;
  }
  const rawItems = Array.isArray(value['items']) ? value['items'] : [];
  return {
    status: readString(value['status']).trim() || 'confirmed',
    orderNumber,
    items: rawItems
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }
        const title = readString(entry['title']).trim() || readString(entry['name']).trim();
        if (!title) {
          return null;
        }
        return {
          productId: readString(entry['productId']).trim(),
          title,
          qty: Math.max(1, Math.trunc(readNumber(entry['qty']))),
          reference: readString(entry['reference']).trim() || orderNumber,
        };
      })
      .filter((entry): entry is OrderConfirmation['items'][number] => entry !== null),
  };
}

function normalizeOrders(value: unknown, fallbackCurrency: string): readonly ShopOrder[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['orders'])
      ? value['orders']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): ShopOrder | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const orderNumber = readString(entry['orderNumber']).trim() || readString(entry['id']).trim();
      if (!orderNumber) {
        return null;
      }
      const rawLines = Array.isArray(entry['items']) ? entry['items'] : [];
      const statusRaw = readString(entry['status']).trim().toLowerCase();
      const status = (
        ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'] as const
      ).includes(statusRaw as never)
        ? (statusRaw as ShopOrder['status'])
        : 'paid';
      return {
        orderNumber,
        date: readString(entry['date']).trim(),
        status,
        total: readNumber(entry['total'] ?? entry['amount']),
        currency: readString(entry['currency']).trim() || fallbackCurrency,
        items: rawLines.map((line) => ({
          title: isRecord(line) ? readString(line['title']).trim() : '',
          qty: isRecord(line) ? Math.max(1, Math.trunc(readNumber(line['qty']))) : 1,
          amount: isRecord(line) ? readNumber(line['amount']) : 0,
        })),
      };
    })
    .filter((order): order is ShopOrder => order !== null);
}

function normalizeWishlist(
  value: unknown,
  fallbackCurrency: string,
): readonly WishlistEntry[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['items'])
      ? value['items']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): WishlistEntry | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const productId = readString(entry['productId']).trim() || readString(entry['id']).trim();
      const title = readString(entry['title']).trim();
      if (!productId || !title) {
        return null;
      }
      const image = readString(entry['image']).trim();
      return {
        productId,
        title,
        amount: readNumber(entry['amount'] ?? entry['price']),
        currency: readString(entry['currency']).trim() || fallbackCurrency,
        image: image || undefined,
      };
    })
    .filter((entry): entry is WishlistEntry => entry !== null);
}

const STAGE_STATES = ['done', 'current', 'pending'] as const;

function normalizeTracking(value: unknown, orderRef: string): OrderTracking | null {
  if (!isRecord(value) || !Array.isArray(value['stages'])) {
    return null;
  }
  const stages = value['stages']
    .map((entry): ShipmentStage | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }
      const stateRaw = readString(entry['state']).trim().toLowerCase();
      const state = (STAGE_STATES as readonly string[]).includes(stateRaw)
        ? (stateRaw as ShipmentStage['state'])
        : 'pending';
      const date = readString(entry['date']).trim();
      const description = readString(entry['description']).trim();
      return {
        id: readString(entry['id']).trim() || label,
        label,
        date: date || undefined,
        description: description || undefined,
        state,
      };
    })
    .filter((stage): stage is ShipmentStage => stage !== null);
  if (stages.length === 0) {
    return null;
  }
  const carrier = readString(value['carrier']).trim();
  return {
    orderRef: readString(value['orderRef']).trim() || orderRef,
    carrier: carrier || undefined,
    stages,
  };
}

function normalizeReturn(value: unknown): ReturnReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const claimId = readString(value['claimId']).trim() || readString(value['id']).trim();
  if (!claimId) {
    return null;
  }
  const statusRaw = readString(value['status']).trim().toLowerCase();
  const status = (['abierto', 'en-revision', 'resuelto'] as const).includes(statusRaw as never)
    ? (statusRaw as ReturnReceipt['status'])
    : 'abierto';
  return { claimId, status };
}

function normalizeThreads(value: unknown): readonly MessageThread[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['threads'])
      ? value['threads']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): MessageThread | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const subject = readString(entry['subject']).trim();
      if (!id || !subject) {
        return null;
      }
      return {
        id,
        subject,
        counterpart: readString(entry['counterpart']).trim() || readString(entry['seller']).trim(),
        lastMessage: readString(entry['lastMessage']).trim(),
        date: readString(entry['date']).trim(),
        unread: readBoolean(entry['unread']),
      };
    })
    .filter((thread): thread is MessageThread => thread !== null);
}

// ─── Mock data (visible degradation when the backend is not yet wired) ─────────

const MOCK_BRANDS = ['Sony', 'Samsung', 'Logitech', 'Xiaomi', 'Apple'];
const MOCK_CATEGORIES = ['Electrónica', 'Hogar', 'Computación', 'Audio'];

function mockSearch(criteria: SearchCriteria, currency: string): SearchResult {
  const all = mockCatalogue(currency);
  const term = criteria.q.trim().toLowerCase();
  let products = term
    ? all.filter(
        (product) =>
          product.title.toLowerCase().includes(term) ||
          product.brand.toLowerCase().includes(term),
      )
    : all;
  for (const [key, values] of Object.entries(criteria.facets)) {
    if (values.length === 0) {
      continue;
    }
    products = products.filter((product) => {
      if (key === 'brand') {
        return values.includes(product.brand);
      }
      if (key === 'condition') {
        return values.includes(product.condition);
      }
      if (key === 'category') {
        return values.includes(product.category);
      }
      return true;
    });
  }
  products = sortMock(products, criteria.sort);
  return { products, facets: mockFacets(all) };
}

function sortMock(products: readonly ShopProduct[], sort: SearchCriteria['sort']): ShopProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'price-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'newest':
      return copy.reverse();
    default:
      return copy.sort((a, b) => b.rating - a.rating);
  }
}

function mockFacets(products: readonly ShopProduct[]): readonly Facet[] {
  const count = (predicate: (product: ShopProduct) => boolean): number =>
    products.filter(predicate).length;
  return [
    {
      key: 'category',
      label: 'Categoría',
      values: MOCK_CATEGORIES.map((category) => ({
        value: category,
        label: category,
        count: count((product) => product.category === category),
      })),
    },
    {
      key: 'brand',
      label: 'Marca',
      values: MOCK_BRANDS.map((brand) => ({
        value: brand,
        label: brand,
        count: count((product) => product.brand === brand),
      })),
    },
    {
      key: 'condition',
      label: 'Condición',
      values: [
        { value: 'new', label: 'Nuevo', count: count((product) => product.condition === 'new') },
        { value: 'used', label: 'Usado', count: count((product) => product.condition === 'used') },
      ],
    },
  ];
}

function mockCatalogue(currency: string): readonly ShopProduct[] {
  const base: ReadonlyArray<Omit<ShopProduct, 'currency'>> = [
    {
      id: 'PMOCK-1',
      title: 'Audífonos Sony WH-1000XM5',
      subtitle: 'Cancelación de ruido · Bluetooth · 30h batería',
      amount: 1_499_000,
      listAmount: 1_799_000,
      brand: 'Sony',
      category: 'Audio',
      seller: 'TecnoHub',
      condition: 'new',
      freeShipping: true,
      rating: 4.8,
      reviewCount: 1240,
      inStock: true,
      images: [],
      badges: ['Envío gratis', '12 cuotas'],
    },
    {
      id: 'PMOCK-2',
      title: 'Smartphone Samsung Galaxy S24',
      subtitle: '256 GB · 8 GB RAM · Cámara 50 MP',
      amount: 3_299_000,
      brand: 'Samsung',
      category: 'Electrónica',
      seller: 'TecnoHub',
      condition: 'new',
      freeShipping: true,
      rating: 4.6,
      reviewCount: 870,
      inStock: true,
      images: [],
      badges: ['Envío gratis'],
    },
    {
      id: 'PMOCK-3',
      title: 'Mouse Logitech MX Master 3S',
      subtitle: 'Ergonómico · 8K DPI · USB-C',
      amount: 389_000,
      listAmount: 459_000,
      brand: 'Logitech',
      category: 'Computación',
      seller: 'PeriferiCO',
      condition: 'new',
      freeShipping: false,
      rating: 4.9,
      reviewCount: 2310,
      inStock: true,
      images: [],
      badges: ['Más vendido'],
    },
    {
      id: 'PMOCK-4',
      title: 'Aspiradora Xiaomi Robot Vacuum',
      subtitle: 'Mapeo láser · App · 5200 mAh',
      amount: 1_099_000,
      brand: 'Xiaomi',
      category: 'Hogar',
      seller: 'HogarPlus',
      condition: 'new',
      freeShipping: true,
      rating: 4.4,
      reviewCount: 530,
      inStock: true,
      images: [],
      badges: ['Oferta del día'],
    },
    {
      id: 'PMOCK-5',
      title: 'iPad Apple 10ª generación (usado)',
      subtitle: '64 GB · WiFi · Reacondicionado grado A',
      amount: 1_250_000,
      listAmount: 1_899_000,
      brand: 'Apple',
      category: 'Computación',
      seller: 'PeriferiCO',
      condition: 'used',
      freeShipping: false,
      rating: 4.2,
      reviewCount: 95,
      inStock: true,
      images: [],
      badges: ['Reacondicionado'],
    },
    {
      id: 'PMOCK-6',
      title: 'Parlante Sony SRS-XB23',
      subtitle: 'Portátil · Extra Bass · Resistente al agua',
      amount: 329_000,
      brand: 'Sony',
      category: 'Audio',
      seller: 'TecnoHub',
      condition: 'new',
      freeShipping: true,
      rating: 4.5,
      reviewCount: 410,
      inStock: false,
      images: [],
      badges: [],
    },
  ];
  return base.map((product) => ({ ...product, currency }));
}

function mockDetail(id: string, currency: string): ProductDetail {
  const product =
    mockCatalogue(currency).find((entry) => entry.id === id) ?? mockCatalogue(currency)[0];
  return {
    product,
    description:
      'Producto de demostración. La descripción real, especificaciones y galería ' +
      'se cargan desde el catálogo del CMS cuando el motor de la tienda responde.',
    variants: [
      {
        variantId: `${product.id}-v1`,
        label: 'Negro',
        attributes: { color: 'Negro' },
        amount: product.amount,
        inStock: true,
        stock: 12,
      },
      {
        variantId: `${product.id}-v2`,
        label: 'Plata',
        attributes: { color: 'Plata' },
        amount: product.amount + 40_000,
        inStock: true,
        stock: 4,
      },
      {
        variantId: `${product.id}-v3`,
        label: 'Azul',
        attributes: { color: 'Azul' },
        amount: product.amount,
        inStock: false,
        stock: 0,
      },
    ],
    reviews: [
      {
        id: 'r1',
        author: 'María G.',
        rating: 5,
        title: 'Excelente compra',
        body: 'Llegó rápido y funciona perfecto. Lo recomiendo totalmente.',
        date: '2026-05-12',
      },
      {
        id: 'r2',
        author: 'Carlos R.',
        rating: 4,
        title: 'Muy bueno',
        body: 'Cumple lo que promete, aunque el empaque llegó algo golpeado.',
        date: '2026-04-28',
      },
    ],
    questions: [
      {
        id: 'q1',
        author: 'Andrea',
        question: '¿Tiene garantía oficial en Colombia?',
        answer: 'Sí, 12 meses de garantía con el distribuidor oficial.',
        date: '2026-05-01',
      },
      {
        id: 'q2',
        author: 'Julián',
        question: '¿Hacen envío a Pasto?',
        date: '2026-05-20',
      },
    ],
  };
}

function mockOrders(currency: string): readonly ShopOrder[] {
  return [
    {
      orderNumber: 'ORD-2026-00481',
      date: '2026-06-10',
      status: 'delivered',
      total: 1_888_000,
      currency,
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000 }],
    },
    {
      orderNumber: 'ORD-2026-00512',
      date: '2026-06-22',
      status: 'shipped',
      total: 389_000,
      currency,
      items: [{ title: 'Mouse Logitech MX Master 3S', qty: 1, amount: 389_000 }],
    },
  ];
}

function mockTracking(orderRef: string, status: string): OrderTracking {
  // Derive a coherent timeline from the coarse order status.
  const order: readonly { id: string; label: string; date?: string }[] = [
    { id: 'paid', label: 'Pago aprobado', date: '2026-06-22' },
    { id: 'preparing', label: 'Preparando el paquete', date: '2026-06-23' },
    { id: 'shipped', label: 'En camino', date: '2026-06-24' },
    { id: 'delivered', label: 'Entregado' },
  ];
  const reached =
    status === 'delivered' ? 4 : status === 'shipped' ? 3 : status === 'preparing' ? 2 : 1;
  return {
    orderRef,
    carrier: 'Envíos Synergos',
    stages: order.map((stage, index) => ({
      ...stage,
      state: index < reached - 1 ? 'done' : index === reached - 1 ? 'current' : 'pending',
    })),
  };
}

function mockThreads(): readonly MessageThread[] {
  return [
    {
      id: 'th-1',
      subject: 'Consulta sobre garantía',
      counterpart: 'TecnoHub',
      lastMessage: 'Sí, la garantía cubre 12 meses con distribuidor oficial.',
      date: '2026-06-25',
      unread: true,
    },
    {
      id: 'th-2',
      subject: 'Pedido ORD-2026-00512',
      counterpart: 'PeriferiCO',
      lastMessage: 'Tu pedido salió de bodega, llega mañana.',
      date: '2026-06-23',
      unread: false,
    },
  ];
}
