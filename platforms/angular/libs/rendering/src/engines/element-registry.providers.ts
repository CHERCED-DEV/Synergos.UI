import {
  APP_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
  inject,
} from '@angular/core';
import { ElementRegistry } from './element-registry';

export interface RegistryEntry {
  /** CMS content type alias, e.g. "elementCompHero" */
  alias: string;
  /** Custom Element tag name, e.g. "synergos-hero" */
  tag: string;
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
            registry.register(entry.alias, { tag: entry.tag });
          }
        };
      },
      multi: true,
    },
  ]);
}
