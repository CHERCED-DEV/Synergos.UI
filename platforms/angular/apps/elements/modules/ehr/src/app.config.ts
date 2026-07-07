import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { EhrApiClient } from './ehr/ehr-api.client';
import { EhrFulfillmentStrategy } from './ehr/ehr-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-ehr&gt;</c> — the Healthcare vertical **v2**
 * as a real **two-portal clinical app** (MyChart patient portal + Hyperspace EHR
 * cockpit, doc 21 §2.5), the Ola-7 consumer of the reusable shell catalogue
 * `@synergos/shells`.
 *
 * Zoneless (signals-only) like every Synergos element. The clinical graph is mostly
 * read/write CRUD over the seams, but the **appointment scheduling sub-flow** reuses
 * the shared <c>@synergos/transaction-engine</c>: the <c>EhrFulfillmentStrategy</c>
 * owns the `ehr` flow so the SH-3 checkout wizard can run `select→pay→confirm` for a
 * cita (slot = médico, copago apagable). The module never branches on "cita/copago";
 * it asks the <c>FulfillmentContext</c>, which routes by `flow === 'ehr'`.
 *
 * A single shared <c>EhrApiClient</c> instance backs every view so both portals read
 * the same <c>degraded</c> flag (visible mock fallback).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    EhrApiClient,
    { provide: FULFILLMENT_STRATEGIES, useClass: EhrFulfillmentStrategy, multi: true },
  ],
};
