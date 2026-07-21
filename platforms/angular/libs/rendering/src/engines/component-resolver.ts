import { inject, Injectable } from '@angular/core';
import type {
  ComponentResolutionFailure,
  ComponentResolutionResult,
  ResolutionErrorCode,
} from '@synergos/contracts';
import { LoggerService } from '@synergos/core';
import { ElementRegistry } from './element-registry';

@Injectable({ providedIn: 'root' })
export class ComponentResolver {
  readonly #registry = inject(ElementRegistry);
  readonly #logger = inject(LoggerService);

  resolve(contentTypeAlias: string): string | null {
    const result = this.resolveDefinition(contentTypeAlias);
    if (!result.ok) {
      this.#logger.warn(`[ComponentResolver] ${result.error.message}`);
      return null;
    }

    return result.definition.tag;
  }

  resolveDefinition(contentTypeAlias: string): ComponentResolutionResult {
    const selector = contentTypeAlias.trim();
    if (!selector) {
      return this.#failure(
        'invalid_selector',
        contentTypeAlias,
        'Component selector is empty.',
      );
    }

    const lookup = this.#registry.lookup(selector);
    if (!lookup.definition) {
      return this.#failure(
        'selector_not_found',
        selector,
        `No component is registered for selector "${selector}".`,
        {
          attemptedKeys: lookup.attemptedKeys,
          registeredCount: this.#registry.entries().length,
        },
      );
    }

    return {
      ok: true,
      selector,
      definition: lookup.definition,
    };
  }

  #failure(
    code: ResolutionErrorCode,
    selector: string,
    message: string,
    details?: Record<string, unknown>,
  ): ComponentResolutionFailure {
    return {
      ok: false,
      selector,
      error: {
        code,
        selector,
        message,
        details,
      },
    };
  }
}
