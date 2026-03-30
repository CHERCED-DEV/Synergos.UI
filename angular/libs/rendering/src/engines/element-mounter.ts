import { inject, Injectable } from '@angular/core';
import { LoggerService } from '@synergos/core';
import { ComponentResolver } from './component-resolver';
import { InputMapper } from './input-mapper';

@Injectable({ providedIn: 'root' })
export class ElementMounter {
  readonly #resolver = inject(ComponentResolver);
  readonly #mapper = inject(InputMapper);
  readonly #logger = inject(LoggerService);

  mount(container: HTMLElement, contentTypeAlias: string, inputs: Record<string, string>): HTMLElement | null {
    const tag = this.#resolver.resolve(contentTypeAlias);
    if (!tag) {
      return null;
    }

    const element = document.createElement(tag);
    this.#mapper.applyInputs(element, inputs);
    container.appendChild(element);
    this.#logger.debug(`[ElementMounter] Mounted <${tag}> into`, container);
    return element;
  }

  unmount(container: HTMLElement): void {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }
}
