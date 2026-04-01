import { inject, Injectable } from '@angular/core';
import type { BlockConfig } from '@synergos/contracts';
import { LoggerService } from '@synergos/core';
import { mapBlockToElement } from '../../../../../../vitals/core/src/mappers/block.mapper';
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

  mountBlock(container: HTMLElement, block: BlockConfig): HTMLElement | null {
    const mapped = mapBlockToElement(block);
    if (!mapped) {
      this.#logger.warn(`[ElementMounter] No mapper for: ${block.type}`);
      return null;
    }

    const element = document.createElement(mapped.tag);
    this.#mapper.applyInputs(element, mapped.inputs);
    if (mapped.blockClass) {
      mapped.blockClass.split(/\s+/).filter(Boolean).forEach(cls => element.classList.add(cls));
    }
    container.appendChild(element);
    this.#logger.debug(`[ElementMounter] Mounted <${mapped.tag}> into`, container);
    return element;
  }

  unmount(container: HTMLElement): void {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }
}
