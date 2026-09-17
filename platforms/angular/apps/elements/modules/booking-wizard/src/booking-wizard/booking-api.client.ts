import { Injectable } from '@angular/core';
import type { BookingGuest, BookingOffer, BookingRoom, BookingVoucher } from './booking.model';

/**
 * El cliente HTTP del motor de reservas de hotel (`/search`, `/hold`, `/pay`).
 *
 * Salió del componente con #24. Lo que antes era un `fetchJson` privado con dos
 * `.then()` encadenados son ahora tres métodos con tres fallos propios, y **ésa
 * es la razón del fichero**, no el orden.
 *
 * **Acá NO se degrada a datos de mentira**, al revés que `TravelApiClient`. Un
 * catálogo que cae a mock enseña hoteles de ejemplo; una DISPONIBILIDAD que cae
 * a mock enseña habitaciones que no existen y acepta reservarlas. Cuando el
 * motor no contesta, esto falla a la vista.
 */

/** Lo que `/hold` devuelve cuando sí aparta. */
export interface BookingHold {
  readonly reservationId: string;
}

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

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

/** Formatea un importe en es-CO para la moneda dada. */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
  }
}

/** Normaliza una oferta cruda de la API a la forma estricta de dentro. */
export function normalizeOffer(value: unknown, fallbackCurrency: string): BookingOffer | null {
  if (!isRecord(value)) {
    return null;
  }

  const offerId =
    readString(value['offerId']).trim() ||
    readString(value['id']).trim() ||
    readString(value['rateKey']).trim();
  const roomTypeName =
    readString(value['roomTypeName']).trim() || readString(value['roomType']).trim();
  if (!offerId || !roomTypeName) {
    return null;
  }

  const currency = readString(value['currency']).trim() || fallbackCurrency;
  const totalPrice = readNumber(value['totalPrice']) ?? readNumber(value['price']) ?? 0;
  const formatted =
    readString(value['totalPriceFormatted']).trim() || formatPrice(totalPrice, currency);

  return {
    offerId,
    roomTypeName,
    board: readString(value['board']).trim(),
    totalPrice,
    totalPriceFormatted: formatted,
    currency,
    refundable: readBoolean(value['refundable']),
    cancellationPolicy: readString(value['cancellationPolicy']).trim(),
    roomsLeft: readNumber(value['roomsLeft']),
  };
}

export function normalizeOffers(value: unknown, fallbackCurrency: string): readonly BookingOffer[] {
  const list = Array.isArray(value)
    ? value
    : isRecord(value)
      ? value['offers'] ?? value['results'] ?? value['rooms']
      : null;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry) => normalizeOffer(entry, fallbackCurrency))
    .filter((offer): offer is BookingOffer => offer !== null);
}

/** Normaliza la ocupación que emite `<synergos-pax-selector>`. */
export function normalizeRooms(value: unknown): readonly BookingRoom[] {
  const source = isRecord(value) ? value['rooms'] : value;
  if (!Array.isArray(source)) {
    return [{ adults: 2, childAges: [] }];
  }
  const rooms = source
    .map((entry): BookingRoom | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const adults = Math.max(1, Math.trunc(readNumber(entry['adults']) ?? 1));
      const rawAges = Array.isArray(entry['childAges']) ? entry['childAges'] : [];
      const childAges = rawAges
        .map((age) => readNumber(age))
        .filter((age): age is number => age !== null)
        .map((age) => Math.max(0, Math.trunc(age)));
      return { adults, childAges };
    })
    .filter((room): room is BookingRoom => room !== null);
  return rooms.length > 0 ? rooms : [{ adults: 2, childAges: [] }];
}

@Injectable()
export class BookingApiClient {
  /** Disponibilidad para unas fechas y una ocupación. */
  async search(
    apiBase: string,
    checkIn: string,
    checkOut: string,
    rooms: readonly BookingRoom[],
    currency: string,
  ): Promise<readonly BookingOffer[]> {
    const data = await this.post(`${apiBase}/search`, {
      checkIn,
      checkOut,
      rooms: rooms.map((room) => ({ adults: room.adults, childAges: [...room.childAges] })),
    });
    return normalizeOffers(data, currency);
  }

  /**
   * Aparta la habitación. **Devuelve `null` cuando no se pudo apartar** en vez de
   * lanzar: quien llama tiene que poder distinguir esto de un cobro rechazado, y
   * una excepción los volvería a juntar en el mismo `catch` — que es el defecto
   * que #24 vino a arreglar.
   */
  async hold(
    apiBase: string,
    offer: BookingOffer,
    checkIn: string,
    checkOut: string,
    rooms: readonly BookingRoom[],
    guest: BookingGuest,
  ): Promise<BookingHold | null> {
    try {
      const data = await this.post(`${apiBase}/hold`, {
        offerId: offer.offerId,
        offer,
        checkIn,
        checkOut,
        rooms: rooms.map((room) => ({ adults: room.adults, childAges: [...room.childAges] })),
        guest,
      });
      const reservationId =
        readString(isRecord(data) ? data['reservationId'] : '').trim() ||
        readString(isRecord(data) ? data['id'] : '').trim();
      return reservationId ? { reservationId } : null;
    } catch {
      return null;
    }
  }

  /** Cobra el apartado. `null` = no se pudo cobrar o no quedó confirmado. */
  async pay(
    apiBase: string,
    reservationId: string,
    fallback: { readonly offer: BookingOffer; readonly checkIn: string; readonly checkOut: string },
  ): Promise<BookingVoucher | null> {
    try {
      const data = await this.post(`${apiBase}/pay`, { reservationId });
      const voucher = this.toVoucher(data, reservationId, fallback);
      // Un estado que no es «confirmado» no es un comprobante: devolverlo dejaría
      // al asistente celebrando una reserva que el motor no aceptó.
      return voucher && voucher.status.toLowerCase() === 'confirmed' ? voucher : null;
    } catch {
      return null;
    }
  }

  private toVoucher(
    data: unknown,
    reservationId: string,
    fallback: { readonly offer: BookingOffer; readonly checkIn: string; readonly checkOut: string },
  ): BookingVoucher | null {
    if (!isRecord(data)) {
      return null;
    }
    const id = readString(data['reservationId']).trim() || reservationId;
    if (!id) {
      return null;
    }
    const currency = readString(data['currency']).trim() || fallback.offer.currency;
    const totalPrice = readNumber(data['totalPrice']) ?? fallback.offer.totalPrice;
    return {
      reservationId: id,
      status: readString(data['status']).trim() || 'Confirmed',
      totalPrice,
      totalPriceFormatted:
        readString(data['totalPriceFormatted']).trim() || formatPrice(totalPrice, currency),
      currency,
      checkIn: readString(data['checkIn']).trim() || fallback.checkIn,
      checkOut: readString(data['checkOut']).trim() || fallback.checkOut,
    };
  }

  private async post(url: string, payload: unknown): Promise<unknown> {
    if (typeof fetch !== 'function') {
      throw new Error('fetch-unavailable');
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }
}
