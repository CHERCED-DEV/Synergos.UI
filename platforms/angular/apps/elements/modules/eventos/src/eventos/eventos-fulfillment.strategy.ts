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
  type SessionParty,
} from '@synergos/transaction-engine';
import type { BffEventos } from '@synergos/contracts';
import { EventosApiClient } from './eventos-api.client';
import {
  EVENTOS_FLOW,
  EVENTOS_KIND,
  type Attendee,
  type CatalogCriteria,
  type EventSummary,
  type TierSelectionPayload,
} from './eventos.model';
import {
  aMenores,
  abrirCompraDeEventos,
  cerrarCompraDeEventos,
  clasificarRechazo,
  consultarCompraDeEventos,
  type CompraLeida,
  type RechazoDelFlujo,
} from '@synergos/vitals-core';

/** Criteria the shell hands the strategy on `search`. */
interface EventosSearchCriteria {
  readonly apiBase: string;
  readonly criteria: CatalogCriteria;
}

/**
 * Lo que el asistente SH-3 le pasa a la estrategia en `pay` Y en `confirm` (ADR 0140 F4).
 *
 * `host` es el `<synergos-eventos>` de ESTA compra: desde él se encuentra, por ancestro, su
 * `<synergos-flujo>`. Viaja por llamada porque hay UNA estrategia por página (la app se crea una
 * vez por etiqueta) y un campo suyo cruzaría dos instancias (regla 60).
 */
interface EventosPayInstrument {
  readonly host: Element;
  readonly apiBase: string;
  readonly attendees: readonly Attendee[];
  /** El evento de la compra, para la billetera ("mis tickets"). */
  readonly eventId?: string;
  readonly eventTitle?: string;
  readonly venueName?: string;
  readonly startsAt?: string;
  /** Las compras con un cobro por devolver que el elemento ya le dijo a la persona: no frenan otra vez. */
  readonly comprasAvisadas?: readonly string[];
}

/**
 * The Eventos vertical's concrete <c>IFulfillmentStrategy</c> for the `eventos`
 * flow — the **only place** ticketing-specific transactional behaviour lives. The
 * shell calls the engine's <c>FulfillmentContext</c> and never knows this class
 * answered; the provider routes by `flow === 'eventos'`.
 *
 * **La compra va por la puerta** (ADR 0140 F4): `pay` la ABRE —aparta y autoriza— y anota los
 * asistentes; `confirm` la CIERRA —captura— y pide las entradas. Abrir y cerrar no salen de acá:
 * se le piden al `<synergos-flujo>` ancestro del elemento, que las lleva a la puerta con el
 * cliente generado. Sin coordinador la compra contesta que no, con `cliente.sin_coordinador`, y
 * **nunca vuelve a la ruta vieja** (`/api/eventos/checkout|confirm`): dos caminos para la misma
 * intención abren dos órdenes, y el retiro exige cero usos. Los rechazos vuelven como su `code`.
 */
