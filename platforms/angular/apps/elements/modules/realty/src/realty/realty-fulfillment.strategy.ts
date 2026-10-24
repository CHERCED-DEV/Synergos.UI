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
import { idAleatorio } from '@synergos/vitals-core';
import { RealtyApiClient } from './realty-api.client';
import { abrirVisita, cerrarYAsentar, type VisitaLeida } from './realty-visita.puerta';
import {
  REALTY_FLOW,
  REALTY_KIND,
  type ContactInfo,
  type Listing,
  type SearchCriteria,
  type Visit,
  type VisitMode,
  type VisitPath,
  type VisitSelectionPayload,
  type VisitSlot,
} from './realty.model';

/** Criteria the portal hands the strategy on `search` (carried in the query). */
interface RealtySearchCriteria {
  readonly apiBase: string;
  readonly criteria: SearchCriteria;
}

/**
 * Lo que el asistente le pasa a la estrategia en `pay` Y en `confirm`.
 *
 * `host` es el `<synergos-realty>` de ESTA visita: desde él se encuentra, por ancestro, su
 * `<synergos-flujo>` (008-propiedades-visita). Viaja por llamada porque hay UNA estrategia por
 * página (la app se crea una vez por etiqueta) y un campo suyo cruzaría dos instancias (regla 60),
 * como en Eventos. Por la ruta directa no hace falta.
 */
interface RealtyVisitInstrument {
  readonly host?: Element;
  readonly apiBase?: string;
}

/**
 * El camino de una visita YA elegida: el que se anotó en su línea al elegirla. Lo que el CMS declare
 * después no cambia el de una visita en curso: su saga sólo existe de un lado (la lección de Eventos,
 * UI `e05f441`). Sin anotación, la directa: es el camino de siempre y el de por defecto (008-P1).
 */
export function caminoDeLaVisitaEnCurso(selection: Readonly<Record<string, unknown>>): VisitPath {
  return selection['path'] === 'puerta' ? 'puerta' : 'directa';
}

/**
 * The Propiedades vertical's concrete <c>IFulfillmentStrategy</c> for the `realty`
 * flow — the **only place** realty-specific transactional behaviour lives, and the
 * proof that the shared engine is general enough to drive a **non-payment**
 * transaction (doc 21 §1.1 punto 5 + §2.7: "el pago es un paso apagable").
 *
 * The reservable resource here is a **visit slot** (habitación ≈ asiento ≈ médico ≈
 * **visita**), held via the engine like any other. `search`/`select`/`pay`/`confirm`
 * map onto the backend contract via <c>RealtyApiClient</c>: the catalogue degrades to
 * mock data when the read endpoint is not yet wired, but **the visit never does** — a
 * visit the server did not book is not confirmed (UI#92 · UI#95). The
 * **`pay` step is OFF**: it resolves to an accepted no-op (a synthetic reference)
 * so the checkout wizard advances to `confirm`, where the visit is actually booked
 * (`POST /api/realty/visit`). The portal calls the engine's <c>FulfillmentContext</c>
 * and never knows this class answered; the provider routes by `flow === 'realty'`.
 */
