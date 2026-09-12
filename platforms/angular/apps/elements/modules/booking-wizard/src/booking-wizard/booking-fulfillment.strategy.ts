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
import { BookingApiClient } from './booking-api.client';
import {
  BOOKING_FLOW,
  BOOKING_HOLD_FAILED,
  BOOKING_ITEM_KIND,
  BOOKING_PAYMENT_FAILED,
  type BookingGuest,
  type BookingOffer,
  type BookingRoom,
  type BookingSelection,
} from './booking.model';

/**
 * La `IFulfillmentStrategy` del flujo de hotel — el único sitio donde vive lo
 * específico de reservar una habitación (#24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **EL REPARTO: `/hold` es `pay`, y `/pay` es `confirm`.**
 *
 * Parece al revés y no lo es. El motor documenta `pay` como «poner los ítems en
 * hold Y tomar el pago del carrito», y `confirm` como el paso que devuelve los
 * comprobantes. En este backend `/hold` es lo que aparta y devuelve el
 * identificador de la reserva, y `/pay` es lo que la deja confirmada con su
 * voucher. El mapeo por nombre —`/pay` en `pay`— habría dejado el apartado
 * colgado de una llamada y el cobro sin paso propio.
 *
 * **Y partirlo ahí es lo que arregla el defecto.** Antes las dos llamadas vivían
 * en el mismo `.then().catch()` del componente, así que «la habitación ya no
 * está» y «tu tarjeta no pasó» salían con el mismo texto y dejaban a la persona
 * en el mismo sitio: reintentando un pago contra un apartado que nunca iba a
 * existir. Ahora cada una devuelve su motivo y el componente decide a dónde
 * mandar a quien reserva.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Criterios que la app le pasa a `search`. */
interface BookingSearchCriteria {
  readonly apiBase: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly rooms: readonly BookingRoom[];
}

/** Instrumento que la app le pasa a `pay`. */
interface BookingPayInstrument {
  readonly guest: BookingGuest;
}

@Injectable()
export class BookingFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = BOOKING_FLOW;
  protected readonly flow = BOOKING_FLOW;

  readonly #api = inject(BookingApiClient);

  /** Paso 1 — disponibilidad para las fechas y la ocupación. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<BookingSearchCriteria>;
    const apiBase = criteria.apiBase ?? '/api/booking';
    const rooms = criteria.rooms ?? [{ adults: 2, childAges: [] }];
    const currency = query.currency ?? 'COP';
    const offers = await this.#api.search(
      apiBase,
      criteria.checkIn ?? '',
      criteria.checkOut ?? '',
      rooms,
      currency,
    );
    return offers.map((offer) => ({
      productRef: offer.offerId,
      kind: BOOKING_ITEM_KIND,
      label: offer.roomTypeName,
      amount: offer.totalPrice,
      // Todo lo que hace falta para apartar y para pintar el resumen viaja en la
      // selección: la línea del carrito es lo que sobrevive a un recargado.
      selection: {
        apiBase,
        checkIn: criteria.checkIn ?? '',
        checkOut: criteria.checkOut ?? '',
        rooms,
        offer,
        currency,
      } satisfies BookingSelection,
      meta: { offer },
    }));
  }

  /**
   * Paso 2 — la oferta elegida se vuelve la línea del carrito.
   *
   * **El id NO lleva la oferta, y es deliberado.** `SessionStore.addItem` es
   * idempotente por id, así que un id por oferta hacía que elegir otra habitación
   * AÑADIERA una segunda línea en vez de cambiar la elección: el total se
   * duplicaba y se apartaba la primera. Acá la sesión sostiene exactamente una
   * habitación, así que el id es el del tipo de línea y quién es va en
   * `productRef`. Con eso, reelegir lo mismo es idempotente y elegir otra cosa
   * reemplaza, sin un `reset()` que además borraría los pagos.
   *
   * Es lo contrario de `TravelFulfillmentStrategy`, que SÍ mete la tarifa en el
   * id — y está bien: un viaje lleva varias reservas a la vez, una reserva de
   * hotel lleva una. Lo cazó el spec.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const item: SessionItem = {
      id: BOOKING_ITEM_KIND,
      kind: product.kind,
      productRef: product.productRef,
      label: product.label,
      selection: product.selection,
      // El motor cuenta en unidades menores; las ofertas llegan en mayores.
      amount: Math.round(product.amount * 100),
      quantity: 1,
    };
    return { item };
  }

  /** Paso 3 — apartar. Un apartado que no sale NO es un fallo de pago. */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const selection = this.selectionOf(request.session);
    if (!selection) {
      return { accepted: false, reason: BOOKING_HOLD_FAILED };
    }
    const instrument = request.instrument as Partial<BookingPayInstrument>;
    const guest: BookingGuest = instrument.guest ?? { name: '', email: '' };

    const hold = await this.#api.hold(
      selection.apiBase,
      selection.offer,
      selection.checkIn,
      selection.checkOut,
      selection.rooms,
      guest,
    );
    if (!hold) {
      return { accepted: false, reason: BOOKING_HOLD_FAILED };
    }
    return { accepted: true, reference: hold.reservationId };
  }

  /** Paso 4 — cobrar el apartado y devolver el comprobante. */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const selection = this.selectionOf(session);
    const reservationId = session.payments[session.payments.length - 1]?.reference ?? '';
    if (!selection || !reservationId) {
      return { confirmed: false, vouchers: [], reason: BOOKING_PAYMENT_FAILED };
    }

    const voucher = await this.#api.pay(selection.apiBase, reservationId, {
      offer: selection.offer,
      checkIn: selection.checkIn,
      checkOut: selection.checkOut,
    });
    if (!voucher) {
      return { confirmed: false, vouchers: [], reason: BOOKING_PAYMENT_FAILED };
    }

    const itemId = session.items[0]?.id ?? BOOKING_ITEM_KIND;
    return {
      confirmed: true,
      vouchers: [
        {
          itemId,
          reference: voucher.reservationId,
          status: voucher.status,
          detail: { voucher },
        },
      ],
    };
  }

  /** La selección de la única línea del carrito, si la hay. */
  private selectionOf(session: SessionData): BookingSelection | null {
    const raw = session.items[0]?.selection as Partial<BookingSelection> | undefined;
    if (!raw || !raw.offer || !raw.apiBase) {
      return null;
    }
    return {
      apiBase: raw.apiBase,
      checkIn: raw.checkIn ?? '',
      checkOut: raw.checkOut ?? '',
      rooms: raw.rooms ?? [{ adults: 2, childAges: [] }],
      offer: raw.offer as BookingOffer,
      currency: raw.currency ?? 'COP',
    };
  }
}