@Injectable()
export class EventosFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = EVENTOS_FLOW;
  protected readonly flow = EVENTOS_FLOW;

  readonly #api = inject(EventosApiClient);
  readonly #store = inject(SessionStore);

  /** Step 1 — catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<EventosSearchCriteria>;
    const apiBase = criteria.apiBase ?? '';
    const catalogCriteria: CatalogCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      city: '',
      sort: 'relevance',
    };
    const result = await this.#api.events(apiBase, catalogCriteria, query.currency ?? '');
    return result.events.map((event) => this.toProduct(event));
  }

  /**
   * Step 2 — turn a chosen tier (+ optional seats) into a cart line. The line id
   * is deterministic per event+tier so re-selecting the same tier replaces (never
   * duplicates) the line — the engine's `addItem` idempotent-by-id contract. For
   * reserved seating, the seat ids ride in the selection payload and the quantity
   * tracks the number of seats.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const payload = product.selection as unknown as TierSelectionPayload;
    const quantity = Math.max(1, payload.seats.length || payload.quantity);
    const item: SessionItem = {
      id: this.lineId(payload),
      kind: EVENTOS_KIND,
      productRef: payload.eventId,
      label: `${payload.eventTitle} · ${payload.tierName}`,
      selection: {
        eventId: payload.eventId,
        eventTitle: payload.eventTitle,
        tierId: payload.tierId,
        tierName: payload.tierName,
        currency: payload.currency,
        cover: payload.cover,
        seats: [...payload.seats],
        // Engine pricing is in minor units; payload carries major units.
        unitAmount: aMenores(payload.amount, payload.currency),
        apiBase: payload.apiBase ?? '',
      },
      amount: aMenores(payload.amount, payload.currency),
      quantity,
    };
    return { item };
  }

  /**
   * Step 3 — ABRIR la compra por la puerta y anotar sus asistentes.
   *
   * La llave de idempotencia es la de la INTENCIÓN: `SessionData.sessionId`, nueva en cada
   * selección —salvo con una compra pendiente, que el elemento resuelve ANTES de reemplazar la sesión
   * (`compraPendiente`)— y persistida, así que sobrevive a la recarga y al login. Con la misma llave y una
   * saga en curso el orquestador devuelve esa saga; con una deshecha, la reabre. El total que se
   * cobra es el del servidor —con su comisión y el descuento del cupón—, y la sesión pasa a decirlo:
   * es el que el asistente anota y compara después. Devuelve como referencia el id de la saga.
   *
   * Con cupón la intención es OTRA (`llaveDeLaIntencion`): con la misma llave, una saga abierta antes
   * sin el código devolvería su total sin descuento, y se cobraría lo que la pantalla ya no dice.
   *
   * **Y una vez enviado abrir, la llave queda RETENIDA en las líneas** (`holdRef`, lo que las aparta)
   * hasta saber que su saga no puede cobrar —un «no» que no deja saga, o la saga deshecha—. Mientras
   * tanto el elemento fija el cupón y cada reintento abre con ESA llave: otra llave es otra saga, que
   * aparta y autoriza otra vez y que cerrar capturaría (el doble cobro de la revisión del cupón). Y
   * mientras está retenida la sesión no vence a los 30 min: tiene el plazo de una compra pendiente.
   *
   * Antes de abrir con una llave NUEVA se pregunta al servidor por las compras sin acuse del miembro
   * para el evento (fase D): las que esta sesión no ve —otro dispositivo, los datos del sitio borrados,
   * más allá del plazo—. Con alguna no se abre: `eventos.compra_sin_acuse`, y el elemento las pinta.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<EventosPayInstrument>;
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const host = instrument.host;
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    // El cupón sale de la SESIÓN (regla 20): lo dejó la vista previa en su pricing, y sobrevive a la
    // recarga y al login. Sólo viaja el CÓDIGO; el descuento lo vuelve a calcular Pricing al abrir.
    const codigo = cuponDeLaSesion(request.session.pricing)?.codigo ?? null;
    const retenida = llaveRetenida(request.session);
    if (retenida === null && (await this.hayComprasSinAcuse(instrument.apiBase ?? apiBaseOf(request.session), request.session, instrument.comprasAvisadas ?? []))) {
      return { accepted: false, reason: CODIGO_COMPRA_SIN_ACUSE };
    }
    const llave = retenida ?? llaveDeLaIntencion(request.session.sessionId, codigo);
    this.retener(llave);
    const abierta = await abrirCompraDeEventos(host, cuerpoDeLaCompra(request.session, codigo), llave);
    if (!abierta.ok) {
      if (abrirNoDejoSaga(abierta.rechazo)) {
        this.soltar();
      }
      return { accepted: false, reason: abierta.rechazo.code };
    }
    const compra = abierta.valor;
    const total = aMenores(compra.importe, compra.moneda);
    const sesion = this.#store.getValidSession();
    const attendees = instrument.attendees ?? [];
    const parties: SessionParty[] = attendees.map((attendee, index) => ({
      id: `att-${index + 1}`,
      fullName: attendee.name,
      email: attendee.email,
      details: { document: attendee.document },
    }));
    // Lo que la sesión dice tras abrir es lo que se ABRIÓ: el total del servidor y, del cupón, sólo la
    // línea del código que viajó (la de la foto que se mandó). Una línea `promo:` que llegara a la
    // sesión mientras abrir estaba en vuelo pintaría un descuento que nadie autorizó.
    const lineaDelCupon = codigo
      ? request.session.pricing.breakdown.filter((linea) => linea.code.startsWith(PREFIJO_DEL_CUPON))
      : [];
    this.#store.setSession({
      ...sesion,
      parties,
      pricing: {
        ...sesion.pricing,
        currency: compra.moneda,
        totalAmount: total,
        balanceDue: total,
        breakdown: [...sesion.pricing.breakdown.filter((linea) => !linea.code.startsWith(PREFIJO_DEL_CUPON)), ...lineaDelCupon],
      },
    });

    if (compra.estado === 'Completed') {
      // La MISMA intención ya se cerró (cerrar cobró y su respuesta se perdió): anotar contestaría
      // 409 `eventos.compra_ya_cerrada` en cada clic. Se acepta con su referencia y `confirm`
      // vuelve a cerrar —idempotente sobre una compra completa— y pide sus entradas.
      return { accepted: true, reference: compra.id };
    }

    const anotados = await this.#api.anotarAsistentes(instrument.apiBase ?? apiBaseOf(request.session), compra.id, attendees);
    if (!anotados.ok) {
      // La saga queda abierta —apartada y autorizada, sin cobrar—: volver a pulsar abre con la
      // MISMA llave, el orquestador devuelve esa saga, y se anotan otra vez.
      return { accepted: false, reason: anotados.rechazo.code };
    }
    return { accepted: true, reference: compra.id };
  }

  /**
   * Step 4 — CERRAR la compra (captura) y pedir sus entradas.
   *
   * Si cerrar falla y es transitorio, el pago se queda como está y el reintento repite sólo cerrar,
   * que es idempotente. **Si NO es transitorio, se pregunta a la saga antes de decidir** (`consultar`):
   * un «no» del orquestador la deja `Compensated`, pero un 502 `puerta.respuesta_invalida` o un 2xx
   * cuyo cuerpo se cortó (`cliente.respuesta_ilegible`) pueden llegar con la captura HECHA, y decir
   * ahí «no se te cobró nada» invitaba a comprar dos veces (revisión de la F4).
   *  - `Compensated`: la saga se deshizo. El último pago se marca `failed` y el siguiente clic vuelve
   *    a `pay`, que abre con la MISMA llave y el orquestador reabre la saga deshecha.
   *  - `Completed`: cerrar sí cobró; se sigue a las entradas como si hubiera contestado bien.
   *  - deshaciéndose DESPUÉS de cobrar (`porDevolver`: el apartado venció entre capturar y consumir):
   *    `eventos.cobro_por_devolver`, y el pago se queda —su referencia va en el aviso—.
   *  - cualquier otro (o sin respuesta): no se afirma nada; el pago se queda y se dice lo que quedó
   *    apartado, con su referencia.
   */
  override async confirm(
    session: SessionData,
    instrument?: Readonly<Record<string, unknown>>,
  ): Promise<FulfillmentConfirmation> {
    const datos = (instrument ?? {}) as Partial<EventosPayInstrument>;
    const host = datos.host;
    const id = session.payments[session.payments.length - 1]?.reference ?? '';
    if (!(host instanceof Element)) {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    const cerrada = await cerrarCompraDeEventos(host, id);
    if (!cerrada.ok) {
      const leida = cerrada.rechazo.transient ? null : await this.compraLeida(host, id);
      if (leida?.estado !== 'Completed') {
        if (leida?.estado === 'Compensated') {
          this.marcarElPagoFallido();
        }
        // Deshaciéndose DESPUÉS de cobrar (el apartado venció entre capturar y consumir): el pago se
        // queda —el aviso lleva su referencia— y se dice que hay una devolución, no «no se te cobró».
        return { confirmed: false, reason: leida?.porDevolver ? CODIGO_COBRO_POR_DEVOLVER : cerrada.rechazo.code, vouchers: [] };
      }
    }

    const attendees = (session.parties ?? []).map(
      (party): Attendee => ({
        name: party.fullName,
        email: party.email ?? '',
        document: typeof party.details?.['document'] === 'string' ? party.details['document'] : '',
      }),
    );
    const entradas = await this.#api.entradas(datos.apiBase ?? apiBaseOf(session), id, attendees, {
      eventId: datos.eventId ?? eventIdOf(session),
      eventTitle: datos.eventTitle ?? eventSelectionTitle(session),
      venueName: datos.venueName ?? '',
      startsAt: datos.startsAt ?? '',
    });
    if (!entradas.ok) {
      // La compra quedó cerrada y cobrada: el pago sigue capturado en la sesión, y el reintento
      // repite cerrar (idempotente sobre una compra completa) y vuelve a pedir las entradas.
      return { confirmed: false, reason: entradas.rechazo.code, vouchers: [] };
    }
    const confirmation = entradas.valor;
    return {
      confirmed:
        confirmation.status.toLowerCase() === 'confirmed' ||
        confirmation.status.toLowerCase() === 'paid',
      vouchers: confirmation.tickets.map((ticket) => ({
        itemId: ticket.id,
        reference: ticket.qr,
        status: confirmation.status,
        detail: {
          ticketId: ticket.id,
          qr: ticket.qr,
          attendee: ticket.attendee ?? '',
          tier: ticket.tier ?? '',
          seat: ticket.seat ?? '',
        },
      })),
    };
  }

  /**
   * ¿El miembro tiene, para este evento, compras sin acuse —en curso, o cobradas sin entradas— que el
   * servidor conoce y esta sesión no? (ADR 0140, el cupón endurecido, fase D.) Se pregunta sólo antes
   * de abrir con una llave NUEVA: la retenida es la de la compra de esta sesión, y abrir con ella
   * devuelve su saga. Si la pregunta no se puede contestar, se degrada por AUSENCIA: no se sabe de
   * ninguna, y se abre como siempre (la guarda de la sesión sigue).
   */
  private async hayComprasSinAcuse(apiBase: string, session: SessionData, avisadas: readonly string[]): Promise<boolean> {
    const pendientes = await this.#api.comprasPendientes(apiBase, eventIdOf(session));
    // Una que se deshace con un cobro por devolver no se duplica comprando otra: se dice UNA vez
    // (el elemento la anota en `avisadas`) y después no frena.
    return pendientes.ok && pendientes.valor.some((c) => !(esPorDevolver(c.estado) && avisadas.includes(c.id)));
  }

  /** La saga según el orquestador (su estado y si hay plata por devolver), o `null` si no se pudo leer. */
  private async compraLeida(host: Element, id: string): Promise<CompraLeida | null> {
    const leida = await consultarCompraDeEventos(host, id);
    return leida.ok ? leida.valor : null;
  }

  /**
   * El último pago de la sesión, `failed`: lo que el servidor deshizo ya no está cobrado. Y la llave se
   * SUELTA: una saga deshecha no cobra, así que el cupón vuelve a poder cambiarse.
   */
  private marcarElPagoFallido(): void {
    this.#store.setSession(sinCompraPendiente(this.#store.getValidSession()));
  }

  /**
   * Las líneas quedan apartadas bajo `llave`: su saga puede estar viva desde que abrir salió. Y la sesión
   * pasa a vencer con el plazo de una compra pendiente, también si la llave ya estaba retenida: con los
   * 30 min de la sesión, la compra se olvidaba antes que el barrido de abandono del orquestador.
   */
  private retener(llave: string): void {
    const sesion = this.#store.getValidSession();
    const vence = Math.max(sesion.expiresAt, Date.now() + PLAZO_DE_UNA_COMPRA_PENDIENTE_MS);
    this.#store.setSession({ ...sesion, expiresAt: vence, items: sesion.items.map((item) => ({ ...item, holdRef: llave })) });
  }

  /** Ninguna saga de esta intención puede cobrar: las líneas dejan de estar retenidas. */
  private soltar(): void {
    const sesion = this.#store.getValidSession();
    if (!sesion.items.some((item) => item.holdRef !== undefined)) {
      return;
    }
    this.#store.setSession({
      ...sesion,
      items: sesion.items.map(({ holdRef: _suelta, ...linea }) => linea),
    });
  }

  private lineId(payload: TierSelectionPayload): string {
    return `${EVENTOS_KIND}:${payload.eventId}:${payload.tierId}`;
  }

  private toProduct(event: EventSummary): FulfillmentProduct {
    return {
      productRef: event.id,
      kind: EVENTOS_KIND,
      label: event.title,
      amount: event.fromAmount,
      selection: { ...event },
      meta: {
        subtitle: event.subtitle,
        badges: event.badges,
        currency: event.currency,
        city: event.city,
        startsAt: event.startsAt,
        mode: event.mode,
      },
    };
  }
}

