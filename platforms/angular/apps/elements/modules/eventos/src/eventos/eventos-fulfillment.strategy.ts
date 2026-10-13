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
   * selección y persistida, así que sobrevive a la recarga y al login. Con la misma llave y una
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
   * aparta y autoriza otra vez y que cerrar capturaría (el doble cobro de la revisión del cupón).
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
    const llave = llaveRetenida(request.session) ?? llaveDeLaIntencion(request.session.sessionId, codigo);
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
      const estado = cerrada.rechazo.transient ? '' : await this.estadoDeLaCompra(host, id);
      if (estado !== 'Completed') {
        if (estado === 'Compensated') {
          this.marcarElPagoFallido();
        }
        return { confirmed: false, reason: cerrada.rechazo.code, vouchers: [] };
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

  /** El estado de la saga según el orquestador (`Completed`, `Compensated`…), o '' si no se pudo leer. */
  private async estadoDeLaCompra(host: Element, id: string): Promise<string> {
    const leida = await consultarCompraDeEventos(host, id);
    return leida.ok ? leida.valor.estado : '';
  }

  /**
   * El último pago de la sesión, `failed`: lo que el servidor deshizo ya no está cobrado. Y la llave se
   * SUELTA: una saga deshecha no cobra, así que el cupón vuelve a poder cambiarse.
   */
  private marcarElPagoFallido(): void {
    this.soltar();
    const sesion = this.#store.getValidSession();
    const ultimo = sesion.payments.length - 1;
    if (ultimo < 0) {
      return;
    }
    this.#store.setSession({
      ...sesion,
      payments: sesion.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
    });
  }

  /** Las líneas quedan apartadas bajo `llave`: su saga puede estar viva desde que abrir salió. */
  private retener(llave: string): void {
    const sesion = this.#store.getValidSession();
    if (sesion.items.every((item) => item.holdRef === llave)) {
      return;
    }
    this.#store.setSession({ ...sesion, items: sesion.items.map((item) => ({ ...item, holdRef: llave })) });
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
 * La llave con la que se envió abrir y cuya saga todavía puede cobrar, o `null` (ADR 0140, el cupón
 * endurecido). Vive en las LÍNEAS (`holdRef`): sobrevive a la recarga y al login, como el cupón.
 */
export function llaveRetenida(session: SessionData): string | null {
  return session.items.find((item) => typeof item.holdRef === 'string' && item.holdRef !== '')?.holdRef ?? null;
}

/**
 * ¿Un «no» de abrir garantiza que no quedó ninguna saga que cobrar con esa llave? Sí cuando lo dijo
 * el negocio —el orquestador rechaza antes de apartar o deshace lo apartado: `negado`—, y cuando la
 * puerta ni lo reenvió (`sesion`, `no_disponible`). Lo transitorio y lo ilegible (un 504, un 502
 * `puerta.respuesta_invalida`, un cuerpo cortado) pueden llegar con la saga ABIERTA: la llave se
 * queda retenida y el reintento la recupera, en vez de abrir otra al lado.
 */
export function abrirNoDejoSaga(rechazo: RechazoDelFlujo): boolean {
  // El tope de códigos que no sirven corta ANTES de cotizar: transitorio, pero sin saga.
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
