import { Injectable, inject } from '@angular/core';
import { LAYOUT_TEMPLATE_MAP } from '../core.tokens';

@Injectable({ providedIn: 'root' })
export class LayoutResolverService {
  readonly #layoutTemplateMap = inject(LAYOUT_TEMPLATE_MAP);

  resolve(template: string | null | undefined, fallback: string): string {
    if (!template) {
      return fallback;
    }

    return this.#layoutTemplateMap[template] ?? fallback;
  }
}
