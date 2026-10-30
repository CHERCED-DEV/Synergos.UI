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
import { aMenores } from '@synergos/vitals-core';
import { TravelApiClient } from './travel-api.client';
import { abrirNoDejoViaje, abrirViaje, cerrarViaje, consultarViaje, type ItemDelViaje, type ViajeLeido } from './travel-viaje';
import {
  TRAVEL_FLOW,
  caminoDeLaReserva,
  type CaminoDeLaReserva,
  type TravelCheckoutLine,
  type TravelCheckoutResult,
  type TravelConfirmation,
  type TravelGuest,
  type TravelOffer,
  type TravelProduct,
} from './travel.model';

/** Criteria the app hands the strategy on `search` (carried in the query). */
interface TravelSearchCriteria {
  readonly product: TravelProduct;
  readonly apiBase: string;
  readonly criteria: Readonly<Record<string, unknown>>;
}

/**
 * Lo que el asistente SH-3 le pasa a la estrategia en `pay` Y en `confirm` (ADR 0140 F4). Viaja por llamada: hay
 * UNA estrategia por página y un campo suyo cruzaría dos instancias (regla 60).
 */
interface TravelPayInstrument {
  readonly apiBase: string;
  readonly guest: TravelGuest;
  /** El `<synergos-travel-shell>` de ESTE viaje: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly host: Element;
  /**
   * Por dónde reserva, como lo DECLARA el CMS (`bookingPath`). Un viaje que ya salió no lo mira: se termina por el
   * camino por el que salió.
   */
  readonly camino: CaminoDeLaReserva;
}

/**
 * The Booking vertical's concrete <c>IFulfillmentStrategy</c> for the `travel`
 * flow — the **only place** product-specific transactional behaviour lives. The
 * app calls the engine's <c>FulfillmentContext</c> and never knows this class
 * answered; the provider routes by `flow === 'travel'`.
 *
 * `search`/`select`/`pay`/`confirm` map onto the backend contract via
 * <c>TravelApiClient</c>: availability degrades to mock data when its read endpoint is
 * not yet wired, but **the order and its locators never do** — `pay` and `confirm`
 * contestan que no cuando el borde no abrió la orden o no emitió los localizadores
 * (UI#92). A cart line is heterogeneous: a
 * hotel (room × rate), a flight (fare family + seat) and a car live side by side
 * under one <c>Pricing</c> and one checkout.
 */