/**
 * El prefijo de la línea del cupón en `pricing.breakdown`: `promo:<CÓDIGO>`, con el descuento en
 * NEGATIVO (ADR 0140, el cupón). La escribe la vista previa del elemento con lo que contestó la
 * puerta; la lee `pay`. Vive en la SESIÓN y no en un campo, así sobrevive a la recarga y al login.
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
 * Lo que se le pide a la puerta para ABRIR la compra, y también para COTIZARLA: el mismo cuerpo, así
 * lo que la vista previa muestra es lo que abrir autorizaría. Sin código, el de siempre (sin un
 * `promotionCode` vacío).
 */
export function cuerpoDeLaCompra(session: SessionData, codigo?: string | null): BffEventos.BuyTicketsRequest {
  const cuerpo: BffEventos.BuyTicketsRequest = { eventId: eventIdOf(session), lines: toLines(session) };
  return codigo ? { ...cuerpo, promotionCode: codigo } : cuerpo;
}

/**
 * La llave de la intención: la de la sesión sin cupón, y otra —la misma para el mismo código— con él.
 * La huella es FNV-1a de 32 bits sobre el código en mayúsculas: no es un secreto (el CMS la reemite
 * atada al sujeto), sólo tiene que separar dos códigos de la MISMA sesión.
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

/**
 * El rechazo del tope de códigos de promoción que no sirven (`IntentosDeCodigo` de `Bff.Eventos`,
 * ADR 0140, el cupón endurecido): «cotizar» o «abrir» CON código, cortados antes de llamar a Pricing.
 */
