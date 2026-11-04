import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { BlogsFulfillmentStrategy } from './blogs/blogs-fulfillment.strategy';

/**
 * Island bootstrap config for <c>&lt;synergos-blogs&gt;</c> — the Blogs vertical **v2**
 * as a real **social network** SPA (feed · thread · profile · explore SH-1 · DMs
 * SH-7 · notificaciones · guardados SH-4 · creator studio SH-5 · long-form · tip/
 * suscripción SH-3), OLA 6.
 *
 * Zoneless (signals-only) like every Synergos element. Unlike the fully
 * transactional verticals, the **social core does NOT touch the engine**
 * (reacciones/comentarios/follow son puro cliente + API). The shared
 * <c>@synergos/transaction-engine</c> is wired **only for the monetizable edge**:
 * the <c>BlogsFulfillmentStrategy</c> owns the `blogs` flow so the SH-3 checkout
 * wizard can run the `select→pay→confirm` de una suscripción/tip (PSP stubbed,
 * decisión D4). The module never branches on "tier/tip"; it asks the
 * <c>FulfillmentContext</c>, which routes by `flow === 'blogs'`.
 *
 * Los adaptadores de `@synergos/dominio/blogs` comparten un solo `BordeDeBlogs` (de la app entera, `providedIn:
 * 'root'`), así el aviso de «datos de ejemplo» se lee igual en toda la red (012-blogs-social, I2). La fachada, en
 * cambio, es de cada elemento: la provee el propio `<sg-blogs>`.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    { provide: FULFILLMENT_STRATEGIES, useClass: BlogsFulfillmentStrategy, multi: true },
  ],
};
