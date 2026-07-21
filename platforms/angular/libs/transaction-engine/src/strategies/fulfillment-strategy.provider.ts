import { InjectionToken, Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import type { SessionData } from '../models/session-data';
import type { IFulfillmentStrategy } from './fulfillment-strategy';

/**
 * Multi-provider DI token collecting every registered `IFulfillmentStrategy`.
 *
 * Mirrors NewShore's `JOURNEYS_SELECTION_STRATEGY` array token. Each vertical
 * registers its strategy with `multi: true`; the `FulfillmentStrategyProvider`
 * reads the whole array and selects one per session.
 *
 * @example
 * ```ts
 * providers: [
 *   { provide: FULFILLMENT_STRATEGIES, useClass: BookingFulfillmentStrategy, multi: true },
 *   { provide: FULFILLMENT_STRATEGIES, useClass: StorefrontFulfillmentStrategy, multi: true },
 * ]
 * ```
 */
export const FULFILLMENT_STRATEGIES = new InjectionToken<readonly IFulfillmentStrategy[]>(
  'FULFILLMENT_STRATEGIES',
  {
    providedIn: 'root',
    factory: () => [],
  },
);

/**
 * Selects the single strategy that fulfils a session — **the one place** the
 * decision is made. Consumers never branch on `flow`; they ask the provider.
 *
 * Selection is first-match by `supports(session)`. Registration order therefore
 * acts as priority; in practice each `flow` is owned by exactly one strategy so
 * order is irrelevant. A duplicate match is logged (a configuration smell).
 */
@Injectable({ providedIn: 'root' })
export class FulfillmentStrategyProvider {
  readonly #strategies = inject(FULFILLMENT_STRATEGIES);
  readonly #logger = inject(LoggerService);

  /** All registered strategies (read-only). */
  list(): readonly IFulfillmentStrategy[] {
    return this.#strategies;
  }

  /**
   * Returns the strategy for the session, or `null` if none claims it. The
   * `FulfillmentContext` turns `null` into an explicit error so a missing
   * registration fails loudly rather than silently no-op-ing.
   */
  getStrategy(session: SessionData): IFulfillmentStrategy | null {
    const matches = this.#strategies.filter((strategy) => strategy.supports(session));
    if (matches.length === 0) {
      return null;
    }
    if (matches.length > 1) {
      this.#logger.warn(
        `Multiple fulfillment strategies claim flow "${session.flow}": ${matches
          .map((strategy) => strategy.id)
          .join(', ')}. Using the first.`,
      );
    }
    return matches[0];
  }
}
