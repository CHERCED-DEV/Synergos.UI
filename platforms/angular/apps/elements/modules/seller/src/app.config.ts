import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { SellerApiClient } from './seller/seller-api.client';

/**
 * Island bootstrap config for <c>&lt;synergos-seller&gt;</c>.
 *
 * Zoneless (signals-only) like every Synergos element. The seller console
 * reads/writes the shop API through one shared <c>SellerApiClient</c> instance
 * (all views observe the same `degraded` flag). It never mounts the buyer cart:
 * the only engine dependency is the SH-6 wizard's own draft `SessionStore`,
 * which the shell provides at component level.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), SellerApiClient],
};
