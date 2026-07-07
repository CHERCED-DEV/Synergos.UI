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

/** The flow id the engine routes the monetization checkout on — one strategy owns it. */
export const BLOGS_FLOW = 'blogs';

/**
 * The Blogs vertical's concrete <c>IFulfillmentStrategy</c> for the `blogs` flow —
 * the **only place** blogs-specific transactional behaviour lives, and the proof
 * that a social network needs the engine only for its **monetizable edge**
 * (suscripción a un creador / tip), not its social core (doc 21 §2.3 + app-spec
 * §4/§8: "engine para monetización, `BlogsSubscriptionStrategy`").
 *
 * The "reservable resource" here is a **creator subscription tier** (or a one-off
 * tip): `select` turns the chosen tier into a single cart line, `pay` accepts the
 * charge (PSP stubbed — real Wompi/PayU decided post-Ola 2, decisión D4), and
 * `confirm` mints the membership voucher. The whole `select→pay→confirm` lifecycle
 * runs offline through the SH-3 checkout wizard; the module never branches on
 * "tier/tip", it asks the <c>FulfillmentContext</c>, which routes by
 * `flow === 'blogs'`. Social reactions/comments/follows do NOT touch the engine.
 */
@Injectable()
export class BlogsFulfillmentStrategy extends FulfillmentStrategyBase {
  readonly id = BLOGS_FLOW;
  protected readonly flow = BLOGS_FLOW;

  /** Blogs has no engine-driven catalogue search — monetization starts at `select`. */
  override async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    void query;
    return [];
  }

  /**
   * Turn the chosen tier/tip into a single membership cart line. The id is
   * deterministic per creator+tier so re-selecting replaces (never duplicates) the
   * line — the engine's idempotent-by-id `addItem` contract.
   */
  override async select(
    product: FulfillmentProduct,
    session: SessionData,
  ): Promise<FulfillmentSelection> {
    void session;
    const raw = product.selection as Record<string, unknown>;
    const creatorKey = readString(raw['creatorKey']);
    const tierId = readString(raw['tierId']) || 'tip';
    const item: SessionItem = {
      id: `sub:${creatorKey}:${tierId}`,
      kind: 'subscription',
      productRef: product.productRef,
      label: product.label,
      selection: {
        creatorKey,
        creatorName: readString(raw['creatorName']),
        tierId,
        tierName: readString(raw['tierName']),
        kind: readString(raw['kind']) || 'subscription',
      },
      amount: product.amount,
      quantity: 1,
    };
    return { item };
  }

  /**
   * Accept the charge. **PSP stub** (decisión D4): no real gateway is wired yet, so
   * we accept with a synthetic reference and let the wizard advance to `confirm`.
   */
  override async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    if (request.session.items.length === 0) {
      return { accepted: false, reason: 'empty-cart' };
    }
    return { accepted: true, reference: `SUB-${Date.now().toString(36).toUpperCase()}` };
  }

  /** Mint the membership/tip voucher — the confirmation of the monetization round. */
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
          reference: `MEMBER-${Date.now().toString(36).toUpperCase()}`,
          status: 'active',
          detail: {
            creatorKey: readString(selection['creatorKey']),
            creatorName: readString(selection['creatorName']),
            tierId: readString(selection['tierId']),
            tierName: readString(selection['tierName']),
            kind: readString(selection['kind']),
          },
        },
      ],
    };
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
