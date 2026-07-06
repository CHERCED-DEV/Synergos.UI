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
import { AcademyApiClient } from './academy-api.client';
import {
  ACADEMY_FLOW,
  ACADEMY_KIND,
  type AcademyCourse,
  type AcademyStudent,
  type CatalogCriteria,
} from './academy.model';

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
 * <c>AcademyApiClient</c>, which degrades to mock data when an endpoint is not yet
 * wired so the full lifecycle works offline. The cart is single-line (one course
 * per enrolment); "confirmed" means the matrícula is active and the classroom
 * unlocks. Free courses resolve `pay` to an accepted no-op.
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
      },
      // Engine pricing is in minor units; payload carries major units.
      amount: Math.round(payload.amount * 100),
      quantity: 1,
    };
    return { item };
  }

  /** Step 3 — one PSP enrolment for the chosen course (or free enrol). */
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
    const fallbackAmount = line.amount / 100;
    const currency = request.session.pricing.currency;

    const enroll = await this.#api.enroll(
      apiBase,
      line.productRef,
      planId,
      student,
      fallbackAmount,
      currency,
    );
    return {
      accepted: true,
      reference: enroll.orderRef,
    };
  }

  /** Step 4 — confirm the enrolment, returning a voucher (matrícula activa). */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const orderRef = session.payments[session.payments.length - 1]?.reference ?? '';
    const confirmation = await this.#api.confirm('/api/academy', orderRef);
    const line = session.items[0];
    const selection = (line?.selection ?? {}) as Record<string, unknown>;
    return {
      confirmed: confirmation.status.toLowerCase() === 'active' || confirmation.status.toLowerCase() === 'confirmed',
      vouchers: line
        ? [
            {
              itemId: line.id,
              reference: confirmation.enrollmentId,
              status: confirmation.status,
              detail: {
                courseId: line.productRef,
                courseTitle: typeof selection['courseTitle'] === 'string' ? selection['courseTitle'] : line.label,
                enrollmentId: confirmation.enrollmentId,
              },
            },
          ]
        : [],
    };
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
