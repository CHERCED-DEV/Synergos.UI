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
  type FulfillmentVoucher,
  type SessionData,
  type SessionItem,
} from '@synergos/transaction-engine';
import { AcademyApiClient, AcademyWriteFailedError } from './academy-api.client';
import { abrirMatricula, cancelarMatricula, cerrarMatricula, consultarMatricula, type MatriculaLeida } from './academy-matricula';
import {
  ACADEMY_FLOW,
  ACADEMY_KIND,
  type AcademyCourse,
  type AcademyStudent,
  type CaminoDeLaMatricula,
  type CatalogCriteria,
  type EnrollConfirmation,
  type EnrollResult,
} from './academy.model';
import { aMenores } from '@synergos/vitals-core';

/**
 * Por qué no se abrió la matrícula. **Códigos estables, no el mensaje del error**:
 * quien los lee es el asistente y la ficha, que deciden qué copy enseñar.
 */
function enrollFailureReason(error: unknown): string {
  if (error instanceof AcademyWriteFailedError) {
    return error.reached ? `enroll-rejected-${error.status}` : 'enroll-unreachable';
  }
  return 'enroll-failed';
}

/**
 * Por qué no se activó. **El 404 se nombra aparte** porque no pide lo mismo: el
 * `orderRef` no existe del otro lado, así que reintentar no lo va a hacer existir —
 * mientras que un 400 («todavía no se puede capturar») o un corte de red sí.
 */
function confirmFailureReason(error: unknown): string {
  if (error instanceof AcademyWriteFailedError) {
    return error.reached ? `confirm-rejected-${error.status}` : 'confirm-unreachable';
  }
  return 'confirm-failed';
}

/** Una línea gratis: el mismo `amount` con el que la ficha eligió la rama directa. */
function isFreeLine(line: SessionItem): boolean {
  return line.amount * line.quantity <= 0;
}

/** Criteria the academy hands the strategy on `search`. */
interface AcademySearchCriteria {
  readonly apiBase: string;
  readonly criteria: CatalogCriteria;
}

/** What the academy hands the strategy as a `select` candidate (course + plan). */
export interface EnrollSelectionPayload {
  readonly courseId: string;
  readonly courseTitle: string;
  readonly planId: string;
  readonly planLabel: string;
  /** Plan price in major units (`0` → free). */
  readonly amount: number;
  readonly currency: string;
  readonly cover: string;
  /**
   * La base del borde con la que se seleccionó. **Viaja en la línea porque `confirm`
   * no recibe instrumento** y tenía `/api/academy` cableada a mano: un elemento montado
   * contra otra base compraba en la suya y confirmaba en la de por defecto —y el
   * `catch` del cliente fabricaba el acuse, así que no fallaba a la vista— (CMS#116).
   */
  readonly apiBase?: string;
}

/**
 * Lo que la academia le pasa a la estrategia en `pay` Y en `confirm`. Viaja por llamada: hay UNA estrategia por
 * página y un campo suyo cruzaría dos instancias.
 */
interface AcademyPayInstrument {
  readonly apiBase: string;
  readonly student: AcademyStudent;
  /** El `<synergos-academy>` de ESTA matrícula: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly host?: Element;
  /**
   * Por dónde se matricula, como lo DECLARA el CMS (`enrollmentPath`, «directa» por defecto). Una matrícula que ya
   * salió no lo mira: se termina por el camino por el que salió.
   */
  readonly camino?: CaminoDeLaMatricula;
}

