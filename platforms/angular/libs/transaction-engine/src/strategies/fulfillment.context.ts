import { Injectable, inject } from '@angular/core';
import type { SessionData } from '../models/session-data';
import type {
  FulfillmentConfirmation,
  FulfillmentPayRequest,
  FulfillmentPayResult,
  FulfillmentProduct,
  FulfillmentSearchQuery,
  FulfillmentSelection,
} from './fulfillment-strategy';
import { FulfillmentStrategyProvider } from './fulfillment-strategy.provider';

/** Thrown when no strategy is registered for the session's flow. */
export class NoFulfillmentStrategyError extends Error {
  constructor(flow: string) {
    super(`No fulfillment strategy registered for flow "${flow}".`);
    this.name = 'NoFulfillmentStrategyError';
  }
}

/**
 * The consumer-facing facade over the Strategy seam — NewShore's
 * `journey-selection.context.ts` generalised to the whole lifecycle.
 *
 * Components / shells call `context.search(...)` etc. and never touch the
 * provider or know which strategy answered. The context resolves the strategy
 * for the supplied `SessionData` on every call (the flow can change between a
 * search and a confirm), keeping the binding late and the consumer ignorant of
 * the polymorphism.
 */
@Injectable({ providedIn: 'root' })
export class FulfillmentContext {
  readonly #provider = inject(FulfillmentStrategyProvider);

  // Methods are `async` so a missing-strategy throw surfaces as a rejected
  // promise (never a synchronous throw the caller must guard separately).

  /** Step 1 — search. The query's `flow` selects the strategy. */
  async search(query: FulfillmentSearchQuery): Promise<readonly FulfillmentProduct[]> {
    return this.resolveForFlow(query.flow).search(query);
  }

  /** Step 2 — select a product into the cart, using the session's flow. */
  async select(product: FulfillmentProduct, session: SessionData): Promise<FulfillmentSelection> {
    return this.resolve(session).select(product, session);
  }

  /** Step 3 — pay the whole cart once. */
  async pay(request: FulfillmentPayRequest): Promise<FulfillmentPayResult> {
    return this.resolve(request.session).pay(request);
  }

  /** Step 4 — confirm every held line. */
  async confirm(session: SessionData): Promise<FulfillmentConfirmation> {
    return this.resolve(session).confirm(session);
  }

  private resolve(session: SessionData) {
    const strategy = this.#provider.getStrategy(session);
    if (strategy === null) {
      throw new NoFulfillmentStrategyError(session.flow);
    }
    return strategy;
  }

  private resolveForFlow(flow: string) {
    // `supports` only inspects `flow`, so a minimal probe session is enough for
    // the search step where no full session exists yet.
    return this.resolve({ flow } as SessionData);
  }
}
