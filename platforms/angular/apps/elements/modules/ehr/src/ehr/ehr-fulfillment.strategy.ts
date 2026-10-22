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
import { aMenores, clasificarRechazo, type RechazoDelFlujo } from '@synergos/vitals-core';
import { EhrApiClient } from './ehr-api.client';
import { abrirCita, cerrarCita, consultarCita, relojEnZona, ventanaDeLaCita, type CitaLeida } from './ehr-cita';
import { type AppointmentSelectionPayload, type CaminoDeLaCita } from './ehr.model';

/** The flow id the engine routes the appointment checkout on — one strategy owns it. */
export const EHR_FLOW = 'ehr';

/** The reservable-resource kind for a clinical appointment slot. */
export const EHR_KIND = 'appointment';

/** Lo que dura una cita por la puerta: la franja de la agenda del demo. */
export const MINUTOS_DE_LA_CITA = 30;

/**
 * Lo que el asistente SH-3 le pasa a la estrategia en `pay` Y en `confirm` (ADR 0140 F4). Viaja por llamada:
 * hay UNA estrategia por página y un campo suyo cruzaría dos instancias (regla 60).
 */
interface EhrPayInstrument {
  /** El `<synergos-ehr>` de ESTA cita: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly host: Element;
  /**
   * Por dónde agenda, como lo DECLARA el CMS (`appointmentPath`) y para quién: agendar para otro paciente va
   * siempre por la directa (FR-026). Una cita que ya salió no lo mira: se termina por el camino por el que salió.
   */
  readonly camino: CaminoDeLaCita;
  /** La zona del sitio: el «10:00» que eligió el paciente es la hora del sitio, no la del navegador. */
  readonly zona: string;
}

/**
 * The Healthcare vertical's concrete <c>IFulfillmentStrategy</c> for the `ehr` flow —
 * the **only place** healthcare-specific transactional behaviour lives, and the proof
 * that the shared engine's reservable resource is polymorphic: **el slot de cita =
 * recurso reservable** (habitación ≈ asiento ≈ **médico** ≈ visita), doc 21 §2.5.
 *
 * **La cita va por el camino que DECLARA el CMS** (`instrument.camino`, ADR 0140; ninguno se retira). Por la
 * **puerta**: `pay` la ABRE —aparta la franja y autoriza el copago, sin mover plata— con la llave de la
 * intención, y `confirm` la CIERRA —captura y confirma—; las dos se le piden al `<synergos-flujo>` ancestro
 * con el envoltorio generado. Sin coordinador contesta que no, con `cliente.sin_coordinador`. Por la
 * **directa**: `pay` no cobra (acepta una referencia local) y `confirm` reserva en `/api/ehr/appointment`.
 *
 * **Nunca se cae de un camino al otro** —ni ante un 503 de la puerta—: dos caminos para la misma intención
 * apartan dos franjas. Y una cita que ya salió **se termina por el camino por el que salió**
 * (`caminoDeLaCitaEnCurso`): `pay` lo anota en las líneas antes de salir a la red, y su cita sólo existe de
 * ese lado.
 */