export const CODIGO_DEMASIADOS_CODIGOS = 'eventos.demasiados_codigos';

/**
 * El motivo con que `pay` NO abre (ADR 0140, el cupón endurecido, fase D): el servidor sabe de otra
 * compra del miembro para el evento sin acuse —en curso, o cobrada sin entradas—, y abrir con una llave
 * nueva la duplicaría. No sale del servidor: lo pone la estrategia, y el elemento pinta esas compras.
 */
export const CODIGO_COMPRA_SIN_ACUSE = 'eventos.compra_sin_acuse';

/**
 * El motivo con que `confirm` NO confirma cuando la compra se deshace DESPUÉS de cobrar (ADR 0140, el
 * cupón endurecido): `cerrar` capturó y el apartado ya había vencido, así que lo que se deshace es una
 * devolución. No sale del servidor: lo pone la estrategia con `refundPending`, y el elemento dice que
 * hay plata por devolver en vez de «no se te cobró nada».
 */
export const CODIGO_COBRO_POR_DEVOLVER = 'eventos.cobro_por_devolver';

/**
 * Los estados en que el servidor informa una compra SÓLO si se deshace con un cobro por devolver
 * (`GET …/compras/pendientes`); en una compra leída lo dice `porDevolver`.
 */
export const esPorDevolver = (estado: string): boolean => estado === 'Compensating' || estado === 'CompensationFailed';

