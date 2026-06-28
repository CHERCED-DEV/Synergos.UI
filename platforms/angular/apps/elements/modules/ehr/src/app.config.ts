import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { EhrApiClient } from './ehr/ehr-api.client';

/**
 * Island bootstrap config for <c>&lt;synergos-ehr&gt;</c> — the Healthcare vertical
 * as a real clinical dashboard (EHR-lite).
 *
 * Zoneless (signals-only) like every Synergos element. Unlike the transactional
 * verticals (Tienda / Booking), the EHR core is an **admin / practice-management
 * panel**, not a checkout flow — so it does not plug a fulfillment strategy into
 * the shared transaction engine. The appointment booking sub-flow (copago) is the
 * only transactional seam and reuses the engine when wired; the dashboard itself
 * is pure read/write CRUD over the clinical seams.
 *
 * A single shared <c>EhrApiClient</c> instance backs every view so the shell and
 * the patient chart read the same <c>degraded</c> flag.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), EhrApiClient],
};