@Injectable()
export class EhrFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = EHR_FLOW;
  protected readonly flow = EHR_FLOW;

  readonly #api = inject(EhrApiClient);
  readonly #store = inject(SessionStore);

  /** No engine-driven catalogue search — scheduling starts at `select`. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    void query;
    return [];
  }

  /**
   * Turn the chosen provider + slot into a single-appointment cart line. The id is
   * deterministic per provider+slot so re-selecting replaces (never duplicates) the
   * line — the engine's idempotent-by-id `addItem` contract.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const payload = product.selection as unknown as AppointmentSelectionPayload;
    const item: SessionItem = {
      id: lineaDeLaCita(payload.doctorId, payload.slot.date, payload.slot.time),
      kind: EHR_KIND,
      productRef: payload.doctorId,
      label: `Cita · ${payload.doctorName}`,
      selection: {
        patientId: payload.patientId,
        patientName: payload.patientName,
        doctorId: payload.doctorId,
        doctorName: payload.doctorName,
        slotDate: payload.slot.date,
        slotTime: payload.slot.time,
        reason: payload.reason,
        mode: payload.mode,
        apiBase: payload.apiBase,
      },
      amount: Math.max(0, payload.copayMinor),
      quantity: 1,
    };
    return { item };
  }

  /**
   * Por la PUERTA, ABRIR la cita: aparta la franja y autoriza el copago. La llave es la de la INTENCIÓN
   * (`SessionData.sessionId`, nueva en cada selección y persistida): reintentar con la misma sesión devuelve la
   * misma cita, o reabre la que se deshizo. El total es el del SERVIDOR, y la sesión pasa a decirlo. Devuelve
   * como referencia el id de la cita.
   *
   * Por la DIRECTA el copago es un paso apagable que no mueve plata: se acepta una referencia local y la
   * reserva la hace `confirm`.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<EhrPayInstrument>;
    const line = request.session.items[0];
    if (!line) {
      return { accepted: false, reason: 'empty-cart' };
    }
    if (caminoDeLaCitaEnCurso(request.session, instrument.camino) === 'directa') {
      this.anotar((item) => conElCamino(item, 'directa'));
      return { accepted: true, reference: `APPT-${Date.now().toString(36).toUpperCase()}` };
    }
    const host = instrument.host;
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    const selection = line.selection as Record<string, unknown>;
    const ventana = ventanaDeLaCita(texto(selection['slotDate']), texto(selection['slotTime']), MINUTOS_DE_LA_CITA, instrument.zona);
    if (!ventana) {
      return { accepted: false, reason: 'cliente.sin_zona' };
    }
    // El camino y la llave quedan en las líneas ANTES de salir a la red: desde ahora la cita puede existir, y
    // sólo del lado de la puerta.
    const llave = request.session.sessionId;
    this.anotar((item) => ({ ...conElCamino(item, 'puerta'), holdRef: llave }));
    const abierta = await abrirCita(host, texto(selection['doctorId']), ventana, llave);
    if (!abierta.ok) {
      if (abrirNoDejoCita(abierta.rechazo)) {
        this.anotar(sinLaRetenida);
      }
      return { accepted: false, reason: abierta.rechazo.code };
    }
    const cita = abierta.valor;
    const sesion = this.#store.getValidSession();
    const total = cita.total ? aMenores(cita.total.amount, cita.total.currency) : 0;
    this.#store.setSession({
      ...sesion,
      items: sesion.items.map((item) => ({ ...item, selection: { ...item.selection, [CAMPO_DE_LA_CITA]: cita.id } })),
      pricing: {
        ...sesion.pricing,
        currency: cita.total?.currency ?? sesion.pricing.currency,
        totalAmount: total,
        balanceDue: total,
      },
    });
    return { accepted: true, reference: cita.id };
  }

  /**
   * Por la PUERTA, CERRAR la cita (captura el copago y confirma la franja). Si cerrar falla y es transitorio,
   * la cita se queda como está y el reintento repite sólo cerrar, que es idempotente. **Si no es transitorio,
   * se pregunta a la cita antes de decidir** (`consultar`): una respuesta ilegible puede llegar con la cita
   * hecha. Completada: se sigue como si hubiera contestado bien. Deshecha: el pago de la sesión se marca
   * fallido y el siguiente clic vuelve a abrir con la MISMA llave. Cualquier otra: no se afirma nada.
   *
   * Por la DIRECTA, **RESERVAR EN EL SERVIDOR** (#111): el comprobante es el que vuelve de allí. Si la reserva
   * no llega, `confirmed: false` y ningún comprobante: el asistente enseña su error y se puede reintentar.
   */
  override async confirm(session: SessionData, instrument?: Readonly<Record<string, unknown>>): Promise<FulfillmentConfirmation> {
    const line = session.items[0];
    if (!line) {
      return { confirmed: false, vouchers: [] };
    }
    const datos = (instrument ?? {}) as Partial<EhrPayInstrument>;
    if (caminoDeLaCitaEnCurso(session, datos.camino) === 'directa') {
      return this.reservarPorLaDirecta(line);
    }
    const host = datos.host;
    if (!(host instanceof Element)) {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    const id = citaDeLaSesion(session) ?? '';
    const cerrada = await cerrarCita(host, id);
    let cita: CitaLeida | null = cerrada.ok ? cerrada.valor : null;
    if (!cerrada.ok) {
      if (cerrada.rechazo.transient) {
        return { confirmed: false, reason: cerrada.rechazo.code, vouchers: [] };
      }
      const leida = await consultarCita(host, id);
      cita = leida.ok && leida.valor.estado === 'Completed' ? leida.valor : null;
      if (!cita) {
        if (leida.ok && leida.valor.estado === 'Compensated') {
          this.#store.setSession(sinCitaPendiente(this.#store.getValidSession()));
        }
        return { confirmed: false, reason: cerrada.rechazo.code, vouchers: [] };
      }
    }
    return aLaConfirmacion(line, cita!, datos.zona);
  }

  private async reservarPorLaDirecta(line: SessionItem): Promise<FulfillmentConfirmation> {
    const selection = line.selection as Record<string, unknown>;
    const apiBase = texto(selection['apiBase']);
    const date = texto(selection['slotDate']);
    const time = texto(selection['slotTime']);

    // El paciente lo pone la SESIÓN (CMS#197): el servidor agenda al de la historia vinculada
    // e ignora el del cuerpo, salvo que quien reserva sea clínico. Lo que viaja es el id que
    // devolvió `portal/home` —del servidor, no de la página—, que es lo que necesita un
    // clínico que se agenda a sí mismo desde su portal; vacío, no se manda.
    const patientId = texto(selection['patientId']);
    let booked;
    try {
      booked = await this.#api.bookAppointment(apiBase, {
        ...(patientId ? { patientId } : {}),
        doctorId: texto(selection['doctorId']),
        slot: { date, time },
      });
    } catch (error) {
      void error;
      return { confirmed: false, reason: 'booking-unavailable', vouchers: [] };
    }

    return {
      confirmed: true,
      vouchers: [
        {
          itemId: line.id,
          // El id del SERVIDOR: es lo que el paciente va a enseñar en recepción.
          reference: booked.id,
          status: booked.status,
          detail: {
            patientId: booked.patientId,
            patientName: booked.patientName || texto(selection['patientName']),
            doctorId: booked.doctorId,
            doctorName: booked.doctorName || texto(selection['doctorName']),
            date: booked.date || date,
            time: booked.time || time,
            reason: booked.reason || texto(selection['reason']),
            mode: texto(selection['mode']),
          },
        },
      ],
    };
  }

  private anotar(cambio: (item: SessionItem) => SessionItem): void {
    const sesion = this.#store.getValidSession();
    this.#store.setSession({ ...sesion, items: sesion.items.map(cambio) });
  }
}