@Injectable()
export class TravelFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = TRAVEL_FLOW;
  protected readonly flow = TRAVEL_FLOW;

  readonly #api = inject(TravelApiClient);
  readonly #store = inject(SessionStore);

  /** Step 1 — search the chosen product's availability. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<TravelSearchCriteria>;
    const product = criteria.product ?? 'hotel';
    const apiBase = criteria.apiBase ?? '';
    const offers = await this.#api.search(
      apiBase,
      product,
      criteria.criteria ?? {},
      query.currency ?? '',
    );
    return offers.map((offer) => this.toProduct(offer));
  }

  /**
   * Step 2 — turn a chosen offer into a heterogeneous cart line. The app builds
   * the `FulfillmentProduct` (already carrying the fare/seat/room selection in
   * `selection`), so the strategy just wraps it into a deterministic line whose
   * id includes the chosen fare/rate so a hotel booked at two rates is two lines.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const item: SessionItem = {
      // Deterministic id per offer+variant → re-selecting the same offer is idempotent.
      id: this.lineId(product),
      kind: product.kind,
      productRef: product.productRef,
      label: product.label,
      // El precio MAYOR de la oferta viaja con la línea (el checkout lo manda tal cual): volver a
      // él desde `amount` dividiendo por 100 es la regla 56, que no mira la moneda.
      selection: { ...product.selection, price: product.amount },
      // Engine pricing is in minor units; offers carry major units.
      amount: Math.round(product.amount * 100),
      quantity: 1,
    };
    return { item };
  }

  /**
   * Step 3 — one PSP checkout for the whole mixed cart.
   *
   * Por la PUERTA, ABRIR el viaje: aparta cada ítem y autoriza el total, sin mover plata, con la llave de la
   * INTENCIÓN (`SessionData.sessionId`): reintentar con la misma sesión devuelve el mismo viaje, o reabre el que
   * se deshizo. El total es el del SERVIDOR, y la sesión pasa a decirlo. Devuelve como referencia el id del viaje.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<TravelPayInstrument>;
    if (caminoDelViajeEnCurso(request.session, instrument.camino) === 'puerta') {
      return this.abrirPorLaPuerta(request.session, instrument.host);
    }
    this.anotar((item) => conElCamino(item, 'directa'));
    const apiBase = instrument.apiBase ?? '';
    const guest: TravelGuest = instrument.guest ?? { name: '', email: '' };
    const lines = this.toLines(request.session);
    const currency = request.session.pricing.currency;

    // Si el borde no abrió la orden, NO se acepta (UI#92): el cliente fabricaba un
    // `MOCK-<ts>` con su `psp_mock_…` y esto lo daba por bueno. Nada se cobró: el
    // asistente dice su `payFailedMessage` y volver a pulsar abre la orden otra vez.
    let checkout: TravelCheckoutResult;
    try {
      checkout = await this.#api.checkout(apiBase, lines, guest, currency);
    } catch (error) {
      void error;
      return { accepted: false, reason: 'checkout-not-opened' };
    }
    return {
      accepted: true,
      reference: checkout.orderRef,
    };
  }

  /**
   * Step 4 — confirm every held line, returning a voucher/PNR per item.
   *
   * **Si el borde no emitió los localizadores, esto NO confirma** (UI#92). El cobro ya
   * quedó en la sesión, así que el asistente lo nombra en su `confirmFailedMessage` y
   * volver a pulsar repite SÓLO esta confirmación sobre la misma orden (CMS#117).
   *
   * Por la PUERTA, CERRAR el viaje (captura el total y confirma cada ítem). Si cerrar falla y es transitorio, el
   * viaje se queda como está y el reintento repite sólo cerrar, que es idempotente. **Si no es transitorio, se
   * pregunta al viaje antes de decidir** (`consultar`): una respuesta ilegible puede llegar con el viaje hecho.
   * Completado: se sigue como si hubiera contestado bien. Deshecho: el pago de la sesión se marca fallido y el
   * siguiente clic vuelve a abrir con la MISMA llave. Cualquier otro: no se afirma nada.
   */
  override async confirm(session: SessionData, instrument?: Readonly<Record<string, unknown>>): Promise<FulfillmentConfirmation> {
    const datos = (instrument ?? {}) as Partial<TravelPayInstrument>;
    if (caminoDelViajeEnCurso(session, datos.camino) === 'puerta') {
      return this.cerrarPorLaPuerta(session, datos.host);
    }
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    const apiBase = this.apiBaseOf(session);
    const lines = this.toLines(session);
    let confirmation: TravelConfirmation;
    try {
      confirmation = await this.#api.confirm(apiBase, orderRef);
    } catch (error) {
      void error;
      return { confirmed: false, reason: 'locators-not-issued', vouchers: [] };
    }
    // Match confirmed items back to cart lines by their (product, offerId) pair so
    // heterogeneous lines of the same product still map to the right voucher.
    const itemByKey = new Map(
      session.items.map((item) => [`${item.kind}:${item.productRef}`, item.id]),
    );
    const lineByProduct = new Map(session.items.map((item) => [item.kind, item.id]));
    return {
      confirmed: confirmation.status.toLowerCase() === 'confirmed',
      vouchers: confirmation.items.map((entry, index) => {
        const byKey = itemByKey.get(`${entry.product}:${lines[index]?.offerId ?? ''}`);
        const itemId = byKey ?? lineByProduct.get(entry.product) ?? entry.product;
        return {
          itemId,
          reference: entry.reference,
          status: confirmation.status,
          detail: {
            title: entry.title,
            subtitle: entry.subtitle ?? '',
            product: entry.product,
            reservationId: entry.reservationId,
            confirmationCode: confirmation.confirmationCode,
          },
        };
      }),
    };
  }

  private async abrirPorLaPuerta(session: SessionData, host: Element | undefined): Promise<FulfillmentPayResult> {
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    if (session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const items = itemsDelViaje(session);
    // Sin periodo no se aparta: el servidor lo rechazaría con un código genérico, y el que falta es un dato
    // de la búsqueda que la pantalla puede nombrar.
    if (items.some((item) => !item.start || !item.end)) {
      return { accepted: false, reason: 'cliente.sin_periodo' };
    }
    // El camino y la llave quedan en las líneas ANTES de salir a la red: desde ahora el viaje puede existir, y
    // sólo del lado de la puerta.
    const llave = session.sessionId;
    this.anotar((item) => ({ ...conElCamino(item, 'puerta'), holdRef: llave }));
    const abierto = await abrirViaje(host, items, llave);
    if (!abierto.ok) {
      if (abrirNoDejoViaje(abierto.rechazo)) {
        this.anotar(sinLaRetenida);
      }
      return { accepted: false, reason: abierto.rechazo.code };
    }
    const viaje = abierto.valor;
    const sesion = this.#store.getValidSession();
    const total = viaje.total ? aMenores(viaje.total.amount, viaje.total.currency) : sesion.pricing.totalAmount;
    this.#store.setSession({
      ...sesion,
      // El plazo lo dice la AGENDA (el apartado que vence antes): el carrito lo cuenta con su reloj de siempre.
      items: sesion.items.map((item) => ({
        ...item,
        ...(viaje.vence ? { expiresAt: viaje.vence } : {}),
        selection: { ...item.selection, [CAMPO_DEL_VIAJE]: viaje.id },
      })),
      pricing: {
        ...sesion.pricing,
        currency: viaje.total?.currency ?? sesion.pricing.currency,
        totalAmount: total,
        balanceDue: total,
      },
    });
    return { accepted: true, reference: viaje.id };
  }

  private async cerrarPorLaPuerta(session: SessionData, host: Element | undefined): Promise<FulfillmentConfirmation> {
    if (!(host instanceof Element)) {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    const id = viajeDeLaSesion(session) ?? '';
    const cerrado = await cerrarViaje(host, id);
    let viaje: ViajeLeido | null = cerrado.ok ? cerrado.valor : null;
    if (!cerrado.ok) {
      if (cerrado.rechazo.transient) {
        return { confirmed: false, reason: cerrado.rechazo.code, vouchers: [] };
      }
      const leido = await consultarViaje(host, id);
      viaje = leido.ok && leido.valor.estado === 'Completed' ? leido.valor : null;
      if (!viaje) {
        if (leido.ok && leido.valor.estado === 'Compensated') {
          this.#store.setSession(sinViajePendiente(this.#store.getValidSession()));
        }
        return { confirmed: false, reason: cerrado.rechazo.code, vouchers: [] };
      }
    }
    return aLaConfirmacion(session, viaje!);
  }

  private anotar(cambio: (item: SessionItem) => SessionItem): void {
    const sesion = this.#store.getValidSession();
    this.#store.setSession({ ...sesion, items: sesion.items.map(cambio) });
  }

  private lineId(product: FulfillmentProduct): string {
    const selection = product.selection as Record<string, unknown>;
    const variant =
      readString(selection['fareId']) ||
      readString(selection['rateId']) ||
      readString(selection['seat']);
    return variant
      ? `${product.kind}:${product.productRef}:${variant}`
      : `${product.kind}:${product.productRef}`;
  }

  private apiBaseOf(session: SessionData): string {
    const first = session.items[0]?.selection as Record<string, unknown> | undefined;
    return readString(first?.['apiBase']);
  }

  private toProduct(offer: TravelOffer): FulfillmentProduct {
    return {
      productRef: offer.offerId,
      kind: offer.product,
      label: offer.title,
      amount: offer.amount,
      selection: { ...offer.detail, currency: offer.currency, subtitle: offer.subtitle },
      // `meta` es el ÚNICO camino de vuelta: la app reconstruye su `TravelOffer`
      // campo por campo desde acá (`runSearch`), así que lo que no viaje en esta
      // lista se pierde en silencio. Por eso están enumerados geo/fares/rating y
      // por eso hubo que añadir los del auto (#27).
      meta: {
        subtitle: offer.subtitle,
        badges: offer.badges,
        currency: offer.currency,
        geo: offer.geo,
        fareFamilies: offer.fareFamilies,
        stayId: offer.stayId,
        rating: offer.rating,
        carCategory: offer.carCategory,
        carTransmission: offer.carTransmission,
      },
    };
  }

  /**
   * Cada línea con la forma de `CartItemDto` del CMS: etiqueta, precio, moneda y su periodo, que la app
   * anotó en la selección al añadirla (defecto 1 de la línea 006).
   */
  private toLines(session: SessionData): readonly TravelCheckoutLine[] {
    return session.items.map((item) => {
      const selection = item.selection as Record<string, unknown>;
      return {
        product: item.kind as TravelProduct,
        offerId: item.productRef,
        label: item.label,
        price: readNumber(selection['price']),
        currency: readString(selection['currency']) || session.pricing.currency,
        start: readString(selection['start']),
        end: readString(selection['end']),
        detail: item.selection,
      };
    });
  }
}

