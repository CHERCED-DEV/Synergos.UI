import { inject, Injectable } from '@angular/core';
import { LoggerService } from '@synergos/core';

@Injectable({ providedIn: 'root' })
export class InputMapper {
  readonly #logger = inject(LoggerService);

  applyInputs(element: HTMLElement, inputs: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(inputs)) {
      const attrName = this.#toAttributeName(key);
      if (!attrName) {
        this.#logger.warn(`[InputMapper] Skipping invalid input key "${key}".`);
        continue;
      }

      const serializedValue = this.#serializeAttributeValue(value);
      if (serializedValue === null) {
        continue;
      }

      element.setAttribute(attrName, serializedValue);
    }
  }

  #toAttributeName(str: string): string | null {
    const normalized = str
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();

    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(normalized) ? normalized : null;
  }

  #serializeAttributeValue(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    try {
      return JSON.stringify(value);
    } catch {
      this.#logger.warn('[InputMapper] Failed to serialize input value. Skipping attribute.');
      return null;
    }
  }
}
