import { TestBed } from '@angular/core/testing';
import { CLEAN_SESSION_DATA, type SessionData, type SessionItem } from '../models/session-data';
import {
  FulfillmentStrategyBase,
  type FulfillmentConfirmation,
  type FulfillmentPayRequest,
  type FulfillmentPayResult,
  type FulfillmentProduct,
  type FulfillmentSearchQuery,
  type FulfillmentSelection,
} from './fulfillment-strategy';
import { FULFILLMENT_STRATEGIES } from './fulfillment-strategy.provider';
import { FulfillmentContext, NoFulfillmentStrategyError } from './fulfillment.context';

function sessionFor(flow: string): SessionData {
  return { ...CLEAN_SESSION_DATA, sessionId: 's1', flow };
}

function product(kind: string): FulfillmentProduct {
  return { productRef: 'p1', kind, label: 'X', amount: 100, selection: {} };
}

/** A minimal concrete strategy built on the abstract base. */
class FakeStrategy extends FulfillmentStrategyBase {
  readonly id: string;
  protected readonly flow: string;

  constructor(flow: string) {
    super();
    this.id = flow;
    this.flow = flow;
  }

  async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    void query;
    return [product(this.flow)];
  }

  async select(p: FulfillmentProduct): Promise<FulfillmentSelection> {
    const item: SessionItem = {
      id: 'i1',
      kind: p.kind,
      productRef: p.productRef,
      label: p.label,
      selection: p.selection,
      amount: p.amount,
      quantity: 1,
    };
    return { item };
  }

  async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    void request;
    return { accepted: true, reference: `pay-${this.flow}` };
  }

  async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    void session;
    return { confirmed: true, vouchers: [{ itemId: 'i1', reference: 'V1', status: 'issued' }] };
  }
}

describe(FulfillmentContext.name, () => {
  function setup(strategies: FulfillmentStrategyBase[]): FulfillmentContext {
    TestBed.configureTestingModule({
      providers: strategies.map((strategy) => ({
        provide: FULFILLMENT_STRATEGIES,
        useValue: strategy,
        multi: true,
      })),
    });
    return TestBed.inject(FulfillmentContext);
  }

  // ── empty ──────────────────────────────────────────────────────────────────
  it('throws NoFulfillmentStrategyError when no strategy claims the flow', async () => {
    const context = setup([]);
    await expect(context.confirm(sessionFor('booking'))).rejects.toBeInstanceOf(
      NoFulfillmentStrategyError,
    );
  });

  // ── happy ──────────────────────────────────────────────────────────────────
  it('routes the full lifecycle to the matching strategy without forks', async () => {
    const context = setup([new FakeStrategy('booking')]);
    const session = sessionFor('booking');

    const results = await context.search({ flow: 'booking', criteria: {} });
    expect(results).toHaveLength(1);

    const selection = await context.select(results[0], session);
    expect(selection.item.kind).toBe('booking');

    const pay = await context.pay({ session, instrument: {} });
    expect(pay).toEqual({ accepted: true, reference: 'pay-booking' });

    const confirmation = await context.confirm(session);
    expect(confirmation.confirmed).toBe(true);
  });

  // ── filter (provider selects by flow, polymorphic dispatch) ───────────────────
  it('selects the right strategy per flow among several', async () => {
    const context = setup([new FakeStrategy('booking'), new FakeStrategy('storefront')]);

    const booking = await context.confirm(sessionFor('booking'));
    expect(booking.vouchers[0].reference).toBe('V1');

    const store = await context.pay({ session: sessionFor('storefront'), instrument: {} });
    expect(store.reference).toBe('pay-storefront');
  });

  // ── idempotent (stateless strategies; repeat calls are stable) ────────────────
  it('repeated calls to the same flow are stable', async () => {
    const context = setup([new FakeStrategy('booking')]);
    const a = await context.search({ flow: 'booking', criteria: {} });
    const b = await context.search({ flow: 'booking', criteria: {} });
    expect(a).toEqual(b);
  });
});
