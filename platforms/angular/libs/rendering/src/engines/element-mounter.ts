import { inject, Injectable } from '@angular/core';
import type { BlockConfig, ResolutionError } from '@synergos/contracts';
import { LoggerService } from '@synergos/core';
import { mapBlockToElementResult, type BlockMappingResult } from '@synergos/vitals-core';
import { ComponentResolver } from './component-resolver';
import { InputMapper } from './input-mapper';

export interface ElementMountSuccess {
  ok: true;
  element: HTMLElement;
  tag: string;
}

export interface ElementMountFailure {
  ok: false;
  error: ResolutionError;
}

export type ElementMountResult = ElementMountSuccess | ElementMountFailure;

@Injectable({ providedIn: 'root' })
export class ElementMounter {
  readonly #resolver = inject(ComponentResolver);
  readonly #mapper = inject(InputMapper);
  readonly #logger = inject(LoggerService);

  mount(container: HTMLElement, contentTypeAlias: string, inputs: Record<string, string>): HTMLElement | null {
    const result = this.mountWithResult(container, contentTypeAlias, inputs);
    return result.ok ? result.element : null;
  }

  mountWithResult(
    container: HTMLElement,
    contentTypeAlias: string,
    inputs: Record<string, string>,
  ): ElementMountResult {
    const resolution = this.#resolver.resolveDefinition(contentTypeAlias);
    if (!resolution.ok) {
      this.#logger.warn(`[ElementMounter] ${resolution.error.message}`);
      return { ok: false, error: resolution.error };
    }

    const tag = resolution.definition.tag;
    const element = document.createElement(tag);
    this.#mapper.applyInputs(element, inputs);
    container.appendChild(element);
    this.#logger.debug(`[ElementMounter] Mounted <${tag}> into`, container);

    return {
      ok: true,
      element,
      tag,
    };
  }

  mountBlock(container: HTMLElement, block: BlockConfig): HTMLElement | null {
    const result = this.mountBlockWithResult(container, block);
    return result.ok ? result.element : null;
  }

  mountBlockWithResult(container: HTMLElement, block: BlockConfig): ElementMountResult {
    const mapped = mapBlockToElementResult(block);
    if (!mapped.ok) {
      const error = this.#toResolutionError(mapped);
      this.#logger.warn(`[ElementMounter] ${error.message}`);
      return {
        ok: false,
        error,
      };
    }

    const element = document.createElement(mapped.value.tag);
    this.#mapper.applyInputs(element, mapped.value.inputs);
    if (mapped.value.blockClass) {
      mapped.value.blockClass.split(/\s+/).filter(Boolean).forEach((cls) => element.classList.add(cls));
    }
    container.appendChild(element);
    this.#logger.debug(`[ElementMounter] Mounted <${mapped.value.tag}> into`, container);

    return {
      ok: true,
      element,
      tag: mapped.value.tag,
    };
  }

  unmount(container: HTMLElement): void {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  #toResolutionError(mapped: BlockMappingResult): ResolutionError {
    if (mapped.ok) {
      return {
        code: 'component_not_registered',
        selector: '',
        message: 'Unexpected block mapping success in error conversion.',
      };
    }

    return {
      code: 'component_not_registered',
      selector: mapped.error.blockType,
      message: mapped.error.message,
      details: {
        code: mapped.error.code,
      },
    };
  }
}
