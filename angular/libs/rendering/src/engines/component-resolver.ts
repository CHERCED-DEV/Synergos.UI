import { inject, Injectable } from '@angular/core';
import { LoggerService } from '@synergos/core';
import { ElementRegistry } from './element-registry';

@Injectable({ providedIn: 'root' })
export class ComponentResolver {
  readonly #registry = inject(ElementRegistry);
  readonly #logger = inject(LoggerService);

  resolve(contentTypeAlias: string): string | null {
    const registration = this.#registry.resolve(contentTypeAlias);
    if (!registration) {
      this.#logger.warn(`[ComponentResolver] No element registered for: ${contentTypeAlias}`);
      return null;
    }
    return registration.tag;
  }
}
