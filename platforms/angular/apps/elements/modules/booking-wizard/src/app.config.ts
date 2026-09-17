import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { BookingApiClient } from './booking-wizard/booking-api.client';
import { BookingFulfillmentStrategy } from './booking-wizard/booking-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-booking-wizard&gt;</c>.
 *
 * Zoneless como todos los elementos, y desde #24 **el sitio donde el vertical de
 * hoteles enchufa su `IFulfillmentStrategy`** al motor compartido. El asistente
 * no llama a `/search`, `/hold` ni `/pay`: le pide al `FulfillmentContext`, que
 * el provider rutea a esta estrategia por el `flow` de la sesión.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    BookingApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: BookingFulfillmentStrategy, multi: true },
  ],
};