/**
 * The Educación / LMS vertical's concrete <c>IFulfillmentStrategy</c> for the
 * `academy` flow — the **only place** enrolment-specific transactional behaviour
 * lives. The academy calls the engine's <c>FulfillmentContext</c> and never knows
 * this class answered; the provider routes by `flow === 'academy'`.
 *
 * `search`/`select`/`pay`/`confirm` map onto the backend contract via
 * <c>AcademyApiClient</c>. El catálogo degrada a datos de ejemplo cuando el borde no
 * responde —es una LECTURA de contenido—; **los dos pasos transaccionales no**
 * (CMS#117): sin respuesta del borde no hay matrícula, y decirlo es todo lo que se
 * puede hacer. The cart is single-line (one course per enrolment); "confirmed"
 * means the matrícula is active and the classroom unlocks. Free courses are already
 * active after `pay` — su `confirm` no sale a la red.
 *
 * **La matrícula va por el camino que DECLARA el CMS** (`instrument.camino`, 010-educacion-matricula; ninguno se
 * retira). Por la **directa**, lo de siempre. Por la **puerta**: `pay` la ABRE —autoriza el cobro, sin mover plata—
 * con la llave del curso, y `confirm` la CIERRA —captura y avisa— y le pide al CMS que la anote en el libro que abre el
 * aula; las dos se le piden al `<synergos-flujo>` ancestro con el envoltorio generado. **Nunca se cae de un camino al
 * otro** —ni ante un 503 de la puerta—: dos caminos para la misma intención cobrarían dos veces. Y una matrícula que ya
 * salió se termina por el camino por el que salió.
 */
