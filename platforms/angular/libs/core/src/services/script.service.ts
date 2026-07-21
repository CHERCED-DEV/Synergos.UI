import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, RendererFactory2, inject } from '@angular/core';

export interface ScriptAttribute {
  readonly name: string;
  readonly value: string;
}

export interface ScriptDefinition {
  readonly id?: string;
  readonly src?: string;
  readonly body?: string;
  readonly defer?: boolean;
  readonly async?: boolean;
  readonly target?: 'head' | 'body';
  readonly attributes?: readonly ScriptAttribute[];
}

@Injectable({ providedIn: 'root' })
export class ScriptService {
  readonly #document = inject(DOCUMENT);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #renderer = inject(RendererFactory2).createRenderer(null, null);

  addScript(definition: ScriptDefinition): HTMLScriptElement | null {
    if (!isPlatformBrowser(this.#platformId)) {
      return null;
    }

    const target = definition.target === 'body' ? this.#document.body : this.#document.head;
    const existingScript = this.findExistingScript(definition);
    if (existingScript) {
      return existingScript;
    }

    const script = this.#renderer.createElement('script') as HTMLScriptElement;
    script.defer = definition.defer ?? true;
    script.async = definition.async ?? false;
    script.type = 'text/javascript';

    if (definition.id) {
      script.id = definition.id;
    }

    if (definition.src) {
      script.src = definition.src;
    }

    if (definition.body) {
      script.text = definition.body;
    }

    definition.attributes?.forEach((attribute) => {
      script.setAttribute(attribute.name, attribute.value);
    });

    this.#renderer.appendChild(target, script);
    return script;
  }

  private findExistingScript(definition: ScriptDefinition): HTMLScriptElement | null {
    if (definition.id) {
      const byId = this.#document.getElementById(definition.id);
      if (byId instanceof HTMLScriptElement) {
        return byId;
      }
    }

    if (definition.src) {
      const selector = `script[src="${definition.src}"]`;
      const bySource = this.#document.querySelector(selector);
      if (bySource instanceof HTMLScriptElement) {
        return bySource;
      }
    }

    return null;
  }
}
