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
  type Pricing,
  type SessionData,
  type SessionItem,
} from '@synergos/transaction-engine';
import type { BffTienda } from '@synergos/contracts';
import { ShopApiClient } from './shop-api.client';
import {
  STOREFRONT_FLOW,
  STOREFRONT_KIND,
  caminoDeLaCompra,
  type CaminoDeCompra,
  type CheckoutLine,
  type CheckoutResult,
  type OrdenDeLaPuerta,
  type OrderConfirmation,
  type SearchCriteria,
  type ShopCustomer,
  type ShopProduct,
} from './shop.model';
import {
  abrirCompraDeTienda,
  cerrarCompraDeTienda,
  consultarCompraDeTienda,
  cuerpoDeLaCompra,
  type CompraDeTienda,
} from './tienda-compra';
import { aMenores, clasificarRechazo, type RechazoDelFlujo } from '@synergos/vitals-core';

/** Criteria the storefront hands the strategy on `search`. */
interface ShopSearchCriteria {
  readonly apiBase: string;
  readonly criteria: SearchCriteria;
}

/** What the storefront hands the strategy as a `select` candidate. */
export interface ShopSelectionPayload {
  readonly productId: string;
  readonly variantId: string;
  readonly variantLabel: string;
  readonly title: string;
  /** Unit price in major units. */
  readonly unitAmount: number;
  readonly currency: string;
  readonly quantity: number;
  readonly image: string;
  /** Marketplace seller — the cart groups lines per seller. */
  readonly seller?: string;
  /**
   * La base del borde con la que se seleccionó. **Viaja en la línea porque `confirm`
   * no recibe instrumento** y tenía `/api/shop` cableada a mano: un elemento montado
   * contra otra base compraba en la suya y confirmaba en la de por defecto —y el
   * `catch` del cliente fabricaba el acuse, así que no fallaba a la vista— (CMS#116).
   */
  readonly apiBase?: string;
}

/**
 * Lo que el asistente SH-3 le pasa a la estrategia en `pay` Y en `confirm` (ADR 0140 F4).
 *
 * `host` es el `<synergos-storefront>` de ESTA compra: desde él se encuentra, por ancestro, su
 * `<synergos-flujo>`. Viaja por llamada porque hay UNA estrategia por página y un campo suyo cruzaría dos
 * instancias.
 */
interface ShopPayInstrument {
  readonly apiBase: string;
  readonly customer: ShopCustomer;
  readonly host: Element;
  /**
   * Por dónde compra, como lo DECLARA el CMS (`purchasePath`). Sin él, la ruta directa: la de siempre de
   * la tienda. Una compra que ya salió no lo mira: se termina por donde salió (`caminoDeLaCompraEnCurso`).
   */
  readonly camino: CaminoDeCompra;
  /** La dirección de «cerrar» por la puerta, con el país del despliegue. */
  readonly direccion: BffTienda.TiendaCompraCerrarEntrada['direccion'];
}

/**
 * The Tienda vertical's concrete <c>IFulfillmentStrategy</c> for the `storefront`
 * flow — the **only place** product-specific transactional behaviour lives. The
 * storefront calls the engine's <c>FulfillmentContext</c> and never knows this
 * class answered; the provider routes by `flow === 'storefront'`.
 *
 * **La compra va por el camino que DECLARA el CMS** (`instrument.camino`, ADR 0140; ninguno se retira).
 * Por la **directa** —sin declaración, lo de siempre—: `pay` abre la orden en `/api/shop/checkout` y
 * `confirm` la coloca en `/api/shop/confirm`; si el borde no lo hizo, contestan que no (UI#92). Por la
 * **puerta**: `pay` ABRE `tienda.compra` —revisa, cotiza, aparta, crea el pedido y autoriza el total del
 * SERVIDOR— y la anota en el registro del CMS; `confirm` la CIERRA con la dirección —captura, despacha,
 * cumple y avisa— y lee su orden. Abrir y cerrar se le piden al `<synergos-flujo>` ancestro del elemento,
 * con las funciones GENERADAS del flujo. Nunca se cae de un camino al otro —ni ante un 503 de la puerta—:
 * dos caminos para la misma intención abren dos órdenes.
 *
 * **Y una compra que ya salió se termina por el camino por el que salió**: `pay` lo anota en las líneas
 * antes de salir a la red, y su saga o su orden sólo existen de ese lado.
 */