@Injectable()
export class AcademyFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = ACADEMY_FLOW;
  protected readonly flow = ACADEMY_FLOW;

  readonly #api = inject(AcademyApiClient);
  readonly #store = inject(SessionStore);

  /** Step 1 — catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<AcademySearchCriteria>;
    const apiBase = criteria.apiBase ?? '';
    const catalogCriteria: CatalogCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      level: '',
      price: '',
      sort: 'relevance',
    };
    const result = await this.#api.courses(apiBase, catalogCriteria, query.currency ?? '');
    return result.courses.map((course) => this.toProduct(course));
  }

  /**
   * Step 2 — turn a chosen course+plan into the single enrolment cart line. The id
   * is deterministic per course so re-selecting a plan replaces (never duplicates)
   * the line — the engine's `addItem` idempotent-by-id contract.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const payload = product.selection as unknown as EnrollSelectionPayload;
    const item: SessionItem = {
      // One enrolment per course → the line id is the course (plan can change).
      id: this.lineId(payload),
      kind: ACADEMY_KIND,
      productRef: payload.courseId,
      label: payload.courseTitle,
      selection: {
        courseId: payload.courseId,
        courseTitle: payload.courseTitle,
        planId: payload.planId,
        planLabel: payload.planLabel,
        currency: payload.currency,
        cover: payload.cover,
        unitAmount: aMenores(payload.amount, payload.currency),
        apiBase: payload.apiBase ?? '',
      },
      // Engine pricing is in minor units; payload carries major units.
      amount: aMenores(payload.amount, payload.currency),
      quantity: 1,
    };
    return { item };
  }

  /**
   * Step 3 — one PSP enrolment for the chosen course (or free enrol).
   *
   * **Un fallo del borde sale como `accepted: false`, no como una referencia
   * inventada** (CMS#117): el asistente se queda donde está, lo tecleado no se
   * pierde y nadie confirma una matrícula que nadie abrió.
   *
   * **En la rama gratis la referencia ES el `enrollmentId`**, porque ahí no hay
   * orden que capturar: `POST /enroll` ya dejó la matrícula activa.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    const instrument = request.instrument as Partial<AcademyPayInstrument>;
    const apiBase = instrument.apiBase ?? '';
    const student: AcademyStudent = instrument.student ?? { name: '', email: '' };
    const line = request.session.items[0];
    if (!line) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const selection = line.selection as Record<string, unknown>;
    const planId = typeof selection['planId'] === 'string' ? selection['planId'] : '';
    if (caminoDeLaMatriculaEnCurso(request.session, instrument.camino) === 'puerta') {
      return this.abrirPorLaPuerta(line, planId, instrument.host);
    }
    this.anotar((item) => conElCamino(item, 'directa'));
    const currency = request.session.pricing.currency;

    let enroll: EnrollResult;
    try {
      enroll = await this.#api.enroll(apiBase, line.productRef, planId, student, currency);
    } catch (error) {
      return { accepted: false, reason: enrollFailureReason(error) };
    }
    const reference = enroll.free ? (enroll.enrollmentId ?? '') : enroll.orderRef;
    if (!reference) {
      return { accepted: false, reason: 'enroll-no-reference' };
    }
    return { accepted: true, reference };
  }

  /**
   * Step 4 — confirm the enrolment, returning a voucher (matrícula activa).
   *
   * **Un curso gratis no pasa por `POST /confirm`, y eso no es un atajo: es el
   * contrato.** La rama gratis de `EnrollAsync` activa la matrícula en el acto y
   * **nunca** pasa por `ConfirmAsync`, así que pedirle al borde que confirme esa
   * orden contesta 404 siempre — y el `catch` que lo tapaba devolvía un id
   * fabricado. Que el carrito sea gratis se lee de la LÍNEA (`amount === 0`), que
   * es el mismo dato con el que la ficha eligió esta rama.
   *
   * **Si el borde no confirma, esto NO confirma.** El asistente conserva el pago ya
   * capturado y ofrece reintentar: reconfirmar el mismo `orderRef` es idempotente
   * del otro lado, volver a `enroll` no lo es.
   */
  override async confirm(session: SessionData, instrument?: Readonly<Record<string, unknown>>): Promise<FulfillmentConfirmation> {
    const reference = session.payments[session.payments.length - 1]?.reference ?? '';
    const line = session.items[0];
    if (!line) {
      return { confirmed: false, vouchers: [], reason: 'empty-cart' };
    }
    const datos = (instrument ?? {}) as Partial<AcademyPayInstrument>;
    if (caminoDeLaMatriculaEnCurso(session, datos.camino) === 'puerta') {
      return this.cerrarPorLaPuerta(line, datos.host);
    }

    if (isFreeLine(line)) {
      return reference
        ? { confirmed: true, vouchers: [this.voucher(line, reference, 'active')] }
        : { confirmed: false, vouchers: [], reason: 'enroll-no-reference' };
    }

    let confirmation: EnrollConfirmation;
    try {
      confirmation = await this.#api.confirm(this.apiBaseOf(session), reference);
    } catch (error) {
      return { confirmed: false, vouchers: [], reason: confirmFailureReason(error) };
    }
    const status = confirmation.status.toLowerCase();
    const confirmed = status === 'active' || status === 'confirmed';
    return {
      confirmed,
      reason: confirmed ? undefined : 'enrollment-not-active',
      vouchers: confirmed
        ? [this.voucher(line, confirmation.enrollmentId, confirmation.status)]
        : [],
    };
  }

  /**
   * Por la PUERTA, ABRIR la matrícula con la llave del curso: autoriza el cobro (o lo omite con total cero). El camino
   * queda en la línea ANTES de salir a la red: desde ahora la matrícula puede existir, y sólo de ese lado. Si la que
   * vuelve está abierta con OTRO plan (otra pestaña, un cambio de plan), se cancela y se abre la del plan elegido: un
   * solo cobro, el del plan que la pantalla muestra.
   */
  private async abrirPorLaPuerta(line: SessionItem, planId: string, host: Element | undefined): Promise<FulfillmentPayResult> {
    if (!(host instanceof Element)) {
      return { accepted: false, reason: 'cliente.sin_coordinador' };
    }
    const cursoId = line.productRef;
    this.anotar((item) => conElCamino(item, 'puerta'));
    let abierta = await abrirMatricula(host, cursoId, planId || null);
    if (abierta.ok && abierta.valor.estado === 'Running' && (abierta.valor.plan ?? '') !== planId) {
      const cancelada = await cancelarMatricula(host, abierta.valor.id);
      if (!cancelada.ok) {
        return { accepted: false, reason: cancelada.rechazo.code };
      }
      abierta = await abrirMatricula(host, cursoId, planId || null);
    }
    if (!abierta.ok) {
      return { accepted: false, reason: abierta.rechazo.code };
    }
    const matricula = abierta.valor;
    const sesion = this.#store.getValidSession();
    const total = matricula.total ? aMenores(matricula.total.amount, matricula.total.currency) : 0;
    this.#store.setSession({
      ...sesion,
      items: sesion.items.map((item) => ({ ...item, selection: { ...item.selection, [CAMPO_DE_LA_MATRICULA]: matricula.id } })),
      pricing: {
        ...sesion.pricing,
        currency: matricula.total?.currency ?? sesion.pricing.currency,
        totalAmount: total,
        balanceDue: total,
      },
    });
    return { accepted: true, reference: matricula.id };
  }

  /**
   * Por la PUERTA, CERRAR la matrícula (captura y avisa) y pedirle al CMS que la anote en el libro que abre el aula.
   * «Activa» sólo cuando el CMS la anotó: si cerrar llegó y anotar no, el cobro ya está y el reintento repite las dos
   * cosas, que son idempotentes (y «mi aprendizaje» la reconcilia igual). Un cerrar que no contesta bien se CONSULTA
   * antes de decidir: una respuesta ilegible puede llegar con la matrícula cerrada.
   */
  private async cerrarPorLaPuerta(line: SessionItem, host: Element | undefined): Promise<FulfillmentConfirmation> {
    if (!(host instanceof Element)) {
      return { confirmed: false, reason: 'cliente.sin_coordinador', vouchers: [] };
    }
    const id = matriculaDeLaLinea(line) ?? '';
    const cerrada = await cerrarMatricula(host, id);
    let matricula: MatriculaLeida | null = cerrada.ok ? cerrada.valor : null;
    if (!cerrada.ok) {
      if (cerrada.rechazo.transient) {
        return { confirmed: false, reason: cerrada.rechazo.code, vouchers: [] };
      }
      const leida = await consultarMatricula(host, id);
      matricula = leida.ok && leida.valor.estado === 'Completed' ? leida.valor : null;
      if (!matricula) {
        if (leida.ok && leida.valor.estado === 'Compensated') {
          this.anotar(sinLaMatricula);
        }
        return { confirmed: false, reason: cerrada.rechazo.code, vouchers: [] };
      }
    }
    if (matricula!.estado !== 'Completed') {
      return { confirmed: false, reason: 'educacion.not_continuable', vouchers: [] };
    }
    let anotada;
    try {
      anotada = await this.#api.anotarMatriculaDeLaPuerta(this.apiBaseOfLine(line), matricula!.id);
    } catch (error) {
      void error;
      return { confirmed: false, reason: RAZON_ACTIVANDO, vouchers: [] };
    }
    return {
      confirmed: true,
      vouchers: [
        {
          itemId: line.id,
          reference: anotada.enrollmentId,
          status: 'active',
          detail: {
            courseId: line.productRef,
            courseTitle: typeof (line.selection as Record<string, unknown>)['courseTitle'] === 'string'
              ? ((line.selection as Record<string, unknown>)['courseTitle'] as string)
              : line.label,
            enrollmentId: anotada.enrollmentId,
            numero: matricula!.numero,
          },
        },
      ],
    };
  }

  private apiBaseOfLine(line: SessionItem): string {
    const base = (line.selection as Record<string, unknown>)['apiBase'];
    return typeof base === 'string' && base.trim() ? base.trim() : '';
  }

  private anotar(cambio: (item: SessionItem) => SessionItem): void {
    const sesion = this.#store.getValidSession();
    this.#store.setSession({ ...sesion, items: sesion.items.map(cambio) });
  }

  /** El comprobante de la matrícula — un id que salió del borde, nunca uno de aquí. */
  private voucher(line: SessionItem, enrollmentId: string, status: string): FulfillmentVoucher {
    const selection = line.selection as Record<string, unknown>;
    return {
      itemId: line.id,
      reference: enrollmentId,
      status,
      detail: {
        courseId: line.productRef,
        courseTitle:
          typeof selection['courseTitle'] === 'string' ? selection['courseTitle'] : line.label,
        enrollmentId,
      },
    };
  }

  /**
   * La base con la que se armó el carrito, o la de por defecto. Sale de la LÍNEA y no
   * de un campo de la instancia: entre `pay` y `confirm` la página puede recargarse y
   * la sesión sobrevive, el campo no.
   */
  private apiBaseOf(session: SessionData): string {
    const selection = session.items[0]?.selection as Record<string, unknown> | undefined;
    const base = selection?.['apiBase'];
    return typeof base === 'string' && base.trim() ? base.trim() : '';
  }

  private lineId(payload: EnrollSelectionPayload): string {
    return `${ACADEMY_KIND}:${payload.courseId}`;
  }

  private toProduct(course: AcademyCourse): FulfillmentProduct {
    return {
      productRef: course.id,
      kind: ACADEMY_KIND,
      label: course.title,
      amount: course.amount,
      selection: { ...course },
      meta: {
        subtitle: course.subtitle,
        badges: course.badges,
        currency: course.currency,
        rating: course.rating,
        level: course.level,
      },
    };
  }
}

