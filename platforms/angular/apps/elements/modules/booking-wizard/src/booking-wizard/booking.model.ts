/**
 * El vocabulario del asistente de reserva de hotel.
 *
 * Vive aparte del componente desde #24, cuando el flujo pasó a apoyarse en el
 * motor de transacción: el cliente HTTP, la estrategia de cumplimiento y el
 * componente tienen que estar de acuerdo en estas formas, y tenerlas dentro del
 * componente obligaba a que los tres lo importaran.
 */

/** El `flow` con el que esta app reclama su sesión ante el motor. */
export const BOOKING_FLOW = 'booking';

/** El `kind` de la única clase de línea que este flujo produce. */
export const BOOKING_ITEM_KIND = 'room';

/**
 * Por qué no se pudo completar una reserva.
 *
 * **Las dos causas piden lo contrario, y antes de #24 daban el mismo mensaje.**
 * El apartado fallido significa que la habitación ya no está: reintentar el pago
 * es reintentar contra algo que no va a existir, y hay que volver a elegir. El
 * cobro fallido significa que la tarjeta no pasó: ahí reintentar es exactamente
 * lo correcto. Son constantes y no literales sueltos porque el que las escribe
 * (la estrategia) y el que decide con ellas (el componente) están en ficheros
 * distintos, y una diferencia de una letra volvería a juntar los dos casos.
 */
export const BOOKING_HOLD_FAILED = 'booking.hold_failed';
export const BOOKING_PAYMENT_FAILED = 'booking.payment_failed';

/** Una habitación con su ocupación — calca lo que emite el pax-selector. */
export interface BookingRoom {
  readonly adults: number;
  readonly childAges: readonly number[];
}

/** Una oferta reservable, tal como la devuelve `/search`. */
export interface BookingOffer {
  readonly offerId: string;
  readonly roomTypeName: string;
  readonly board: string;
  readonly totalPrice: number;
  readonly totalPriceFormatted: string;
  readonly currency: string;
  readonly refundable: boolean;
  readonly cancellationPolicy: string;
  readonly roomsLeft: number | null;
}

/** El huésped que se captura antes de pagar. */
export interface BookingGuest {
  readonly name: string;
  readonly email: string;
}

/** El comprobante que devuelve `/pay`. */
export interface BookingVoucher {
  readonly reservationId: string;
  readonly status: string;
  readonly totalPrice: number;
  readonly totalPriceFormatted: string;
  readonly currency: string;
  readonly checkIn: string;
  readonly checkOut: string;
}

/**
 * Lo que la línea del carrito se lleva dentro. Es lo que sobrevive a un
 * recargado de página: el motor persiste la sesión, y las fechas y la ocupación
 * viajan acá dentro porque `SessionData` no tiene sitio para criterios
 * pre-carrito — y añadírselo por un solo consumidor va contra la regla de
 * promoción al segundo.
 */
export interface BookingSelection {
  readonly apiBase: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly rooms: readonly BookingRoom[];
  readonly offer: BookingOffer;
  readonly currency: string;
}
