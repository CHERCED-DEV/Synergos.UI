import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { TravelApiClient } from './travel-shell/travel-api.client';
import { TravelFulfillmentStrategy } from './travel-shell/travel-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-travel-shell&gt;</c>.
 *
 * Zoneless (signals-only) like every Synergos element, plus the one place the
 * Booking vertical plugs its <c>IFulfillmentStrategy</c> into the shared
 * transaction engine. The shell never branches on product (hotel/flight/car);
 * it asks the <c>FulfillmentContext</c>, which the provider routes to this
 * strategy by the session's <c>flow</c>.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Single shared instance: the strategy and the shell read the same `degraded` flag.
    TravelApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: TravelFulfillmentStrategy, multi: true },
  ],
};