/** El comprobante de una cita que el SERVIDOR confirmó: su id, su número y la hora en la zona del sitio. */
function aLaConfirmacion(line: SessionItem, cita: CitaLeida, zona: string | undefined): FulfillmentConfirmation {
  const selection = line.selection as Record<string, unknown>;
  const reloj = cita.ventana ? relojEnZona(cita.ventana.start, zona) : null;
  return {
    confirmed: true,
    vouchers: [
      {
        itemId: line.id,
        reference: cita.id,
        status: cita.estado,
        detail: {
          numero: cita.numero,
          patientName: texto(selection['patientName']),
          doctorId: cita.profesionalId || texto(selection['doctorId']),
          doctorName: texto(selection['doctorName']),
          date: reloj?.fecha ?? texto(selection['slotDate']),
          time: reloj?.hora ?? texto(selection['slotTime']),
          reason: texto(selection['reason']),
          mode: texto(selection['mode']),
        },
      },
    ],
  };
}

/** El id de la línea: el mismo médico y la misma franja son la misma línea (y la misma intención). */
export function lineaDeLaCita(doctorId: string, fecha: string, hora: string): string {
  return `${EHR_KIND}:${doctorId}:${fecha}:${hora}`;
}

/** Dónde queda, en la línea, el id de la cita que abrió la puerta. */
export const CAMPO_DE_LA_CITA = 'cita';

