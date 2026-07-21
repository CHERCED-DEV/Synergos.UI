import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { ELEMENT_REGISTRY_TOKEN } from '../core.tokens';

export interface CustomElementMountConfig {
  readonly component?: string;
  readonly tagName?: string;
  readonly props?: Record<string, unknown>;
  readonly textContent?: string;
}

type ElementRecord = HTMLElement & Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class CustomElementHostService {
  readonly #document  = inject(DOCUMENT);
  readonly #registry  = inject(ELEMENT_REGISTRY_TOKEN);

  mount(container: HTMLElement, config: CustomElementMountConfig): HTMLElement | null {
    const tagName = this.resolveTagName(config);
    if (!tagName) {
      return null;
    }

    this.unmount(container);

    const element = this.#document.createElement(tagName) as ElementRecord;
    this.applyProps(element, config.props ?? {});

    if (config.textContent) {
      element.textContent = config.textContent;
    }

    container.appendChild(element);
    return element;
  }

  unmount(container: HTMLElement): void {
    container.replaceChildren();
  }

  private applyProps(element: ElementRecord, props: Record<string, unknown>): void {
    Object.entries(props).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      Reflect.set(element, key, value);

      const attributeName = this.toAttributeName(key);
      if (typeof value === 'string') {
        element.setAttribute(attributeName, value);
        return;
      }

      if (typeof value === 'number') {
        element.setAttribute(attributeName, `${value}`);
        return;
      }

      if (typeof value === 'boolean') {
        if (value) {
          element.setAttribute(attributeName, 'true');
        } else {
          element.removeAttribute(attributeName);
        }
      }
    });
  }

  private toAttributeName(value: string): string {
    return value.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  private resolveTagName(config: CustomElementMountConfig): string {
    const directTagName = config.tagName?.trim() ?? '';
    if (directTagName) {
      return directTagName;
    }

    const component = config.component?.trim() ?? '';
    if (!component) {
      return '';
    }

    if (component.includes('-')) {
      return component;
    }

    const entry = this.#registry.find((candidate) =>
      candidate.alias === component || candidate.name === component,
    );

    return entry?.tag ?? component;
  }
}
