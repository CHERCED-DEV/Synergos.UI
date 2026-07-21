import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { ShopApiClient } from './storefront/shop-api.client';
import { ShopFulfillmentStrategy } from './storefront/shop-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-storefront&gt;</c>.
 *
 * Zoneless (signals-only) like every Synergos element, plus the one place the
 * Tienda vertical plugs its <c>IFulfillmentStrategy</c> into the shared
 * transaction engine. The storefront never branches on product; it asks the
 * <c>FulfillmentContext</c>, which the provider routes to this strategy by the
 * session's <c>flow === 'storefront'</c>.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Single shared instance: the strategy and the shell read the same `degraded` flag.
    ShopApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: ShopFulfillmentStrategy, multi: true },
  ],
};