@Injectable()
export class ShopFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = STOREFRONT_FLOW;
  protected readonly flow = STOREFRONT_FLOW;

  readonly #api = inject(ShopApiClient);
  readonly #store = inject(SessionStore);

  /** Step 1 — faceted catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<ShopSearchCriteria>;
    const apiBase = criteria.apiBase ?? '';
    const searchCriteria: SearchCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      facets: {},
      sort: 'relevance',
      page: 1,
    };
    const result = await this.#api.search(apiBase, searchCriteria, query.currency ?? '');
    // The storefront needs the facets too; carry them on the first product's meta is
    // wrong — instead we expose facets via a sentinel product. Keep it simple: the
    // shell reads facets from the client directly. Here we only map products.
    return result.products.map((product) => this.toProduct(product));
  }

  /**
   * Step 2 — turn a chosen product+variant into a single cart line carrying the
   * **delta** quantity to add. The shell merges this against the live store line at
   * apply time (so concurrent quick-adds accumulate deterministically), keeping the
   * engine's `addItem` idempotent-by-id contract intact.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const payload = product.selection as unknown as ShopSelectionPayload;
    const quantity = Math.max(1, Math.trunc(payload.quantity || 1));
    const item: SessionItem = {
      // Deterministic id per product+variant → re-selecting targets the same line.
      id: this.lineId(payload),
      kind: STOREFRONT_KIND,
      productRef: payload.productId,
      label: payload.title,
      selection: {
        productId: payload.productId,
        variantId: payload.variantId,
        variantLabel: payload.variantLabel,
        currency: payload.currency,
        image: payload.image,
        seller: payload.seller ?? '',
        unitAmount: aMenores(payload.unitAmount, payload.currency),
        apiBase: payload.apiBase ?? '',
      },
      // Engine pricing is in minor units; payload carries major units.
      amount: aMenores(payload.unitAmount, payload.currency),
      quantity,
    };
    return { item };
  }

  /**
   * Step 3 — por la puerta, ABRIR la compra y anotarla en el registro del CMS.
   *
   * La llave de idempotencia es la de la INTENCIÓN (`llaveDeLaIntencion`): la de la sesión, y otra con
   * cupón —una saga abierta sin el código devolvería su total sin descuento—. **Una vez enviado abrir, la
   * llave queda RETENIDA en las líneas** hasta saber que su saga no puede cobrar: cada reintento abre con
   * ESA llave (otra llave es otra saga, que aparta y autoriza otra vez), y el elemento no deja cambiar el
   * carrito ni el cupón mientras tanto. El total que se cobra es el del servidor, y la sesión pasa a
   * decirlo. Devuelve como referencia el id de la saga.
   *
   * Antes de abrir se pregunta al servidor por las compras de la puerta del miembro sin resolver: las que
   * esta sesión no ve (otro dispositivo, los datos del sitio borrados). Con alguna que no sea la de esta
   * sesión no se abre (`tienda.compra_sin_resolver`) y el elemento las pinta. Sin respuesta, se degrada
   * por AUSENCIA: se abre como siempre.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<ShopPayInstrument>;
    if (caminoDeLaCompraEnCurso(request.session, instrument.camino) === 'directa') {
      return this.pagarPorLaRutaDirecta(request, instrument);
    }
    const host = instrument.host;
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const apiBase = instrument.apiBase ?? apiBaseOf(request.session);
    // El cupón sale de la SESIÓN: lo dejó la vista previa en su pricing. Sólo viaja el CÓDIGO; el
    // descuento lo vuelve a calcular Pricing al abrir.
    const codigo = cuponDeLaSesion(request.session.pricing)?.codigo ?? null;
    if (await this.hayComprasSinResolver(apiBase, request.session)) {
      return { accepted: false, reason: CODIGO_COMPRA_SIN_RESOLVER };
    }
    const llave = llaveRetenida(request.session) ?? llaveDeLaIntencion(request.session.sessionId, codigo);
    this.retener(llave);
    const abierta = await abrirCompraDeTienda(host, cuerpoDeLaCompra(request.session, codigo), llave);
    if (!abierta.ok) {
      if (abrirNoDejoSaga(abierta.rechazo)) {
        this.soltar();
      }
      return { accepted: false, reason: abierta.rechazo.code };
    }
    const compra = abierta.valor;
    if (compra.total === null) {
      // La saga existe y el servidor no dijo cuánto: no se cobra un total inventado. La llave queda
      // retenida y el reintento la recupera.
      return { accepted: false, reason: 'cliente.respuesta_ilegible' };
    }
    const total = aMenores(compra.total.amount, compra.total.currency);
    const sesion = this.#store.getValidSession();
    // Lo que la sesión dice tras abrir es lo que se ABRIÓ: el total del servidor y, del cupón, sólo la
    // línea del código que viajó.
    const lineaDelCupon = codigo ? sesion.pricing.breakdown.filter((linea) => linea.code.startsWith(PREFIJO_DEL_CUPON)) : [];
    this.#store.setSession({
      ...sesion,
      items: sesion.items.map((item) => ({ ...item, selection: { ...item.selection, [CAMPO_DE_LA_COMPRA]: compra.id } })),
      pricing: {
        ...sesion.pricing,
        currency: compra.total.currency,
        totalAmount: total,
        balanceDue: total,
        breakdown: [...sesion.pricing.breakdown.filter((linea) => !linea.code.startsWith(PREFIJO_DEL_CUPON)), ...lineaDelCupon],
      },
    });

    if (compra.estado !== 'Completed') {
      // Para «Mis compras»: la compra en curso queda como orden pendiente del miembro. Si no llega, la
      // orden se anota pagada al leerla tras cerrar; no se frena la compra por esto.
      await this.#api.anotarCompra(apiBase, compra.id);
    }
    return { accepted: true, reference: compra.id };
  }

  /**
   * Step 4 — por la puerta, CERRAR la compra con la dirección y leer su orden.
   *
   * Si cerrar falla y es transitorio, el pago se queda como está y el reintento repite sólo cerrar, que es
   * idempotente. **Si NO es transitorio, se pregunta a la saga antes de decidir** (`consultar`): un 502 de
   * la puerta o un cuerpo cortado pueden llegar con la captura HECHA.
   *  - `Completed`: cerrar sí cobró; se sigue a la orden como si hubiera contestado bien.
   *  - `Compensated`: la saga se deshizo y el pago se marca `failed`, así que el reintento vuelve a `pay`
   *    con la MISMA llave. Si lo que falló fue el despacho —después de capturar—, lo cobrado se devolvió
   *    (`tienda.cobro_devuelto`); si no, no se cobró nada.
   *  - cualquier otro: no se afirma nada (`tienda.compra_sin_saber`); el pago se queda con su referencia.
   */
  override async confirm(
    session: SessionData,
    instrument?: Readonly<Record<string, unknown>>,
  ): Promise<FulfillmentConfirmation> {
    const datos = (instrument ?? {}) as Partial<ShopPayInstrument>;
    if (caminoDeLaCompraEnCurso(session, datos.camino) === 'directa') {
      return this.confirmarPorLaRutaDirecta(session);
    }
    const host = datos.host;
    const id = session.payments[session.payments.length - 1]?.reference ?? '';
    if (!(host instanceof Element)) {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    if (!datos.direccion) {
      return { confirmed: false, reason: CODIGO_SIN_DIRECCION, vouchers: [] };
    }

    const cerrada = await cerrarCompraDeTienda(host, id, datos.direccion);
    let compra: CompraDeTienda | null = cerrada.ok ? cerrada.valor : null;
    if (!cerrada.ok) {
      const leida = cerrada.rechazo.transient || esDeSesion(cerrada.rechazo) ? null : await this.compraLeida(host, id);
      if (leida?.estado !== 'Completed') {
        if (leida?.estado === 'Compensated') {
          this.marcarElPagoFallido();
          return {
            confirmed: false,
            reason: cerrada.rechazo.code.startsWith(PREFIJO_DEL_DESPACHO) ? CODIGO_COBRO_DEVUELTO : cerrada.rechazo.code,
            vouchers: [],
          };
        }
        return { confirmed: false, reason: leida ? CODIGO_SIN_SABER : cerrada.rechazo.code, vouchers: [] };
      }
      compra = leida;
    }

    // Leer la orden es lo que la pasa a pagada en el CMS («Mis compras», seguimiento, ventas). Sin ella la
    // compra igual quedó cobrada y despachada: se confirma con lo que dijo el orquestador.
    const orden = await this.#api.compraDeLaPuerta(datos.apiBase ?? apiBaseOf(session), id);
    return aLaConfirmacion(compra, orden.ok ? orden.valor : null, session);
  }

  /**
   * Step 3 por la ruta DIRECTA — one PSP checkout for the whole cart.
   *
   * Si el borde no abrió la orden, NO se acepta (UI#92): el cliente fabricaba un `MOCK-<ts>` con su
   * `psp_mock_…` y esto lo daba por bueno. Nada se cobró: el asistente dice su `payFailedMessage` y
   * volver a pulsar abre la orden otra vez. Las líneas dicen por dónde salió la compra, antes de salir.
   */
  private async pagarPorLaRutaDirecta(
    request: FulfillmentPayRequest,
    instrument: Partial<ShopPayInstrument>,
  ): Promise<FulfillmentPayResult> {
    const apiBase = instrument.apiBase ?? '';
    const customer: ShopCustomer = instrument.customer ?? { name: '', email: '' };
    const lines = this.toLines(request.session);
    const currency = request.session.pricing.currency;
    const sesion = this.#store.getValidSession();
    this.#store.setSession({ ...sesion, items: sesion.items.map((item) => conElCamino(item, 'directa')) });

    let checkout: CheckoutResult;
    try {
      checkout = await this.#api.checkout(apiBase, lines, customer, currency);
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
   * Step 4 por la ruta DIRECTA — confirm the order, returning a voucher per cart line.
   *
   * **Si el borde no colocó el pedido, esto NO confirma** (UI#92). El cobro ya quedó en la
   * sesión, así que el asistente lo nombra en su `confirmFailedMessage` y volver a pulsar
   * repite SÓLO esta confirmación sobre la misma orden — sin otro cobro (CMS#117).
   */
  private async confirmarPorLaRutaDirecta(session: SessionData): Promise<FulfillmentConfirmation> {
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    let confirmation: OrderConfirmation;
    try {
      confirmation = await this.#api.confirm(apiBaseOf(session), orderRef);
    } catch (error) {
      void error;
      return { confirmed: false, reason: 'order-not-placed', vouchers: [] };
    }
    const itemByProduct = new Map(session.items.map((item) => [item.productRef, item.id]));
    // El borde contesta `Paid` cuando capturó (`ShopConfirmationResult.Status`, CMS) — el
    // estado del PEDIDO, cuyo enum es `Pending | Paid | Cancelled` (regla 10). Esto sólo
    // aceptaba `confirmed`, que es lo que fabricaba el `catch`: contra un borde vivo, un
    // pedido colocado salía como «no pudimos confirmarlo». Lo destapó el caso feliz contra
    // la forma de verdad (UI#92, regla 16); con la red caída nunca se veía.
    const status = confirmation.status.toLowerCase();
    return {
      confirmed: status === 'paid' || status === 'confirmed',
      vouchers: confirmation.items.map((entry) => ({
        itemId: itemByProduct.get(entry.productId) ?? entry.productId,
        reference: entry.reference,
        status: confirmation.status,
        detail: { title: entry.title, qty: entry.qty, orderNumber: confirmation.orderNumber },
      })),
    };
  }

  /**
   * ¿El miembro tiene compras de la puerta sin resolver que el servidor conoce y esta sesión no? La de
   * esta sesión (su saga, o la que la misma llave reabrió) no frena. Si no se puede contestar, se degrada
   * por AUSENCIA: no se sabe de ninguna, y se abre como siempre.
   */
  private async hayComprasSinResolver(apiBase: string, session: SessionData): Promise<boolean> {
    const pendientes = await this.#api.comprasPendientes(apiBase);
    const propia = raizDeLaSaga(compraDeLaSesion(session));
    return pendientes.ok && pendientes.valor.some((c) => raizDeLaSaga(c.id) !== propia);
  }

  /** La saga según el orquestador, o `null` si no se pudo leer. */
  private async compraLeida(host: Element, id: string): Promise<CompraDeTienda | null> {
    const leida = await consultarCompraDeTienda(host, id);
    return leida.ok ? leida.valor : null;
  }

  /** El último pago de la sesión, `failed`, y la llave SUELTA: una saga deshecha no cobra. */
  private marcarElPagoFallido(): void {
    this.#store.setSession(sinCompraPendiente(this.#store.getValidSession()));
  }

  /**
   * Las líneas quedan apartadas bajo `llave` y anotadas por la puerta: su saga puede estar viva desde que
   * abrir salió. Y la sesión vence con el plazo de una compra pendiente: con los 30 min de la sesión, la
   * compra se olvidaba antes que el barrido de abandono del orquestador.
   */
  private retener(llave: string): void {
    const sesion = this.#store.getValidSession();
    const vence = Math.max(sesion.expiresAt, Date.now() + PLAZO_DE_UNA_COMPRA_PENDIENTE_MS);
    this.#store.setSession({
      ...sesion,
      expiresAt: vence,
      items: sesion.items.map((item) => ({ ...conElCamino(item, 'puerta'), holdRef: llave })),
    });
  }

  /** Ninguna saga de esta intención puede cobrar: las líneas dejan de estar retenidas. */
  private soltar(): void {
    const sesion = this.#store.getValidSession();
    if (!sesion.items.some((item) => item.holdRef !== undefined)) {
      return;
    }
    this.#store.setSession({ ...sesion, items: sesion.items.map(sinLaRetenida) });
  }

  private lineId(payload: ShopSelectionPayload): string {
    return `${STOREFRONT_KIND}:${payload.productId}:${payload.variantId}`;
  }

  private toProduct(product: ShopProduct): FulfillmentProduct {
    return {
      productRef: product.id,
      kind: STOREFRONT_KIND,
      label: product.title,
      amount: product.amount,
      selection: { ...product },
      meta: {
        subtitle: product.subtitle,
        badges: product.badges,
        currency: product.currency,
        rating: product.rating,
      },
    };
  }

  private toLines(session: SessionData): readonly CheckoutLine[] {
    return session.items.map((item) => {
      const selection = item.selection as Record<string, unknown>;
      return {
        productId: item.productRef,
        variantId: typeof selection['variantId'] === 'string' ? selection['variantId'] : '',
        qty: item.quantity,
      };
    });
  }
}

// ─── La compra por la puerta: lo que vive en la SESIÓN (004-tienda-compra) ─────────────────────
//
// Copia adaptada de lo que endureció Eventos (ADR 0140 F4 y el cupón endurecido): un elemento publicado no
// se importa de otro, y estas reglas viven con su estrategia. Cambia el camino por defecto —la tienda compra
// por la ruta directa si el CMS no declara otra cosa— y no hay asistentes ni entradas.

/**
 * El prefijo de la línea del cupón en `pricing.breakdown`: `promo:<CÓDIGO>`, con el descuento en NEGATIVO.
 * Es el mismo que escribía el cupón de la ruta directa (`reprice`), así que la sesión lo dice igual por
 * los dos caminos; por la puerta lo escribe la vista previa con lo que contestó `cotizar`.
 */
export const PREFIJO_DEL_CUPON = 'promo:';

/** El cupón aplicado a la compra, si lo hay: su código y lo que descontó el servidor, en unidades menores. */
export interface CuponDeLaCompra {
  readonly codigo: string;
  readonly descuentoMinor: number;
}

export function cuponDeLaSesion(pricing: Pricing): CuponDeLaCompra | null {
  const linea = pricing.breakdown.find((l) => l.code.startsWith(PREFIJO_DEL_CUPON));
  const codigo = linea ? linea.code.slice(PREFIJO_DEL_CUPON.length).trim() : '';
  return linea && codigo ? { codigo, descuentoMinor: Math.abs(linea.amount) } : null;
}

/**
 * La llave de la intención: la de la sesión sin cupón, y otra —la misma para el mismo código— con él. La
 * huella es FNV-1a de 32 bits sobre el código en mayúsculas: no es un secreto, sólo separa dos códigos de
 * la MISMA sesión.
 */
export function llaveDeLaIntencion(sessionId: string, codigo: string | null): string {
  if (!codigo) {
    return sessionId;
  }
  let huella = 0x811c9dc5;
  for (const caracter of codigo.trim().toUpperCase()) {
    huella ^= caracter.codePointAt(0) ?? 0;
    huella = Math.imul(huella, 0x01000193) >>> 0;
  }
  return `${sessionId}~${huella.toString(16).padStart(8, '0')}`;
}

/** El tope de códigos que no sirven del orquestador (`IntentosDeCodigo` de `Bff.Tienda`). */
export const CODIGO_DEMASIADOS_CODIGOS = 'tienda.demasiados_codigos';

/** `pay` NO abre: el servidor sabe de otra compra de la puerta del miembro sin resolver. Lo pone la estrategia. */
export const CODIGO_COMPRA_SIN_RESOLVER = 'tienda.compra_sin_resolver';

/** `confirm` no confirma: el despacho falló DESPUÉS de capturar y lo cobrado se devolvió. Lo pone la estrategia. */
export const CODIGO_COBRO_DEVUELTO = 'tienda.cobro_devuelto';

/** `confirm` no sabe en qué quedó la compra: ni completa ni deshecha. Lo pone la estrategia. */
export const CODIGO_SIN_SABER = 'tienda.compra_sin_saber';

/** `confirm` sin la dirección que «cerrar» exige. Lo pone la estrategia. */
export const CODIGO_SIN_DIRECCION = 'tienda.sin_direccion';

/** Los rechazos del paso que despacha: después de capturar, así que lo que se deshace es una devolución. */
const PREFIJO_DEL_DESPACHO = 'fulfillment.';

/** La llave con la que se envió abrir y cuya saga todavía puede cobrar, o `null`. Vive en las LÍNEAS. */
export function llaveRetenida(session: SessionData): string | null {
  return session.items.find((item) => typeof item.holdRef === 'string' && item.holdRef !== '')?.holdRef ?? null;
}

/** Cuánto vive una sesión con una compra pendiente: más que el barrido de abandono del orquestador. */
export const PLAZO_DE_UNA_COMPRA_PENDIENTE_MS = 24 * 60 * 60 * 1000;

/** Una compra de la sesión que pudo cobrar y no se confirmó: su llave y, si abrir contestó, su id. */
export interface CompraPendiente {
  readonly llave: string | null;
  /** El id de su saga o de su orden (el del último pago anotado); `null` si abrir no contestó. */
  readonly referencia: string | null;
}

/**
 * La compra pendiente de la sesión, o `null`: la que salió a abrir (llave retenida) o la que tiene un pago
 * anotado, mientras la sesión no esté confirmada. Mientras la haya, el elemento no deja cambiar el carrito
 * ni el cupón: lo que se abrió es lo que se cierra.
 */
export function compraPendiente(session: SessionData): CompraPendiente | null {
  if (session.status === 'confirmed') {
    return null;
  }
  const llave = llaveRetenida(session);
  const ultimo = session.payments[session.payments.length - 1];
  const referencia = ultimo?.status === 'captured' && ultimo.reference ? ultimo.reference : null;
  if (llave === null && referencia === null) {
    return null;
  }
  return { llave, referencia };
}

/** Dónde guarda la línea el id de la saga que abrió: se escribe en cuanto abrir contesta. */
const CAMPO_DE_LA_COMPRA = 'compra';

/** Dónde guarda la línea el camino por el que salió su compra: lo escribe `pay` antes de salir a la red. */
const CAMPO_DEL_CAMINO = 'camino';

/** La línea con el camino por el que sale su compra. */
function conElCamino(item: SessionItem, camino: CaminoDeCompra): SessionItem {
  return { ...item, selection: { ...item.selection, [CAMPO_DEL_CAMINO]: camino } };
}

/**
 * El camino por el que salió la compra pendiente de la sesión, o `null` sin ella. Una llave retenida sin el
 * camino anotado es de la puerta: la directa no retiene llave.
 */
export function caminoDeLaPendiente(session: SessionData): CaminoDeCompra | null {
  if (compraPendiente(session) === null) {
    return null;
  }
  const anotado = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DEL_CAMINO];
  if (anotado === 'puerta' || anotado === 'directa') {
    return anotado;
  }
  return llaveRetenida(session) !== null ? 'puerta' : null;
}

/**
 * Por dónde va ESTA compra: la que ya salió, por el camino por el que salió —su saga o su orden sólo
 * existen de ese lado—; sin ninguna en curso, por el que declara el CMS.
 */
export function caminoDeLaCompraEnCurso(session: SessionData, declarado: unknown): CaminoDeCompra {
  return caminoDeLaPendiente(session) ?? caminoDeLaCompra(declarado);
}

/** El id de la saga de esta sesión: el que abrir contestó, o el del último pago anotado; `null` si nadie lo tiene. */
export function compraDeLaSesion(session: SessionData): string | null {
  const enLaLinea = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DE_LA_COMPRA];
  const ultimo = session.payments[session.payments.length - 1];
  if (typeof enLaLinea === 'string' && enLaLinea) return enLaLinea;
  return ultimo && ultimo.status !== 'failed' ? (ultimo.reference ?? null) : null;
}