/** Cada línea del carrito como ítem del viaje: el producto de la oferta, su nombre y su periodo. */
export function itemsDelViaje(session: SessionData): readonly ItemDelViaje[] {
  return session.items.map((item) => {
    const selection = item.selection as Record<string, unknown>;
    return {
      producto: item.productRef,
      etiqueta: item.label,
      start: readString(selection['start']),
      end: readString(selection['end']),
      // Sólo el hotel va por noche; el vuelo y el auto, por producto (006-H2).
      porNoche: item.kind === 'hotel',
    };
  });
}

/**
 * El comprobante de un viaje que el SERVIDOR confirmó: una credencial por línea con el número del viaje, que es lo
 * que la persona enseña. Por la puerta no viaja ningún identificador de las capacidades (el de cada reserva queda
 * en el orquestador), así que el localizador ES el número.
 */
function aLaConfirmacion(session: SessionData, viaje: ViajeLeido): FulfillmentConfirmation {
  return {
    confirmed: true,
    vouchers: session.items.map((item, indice) => {
      const selection = item.selection as Record<string, unknown>;
      // El ítem del itinerario va en el orden de las líneas: el servidor dice si se cumplió (historia 3).
      const parada = viaje.itinerario[indice];
      return {
        itemId: item.id,
        reference: viaje.numero,
        status: viaje.estado,
        detail: {
          title: item.label,
          subtitle: readString(selection['subtitle']),
          product: item.kind,
          reservationId: viaje.numero,
          confirmationCode: viaje.numero,
          ...(parada?.noCumplido ? { noCumplido: true, devuelto: parada.devuelto?.amount ?? 0 } : {}),
        },
      };
    }),
  };
}

