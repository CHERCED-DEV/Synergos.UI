import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

@Injectable({ providedIn: 'root' })
export class FocusManagerService {
  readonly #document = inject(DOCUMENT);

  focus(element: HTMLElement | null | undefined): void {
    element?.focus();
  }

  focusById(id: string, delayMs = 0): void {
    setTimeout(() => {
      const element = this.#document.getElementById(id);
      if (element instanceof HTMLElement) {
        element.focus();
      }
    }, delayMs);
  }

  focusFirst(container: HTMLElement | null | undefined): boolean {
    const [firstFocusable] = this.getFocusableElements(container);
    if (!firstFocusable) {
      return false;
    }

    firstFocusable.focus();
    return true;
  }

  getFocusableElements(container: HTMLElement | null | undefined): HTMLElement[] {
    if (!container) {
      return [];
    }

    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter((element) =>
      this.isFocusableElement(element),
    );
  }

  isFocusableElement(element: Element | null | undefined): element is HTMLElement {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.matches('[hidden], [disabled], [aria-hidden="true"]')) {
      return false;
    }

    const styles = getComputedStyle(element);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  }

  contains(container: HTMLElement | null | undefined, target: EventTarget | null): boolean {
    return target instanceof Node && !!container?.contains(target);
  }

  isFocusWithin(container: HTMLElement | null | undefined): boolean {
    return this.contains(container, this.#document.activeElement);
  }
}
