import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { RealtyApiClient } from './realty/realty-api.client';
import { RealtyFulfillmentStrategy } from './realty/realty-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-realty&gt;</c> — the Propiedades vertical
 * **v2** as a role-switch marketplace portal (SH-1 + SH-8 lista↔mapa · SH-2 ficha ·
 * SH-4 cuenta · SH-5 consola agente · SH-6 publicar), built on the shared engine.
 *
 * Zoneless (signals-only) like every Synergos element, plus the one place the
 * Propiedades vertical plugs its <c>IFulfillmentStrategy</c> into the shared
 * transaction engine. The transaction central of this domain is **agendar una
 * visita — NOT a payment** (spec §1, §4): the visit is a reservable agent slot and
 * the pay step is **apagado** (validates the engine's generality). The shell never
 * branches on "propiedad/visita"; it asks the <c>FulfillmentContext</c>, which the
 * provider routes to this strategy by the session's <c>flow === 'realty'</c>.
 *
 * A single shared <c>RealtyApiClient</c> instance backs every view and the strategy
 * so the shell, the PDP and the strategy read the same <c>degraded</c> flag.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Single shared instance: the strategy and the shell read the same `degraded` flag.
    RealtyApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: RealtyFulfillmentStrategy, multi: true },
  ],
};
