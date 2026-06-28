import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type TravelCheckoutLine,
  type TravelCheckoutResult,
  type TravelConfirmation,
  type TravelGuest,
  type TravelOffer,
  type TravelProduct,
} from './travel.model';

/**
 * Thin HTTP client over the Booking backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/travel/search/{hotel|flight|car}?...criteria` → `{ offers: [...] }`
 *  - `POST /api/travel/checkout` `{ items, guest }` → `{ orderRef, paymentSessionId, amount, currency }`
 *  - `POST /api/travel/confirm`  `{ orderRef }`     → `{ status, items, confirmationCode }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the UI flow
 * is complete end-to-end before the backend lands. Every mock path is tagged
 * `degraded` so the shell can surface a "datos de ejemplo" notice.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class TravelApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  async search(
    apiBase: string,
    product: TravelProduct,
    criteria: Readonly<Record<string, unknown>>,
    currency: string,
  ): Promise<readonly TravelOffer[]> {
    const query = this.toQuery(criteria);
    const url = `${apiBase}/search/${product}${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const offers = normalizeOffers(data, product, currency);
      if (offers.length > 0) {
        return offers;
      }
      // Empty live result is legitimate (no availability) — return it as-is.
      if (isRecord(data) && Array.isArray(data['offers'])) {
        return offers;
      }
      throw new Error('empty-shape');
    } catch (error) {
      this.markDegraded('GET /api/travel/search', error);
      return mockOffers(product, currency);
    }
  }

  // ─── Checkout (single payment for the whole cart) ────────────────────────────

  async checkout(
    apiBase: string,
    lines: readonly TravelCheckoutLine[],
    guest: TravelGuest,
    fallbackAmount: number,
    currency: string,
  ): Promise<TravelCheckoutResult> {
    const url = `${apiBase}/checkout`;
    try {
      const data = await this.postJson(url, { items: lines, guest });
      const result = normalizeCheckout(data, currency);
      if (result) {
        return result;
      }
      throw new Error('checkout-shape');
    } catch (error) {
      this.markDegraded('POST /api/travel/checkout', error);
      return {
        orderRef: `MOCK-${Date.now().toString(36).toUpperCase()}`,
        paymentSessionId: `psp_mock_${Math.random().toString(36).slice(2, 10)}`,
        amount: fallbackAmount,
        currency,
      };
    }
  }

  // ─── Confirm (issue vouchers for the whole order) ────────────────────────────

  async confirm(
    apiBase: string,
    orderRef: string,
    fallbackLines: readonly TravelCheckoutLine[],
  ): Promise<TravelConfirmation> {
    const url = `${apiBase}/confirm`;
    try {
      const data = await this.postJson(url, { orderRef });
      const confirmation = normalizeConfirmation(data);
      if (confirmation) {
        return confirmation;
      }
      throw new Error('confirm-shape');
    } catch (error) {
      this.markDegraded('POST /api/travel/confirm', error);
      return {
        status: 'confirmed',
        confirmationCode: orderRef,
        items: fallbackLines.map((line) => ({
          product: line.product,
          title: readString(line.detail['title']) || productLabel(line.product),
          reference: `${line.product.slice(0, 2).toUpperCase()}-${line.offerId}`,
        })),
      };
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

  private toQuery(criteria: Readonly<Record<string, unknown>>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(criteria)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    return params.toString();
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Booking API responds.
    this.#logger.warn(`Travel API "${endpoint}" unavailable — using mock data.`, error);
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

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

function normalizeOffers(
  value: unknown,
  product: TravelProduct,
  fallbackCurrency: string,
): readonly TravelOffer[] {
  const list = Array.isArray(value)
    ? value
    : isRecord(value)
      ? (value['offers'] ?? value['results'])
      : null;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry) => normalizeOffer(entry, product, fallbackCurrency))
    .filter((offer): offer is TravelOffer => offer !== null);
}

function normalizeOffer(
  value: unknown,
  product: TravelProduct,
  fallbackCurrency: string,
): TravelOffer | null {
  if (!isRecord(value)) {
    return null;
  }
  const offerId = readString(value['offerId']).trim() || readString(value['id']).trim();
  const title = readString(value['title']).trim() || readString(value['name']).trim();
  if (!offerId || !title) {
    return null;
  }
  const detail = isRecord(value['detail']) ? (value['detail'] as Record<string, unknown>) : value;
  return {
    offerId,
    product,
    title,
    subtitle: readString(value['subtitle']).trim() || readString(value['description']).trim(),
    amount: readNumber(value['amount'] ?? value['price'] ?? value['totalPrice']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
    badges: readStringArray(value['badges']),
    detail: { ...detail, title },
  };
}

function normalizeCheckout(value: unknown, fallbackCurrency: string): TravelCheckoutResult | null {
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

function normalizeConfirmation(value: unknown): TravelConfirmation | null {
  if (!isRecord(value)) {
    return null;
  }
  const confirmationCode =
    readString(value['confirmationCode']).trim() || readString(value['code']).trim();
  if (!confirmationCode) {
    return null;
  }
  const rawItems = Array.isArray(value['items']) ? value['items'] : [];
  return {
    status: readString(value['status']).trim() || 'confirmed',
    confirmationCode,
    items: rawItems
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }
        const productRaw = readString(entry['product']).trim();
        const product: TravelProduct =
          productRaw === 'flight' || productRaw === 'car' ? productRaw : 'hotel';
        return {
          product,
          title: readString(entry['title']).trim() || productLabel(product),
          reference: readString(entry['reference']).trim() || confirmationCode,
        };
      })
      .filter((entry): entry is TravelConfirmation['items'][number] => entry !== null),
  };
}

function productLabel(product: TravelProduct): string {
  switch (product) {
    case 'hotel':
      return 'Hotel';
    case 'flight':
      return 'Vuelo';
    case 'car':
      return 'Auto';
  }
}

// ─── Mock data (visible degradation when the backend is not yet wired) ─────────

function mockOffers(product: TravelProduct, currency: string): readonly TravelOffer[] {
  switch (product) {
    case 'hotel':
      return [
        offerMock('HMOCK-1', 'hotel', 'Hotel Caribe Cartagena', 'Desayuno incluido · Frente al mar', 980_000, currency, ['Reembolsable', '4 estrellas']),
        offerMock('HMOCK-2', 'hotel', 'Sofitel Santa Clara', 'Solo alojamiento · Centro histórico', 1_640_000, currency, ['No reembolsable', '5 estrellas']),
      ];
    case 'flight':
      return [
        offerMock('FMOCK-1', 'flight', 'BOG → CTG', 'Directo · 1h 25m · Económica', 412_000, currency, ['Equipaje de mano', 'Sin escalas']),
        offerMock('FMOCK-2', 'flight', 'BOG → CTG', '1 escala · 4h 10m · Económica', 298_000, currency, ['Equipaje incluido']),
      ];
    case 'car':
      return [
        offerMock('CMOCK-1', 'car', 'Chevrolet Onix', 'Económico · Automático · A/C', 156_000, currency, ['Kilometraje ilimitado']),
        offerMock('CMOCK-2', 'car', 'Toyota Fortuner', 'SUV · 4x4 · 7 plazas', 384_000, currency, ['Seguro incluido']),
      ];
  }
}

function offerMock(
  offerId: string,
  product: TravelProduct,
  title: string,
  subtitle: string,
  amount: number,
  currency: string,
  badges: readonly string[],
): TravelOffer {
  return { offerId, product, title, subtitle, amount, currency, badges, detail: { title, subtitle } };
}
