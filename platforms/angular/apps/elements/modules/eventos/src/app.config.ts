import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { EventosApiClient } from './eventos/eventos-api.client';
import { EventosFulfillmentStrategy } from './eventos/eventos-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-eventos&gt;</c>.
 *
 * Zoneless (signals-only) like every Synergos element, plus the one place the
 * Eventos vertical plugs its <c>IFulfillmentStrategy</c> into the shared
 * transaction engine. The shell never branches on event/tier; it asks the
 * <c>FulfillmentContext</c>, which the provider routes to this strategy by the
 * session's <c>flow === 'eventos'</c>.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Single shared instance: the strategy and the shell read the same `degraded` flag.
    EventosApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: EventosFulfillmentStrategy, multi: true },
  ],
};