/** La saga y las que la misma llave reabrió tras deshacerse (`<id>#2`…) son la MISMA intención. */
const raizDeLaSaga = (id: string | null): string | null => id?.split('#')[0] ?? null;

/** La línea sin lo que la ataba a su saga: la llave retenida, el id y el camino por el que salió. */
function sinLaRetenida(item: SessionItem): SessionItem {
  const { holdRef: _suelta, ...linea } = item;
  const { [CAMPO_DE_LA_COMPRA]: _compra, [CAMPO_DEL_CAMINO]: _camino, ...seleccion } = linea.selection as Record<string, unknown>;
  return { ...linea, selection: seleccion };
}

/**
 * La sesión SIN su compra pendiente: las líneas sin la llave retenida y el último pago `failed`. Para cuando
 * su saga ya no puede cobrar —se deshizo, se canceló—.
 */
export function sinCompraPendiente(session: SessionData): SessionData {
  const ultimo = session.payments.length - 1;
  return {
    ...session,
    items: session.items.map(sinLaRetenida),
    payments: session.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
  };
}

const esDeSesion = (r: RechazoDelFlujo): boolean => clasificarRechazo(r) === 'sesion';

/**
 * ¿Un «no» de abrir garantiza que no quedó ninguna saga que cobrar con esa llave? Sí cuando lo dijo el
 * negocio —el orquestador rechaza antes de apartar o deshace lo apartado—, cuando la puerta ni lo reenvió, y
 * con el tope de códigos (corta antes de cotizar). Lo transitorio y lo ilegible pueden llegar con la saga
 * ABIERTA: la llave se queda retenida y el reintento la recupera.
 */
