import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InputMapper {
  applyInputs(element: HTMLElement, inputs: Record<string, string>): void {
    for (const [key, value] of Object.entries(inputs)) {
      const attrName = this.#toKebabCase(key);
      element.setAttribute(attrName, value);
    }
  }

  #toKebabCase(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
}
