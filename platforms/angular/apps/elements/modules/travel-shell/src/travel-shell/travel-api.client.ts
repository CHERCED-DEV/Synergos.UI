import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  type CancelReceipt,
  type FareFamily,
  type SeatMapPayload,
  type StayDetail,
  type StayRate,
  type StaySpec,
  type TravelCheckoutLine,
  type TravelCheckoutResult,
  type TravelConfirmation,
  type TravelConfirmedItem,
  type TravelGeo,
  type TravelGuest,
  type TravelOffer,
  type TravelProduct,
  type TravelTrip,
  type TravelTripItem,
  type TripStatus,
} from './travel.model';

/**
 * Thin HTTP client over the Booking backend contract (provided by the backend
 * agent in parallel). travel-shell v2 programs against:
 *
 *  - `GET  /api/travel/search/{hotel|flight|car}?...criteria` → `{ offers }`
 *      · hotel offers carry `geo`; flight offers carry `fareFamilies`.
 *  - `GET  /api/travel/stay/{id}`                     → rich stay ficha (SH-2)
 *  - `POST /api/travel/checkout` `{ items, guest }`   → `{ orderRef, paymentSessionId, amount, currency }`
 *  - `POST /api/travel/confirm`  `{ orderRef }`       → `{ status, confirmationCode, items[reservationId] }`
 *  - `GET  /api/travel/trips?traveler=`               → `{ trips }` (mis viajes)
 *  - `POST /api/travel/order/{ref}/cancel`            → `{ ref, status, refundLabel }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. Every mock path flips the
 * `degraded` flag so the app can surface a "datos de ejemplo" notice.
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

  // ─── Stay detail (SH-2 rich ficha) ───────────────────────────────────────────

  async stay(apiBase: string, id: string, currency: string): Promise<StayDetail> {
    const url = `${apiBase}/stay/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeStay(data, id, currency);
      if (detail) {
        return detail;
      }
      throw new Error('stay-shape');
    } catch (error) {
      this.markDegraded('GET /api/travel/stay/{id}', error);
      return mockStay(id, currency);
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

  // ─── Confirm (issue vouchers/PNRs for the whole order) ───────────────────────

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
        items: fallbackLines.map((line, index) => {
          const reference = `${line.product.slice(0, 2).toUpperCase()}-${line.offerId}`;
          const reservationId = `${orderRef}-${(index + 1).toString().padStart(2, '0')}`;
          return {
            product: line.product,
            title: readString(line.detail['title']) || productLabel(line.product),
            subtitle: readString(line.detail['subtitle']) || undefined,
            reference,
            reservationId,
          };
        }),
      };
    }
  }

  // ─── Mis viajes ──────────────────────────────────────────────────────────────

  async trips(apiBase: string, traveler: string, currency: string): Promise<readonly TravelTrip[]> {
    const query = traveler ? `?traveler=${encodeURIComponent(traveler)}` : '';
    const url = `${apiBase}/trips${query}`;
    try {
      const data = await this.getJson(url);
      const trips = normalizeTrips(data, currency);
      if (trips) {
        return trips;
      }
      throw new Error('trips-shape');
    } catch (error) {
      this.markDegraded('GET /api/travel/trips', error);
      return mockTrips(currency);
    }
  }

  // ─── Cancel a booking ─────────────────────────────────────────────────────────

  async cancel(apiBase: string, ref: string): Promise<CancelReceipt> {
    const url = `${apiBase}/order/${encodeURIComponent(ref)}/cancel`;
    try {
      const data = await this.postJson(url, { ref });
      const receipt = normalizeCancel(data, ref);
      if (receipt) {
        return receipt;
      }
      throw new Error('cancel-shape');
    } catch (error) {
      this.markDegraded('POST /api/travel/order/{ref}/cancel', error);
      return { ref, status: 'cancelled', refundLabel: 'Reembolso en 5–7 días hábiles' };
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

function readGeo(value: unknown): TravelGeo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const lat = Number(value['lat']);
  const lng = Number(value['lng']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }
  return { lat, lng };
}

function normalizeFareFamilies(
  value: unknown,
  fallbackCurrency: string,
): readonly FareFamily[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const families = value
    .map((entry): FareFamily | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const label = readString(entry['label']).trim() || readString(entry['name']).trim();
      if (!id || !label) {
        return null;
      }
      return {
        id,
        label,
        amount: readNumber(entry['amount'] ?? entry['price']),
        currency: readString(entry['currency']).trim() || fallbackCurrency,
        perks: readStringArray(entry['perks'] ?? entry['included']),
        badge: readString(entry['badge']).trim() || undefined,
      };
    })
    .filter((family): family is FareFamily => family !== null);
  return families.length > 0 ? families : undefined;
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
  const subtitle = readString(value['subtitle']).trim() || readString(value['description']).trim();
  const currency = readString(value['currency']).trim() || fallbackCurrency;
  const geo = product === 'hotel' ? readGeo(value['geo']) : undefined;
  const fareFamilies =
    product === 'flight' ? normalizeFareFamilies(value['fareFamilies'], currency) : undefined;
  const rating = product === 'hotel' ? readNumber(value['rating']) : undefined;
  const stayId =
    product === 'hotel' ? readString(value['stayId']).trim() || offerId : undefined;
  return {
    offerId,
    product,
    title,
    subtitle,
    amount: readNumber(value['amount'] ?? value['price'] ?? value['totalPrice']),
    currency,
    badges: readStringArray(value['badges']),
    geo,
    fareFamilies,
    stayId,
    rating: rating && rating > 0 ? rating : undefined,
    detail: { ...detail, title, subtitle },
  };
}

function normalizeStayRates(value: unknown, fallbackCurrency: string): readonly StayRate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): StayRate | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const roomLabel = readString(entry['roomLabel']).trim() || readString(entry['room']).trim();
      if (!id || !roomLabel) {
        return null;
      }
      return {
        id,
        roomLabel,
        rateLabel: readString(entry['rateLabel']).trim() || readString(entry['rate']).trim(),
        amount: readNumber(entry['amount'] ?? entry['price']),
        currency: readString(entry['currency']).trim() || fallbackCurrency,
        refundable: readBoolean(entry['refundable']),
        perks: readStringArray(entry['perks']),
      };
    })
    .filter((rate): rate is StayRate => rate !== null);
}

function normalizeStay(value: unknown, id: string, fallbackCurrency: string): StayDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const source = isRecord(value['stay']) ? (value['stay'] as Record<string, unknown>) : value;
  const title = readString(source['title']).trim() || readString(source['name']).trim();
  if (!title) {
    return null;
  }
  const currency = readString(source['currency']).trim() || fallbackCurrency;
  const rawSpecs = Array.isArray(source['specs']) ? source['specs'] : [];
  const specs: StaySpec[] = rawSpecs
    .map((entry): StaySpec | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }
      return { label, value: readString(entry['value']).trim() };
    })
    .filter((spec): spec is StaySpec => spec !== null);
  return {
    id: readString(source['id']).trim() || id,
    title,
    subtitle: readString(source['subtitle']).trim(),
    description: readString(source['description']).trim(),
    address: readString(source['address']).trim(),
    rating: readNumber(source['rating']),
    reviewCount: Math.trunc(readNumber(source['reviewCount'])),
    currency,
    images: readStringArray(source['images']),
    amenities: readStringArray(source['amenities']),
    specs,
    rates: normalizeStayRates(source['rates'], currency),
    geo: readGeo(source['geo']),
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
      .map((entry): TravelConfirmedItem | null => {
        if (!isRecord(entry)) {
          return null;
        }
        const productRaw = readString(entry['product']).trim();
        const product: TravelProduct =
          productRaw === 'flight' || productRaw === 'car' ? productRaw : 'hotel';
        const reference = readString(entry['reference']).trim() || confirmationCode;
        const subtitle = readString(entry['subtitle']).trim();
        return {
          product,
          title: readString(entry['title']).trim() || productLabel(product),
          reference,
          reservationId: readString(entry['reservationId']).trim() || reference,
          ...(subtitle ? { subtitle } : {}),
        };
      })
      .filter((entry): entry is TravelConfirmedItem => entry !== null),
  };
}

const TRIP_STATES: readonly TripStatus[] = ['upcoming', 'inprogress', 'completed', 'cancelled'];

function normalizeTrips(value: unknown, fallbackCurrency: string): readonly TravelTrip[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['trips'])
      ? value['trips']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): TravelTrip | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const ref = readString(entry['ref']).trim() || readString(entry['id']).trim();
      const title = readString(entry['title']).trim();
      if (!ref || !title) {
        return null;
      }
      const statusRaw = readString(entry['status']).trim().toLowerCase();
      const status = (TRIP_STATES as readonly string[]).includes(statusRaw)
        ? (statusRaw as TripStatus)
        : 'upcoming';
      const rawItems = Array.isArray(entry['items']) ? entry['items'] : [];
      return {
        ref,
        title,
        destination: readString(entry['destination']).trim(),
        startDate: readString(entry['startDate']).trim(),
        endDate: readString(entry['endDate']).trim(),
        status,
        total: readNumber(entry['total'] ?? entry['amount']),
        currency: readString(entry['currency']).trim() || fallbackCurrency,
        items: rawItems
          .map((line): TravelTripItem | null => {
            if (!isRecord(line)) {
              return null;
            }
            const productRaw = readString(line['product']).trim();
            const product: TravelProduct =
              productRaw === 'flight' || productRaw === 'car' ? productRaw : 'hotel';
            return {
              product,
              title: readString(line['title']).trim() || productLabel(product),
              subtitle: readString(line['subtitle']).trim(),
              reservationId: readString(line['reservationId']).trim() || ref,
            };
          })
          .filter((line): line is TravelTripItem => line !== null),
      };
    })
    .filter((trip): trip is TravelTrip => trip !== null);
}

function normalizeCancel(value: unknown, ref: string): CancelReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const statusRaw = readString(value['status']).trim().toLowerCase();
  const status: CancelReceipt['status'] = statusRaw === 'pending' ? 'pending' : 'cancelled';
  return {
    ref: readString(value['ref']).trim() || ref,
    status,
    refundLabel: readString(value['refundLabel']).trim() || undefined,
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

const HOTEL_GEO: Readonly<Record<string, TravelGeo>> = {
  'HMOCK-1': { lat: 10.4236, lng: -75.5518 },
  'HMOCK-2': { lat: 10.4265, lng: -75.5486 },
  'HMOCK-3': { lat: 10.3997, lng: -75.5511 },
  'HMOCK-4': { lat: 10.4142, lng: -75.5432 },
};

function mockFareFamilies(base: number, currency: string): readonly FareFamily[] {
  return [
    {
      id: 'basic',
      label: 'Basic',
      amount: base,
      currency,
      perks: ['Equipaje de mano', 'Sin cambios'],
    },
    {
      id: 'classic',
      label: 'Classic',
      amount: Math.round(base * 1.35),
      currency,
      perks: ['Equipaje de mano', 'Maleta 23 kg', 'Cambios con costo'],
      badge: 'Más popular',
    },
    {
      id: 'flex',
      label: 'Flex',
      amount: Math.round(base * 1.75),
      currency,
      perks: ['Equipaje de mano', 'Maleta 23 kg', 'Cambios sin costo', 'Reembolsable'],
    },
  ];
}

function mockOffers(product: TravelProduct, currency: string): readonly TravelOffer[] {
  switch (product) {
    case 'hotel':
      return [
        hotelMock('HMOCK-1', 'Hotel Caribe Cartagena', 'Desayuno incluido · Frente al mar', 980_000, currency, ['Reembolsable', '4 estrellas'], 4.5),
        hotelMock('HMOCK-2', 'Sofitel Santa Clara', 'Solo alojamiento · Centro histórico', 1_640_000, currency, ['No reembolsable', '5 estrellas'], 4.8),
        hotelMock('HMOCK-3', 'Hotel Boutique Getsemaní', 'Desayuno · Piscina en terraza', 620_000, currency, ['Reembolsable', '3 estrellas'], 4.2),
        hotelMock('HMOCK-4', 'Hyatt Regency Cartagena', 'Media pensión · Playa privada', 1_280_000, currency, ['Reembolsable', '5 estrellas'], 4.6),
      ];
    case 'flight':
      return [
        flightMock('FMOCK-1', 'BOG → CTG', 'Directo · 1h 25m · Económica', 412_000, currency, ['Sin escalas']),
        flightMock('FMOCK-2', 'BOG → CTG', '1 escala · 4h 10m · Económica', 298_000, currency, ['Más económico']),
        flightMock('FMOCK-3', 'BOG → CTG', 'Directo · 1h 30m · Económica', 456_000, currency, ['Sin escalas', 'Horario mañana']),
      ];
    case 'car':
      return [
        offerMock('CMOCK-1', 'car', 'Chevrolet Onix', 'Económico · Automático · A/C', 156_000, currency, ['Kilometraje ilimitado']),
        offerMock('CMOCK-2', 'car', 'Toyota Fortuner', 'SUV · 4x4 · 7 plazas', 384_000, currency, ['Seguro incluido']),
        offerMock('CMOCK-3', 'car', 'Renault Kwid', 'Económico · Manual', 118_000, currency, ['El más barato']),
      ];
  }
}

function hotelMock(
  offerId: string,
  title: string,
  subtitle: string,
  amount: number,
  currency: string,
  badges: readonly string[],
  rating: number,
): TravelOffer {
  return {
    offerId,
    product: 'hotel',
    title,
    subtitle,
    amount,
    currency,
    badges,
    geo: HOTEL_GEO[offerId],
    stayId: offerId,
    rating,
    detail: { title, subtitle },
  };
}

function flightMock(
  offerId: string,
  title: string,
  subtitle: string,
  amount: number,
  currency: string,
  badges: readonly string[],
): TravelOffer {
  return {
    offerId,
    product: 'flight',
    title,
    subtitle,
    amount,
    currency,
    badges,
    fareFamilies: mockFareFamilies(amount, currency),
    detail: { title, subtitle },
  };
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

function mockStay(id: string, currency: string): StayDetail {
  const source = mockOffers('hotel', currency).find((offer) => offer.stayId === id);
  const title = source?.title ?? 'Hotel Caribe Cartagena';
  const rating = source?.rating ?? 4.5;
  const base = source?.amount ?? 980_000;
  return {
    id,
    title,
    subtitle: source?.subtitle ?? 'Frente al mar · Centro histórico',
    description:
      'Alojamiento de demostración. La descripción real, la galería, las amenidades y ' +
      'las tarifas se cargan desde el motor de reservas cuando la API responde.',
    address: 'Bocagrande, Cartagena de Indias, Colombia',
    rating,
    reviewCount: 842,
    currency,
    images: [],
    amenities: [
      'WiFi gratis',
      'Piscina',
      'Desayuno buffet',
      'Aire acondicionado',
      'Gimnasio',
      'Parqueadero',
      'Bar en la terraza',
      'Recepción 24h',
    ],
    specs: [
      { label: 'Check-in', value: 'Desde las 15:00' },
      { label: 'Check-out', value: 'Hasta las 12:00' },
      { label: 'Política', value: 'Cancelación gratis hasta 48h antes' },
      { label: 'Mascotas', value: 'No se admiten' },
    ],
    rates: [
      {
        id: `${id}-r1`,
        roomLabel: 'Habitación Estándar · Vista ciudad',
        rateLabel: 'Solo alojamiento',
        amount: base,
        currency,
        refundable: false,
        perks: ['Cama doble', 'WiFi'],
      },
      {
        id: `${id}-r2`,
        roomLabel: 'Habitación Deluxe · Vista al mar',
        rateLabel: 'Desayuno incluido · Flexible',
        amount: Math.round(base * 1.3),
        currency,
        refundable: true,
        perks: ['Cama king', 'Desayuno buffet', 'Cancelación gratis'],
      },
      {
        id: `${id}-r3`,
        roomLabel: 'Suite Junior · Terraza privada',
        rateLabel: 'Media pensión · Flexible',
        amount: Math.round(base * 1.85),
        currency,
        refundable: true,
        perks: ['Sala de estar', 'Desayuno + cena', 'Cancelación gratis', 'Late check-out'],
      },
    ],
    geo: source?.geo ?? HOTEL_GEO['HMOCK-1'],
  };
}

function mockTrips(currency: string): readonly TravelTrip[] {
  return [
    {
      ref: 'TRIP-2026-0481',
      title: 'Escapada a Cartagena',
      destination: 'Cartagena, Colombia',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      status: 'upcoming',
      total: 2_872_000,
      currency,
      items: [
        { product: 'flight', title: 'BOG → CTG', subtitle: 'Directo · Económica', reservationId: 'PNR-QX7T2A' },
        { product: 'hotel', title: 'Hotel Caribe Cartagena', subtitle: '4 noches · Deluxe', reservationId: 'HTL-88213' },
        { product: 'car', title: 'Chevrolet Onix', subtitle: '4 días · Automático', reservationId: 'CAR-55190' },
      ],
    },
    {
      ref: 'TRIP-2026-0355',
      title: 'Fin de semana en Medellín',
      destination: 'Medellín, Colombia',
      startDate: '2026-05-16',
      endDate: '2026-05-18',
      status: 'completed',
      total: 720_000,
      currency,
      items: [
        { product: 'flight', title: 'BOG → MDE', subtitle: 'Directo · Económica', reservationId: 'PNR-LM3K9' },
      ],
    },
  ];
}

/** Build a demo seat map for the flight seat-selection step (visible degradation). */
export function mockSeatMap(): SeatMapPayload {
  const columns: readonly ('window' | 'aisle' | 'middle' | 'extra-legroom')[] = [
    'window',
    'middle',
    'aisle',
    'aisle',
    'middle',
    'window',
  ];
  const rows: SeatMapRowInternal[] = [];
  for (let r = 1; r <= 8; r += 1) {
    const seats = columns.map((type, index) => {
      const legroom = r <= 2;
      const resolvedType = legroom && (index === 0 || index === 5) ? 'extra-legroom' : type;
      return {
        id: `${r}${String.fromCharCode(65 + index)}`,
        type: resolvedType,
        available: (r + index) % 3 !== 0,
        price: resolvedType === 'extra-legroom' ? 45_000 : index === 2 || index === 3 ? 18_000 : 0,
      };
    });
    rows.push({ rowNumber: r, seats });
  }
  return { rows, aisleAfterColumns: 3 };
}

type SeatMapRowInternal = {
  rowNumber: number;
  seats: { id: string; type: 'window' | 'aisle' | 'middle' | 'extra-legroom'; available: boolean; price: number }[];
};
