import {
  APP_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
  inject,
} from '@angular/core';
import type { ComponentTier, FrameworkKind, RegistrySource } from '@synergos/contracts';
import { ElementRegistry } from './element-registry';

export interface RegistryEntry {
  /** Stable element name from the registry catalog, e.g. "hero" or "product-card". */
  name?: string;
  /** CMS content type alias, e.g. "elementCompHero" */
  alias: string;
  /** Custom Element tag name, e.g. "synergos-hero" */
  tag: string;
  /** Optional component tier for diagnostics and routing. */
  tier?: ComponentTier;
  /** Optional framework owner of this runtime registration. */
  framework?: FrameworkKind;
  /** Optional registry source metadata for diagnostics. */
  source?: RegistrySource;
}

/**
 * Seeds the ElementRegistry with the provided entries at application startup.
 *
 * Usage in app.config.ts:
 *
 * ```typescript
 * import elementRegistry from '../../../../../../vitals/contracts/src/element-registry.json';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideZonelessChangeDetection(),
 *     provideElementRegistry(elementRegistry),
 *   ],
 * };
 * ```
 */
export function provideElementRegistry(entries: RegistryEntry[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const registry = inject(ElementRegistry);
        return () => {
          for (const entry of entries) {
            registry.register(entry.alias, {
              name: entry.name,
              tag: entry.tag,
              tier: entry.tier,
              framework: entry.framework ?? 'angular',
              source: entry.source ?? 'static-json',
            });
          }
        };
      },
      multi: true,
    },
  ]);
}