/** Dónde queda, en cada línea, el id del viaje que abrió la puerta. */
export const CAMPO_DEL_VIAJE = 'viaje';

/** Dónde queda, en cada línea, el camino por el que salió el viaje. */
const CAMPO_DEL_CAMINO = 'camino';

function conElCamino(item: SessionItem, camino: CaminoDeLaReserva): SessionItem {
  return { ...item, selection: { ...item.selection, [CAMPO_DEL_CAMINO]: camino } };
}

/** El camino por el que SALIÓ el viaje de esta sesión, o `null` si todavía no salió. */
export function caminoDelViajePendiente(session: SessionData): CaminoDeLaReserva | null {
  const anotado = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DEL_CAMINO];
  return anotado === 'puerta' || anotado === 'directa' ? anotado : null;
}

/**
 * Un viaje que ya salió **se termina por el camino por el que salió**: su viaje u orden sólo existe de ese lado,
 * y cambiar de camino a mitad apartaría dos veces. Si todavía no salió, el que declara el CMS.
 */
export function caminoDelViajeEnCurso(session: SessionData, declarado: unknown): CaminoDeLaReserva {
  return caminoDelViajePendiente(session) ?? caminoDeLaReserva(declarado);
}

/** El id del viaje de esta sesión por la puerta: el que abrir contestó, o el del último pago vivo. */
export function viajeDeLaSesion(session: SessionData): string | null {
  const enLaLinea = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DEL_VIAJE];
  if (typeof enLaLinea === 'string' && enLaLinea !== '') return enLaLinea;
  const ultimo = session.payments[session.payments.length - 1];
  return caminoDelViajePendiente(session) === 'puerta' && ultimo && ultimo.status !== 'failed' ? (ultimo.reference ?? null) : null;
}

/**
 * El viaje PENDIENTE de esta sesión: abierto por la puerta y sin confirmar. Es el único que la pantalla ofrece
 * cancelar: lo confirmado lo gestiona quien vende (006-P3).
 */
export function viajePendiente(session: SessionData): string | null {
  return session.status !== 'confirmed' && caminoDelViajePendiente(session) === 'puerta' ? viajeDeLaSesion(session) : null;
}

/** La línea sin lo que la ataba a su viaje: la llave retenida, el plazo del apartado, el id y el camino. */
function sinLaRetenida(item: SessionItem): SessionItem {
  const { holdRef: _suelta, expiresAt: _vence, ...linea } = item;
  const { [CAMPO_DEL_VIAJE]: _viaje, [CAMPO_DEL_CAMINO]: _camino, ...seleccion } = linea.selection as Record<string, unknown>;
  return { ...linea, selection: seleccion };
}

/**
 * La sesión sin el viaje pendiente: lo que el servidor deshizo ya no está apartado ni autorizado. El último pago
 * queda `failed` y las líneas dejan de estar retenidas, así que el siguiente clic vuelve a abrir.
 */
export function sinViajePendiente(session: SessionData): SessionData {
  const ultimo = session.payments.length - 1;
  return {
    ...session,
    items: session.items.map(sinLaRetenida),
    payments: session.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
