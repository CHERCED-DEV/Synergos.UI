import { Injectable, inject } from '@angular/core';
import {
  FulfillmentStrategyBase,
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
import {
  ACADEMY_FLOW,
  ACADEMY_KIND,
  type AcademyCourse,
  type AcademyStudent,
  type CatalogCriteria,
  type EnrollConfirmation,
  type EnrollResult,
} from './academy.model';

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

/** PSP instrument the academy hands the strategy on `pay`. */
interface AcademyPayInstrument {
  readonly apiBase: string;
  readonly student: AcademyStudent;
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
 */
@Injectable()
export class AcademyFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = ACADEMY_FLOW;
  protected readonly flow = ACADEMY_FLOW;

  readonly #api = inject(AcademyApiClient);

  /** Step 1 — catalogue search. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    const criteria = query.criteria as Partial<AcademySearchCriteria>;
    const apiBase = criteria.apiBase ?? '/api/academy';
    const catalogCriteria: CatalogCriteria = criteria.criteria ?? {
      q: '',
      category: '',
      level: '',
      price: '',
      sort: 'relevance',
    };
    const result = await this.#api.courses(apiBase, catalogCriteria, query.currency ?? 'COP');
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
        unitAmount: Math.round(payload.amount * 100),
        apiBase: payload.apiBase ?? '',
      },
      // Engine pricing is in minor units; payload carries major units.
      amount: Math.round(payload.amount * 100),
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
    const apiBase = instrument.apiBase ?? '/api/academy';
    const student: AcademyStudent = instrument.student ?? { name: '', email: '' };
    const line = request.session.items[0];
    if (!line) {
      return { accepted: false, reason: 'empty-cart' };
    }
    const selection = line.selection as Record<string, unknown>;
    const planId = typeof selection['planId'] === 'string' ? selection['planId'] : '';
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
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const reference = session.payments[session.payments.length - 1]?.reference ?? '';
    const line = session.items[0];
    if (!line) {
      return { confirmed: false, vouchers: [], reason: 'empty-cart' };
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
    return typeof base === 'string' && base.trim() ? base.trim() : '/api/academy';
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