/** Dónde queda, en la línea, el camino por el que salió la cita. */
const CAMPO_DEL_CAMINO = 'camino';

function conElCamino(item: SessionItem, camino: CaminoDeLaCita): SessionItem {
  return { ...item, selection: { ...item.selection, [CAMPO_DEL_CAMINO]: camino } };
}

/**
 * El camino que declara el CMS: `puerta` sólo si lo declaró así; cualquier otra cosa —o nada— es la directa,
 * lo de siempre en este elemento. El CMS declara siempre uno de los dos (`CaminoDeCompra.Decidir`); sin él (el
 * tag crudo, una página de antes) la cita sigue agendando como agendaba.
 */
export function caminoDeLaCita(camino: unknown): CaminoDeLaCita {
  return camino === 'puerta' ? 'puerta' : 'directa';
}

/** El camino por el que SALIÓ la cita de esta sesión, o `null` si todavía no salió. */
export function caminoDeLaPendiente(session: SessionData): CaminoDeLaCita | null {
  const anotado = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DEL_CAMINO];
  return anotado === 'puerta' || anotado === 'directa' ? anotado : null;
}

/** Una cita que ya salió se termina por su camino; si no, el declarado. */
export function caminoDeLaCitaEnCurso(session: SessionData, declarado: unknown): CaminoDeLaCita {
  return caminoDeLaPendiente(session) ?? caminoDeLaCita(declarado);
}

/** El id de la cita de esta sesión por la puerta: el que abrir contestó, o el del último pago vivo. */
export function citaDeLaSesion(session: SessionData): string | null {
  const enLaLinea = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DE_LA_CITA];
  if (typeof enLaLinea === 'string' && enLaLinea !== '') return enLaLinea;
  const ultimo = session.payments[session.payments.length - 1];
  return caminoDeLaPendiente(session) === 'puerta' && ultimo && ultimo.status !== 'failed' ? (ultimo.reference ?? null) : null;
}

/**
 * ¿Un «no» de abrir garantiza que no quedó ninguna cita con esa llave? Sí cuando lo dijo el negocio —el
 * orquestador rechaza antes de apartar o deshace lo apartado—, y cuando la puerta ni lo reenvió (sin sesión,
 * no disponible). Lo transitorio y lo ilegible pueden llegar con la cita ABIERTA: la llave se queda retenida
 * y el reintento la recupera, en vez de abrir otra al lado.
 */
export function abrirNoDejoCita(rechazo: RechazoDelFlujo): boolean {
  const clase = clasificarRechazo(rechazo);
  return clase === 'negado' || clase === 'sesion' || clase === 'no_disponible';
}

/** La línea sin lo que la ataba a su cita: la llave retenida, el id y el camino por el que salió. */
function sinLaRetenida(item: SessionItem): SessionItem {
  const { holdRef: _suelta, ...linea } = item;
  const { [CAMPO_DE_LA_CITA]: _cita, [CAMPO_DEL_CAMINO]: _camino, ...seleccion } = linea.selection as Record<string, unknown>;
  return { ...linea, selection: seleccion };
}

/**
 * La cita PENDIENTE de esta sesión: abierta por la puerta y sin confirmar. Es la que hay que resolver antes de
 * elegir otra franja (lección D2) y la única sobre la que se ofrece «Cancelar cita».
 */
export function citaPendiente(session: SessionData): string | null {
  return session.status !== 'confirmed' && caminoDeLaPendiente(session) === 'puerta' ? citaDeLaSesion(session) : null;
}

/**
 * La sesión sin la cita pendiente: lo que el servidor deshizo ya no está apartado ni autorizado. El último pago
 * queda `failed` y las líneas dejan de estar retenidas, así que el siguiente clic vuelve a abrir.
 */
export function sinCitaPendiente(session: SessionData): SessionData {
  const ultimo = session.payments.length - 1;
  return {
    ...session,
    items: session.items.map(sinLaRetenida),
    payments: session.payments.map((pago, indice) => (indice === ultimo ? { ...pago, status: 'failed' as const } : pago)),
  };
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
