import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { GovApiClient } from './gov/gov-api.client';

/**
 * Island bootstrap config for <c>&lt;synergos-gov&gt;</c> — the Gobierno/Trámites
 * vertical as a citizen-services portal (GOV.UK + GOV.CO/SUIT-style): catálogo de
 * trámites → ficha en lenguaje claro → radicación (wizard data-driven + documentos
 * + check-answers + tasa opcional) → radicado + QR → mi carpeta / seguimiento, con
 * la cara de funcionario (bandeja + expediente + transiciones legales) tras el
 * role-switch de demo.
 *
 * Zoneless (signals-only) like every Synergos element. The transactional object of
 * this domain is a **long-lived case file (expediente) with an audited state
 * machine** (gobierno-app-spec §1) — not an order that confirms and closes. The fee
 * payment is optional (free trámites skip the payment step entirely). Persistence
 * goes through the thin <c>GovApiClient</c> (optimistic POST + visible mock
 * fallback) so the whole lifecycle demos end-to-end before the backend lands.
 *
 * A single shared <c>GovApiClient</c> instance backs both faces (citizen/officer)
 * so the folder, queue and case views read the same seeded case store and the same
 * <c>degraded</c> flag.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), GovApiClient],
};