@Injectable()
export class RealtyFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = REALTY_FLOW;
  protected readonly flow = REALTY_FLOW;

  readonly #api = inject(RealtyApiClient);

  /** Step 1 — search the listings catalogue. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<RealtySearchCriteria>;
    const apiBase = criteria.apiBase ?? '';
    const searchCriteria: SearchCriteria = criteria.criteria ?? {
      q: '',
      operation: 'sale',
      type: '',
      minPrice: 0,
      maxPrice: 0,
      beds: 0,
      location: '',
      sort: 'relevance',
    };
    const result = await this.#api.listings(apiBase, searchCriteria, query.currency ?? '');
    return result.listings.map((listing) => this.toProduct(listing));
  }

  /**
   * Step 2 — turn the chosen listing + slot into a single-visit cart line. The id
   * is deterministic per listing so re-selecting the same listing replaces (never
   * duplicates) the line — the engine's idempotent-by-id `addItem` contract. The
   * amount is 0: a visit costs nothing (pago OFF).
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const raw = product.selection as Record<string, unknown>;
    const payload = product.selection as unknown as VisitSelectionPayload;
    const item: SessionItem = {
      id: `${REALTY_KIND}:${payload.listingId}`,
      kind: REALTY_KIND,
      productRef: payload.listingId,
      label: `Visita · ${payload.listingTitle}`,
      selection: {
        apiBase: readString(raw['apiBase']),
        listingId: payload.listingId,
        listingTitle: payload.listingTitle,
        slotDate: payload.slot.date,
        slotTime: payload.slot.time,
        mode: payload.mode,
        contactName: payload.contact.name,
        contactEmail: payload.contact.email,
        contactPhone: payload.contact.phone,
        // El camino de ESTA visita y lo que la puerta pide: los instantes de la franja (la ventana) y
        // la llave de la intención, que se queda con la línea —elegir otra franja la reemplaza y trae
        // otra llave; reintentar la misma la repite y no aparta dos veces—.
        path: payload.path === 'puerta' ? 'puerta' : 'directa',
        slotStart: payload.slot.start ?? '',
        slotEnd: payload.slot.end ?? '',
        llave: idAleatorio(),
      },
      amount: 0,
      quantity: 1,
    };
    return { item };
  }

  /**
   * Step 3 — **pago apagado**. There is no PSP: agendar una visita es gratis, así
   * que aceptamos con una referencia sintética para que el wizard avance a
   * `confirm`, donde se agenda la visita de verdad.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const line = request.session.items[0];
    if (!line) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const selection = line.selection as Record<string, unknown>;
    if (caminoDeLaVisitaEnCurso(selection) === 'directa') {
      return { accepted: true, reference: `VISIT-${Date.now().toString(36).toUpperCase()}` };
    }

    // Por la puerta, «pagar» es APARTAR la franja (la fase que abre `propiedades.visita`): no se
    // cobra nada, y la franja queda guardada a tu nombre mientras confirmas.
    const host = (request.instrument as RealtyVisitInstrument).host;
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    const start = readString(selection['slotStart']);
    const end = readString(selection['slotEnd']);
    if (start === '' || end === '') {
      return { accepted: false, reason: 'propiedades.franja_sin_instantes' };
    }
    const mode: VisitMode = readString(selection['mode']) === 'video' ? 'video' : 'in-person';
    const r = await abrirVisita(host, readString(selection['listingId']), { start, end }, mode, readString(selection['llave']));
    return r.ok ? { accepted: true, reference: r.valor.id } : { accepted: false, reason: r.rechazo.code };
  }

  /**
   * Step 4 — confirm the reservation: actually book the visit slot (NO payment).
   *
   * **Si el servidor no apartó la franja, esto NO confirma** (UI#92 · UI#95). El cliente
   * fabricaba una visita `VIS-<ts>` «confirmada» cuando el `POST` no llegaba y esto la
   * convertía en `confirmed: true`: el asistente cerraba con «¡Visita agendada!». Hoy se
   * contesta `confirmed: false` sin comprobante —la forma de EHR (#111)—: el asistente
   * dice UNA vez que el horario no quedó reservado (su `confirmFailedMessage`), la
   * selección sigue en la sesión y volver a pulsar reintenta sólo este paso.
   */
  override async confirm(
    session: SessionData,
    instrument?: Readonly<Record<string, unknown>>,
  ): Promise<FulfillmentConfirmation> {
    const line = session.items[0];
    if (!line) {
      return { confirmed: false, vouchers: [] };
    }
    const selection = line.selection as Record<string, unknown>;
    if (caminoDeLaVisitaEnCurso(selection) === 'puerta') {
      return this.confirmarPorLaPuerta(session, line.id, selection, (instrument ?? {}) as RealtyVisitInstrument);
    }
    const apiBase = readString(selection['apiBase']);
    const listingId = readString(selection['listingId']);
    const listingTitle = readString(selection['listingTitle']);
    const slot: VisitSlot = {
      date: readString(selection['slotDate']),
      time: readString(selection['slotTime']),
    };
    const contact: ContactInfo = {
      name: readString(selection['contactName']),
      email: readString(selection['contactEmail']),
      phone: readString(selection['contactPhone']),
    };
    const mode: VisitMode = readString(selection['mode']) === 'video' ? 'video' : 'in-person';

    let visit: Visit;
    try {
      visit = await this.#api.scheduleVisit(apiBase, { listingId, slot, contact, mode }, listingTitle);
    } catch (error) {
      void error;
      return { confirmed: false, reason: 'visit-not-booked', vouchers: [] };
    }
    return {
      confirmed: visit.status === 'confirmed' || visit.status === 'held',
      vouchers: [
        {
          itemId: line.id,
          reference: visit.id,
          status: visit.status,
          detail: {
            visitId: visit.id,
            listingId: visit.listingId,
            listingTitle: visit.listingTitle,
            date: visit.slot.date,
            time: visit.slot.time,
            mode: visit.mode,
          },
        },
      ],
    };
  }

  /**
   * Confirmar por la puerta es CERRAR la saga que abrió `pay` (confirmar la reserva y avisar). Si
   * cerrar no contesta con la visita, se consulta: lo que dice qué quedó es su estado. Sólo una visita
   * `Completed` se da por agendada.
   */
  private async confirmarPorLaPuerta(
    session: SessionData,
    itemId: string,
    selection: Readonly<Record<string, unknown>>,
    instrument: RealtyVisitInstrument,
  ): Promise<FulfillmentConfirmation> {
    const host = instrument.host;
    const id = session.payments[session.payments.length - 1]?.reference ?? '';
    if (!(host instanceof Element) || id === '') {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    const { visita, rechazo } = await cerrarYAsentar(host, id);
    if (!visita || visita.estado !== 'Completed') {
      return { confirmed: false, reason: rechazo?.code ?? `visita.${visita?.estado ?? 'desconocida'}`, vouchers: [] };
    }
    return {
      confirmed: true,
      vouchers: [
        {
          itemId,
          reference: visita.numero,
          status: 'confirmed',
          detail: detalleDeLaVisita(visita, selection),
        },
      ],
    };
  }

  private toProduct(listing: Listing): FulfillmentProduct {
    return {
      productRef: listing.id,
      kind: REALTY_KIND,
      label: listing.title,
      // A visit is free — the amount is the listing price only as informational meta.
      amount: 0,
      selection: { ...listing },
      meta: {
        subtitle: listing.subtitle,
        badges: listing.badges,
        currency: listing.currency,
        price: listing.price,
        operation: listing.operation,
        geo: listing.geo,
      },
    };
  }
}

/** El comprobante de una visita de la puerta: la hora es la que se eligió, ya en la del sitio. */
function detalleDeLaVisita(visita: VisitaLeida, selection: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    visitId: visita.id,
    listingId: visita.inmueble || readString(selection['listingId']),
    listingTitle: readString(selection['listingTitle']),
    date: readString(selection['slotDate']),
    time: readString(selection['slotTime']),
    mode: visita.modo,
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
