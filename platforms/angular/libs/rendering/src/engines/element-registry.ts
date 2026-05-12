import { inject, Injectable, signal } from '@angular/core';
import type {
  ComponentTag,
  ComponentTier,
  FrameworkKind,
  RegistrySource,
  RuntimeComponentDefinition,
} from '@synergos/contracts';
import { LoggerService } from '@synergos/core';

export interface ElementRegistration {
  name?: string;
  tag: string;
  tier?: ComponentTier;
  framework?: FrameworkKind;
  source?: RegistrySource;
}

export interface RegistryLookupResult {
  readonly definition?: RuntimeComponentDefinition;
  readonly attemptedKeys: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class ElementRegistry {
  readonly #registry = signal(new Map<string, RuntimeComponentDefinition>());
  readonly #logger = inject(LoggerService);

  register(type: string, registration: ElementRegistration): void {
    const selector = this.#normalizeSelector(type);
    if (!selector) {
      this.#logger.error('[ElementRegistry] Cannot register an empty selector.');
      return;
    }

    const tag = this.#normalizeTag(registration.tag);
    if (!tag) {
      this.#logger.error(
        `[ElementRegistry] Invalid custom element tag "${registration.tag}" for selector "${selector}".`,
      );
      return;
    }

    const current = new Map(this.#registry());
    const previous = current.get(selector);
    if (previous && previous.tag !== tag) {
      this.#logger.warn(
        `[ElementRegistry] Selector "${selector}" was already registered as <${previous.tag}>. Replacing with <${tag}>.`,
      );
    }

    const definition: RuntimeComponentDefinition = {
      selector,
      alias: selector,
      name: registration.name,
      tag,
      framework: registration.framework ?? 'angular',
      source: registration.source ?? 'runtime-bootstrap',
      tier: registration.tier,
    };

    current.set(selector, definition);
    this.#registry.set(current);
  }

  resolve(type: string): RuntimeComponentDefinition | undefined {
    return this.lookup(type).definition;
  }

  lookup(type: string): RegistryLookupResult {
    const current = this.#registry();
    const attemptedKeys = this.#candidateKeys(type);

    for (const key of attemptedKeys) {
      const direct = current.get(key);
      if (direct) {
        return { definition: direct, attemptedKeys };
      }
    }

    for (const definition of current.values()) {
      if (attemptedKeys.includes(definition.tag)) {
        return { definition, attemptedKeys };
      }

      if (definition.name && attemptedKeys.includes(definition.name)) {
        return { definition, attemptedKeys };
      }
    }

    return { attemptedKeys };
  }

  entries(): readonly RuntimeComponentDefinition[] {
    return [...this.#registry().values()];
  }

  #normalizeSelector(type: string): string | null {
    const normalized = type.trim();
    return normalized.length > 0 ? normalized : null;
  }

  #normalizeTag(tag: string): ComponentTag | null {
    const normalized = tag.trim().toLowerCase();
    const isValidCustomElementName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u.test(normalized);
    return isValidCustomElementName ? (normalized as ComponentTag) : null;
  }

  #candidateKeys(type: string): readonly string[] {
    const normalized = type.trim();
    if (!normalized) {
      return [];
    }

    const compact = normalized.replace(/\s+/g, '');
    const kebab = compact
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();

    return [...new Set([normalized, compact, kebab])];
  }
}
