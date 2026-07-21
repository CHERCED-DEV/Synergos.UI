import { Injectable } from '@angular/core';
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
import { type AppointmentSelectionPayload } from './ehr.model';

/** The flow id the engine routes the appointment checkout on — one strategy owns it. */
export const EHR_FLOW = 'ehr';

/** The reservable-resource kind for a clinical appointment slot. */
export const EHR_KIND = 'appointment';

/**
 * The Healthcare vertical's concrete <c>IFulfillmentStrategy</c> for the `ehr` flow —
 * the **only place** healthcare-specific transactional behaviour lives, and the proof
 * that the shared engine's reservable resource is polymorphic: **el slot de cita =
 * recurso reservable** (habitación ≈ asiento ≈ **médico** ≈ visita), doc 21 §2.5.
 *
 * `select` turns the chosen provider + slot into a single cart line; `pay` is a
 * **step apagable** — with copay ON it accepts the copay charge (PSP stubbed,
 * decisión D4), with copay OFF (`copayMinor === 0`) it resolves to an accepted no-op
 * so the SH-3 wizard advances straight to `confirm`, where the appointment is booked.
 * The module calls the engine's <c>FulfillmentContext</c> and never branches on
 * "cita/copago"; the provider routes by `flow === 'ehr'`.
 */
@Injectable()
export class EhrFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = EHR_FLOW;
  protected readonly flow = EHR_FLOW;

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
      id: `${EHR_KIND}:${payload.doctorId}:${payload.slot.date}:${payload.slot.time}`,
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
      },
      amount: Math.max(0, payload.copayMinor),
      quantity: 1,
    };
    return { item };
  }

  /**
   * Accept the charge. **Copay is a step apagable** (doc 21 §1.1): when the cart total
   * is 0 (pago OFF) we accept a synthetic reference so the wizard advances; otherwise
   * we accept the copay charge (PSP stubbed — real Wompi/PayU decided post-Ola 2).
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    return { accepted: true, reference: `APPT-${Date.now().toString(36).toUpperCase()}` };
  }

  /** Confirm the reservation: mint the appointment voucher (comprobante de cita). */
  override async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    const line = session.items[0];
    if (!line) {
      return { confirmed: false, vouchers: [] };
    }
    const selection = line.selection as Record<string, unknown>;
    return {
      confirmed: true,
      vouchers: [
        {
          itemId: line.id,
          reference: `CITA-${Date.now().toString(36).toUpperCase()}`,
          status: 'confirmed',
          detail: {
            patientId: readString(selection['patientId']),
            patientName: readString(selection['patientName']),
            doctorId: readString(selection['doctorId']),
            doctorName: readString(selection['doctorName']),
            date: readString(selection['slotDate']),
            time: readString(selection['slotTime']),
            reason: readString(selection['reason']),
            mode: readString(selection['mode']),
          },
        },
      ],
    };
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