/**
 * La llave con la que se envió abrir y cuya saga todavía puede cobrar, o `null` (ADR 0140, el cupón
 * endurecido). Vive en las LÍNEAS (`holdRef`): sobrevive a la recarga y al login, como el cupón.
 */
export function llaveRetenida(session: SessionData): string | null {
  return session.items.find((item) => typeof item.holdRef === 'string' && item.holdRef !== '')?.holdRef ?? null;
}

/**
 * Cuánto vive una sesión con una compra pendiente (ADR 0140, el cupón endurecido): más que los 60 min
 * del barrido de abandono del orquestador. Con los 30 min de la sesión, la compra se olvidaba antes.
 */
export const PLAZO_DE_UNA_COMPRA_PENDIENTE_MS = 24 * 60 * 60 * 1000;

/** Una compra de la sesión que pudo cobrar y no se confirmó: su llave y, si abrir contestó, su id. */
export interface CompraPendiente {
  readonly llave: string | null;
  /** El id de su saga (el del último pago anotado); `null` si abrir no contestó: nadie lo tiene. */
  readonly referencia: string | null;
}

/**
 * La compra pendiente de la sesión, o `null` (ADR 0140, el cupón endurecido). Lo es la que salió a
 * abrir (llave retenida) o la que tiene un pago anotado, mientras la sesión no esté confirmada: el
 * asistente anota el pago en cuanto `pay` acepta, y sólo el éxito de `confirm` pone `confirmed`. Es la
 * condición de `cuponFijado`, más el estado: comprar dos veces a propósito, tras confirmar, no lo es.
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

/**
 * La sesión SIN su compra pendiente: las líneas sin la llave retenida y el último pago `failed`. Para
 * cuando su saga ya no puede cobrar —se deshizo, se canceló— o se eligen otras entradas sin su id.
 */
