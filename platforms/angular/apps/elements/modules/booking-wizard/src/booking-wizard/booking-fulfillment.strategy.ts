import { Injectable, inject } from '@angular/core';
import {
  FulfillmentStrategyBase,
  SessionStore,
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
  abrirEstadia,
  abrirNoDejoEstadia,
  cerrarEstadia,
  consultarEstadia,
  ventanaDeLaEstadia,
  type EstadiaLeida,
} from './booking-viaje';
import {
  BOOKING_FLOW,
  BOOKING_HOLD_FAILED,
  BOOKING_ITEM_KIND,
  BOOKING_PAYMENT_FAILED,
  caminoDeLaReserva,
  type BookingGuest,
  type BookingOffer,
  type BookingRoom,
  type BookingSelection,
  type BookingVoucher,
  type CaminoDeLaReserva,
} from './booking.model';
import { aMenores, formatearImporte } from '@synergos/vitals-core';

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

/**
 * Instrumento que la app le pasa a `pay` Y a `confirm` (ADR 0140 F4): viaja por llamada, porque hay UNA estrategia por
 * página y un campo suyo cruzaría dos instancias (regla 60).
 */
interface BookingPayInstrument {
  readonly guest: BookingGuest;
  /** El `<synergos-booking-wizard>` de ESTA reserva: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly host: Element;
  /** Por dónde reserva, como lo DECLARA el CMS. Una estadía que ya salió se termina por el camino por el que salió. */
  readonly camino: CaminoDeLaReserva;
}

@Injectable()
export class BookingFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = BOOKING_FLOW;
  protected readonly flow = BOOKING_FLOW;

  readonly #api = inject(BookingApiClient);
  readonly #store = inject(SessionStore);

  /** Paso 1 — disponibilidad para las fechas y la ocupación. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<BookingSearchCriteria>;
    const apiBase = criteria.apiBase ?? '';
    const rooms = criteria.rooms ?? [{ adults: 2, childAges: [] }];
    const currency = query.currency ?? '';
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
      amount: aMenores(product.amount, (product.selection as { readonly currency?: string }).currency),
      quantity: 1,
    };
    return { item };
  }

  /**
   * Paso 3 — apartar. Un apartado que no sale NO es un fallo de pago.
   *
   * Por la PUERTA, ABRIR la estadía: aparta la habitación y autoriza el total, sin mover plata, con la llave de la
   * INTENCIÓN (la sesión). El producto es el `productRef` que dio la búsqueda, nunca uno derivado del `offerId`. El
   * total pasa a ser el del SERVIDOR. Nunca cae a la directa, ni ante un 503.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const selection = this.selectionOf(request.session);
    if (!selection) {
      return { accepted: false, reason: BOOKING_HOLD_FAILED };
    }
    const instrument = request.instrument as Partial<BookingPayInstrument>;
    if (caminoDeLaEstadiaEnCurso(request.session, instrument.camino) === 'puerta') {
      return this.abrirPorLaPuerta(request.session, selection, instrument.host);
    }
    this.anotar((item) => conElCamino(item, 'directa'));
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

  /**
   * Paso 4 — cobrar el apartado y devolver el comprobante.
   *
   * Por la PUERTA, CERRAR la estadía (captura y confirma). Si falla y no es transitorio, se CONSULTA antes de decidir
   * (defecto 3: el asistente no consultaba): completada, se sigue como si hubiera contestado bien; deshecha, el pago de
   * la sesión queda fallido y el siguiente clic reabre con la misma llave.
   */
  override async confirm(session: SessionData, instrument?: Readonly<Record<string, unknown>>): Promise<FulfillmentConfirmation> {
    const datos = (instrument ?? {}) as Partial<BookingPayInstrument>;
    if (caminoDeLaEstadiaEnCurso(session, datos.camino) === 'puerta') {
      return this.cerrarPorLaPuerta(session, datos.host);
    }
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

  private async abrirPorLaPuerta(
    session: SessionData,
    selection: BookingSelection,
    host: Element | undefined,
  ): Promise<FulfillmentPayResult> {
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    if (!selection.offer.productRef) {
      return { accepted: false, reason: 'cliente.sin_producto' };
    }
    const ventana = ventanaDeLaEstadia(selection.checkIn, selection.checkOut);
    if (!ventana) {
      return { accepted: false, reason: 'cliente.sin_periodo' };
    }
    // El camino y la llave quedan en la línea ANTES de salir a la red: desde ahora la estadía puede existir, y sólo
    // del lado de la puerta.
    const llave = session.sessionId;
    this.anotar((item) => ({ ...conElCamino(item, 'puerta'), holdRef: llave }));
    const abierta = await abrirEstadia(host, selection.offer.productRef, selection.offer.roomTypeName, ventana, llave);
    if (!abierta.ok) {
      if (abrirNoDejoEstadia(abierta.rechazo)) {
        this.anotar(sinLaRetenida);
      }
      return { accepted: false, reason: abierta.rechazo.code };
    }
    const estadia = abierta.valor;
    const sesion = this.#store.getValidSession();
    const total = estadia.total ? aMenores(estadia.total.amount, estadia.total.currency) : sesion.pricing.totalAmount;
    this.#store.setSession({
      ...sesion,
      items: sesion.items.map((item) => ({
        ...item,
        ...(estadia.vence ? { expiresAt: estadia.vence } : {}),
        selection: { ...item.selection, [CAMPO_DE_LA_ESTADIA]: estadia.id },
      })),
      pricing: {
        ...sesion.pricing,
        currency: estadia.total?.currency ?? sesion.pricing.currency,
        totalAmount: total,
        balanceDue: total,
      },
    });
    return { accepted: true, reference: estadia.id };
  }

  private async cerrarPorLaPuerta(session: SessionData, host: Element | undefined): Promise<FulfillmentConfirmation> {
    if (!(host instanceof Element)) {
      return { confirmed: false, vouchers: [], reason: 'cliente.sin_coordinador' };
    }
    const id = estadiaDeLaSesion(session) ?? '';
    const cerrada = await cerrarEstadia(host, id);
    let estadia: EstadiaLeida | null = cerrada.ok ? cerrada.valor : null;
    if (!cerrada.ok) {
      if (cerrada.rechazo.transient) {
        return { confirmed: false, vouchers: [], reason: cerrada.rechazo.code };
      }
      const leida = await consultarEstadia(host, id);
      estadia = leida.ok && leida.valor.estado === 'Completed' ? leida.valor : null;
      if (!estadia) {
        if (leida.ok && leida.valor.estado === 'Compensated') {
          this.#store.setSession(sinEstadiaPendiente(this.#store.getValidSession()));
        }
        return { confirmed: false, vouchers: [], reason: cerrada.rechazo.code };
      }
    }
    const selection = this.selectionOf(session);
    const total = estadia!.total;
    const voucher: BookingVoucher = {
      // El número del viaje es lo que se enseña: por la puerta no sale ningún identificador de la agenda.
      reservationId: estadia!.numero,
      status: estadia!.estado,
      totalPrice: total?.amount ?? 0,
      totalPriceFormatted: total ? formatearImporte(total.amount, total.currency) : '',
      currency: total?.currency ?? selection?.currency ?? '',
      checkIn: selection?.checkIn ?? '',
      checkOut: selection?.checkOut ?? '',
    };
    return {
      confirmed: true,
      vouchers: [{ itemId: session.items[0]?.id ?? BOOKING_ITEM_KIND, reference: voucher.reservationId, status: voucher.status, detail: { voucher } }],
    };
  }

  private anotar(cambio: (item: SessionItem) => SessionItem): void {
    const sesion = this.#store.getValidSession();
    this.#store.setSession({ ...sesion, items: sesion.items.map(cambio) });
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
      currency: raw.currency ?? '',
    };
  }
}