/**
 * La razón cuando cerrar llegó y el CMS todavía no anotó la matrícula: el cobro ya está, y reintentar repite cerrar y
 * anotar, que son idempotentes. La ficha la nombra aparte para no decir «no se te cobró».
 */
export const RAZON_ACTIVANDO = 'academy.activando';

/** Dónde queda, en la línea, el id de la matrícula que abrió la puerta. */
export const CAMPO_DE_LA_MATRICULA = 'matricula';

/** Dónde queda, en la línea, el camino por el que salió la matrícula. */
const CAMPO_DEL_CAMINO = 'camino';

function conElCamino(item: SessionItem, camino: CaminoDeLaMatricula): SessionItem {
  return { ...item, selection: { ...item.selection, [CAMPO_DEL_CAMINO]: camino } };
}

/** La línea sin lo que la ataba a su matrícula: el id y el camino por el que salió. */
function sinLaMatricula(item: SessionItem): SessionItem {
  const { [CAMPO_DE_LA_MATRICULA]: _matricula, [CAMPO_DEL_CAMINO]: _camino, ...seleccion } = item.selection as Record<string, unknown>;
  void _matricula;
  void _camino;
  return { ...item, selection: seleccion };
}

/**
 * El camino que declara el CMS: `puerta` sólo si lo declaró así; cualquier otra cosa —o nada— es la directa, lo de
 * siempre en este elemento («directa» por defecto, 010-educacion-matricula).
 */
export function caminoDeLaMatricula(camino: unknown): CaminoDeLaMatricula {
  return camino === 'puerta' ? 'puerta' : 'directa';
}

/** El camino por el que SALIÓ la matrícula de esta sesión, o `null` si todavía no salió. */
export function caminoDeLaPendiente(session: SessionData): CaminoDeLaMatricula | null {
  const camino = (session.items[0]?.selection as Record<string, unknown> | undefined)?.[CAMPO_DEL_CAMINO];
  return camino === 'puerta' || camino === 'directa' ? camino : null;
}

/** Una matrícula que ya salió se termina por su camino; si no, el declarado. */
export function caminoDeLaMatriculaEnCurso(session: SessionData, declarado: unknown): CaminoDeLaMatricula {
  return caminoDeLaPendiente(session) ?? caminoDeLaMatricula(declarado);
}

/** El id de la matrícula de esta línea por la puerta, si la abrió. */
export function matriculaDeLaLinea(line: SessionItem | undefined): string | null {
  const id = (line?.selection as Record<string, unknown> | undefined)?.[CAMPO_DE_LA_MATRICULA];
  return typeof id === 'string' && id ? id : null;
}