export function sinCompraPendiente(session: SessionData): SessionData {
  const ultimo = session.payments.length - 1;
  return {
    ...session,
    items: session.items.map(({ holdRef: _suelta, ...linea }) => linea),
    payments: session.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
  };
}

/**
 * ¿Un «no» de abrir garantiza que no quedó ninguna saga que cobrar con esa llave? Sí cuando lo dijo
 * el negocio —el orquestador rechaza antes de apartar o deshace lo apartado: `negado`—, y cuando la
 * puerta ni lo reenvió (`sesion`, `no_disponible`). Lo transitorio y lo ilegible (un 504, un 502
 * `puerta.respuesta_invalida`, un cuerpo cortado) pueden llegar con la saga ABIERTA: la llave se
 * queda retenida y el reintento la recupera, en vez de abrir otra al lado.
 */
export function abrirNoDejoSaga(rechazo: RechazoDelFlujo): boolean {
  // El tope de códigos que no sirven corta ANTES de cotizar: firme y sin saga. Se decide por su code
  // y no por la clase: un orquestador de antes lo mandaba 503 transitorio, y también suelta.
  if (rechazo.code === CODIGO_DEMASIADOS_CODIGOS) {
    return true;
  }
  const clase = clasificarRechazo(rechazo);
  return clase === 'negado' || clase === 'sesion' || clase === 'no_disponible';
}

/** Ver `TierSelectionPayload.apiBase`: sale de la LÍNEA, que sobrevive a una recarga. */
function apiBaseOf(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const base = selection?.['apiBase'];
  return typeof base === 'string' ? base.trim() : '';
}

/** El evento de la compra, de la LÍNEA del carrito (sobrevive a la recarga y al login). */
function eventIdOf(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const id = selection?.['eventId'];
  return typeof id === 'string' ? id : (session.items[0]?.productRef ?? '');
}

/** Read the event title from the first cart line's selection (best-effort). */
function eventSelectionTitle(session: SessionData): string {
  const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
  const title = selection?.['eventTitle'];
  return typeof title === 'string' ? title : (session.items[0]?.label ?? '');
}

/**
 * El carrito como las líneas de `BuyTicketsRequest`: una por butaca (cantidad 1) en lo numerado,
 * y una por localidad con su cantidad en la admisión general.
 */
function toLines(session: SessionData): BffEventos.TicketLineRequest[] {
  const lines: BffEventos.TicketLineRequest[] = [];
  for (const line of session.items) {
    const selection = line.selection as Record<string, unknown>;
    const tier = typeof selection['tierId'] === 'string' ? selection['tierId'] : line.productRef;
    const seats = Array.isArray(selection['seats']) ? (selection['seats'] as string[]) : [];
    if (seats.length > 0) {
      for (const seat of seats) {
        lines.push({ quantity: 1, tier, seat });
      }
    } else {
      lines.push({ quantity: Math.max(1, line.quantity), tier });
    }
  }
  return lines;
}
