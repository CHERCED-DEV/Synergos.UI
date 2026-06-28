import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { BlogsApiClient } from './blogs/blogs-api.client';

/**
 * Island bootstrap config for <c>&lt;synergos-blogs&gt;</c> — the Blogs vertical as a
 * real **social network** app (feed · composer · thread · profile · notifications ·
 * search), OLA 3.
 *
 * Zoneless (signals-only) like every Synergos element. Unlike the transactional
 * verticals (storefront / travel-shell) Blogs does NOT wire the shared
 * <c>@synergos/transaction-engine</c>: a social network has no select→pay→confirm
 * core. The engine stays *available but unwired*, reserved for the monetizable
 * extension (creator subscription / tip / boost) per the app-spec §4/§8.
 *
 * A single shared <c>BlogsApiClient</c> instance backs every store so the
 * <c>degraded</c> flag (mock fallback) is read consistently across the shell.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), BlogsApiClient],
};
