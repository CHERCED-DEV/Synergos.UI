import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type CheckoutLine,
  type CheckoutResult,
  type Facet,
  type OrderConfirmation,
  type ProductCondition,
  type ProductDetail,
  type ProductQuestion,
  type ProductReview,
  type ProductVariant,
  type SearchCriteria,
  type SearchResult,
  type ShopCustomer,
  type ShopOrder,
  type ShopProduct,
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
