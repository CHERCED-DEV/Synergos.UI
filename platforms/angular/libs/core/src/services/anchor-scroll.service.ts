import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { WindowService } from './window.service';

export interface AnchorScrollOptions {
  readonly behavior?: ScrollBehavior;
  readonly offsetTop?: number;
}

export interface AnchorBindingOptions extends AnchorScrollOptions {
  readonly root?: ParentNode;
  readonly selector?: string;
}

@Injectable({ providedIn: 'root' })
export class AnchorScrollService {
  readonly #document = inject(DOCUMENT);
  readonly #window = inject(WindowService);

  scrollToPosition(top: number, options: { readonly behavior?: ScrollBehavior; readonly left?: number } = {}): boolean {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return false;
    }

    windowRef.scrollTo({
      top,
      left: options.left ?? 0,
      behavior: options.behavior ?? 'smooth',
    });
    return true;
  }

  scrollToFragment(fragment: string, options: AnchorScrollOptions = {}): boolean {
    const targetId = fragment.replace(/^#/, '').trim();
    if (!targetId) {
      return false;
    }

    const element = this.#document.getElementById(targetId);
    if (!element) {
      return false;
    }

    return this.scrollToElement(element, options);
  }

  scrollToElement(target: string | HTMLElement, options: AnchorScrollOptions = {}): boolean {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return false;
    }

    const element = typeof target === 'string' ? this.resolveElement(target) : target;
    if (!element) {
      return false;
    }

    const top = element.getBoundingClientRect().top + windowRef.scrollY - (options.offsetTop ?? 0);
    return this.scrollToPosition(top, { behavior: options.behavior });
  }

  bindAnchors(options: AnchorBindingOptions = {}): () => void {
    const root = options.root ?? this.#document;
    const selector = options.selector ?? 'a[href*="#"]';
    const anchorElements = Array.from(root.querySelectorAll(selector)).filter(
      (element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement,
    );

    const listeners = anchorElements.map((anchorElement) => {
      const listener = (event: Event): void => {
        const fragment = this.extractFragment(anchorElement.getAttribute('href'));
        if (!fragment) {
          return;
        }

        event.preventDefault();
        this.scrollToFragment(fragment, options);
      };

      anchorElement.addEventListener('click', listener);
      return { anchorElement, listener };
    });

    return () => {
      for (const { anchorElement, listener } of listeners) {
        anchorElement.removeEventListener('click', listener);
      }
    };
  }

  private resolveElement(selectorOrFragment: string): HTMLElement | null {
    if (selectorOrFragment.startsWith('#')) {
      return this.#document.getElementById(selectorOrFragment.slice(1));
    }

    return this.#document.querySelector<HTMLElement>(selectorOrFragment);
  }

  private extractFragment(href: string | null): string {
    if (!href) {
      return '';
    }

    const hashIndex = href.indexOf('#');
    if (hashIndex < 0) {
      return '';
    }

    return decodeURIComponent(href.slice(hashIndex + 1));
  }
}
