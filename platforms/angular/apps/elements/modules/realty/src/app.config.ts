import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { RealtyApiClient } from './realty/realty-api.client';

/**
 * Island bootstrap config for <c>&lt;synergos-realty&gt;</c> — the Propiedades vertical
 * as a real estate marketplace portal (search + map · PDP · mortgage · visit · lead).
 *
 * Zoneless (signals-only) like every Synergos element. The transaction central of
 * this domain is **scheduling a visit + capturing a lead — NOT a payment**
 * (propiedades-app-spec §1, §4): the visit is a reservable agent slot and the lead
 * is the degenerate "confirm without slot". So the portal does NOT plug a
 * fulfillment strategy into the shared transaction engine — it persists intent via
 * the clinical-style <c>RealtyApiClient</c> (optimistic POST + visible mock
 * fallback). The mortgage calculator is pure, deterministic client-side math.
 *
 * A single shared <c>RealtyApiClient</c> instance backs every view so the shell and
 * the PDP read the same <c>degraded</c> flag.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), RealtyApiClient],
};