/** Dónde queda, en la línea, el id de la estadía que abrió la puerta. */
export const CAMPO_DE_LA_ESTADIA = 'estadia';

/** Dónde queda, en la línea, el camino por el que salió la estadía. */
const CAMPO_DEL_CAMINO = 'camino';

function conElCamino(item: SessionItem, camino: CaminoDeLaReserva): SessionItem {
  return { ...item, selection: { ...item.selection, [CAMPO_DEL_CAMINO]: camino } };
}

/** El camino por el que SALIÓ la estadía de esta sesión, o `null` si todavía no salió. */
export function caminoDeLaEstadiaPendiente(session: SessionData): CaminoDeLaReserva | null {
  const anotado = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DEL_CAMINO];
  return anotado === 'puerta' || anotado === 'directa' ? anotado : null;
}

/**
 * Una estadía que ya salió **se termina por el camino por el que salió**: su viaje o su apartado sólo existe de ese
 * lado, y cambiar de camino a mitad apartaría dos veces. Si todavía no salió, el que declara el CMS.
 */
export function caminoDeLaEstadiaEnCurso(session: SessionData, declarado: unknown): CaminoDeLaReserva {
  return caminoDeLaEstadiaPendiente(session) ?? caminoDeLaReserva(declarado);
}

/** El id de la estadía de esta sesión por la puerta: el que abrir contestó, o el del último pago vivo. */
export function estadiaDeLaSesion(session: SessionData): string | null {
  const enLaLinea = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DE_LA_ESTADIA];
  if (typeof enLaLinea === 'string' && enLaLinea !== '') return enLaLinea;
  const ultimo = session.payments[session.payments.length - 1];
  return caminoDeLaEstadiaPendiente(session) === 'puerta' && ultimo && ultimo.status !== 'failed' ? (ultimo.reference ?? null) : null;
}

/**
 * La estadía PENDIENTE de esta sesión: abierta por la puerta y sin confirmar. Es la única que la pantalla ofrece
 * cancelar: lo confirmado lo gestiona quien vende (006-P3).
 */
export function estadiaPendiente(session: SessionData): string | null {
  return session.status !== 'confirmed' && caminoDeLaEstadiaPendiente(session) === 'puerta' ? estadiaDeLaSesion(session) : null;
}

/** La línea sin lo que la ataba a su estadía: la llave retenida, el plazo del apartado, el id y el camino. */
function sinLaRetenida(item: SessionItem): SessionItem {
  const { holdRef: _suelta, expiresAt: _vence, ...linea } = item;
  const { [CAMPO_DE_LA_ESTADIA]: _estadia, [CAMPO_DEL_CAMINO]: _camino, ...seleccion } = linea.selection as Record<string, unknown>;
  return { ...linea, selection: seleccion };
}

/**
 * La sesión sin la estadía pendiente: lo que el servidor deshizo ya no está apartado ni autorizado. El último pago
 * queda `failed` y la línea deja de estar retenida, así que el siguiente clic vuelve a abrir.
 */
export function sinEstadiaPendiente(session: SessionData): SessionData {
  const ultimo = session.payments.length - 1;
  return {
    ...session,
    items: session.items.map(sinLaRetenida),
    payments: session.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
  };
}
