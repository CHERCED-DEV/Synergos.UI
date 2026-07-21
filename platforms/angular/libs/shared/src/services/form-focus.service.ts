import { Injectable, inject } from '@angular/core';
import { FocusManagerService } from './focus-manager.service';

const INVALID_FIELD_SELECTORS = ['[aria-invalid="true"]', '.ng-invalid', '[data-invalid="true"]'].join(
  ', ',
);

@Injectable({ providedIn: 'root' })
export class FormFocusService {
  readonly #focusManager = inject(FocusManagerService);

  getInvalidFields(container: HTMLElement | null | undefined): HTMLElement[] {
    if (!container) {
      return [];
    }

    return Array.from(container.querySelectorAll<HTMLElement>(INVALID_FIELD_SELECTORS));
  }

  focusFirstInvalid(container: HTMLElement | null | undefined): HTMLElement | null {
    const invalidFields = this.getInvalidFields(container);

    for (const field of invalidFields) {
      if (this.#focusManager.isFocusableElement(field)) {
        this.#focusManager.focus(field);
        return field;
      }

      const [focusableDescendant] = this.#focusManager.getFocusableElements(field);
      if (focusableDescendant) {
        this.#focusManager.focus(focusableDescendant);
        return focusableDescendant;
      }
    }

    return null;
  }

  focusFirstInvalidIn(
    containers: readonly (HTMLElement | null | undefined)[],
  ): HTMLElement | null {
    const sortedContainers = containers
      .filter((container): container is HTMLElement => !!container)
      .sort((left, right) => {
        if (left === right) {
          return 0;
        }

        return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

    for (const container of sortedContainers) {
      const focusedField = this.focusFirstInvalid(container);
      if (focusedField) {
        return focusedField;
      }
    }

    return null;
  }
}