export function abrirNoDejoSaga(rechazo: RechazoDelFlujo): boolean {
  if (rechazo.code === CODIGO_DEMASIADOS_CODIGOS) {
    return true;
  }
  const clase = clasificarRechazo(rechazo);
  return clase === 'negado' || clase === 'sesion' || clase === 'no_disponible';
}

/**
 * La compra completa como la lee el asistente: confirmada, y un voucher por línea —con su nombre si el CMS
 * ya registró la orden; si no, con el de la línea del carrito—. El número es el de la orden (el del aviso).
 */
function aLaConfirmacion(compra: CompraDeTienda | null, orden: OrdenDeLaPuerta | null, session: SessionData): FulfillmentConfirmation {
  const numero = orden?.orderNumber ?? compra?.numero ?? '';
  const porProducto = new Map(session.items.map((item) => [item.productRef, item]));
  const lineas = orden
    ? orden.items.map((l) => ({ productId: l.productId, title: l.title, qty: l.qty }))
    : (compra?.lineas ?? []).map((l) => ({
        productId: l.productoId,
        title: porProducto.get(l.productoId)?.label ?? l.productoId,
        qty: l.cantidad,
      }));
  // El estado es el que dijo el servidor: el de la orden del CMS, o el de la saga si la orden no se leyó.
  const estado = orden?.status ?? compra?.estado ?? '';
  return {
    confirmed: true,
    vouchers: lineas.map((l) => ({
      itemId: porProducto.get(l.productId)?.id ?? l.productId,
      reference: numero,
      status: estado,
      detail: { title: l.title, qty: l.qty, orderNumber: numero },
    })),
  };
}

/** Ver `ShopSelectionPayload.apiBase`: sale de la LÍNEA, que sobrevive a una recarga. */
function apiBaseOf(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const base = selection?.['apiBase'];
  return typeof base === 'string' && base.trim() ? base.trim() : '';
}
