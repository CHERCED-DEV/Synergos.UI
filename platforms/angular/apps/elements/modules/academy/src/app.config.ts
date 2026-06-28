import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { AcademyApiClient } from './academy/academy-api.client';
import { AcademyFulfillmentStrategy } from './academy/academy-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-academy&gt;</c>.
 *
 * Zoneless (signals-only) like every Synergos element, plus the one place the
 * Educación / LMS vertical plugs its <c>IFulfillmentStrategy</c> into the shared
 * transaction engine. The academy never branches on course; it asks the
 * <c>FulfillmentContext</c>, which the provider routes to this strategy by the
 * session's <c>flow === 'academy'</c>.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Single shared instance: the strategy and the shell read the same `degraded` flag.
    AcademyApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: AcademyFulfillmentStrategy, multi: true },
  ],
};
