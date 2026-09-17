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
  type ReviewSubmission,
  type ShopPromo,
  type ShopPromoResult,
  type ReturnAdvance,
  type ReturnAdvanceResult,
  type ReturnCase,
  type ReturnReason,
  type ReturnRequestResult,
  type ReturnStatus,
  type SellerDeskResult,
  type SellerOrder,
  type ShopModerationItem,
  type ShopModerationResult,
  type ReviewReportResult,
  type ReviewSubmitResult,
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

  // ─── Reseñas (T10 Ola B) ─────────────────────────────────────────────────────

  /**
   * Envía la reseña de un producto. Devuelve un resultado TIPADO.
   *
   * **No degrada a mock, y es la diferencia que importa.** El resto de este cliente cae a
   * datos de ejemplo cuando el backend falla, y para una LECTURA es aceptable. Para una
   * ESCRITURA sería fingir que se guardó algo que no se guardó — el fallo exacto que ADR 0112
   * documenta en `gov.mockDecide`, donde la UI anunciaba una decisión que nunca se registró.
   *
   * El motivo se lee del STATUS, no de `error.name` ni de `instanceof`: aquel depende de que
   * alguien recuerde tipar el error, y este último ni siquiera cruza bundles.
   */
  /**
   * `POST /{apiBase}/promo` — valida un cupón contra el carrito (#29).
   *
   * **No degrada a mock.** Un descuento inventado del lado del cliente es una
   * promesa de plata que el checkout va a romper; el peor momento para descubrirlo
   * es al pagar. Si el endpoint no responde, esto contesta `failed` y la pantalla
   * lo dice.
   */
  async applyPromo(
    apiBase: string,
    code: string,
    subtotalMinor: number,
  ): Promise<ShopPromoResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    try {
      const response = await fetch(`${apiBase}/promo`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalMinor }),
      });

      if (response.ok) {
        const data: unknown = await response.json();
        const promo = normalizePromo(data, code);
        // Una respuesta 200 que no trae un descuento utilizable NO es un cupón
        // aplicado: decir que sí dejaría el total sin cambiar y al comprador
        // creyendo que ahorró.
        return promo ? { ok: true, promo } : { ok: false, reason: 'unknown' };
      }

      if (response.status === 409) {
        return { ok: false, reason: 'already-used' };
      }
      if (response.status === 410) {
        return { ok: false, reason: 'expired' };
      }
      if (response.status === 404) {
        return { ok: false, reason: 'unknown' };
      }
      if (response.status === 422) {
        // El servidor dice por qué no aplica, y cuánto falta si es el mínimo.
        const data: unknown = await response.json().catch(() => null);
        const motivo = isRecord(data) ? readString(data['reason']).trim() : '';
        if (motivo === 'minimum-not-met') {
          const falta = isRecord(data) ? readNumber(data['shortfallMinor']) : 0;
          return { ok: false, reason: 'minimum-not-met', shortfallMinor: Math.max(0, falta) };
        }
        return { ok: false, reason: 'not-applicable' };
      }
      return { ok: false, reason: 'failed' };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  async submitReview(
    apiBase: string,
    sku: string,
    submission: ReviewSubmission,
  ): Promise<ReviewSubmitResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }

    const url = `${apiBase}/products/${encodeURIComponent(sku)}/reviews`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: submission.rating,
          title: submission.title,
          body: submission.body,
        }),
      });

      if (response.ok) {
        // **202 no es 201.** `response.ok` es cierto para TODO 2xx, así que un borde
        // que encola para revisión se leía como publicación y el acuse mentía (#31).
        return { ok: true, pending: response.status === 202 };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 403:
          return { ok: false, reason: 'not-buyer' };
        case 400:
          return { ok: false, reason: 'invalid' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      // Red caída. NO es lo mismo que "no puedes reseñar": el mensaje debe invitar a
      // reintentar, no acusar al comprador.
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * Reporta una reseña (#31).
   *
   * **No degrada a mock ni a éxito silencioso.** Un «gracias por avisar» que no
   * salió de la máquina es la regla 4 de `CLAUDE.md` sobre la escritura que más
   * confianza pide: quien reporta está diciendo que algo está mal y espera que
   * alguien lo mire.
   */
  async reportReview(apiBase: string, reviewId: string): Promise<ReviewReportResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/reviews/${encodeURIComponent(reviewId)}/reports`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        return { ok: true };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        // El servidor deduplica por (reseña, quien reporta). No es un fallo.
        case 409:
          return { ok: false, reason: 'already-reported' };
        case 404:
          return { ok: false, reason: 'not-found' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      return { ok: false, reason: 'failed' };
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

  /**
   * Pide la devolución de UNA LÍNEA de un pedido (#32).
   *
   * **Manda `lineId`, que es lo que faltaba.** El borde lo exige junto al motivo
   * (`ShopCatalogController:746`) y esta llamada enviaba sólo `{ reason }`, así
   * que contestaba `400` — *siempre*. Y no se notaba porque el `catch` inventaba
   * un `claimId` local y devolvía «abierto»: la devolución **nunca funcionó** y
   * el mock lo tapó entero. Es la regla 4 de `CLAUDE.md` en su forma más cara,
   * porque el comprador se llevaba un número de reclamo que no existe en ninguna
   * parte.
   *
   * Por eso ahora **no degrada**: un fallo se dice.
   */
  async requestReturn(
    apiBase: string,
    orderRef: string,
    lineId: string,
    reason: ReturnReason,
  ): Promise<ReturnRequestResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/return`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, reason }),
      });
      if (response.ok) {
        const claim = normalizeReturnCase(await response.json());
        // Un 200 con una forma que no se entiende NO es un reclamo abierto:
        // decir que sí dejaría al comprador sin nada y creyendo que sí.
        return claim ? { ok: true, claim } : { ok: false, reason: 'failed' };
      }
      return {
        ok: false,
        reason: RETURN_REQUEST_REASONS[response.status] ?? 'failed',
        detail: await readErrorDetail(response),
      };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * Los reclamos de un pedido (#32).
   *
   * **Devuelve `null` cuando no se pudo leer, y eso NO es lo mismo que «no hay
   * ninguno».** Con una lista vacía en el fallo, la pantalla volvería a ofrecer
   * «Iniciar devolución» sobre un pedido que ya tiene una abierta, y el comprador
   * abriría un segundo reclamo. Es el defecto que esta HU vino a cerrar.
   */
  async orderReturns(apiBase: string, orderRef: string): Promise<readonly ReturnCase[] | null> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/return`;
    try {
      const data = await this.getJson(url);
      const raw = isRecord(data) && Array.isArray(data['returns']) ? data['returns'] : [];
      return raw
        .map((entry) => normalizeReturnCase(entry))
        .filter((entry): entry is ReturnCase => entry !== null);
    } catch (error) {
      this.markDegraded('GET /api/shop/order/{ref}/return', error);
      return null;
    }
  }

  /**
   * El vendedor mueve un reclamo de estado (#32).
   *
   * El endpoint existía desde siempre y **no lo llamaba nadie**. Tampoco degrada:
   * llegar a `refunded` dispara un reembolso de verdad, así que decir «listo»
   * cuando el POST falló sería prometer plata que no se movió.
   */
  async advanceReturn(
    apiBase: string,
    rmaId: string,
    status: ReturnAdvance,
    note?: string,
  ): Promise<ReturnAdvanceResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/return/${encodeURIComponent(rmaId)}/advance`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { status, note } : { status }),
      });
      if (response.ok) {
        const claim = normalizeReturnCase(await response.json());
        return claim ? { ok: true, claim } : { ok: false, reason: 'failed' };
      }
      return {
        ok: false,
        reason: RETURN_ADVANCE_REASONS[response.status] ?? 'failed',
        detail: await readErrorDetail(response),
      };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * El vendedor decide sobre una opinión en cola (#32).
   *
   * Gemelo del de Educación (#31) — mismo contrato, mismo criterio: no degrada,
   * porque dejar una opinión publicada mientras la pantalla dice que se rechazó
   * deja a alguien expuesto y al vendedor creyendo que lo atendió.
   */
  async decideShopModeration(
    apiBase: string,
    reviewId: string,
    decision: 'approve' | 'reject',
  ): Promise<ShopModerationResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/moderation/${encodeURIComponent(reviewId)}/${decision}`;
    try {
      const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
      if (response.ok) {
        return { ok: true };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 403:
          return { ok: false, reason: 'forbidden' };
        // Otra persona ya decidió: la fila sale de la cola igual.
        case 409:
          return { ok: false, reason: 'already-decided' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  // ─── Consola del vendedor (#32) ──────────────────────────────────────────────

  /**
   * Lo que el vendedor tiene por atender.
   *
   * **Esta LECTURA sí degrada a mock**, con el cartel de degradado que ya pintan
   * las otras dos consolas: un escritorio de ejemplo rotulado no engaña a nadie
   * (regla 4). Las escrituras de esta misma consola —avanzar un reclamo, decidir
   * una opinión— no degradan ninguna.
   */
  async sellerDesk(apiBase: string): Promise<SellerDeskResult> {
    const url = `${apiBase}/seller/desk`;
    try {
      const data = await this.getJson(url);
      const desk = normalizeSellerDesk(data);
      if (desk) {
        return desk;
      }
      throw new Error('seller-desk-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/seller/desk', error);
      return mockSellerDesk();
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
        // Sin kind = MultiSelect: es el default del contrato y deja el checkbox de siempre.
        kind: readString(entry['kind']).trim() || 'MultiSelect',
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
  const products = rawProducts
    .map((entry) => normalizeProduct(entry, fallbackCurrency))
    .filter((product): product is ShopProduct => product !== null);

  return {
    products,
    facets: normalizeFacets(value['facets']),
    // Falls back to the page length when the backend omits `total`, which keeps an older
    // API honest: one page of results is exactly what we got.
    total: readNumber(value['total']) || products.length,
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
    // Ausente ⇒ false. Un backend que no lo emita deja el formulario OCULTO, que es el
    // fallo seguro: lo contrario ofrecería escribir a quien va a recibir un 403.
    canReview: value['canReview'] === true,
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
      return {
        orderNumber,
        date: readString(entry['date']).trim(),
        status: readOrderStatus(entry['status']),
        total: readNumber(entry['total'] ?? entry['amount']),
        currency: readString(entry['currency']).trim() || fallbackCurrency,
        items: rawLines.map((line) => ({
          title: isRecord(line) ? readString(line['title']).trim() : '',
          qty: isRecord(line) ? Math.max(1, Math.trunc(readNumber(line['qty']))) : 1,
          amount: isRecord(line) ? readNumber(line['amount']) : 0,
          // El borde los emitía desde siempre y nadie los leía; sin el
          // `productId` no se puede pedir una devolución (#32).
          productId: isRecord(line) ? readString(line['productId']).trim() : '',
          variantId: (isRecord(line) ? readString(line['variantId']).trim() : '') || undefined,
          // Ausente = NO se puede (#34). Lo decide el servidor; la UI ya no lo
          // deduce, que es lo que hizo que su copia se desviara (#33).
          canReturn: isRecord(line) && line['canReturn'] === true,
          returnBlock: (isRecord(line) ? readString(line['returnBlock']).trim() : '') || undefined,
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

/**
 * Qué significa cada código al pedir una devolución (#32).
 *
 * `400` es `invalid` y no `failed` porque el borde manda el motivo en `{ error }`
 * —«La línea X no está en la orden», «Solo se puede devolver sobre una orden
 * pagada»— y esa frase le sirve a quien compró. `failed` es «no sabemos».
 */
const RETURN_REQUEST_REASONS: Readonly<
  Record<number, 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid' | 'failed'>
> = {
  400: 'invalid',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
};

/** Al avanzar, un `400` es una transición ilegal: el borde nombra cuál. */
const RETURN_ADVANCE_REASONS: Readonly<
  Record<number, 'unauthenticated' | 'forbidden' | 'not-found' | 'illegal' | 'failed'>
> = {
  400: 'illegal',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
};

const ORDER_STATUSES: readonly ShopOrder['status'][] = [
  'pending',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

/** `paid` por defecto: es el estado con el que un pedido existe de verdad. */
function readOrderStatus(value: unknown): ShopOrder['status'] {
  const raw = readString(value).trim().toLowerCase();
  return ORDER_STATUSES.includes(raw as ShopOrder['status'])
    ? (raw as ShopOrder['status'])
    : 'paid';
}

/** Los estados del reclamo que emite el borde, en su vocabulario. */
const RETURN_STATUSES: readonly ReturnStatus[] = [
  'abierto',
  'en-revision',
  'resuelto',
  'rechazado',
];

function normalizeReturnCase(value: unknown): ReturnCase | null {
  if (!isRecord(value)) {
    return null;
  }
  const claimId = readString(value['claimId']).trim() || readString(value['rmaId']).trim();
  if (!claimId) {
    return null;
  }
  const statusRaw = readString(value['status']).trim().toLowerCase();
  return {
    claimId,
    orderRef: readString(value['orderRef']).trim(),
    lineRef: readString(value['lineRef']).trim(),
    productName: readString(value['productName']).trim() || 'Producto',
    quantity: Math.max(1, Math.trunc(readNumber(value['quantity'])) || 1),
    // Ya formateado por el servidor. Si no lo mandó se queda vacío en vez de
    // inventar un número: la UI no calcula dinero (#22, #29).
    refundAmountFormatted: readString(value['refundAmountFormatted']).trim(),
    reason: readString(value['reason']).trim(),
    // Un estado desconocido cae a `abierto`, que es el conservador: dar por
    // resuelto lo que no se entiende cerraría un reclamo vivo en pantalla.
    status: RETURN_STATUSES.includes(statusRaw as ReturnStatus)
      ? (statusRaw as ReturnStatus)
      : 'abierto',
    requestedAt: readString(value['requestedAt']).trim(),
    updatedAt: readString(value['updatedAt']).trim(),
    note: readString(value['note']).trim() || undefined,
  };
}

function normalizeShopModerationItem(value: unknown): ShopModerationItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    author: readString(value['author']).trim() || 'Comprador',
    productTitle: readString(value['productTitle']).trim() || 'Producto',
    rating: Math.min(5, Math.max(0, Math.trunc(readNumber(value['rating'])))),
    body: readString(value['body']).trim(),
    createdAt: readString(value['createdAt']).trim(),
    // `reported` sólo si el servidor lo dice: por defecto es una pendiente, que
    // es la lectura conservadora (misma regla que la cola de Educación, #31).
    reason: readString(value['reason']).trim() === 'reported' ? 'reported' : 'pending',
    reportCount: Math.max(0, Math.trunc(readNumber(value['reportCount']))),
  };
}

function normalizeSellerOrder(value: unknown): SellerOrder | null {
  if (!isRecord(value)) {
    return null;
  }
  const orderRef = readString(value['orderRef']).trim() || readString(value['orderNumber']).trim();
  if (!orderRef) {
    return null;
  }
  return {
    orderRef,
    orderNumber: readString(value['orderNumber']).trim() || orderRef,
    buyer: readString(value['buyer']).trim() || readString(value['customerName']).trim() || 'Comprador',
    date: readString(value['date']).trim(),
    status: readOrderStatus(value['status']),
    totalFormatted: readString(value['totalFormatted']).trim(),
    itemCount: Math.max(0, Math.trunc(readNumber(value['itemCount']))),
  };
}

function normalizeSellerDesk(value: unknown): SellerDeskResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawOrders = Array.isArray(value['orders']) ? value['orders'] : [];
  const rawReturns = Array.isArray(value['returns']) ? value['returns'] : [];
  const rawModeration = Array.isArray(value['moderation']) ? value['moderation'] : [];
  if (rawOrders.length === 0 && rawReturns.length === 0 && rawModeration.length === 0) {
    return null;
  }
  const orders = rawOrders
    .map((entry) => normalizeSellerOrder(entry))
    .filter((entry): entry is SellerOrder => entry !== null);
  return {
    orders,
    returns: rawReturns
      .map((entry) => normalizeReturnCase(entry))
      .filter((entry): entry is ReturnCase => entry !== null),
    moderation: rawModeration
      .map((entry) => normalizeShopModerationItem(entry))
      .filter((entry): entry is ShopModerationItem => entry !== null),
    salesFormatted: readString(value['salesFormatted']).trim(),
    pendingShipments:
      Math.max(0, Math.trunc(readNumber(value['pendingShipments']))) ||
      orders.filter((order) => order.status === 'paid' || order.status === 'preparing').length,
  };
}

/** El texto que el borde manda en `{ error }`. Se enseña tal cual: lo escribió él. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) ? readString(body['error']).trim() || undefined : undefined;
  } catch {
    return undefined;
  }
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
  // The mock does not paginate, so every match is on the single page it returns.
  return { products, facets: mockFacets(all), total: products.length };
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
    // En modo degradado NUNCA se ofrece reseñar: el backend que decide quién puede es
    // justo el que no está respondiendo. Invitar a escribir aquí acabaría en un envío
    // que se pierde.
    canReview: false,
  };
}

/**
 * Pedidos de ejemplo.
 *
 * **Los dos van en `paid`, que es lo ÚNICO que un pedido comprado puede valer.**
 * Traían `delivered` y `shipped` —estados que el enum del CMS no tiene: sólo
 * `Pending`, `Paid` y `Cancelled`—, y eso fue lo que escondió el #33: el gate de
 * la devolución pedía justo esos dos, así que en producción el botón no aparecía
 * nunca y acá sí. Un dato de ejemplo que no puede existir en producción hace
 * verde un camino que en producción está cortado.
 *
 * En qué fase va cada uno lo dice el SEGUIMIENTO, que es donde el dominio lo
 * guarda (`StubOrderTrackingService.ShopPipeline`).
 */
function mockOrders(currency: string): readonly ShopOrder[] {
  return [
    {
      orderNumber: 'ORD-2026-00481',
      date: '2026-06-10',
      status: 'paid',
      total: 1_888_000,
      currency,
      // El ejemplo también trae el veredicto, porque lo trae el servidor (#34).
      items: [
        {
          title: 'Audífonos Sony WH-1000XM5',
          qty: 1,
          amount: 1_499_000,
          productId: 'SONY-XM5',
          canReturn: true,
        },
      ],
    },
    {
      orderNumber: 'ORD-2026-00512',
      date: '2026-06-22',
      status: 'paid',
      total: 389_000,
      currency,
      // Éste también sale con permiso del servidor: la única condición que el
      // dominio impone es que la orden esté pagada, y lo está. Que todavía vaya
      // en camino lo sabe el SEGUIMIENTO, y ése es el refinamiento de la UI
      // (#33) — no un motivo del servidor.
      items: [
        {
          title: 'Mouse Logitech MX Master 3S',
          qty: 1,
          amount: 389_000,
          productId: 'LOGI-MX3S',
          canReturn: true,
        },
      ],
    },
  ];
}

/**
 * Hasta dónde llegó cada pedido de ejemplo.
 *
 * Vive acá y no en `status` a propósito (#33): uno entregado y otro en camino es
 * lo que hace útil el ejemplo, y los dos son `paid` porque es lo que el servidor
 * emite. Un pedido que no esté acá arranca en «pago confirmado».
 */
const MOCK_TRACKING_STAGE: Readonly<Record<string, string>> = {
  'ORD-2026-00481': 'delivered',
  'ORD-2026-00512': 'shipped',
};

function mockTracking(orderRef: string, status: string): OrderTracking {
  // Los ids son los del pipeline de la Tienda en el CMS
  // (`StubOrderTrackingService.ShopPipeline`), no una invención de este mock.
  const order: readonly { id: string; label: string; date?: string }[] = [
    { id: 'paid', label: 'Pago aprobado', date: '2026-06-22' },
    { id: 'preparing', label: 'Preparando el paquete', date: '2026-06-23' },
    { id: 'shipped', label: 'En camino', date: '2026-06-24' },
    { id: 'delivered', label: 'Entregado' },
  ];
  // La fase sale del PEDIDO, no de su estado: un pedido comprado siempre vale
  // `paid`, y derivar la fase de ahí dejaría a todos en «pago confirmado» (#33).
  // Un pedido sin pagar o cancelado no avanza, pase lo que pase en el mapa.
  const etapa = status === 'paid' ? (MOCK_TRACKING_STAGE[orderRef] ?? 'paid') : 'paid';
  const reached =
    etapa === 'delivered' ? 4 : etapa === 'shipped' ? 3 : etapa === 'preparing' ? 2 : 1;
  return {
    orderRef,
    carrier: 'Envíos Synergos',
    stages: order.map((stage, index) => ({
      ...stage,
      state: index < reached - 1 ? 'done' : index === reached - 1 ? 'current' : 'pending',
    })),
  };
}

/**
 * El escritorio de ejemplo del vendedor.
 *
 * **Va DESORDENADO a propósito** —una devolución vieja antes que una nueva, y la
 * opinión pendiente antes que las reportadas—: si llegara ya ordenado, quitar el
 * orden de la consola pasaría en verde y el spec no vigilaría nada. Es la regla 7
 * de `CLAUDE.md`, aprendida en la #31 con esta misma cola.
 */
function mockSellerDesk(): SellerDeskResult {
  return {
    orders: [
      { orderRef: 'ord_9f21', orderNumber: 'SYN-10241', buyer: 'María González', date: '2026-09-10', status: 'paid', totalFormatted: '$248.000', itemCount: 2 },
      { orderRef: 'ord_9f22', orderNumber: 'SYN-10242', buyer: 'Julián Pérez', date: '2026-09-09', status: 'preparing', totalFormatted: '$96.000', itemCount: 1 },
      { orderRef: 'ord_9f18', orderNumber: 'SYN-10238', buyer: 'Camila Rodríguez', date: '2026-09-05', status: 'delivered', totalFormatted: '$412.000', itemCount: 3 },
    ],
    returns: [
      {
        claimId: 'rma_a1',
        orderRef: 'ord_9f18',
        lineRef: 'SKU-114',
        productName: 'Audífonos inalámbricos',
        quantity: 1,
        refundAmountFormatted: '$180.000',
        reason: 'changed-mind',
        status: 'en-revision',
        requestedAt: '2026-09-07',
        updatedAt: '2026-09-08',
      },
      {
        claimId: 'rma_a2',
        orderRef: 'ord_9f21',
        lineRef: 'SKU-220',
        productName: 'Cafetera de goteo',
        quantity: 1,
        refundAmountFormatted: '$124.000',
        reason: 'damaged',
        status: 'abierto',
        requestedAt: '2026-09-11',
        updatedAt: '2026-09-11',
      },
    ],
    moderation: [
      { id: 'SMOD-2', author: 'Julián Pérez', productTitle: 'Cafetera de goteo', rating: 4, body: 'Buena, aunque el filtro se ensucia rápido.', createdAt: '2026-09-09', reason: 'pending', reportCount: 0 },
      // Reportada SIN conteo: el normalizador deja 0 cuando el servidor no lo
      // manda, y aun así tiene que ir por delante de la pendiente. Sin esta fila,
      // ordenar sólo por conteo daría el mismo resultado que ordenar bien.
      { id: 'SMOD-3', author: 'Sofía Marín', productTitle: 'Audífonos inalámbricos', rating: 2, body: 'La descripción decía cancelación activa y no la tiene.', createdAt: '2026-09-10', reason: 'reported', reportCount: 0 },
      { id: 'SMOD-1', author: 'Andrés Gómez', productTitle: 'Audífonos inalámbricos', rating: 1, body: 'No compren acá, escríbanme y se los vendo más barato.', createdAt: '2026-09-11', reason: 'reported', reportCount: 4 },
    ],
    salesFormatted: '$756.000',
    pendingShipments: 2,
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

/** El cupón que devuelve el servidor. Sin descuento utilizable, no hay cupón. */
function normalizePromo(value: unknown, fallbackCode: string): ShopPromo | null {
  if (!isRecord(value)) {
    return null;
  }
  const source = isRecord(value['promo']) ? (value['promo'] as Record<string, unknown>) : value;
  const raw = readNumber(source['amountMinor'] ?? source['discountMinor']);
  if (!Number.isFinite(raw) || raw === 0) {
    return null;
  }
  // Se fuerza el signo: un backend que mande el descuento en positivo SUMARÍA al
  // total, y el error se vería como un cargo sorpresa.
  const amountMinor = -Math.abs(Math.round(raw));
  const code = readString(source['code']).trim().toUpperCase() || fallbackCode.toUpperCase();
  const detail = readString(source['detail']).trim();
  return {
    code,
    amountMinor,
    label: readString(source['label']).trim() || `Cupón ${code}`,
    ...(detail ? { detail } : {}),
  };
}
