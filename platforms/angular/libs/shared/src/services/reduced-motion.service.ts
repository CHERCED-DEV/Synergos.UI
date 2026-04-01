import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ReducedMotionService implements OnDestroy {
  readonly #platformId = inject(PLATFORM_ID);
  readonly #mediaQuery = this.resolveMediaQuery();
  readonly #prefersReducedMotion = signal(this.#mediaQuery?.matches ?? false);

  readonly prefersReducedMotion = this.#prefersReducedMotion.asReadonly();

  constructor() {
    this.#mediaQuery?.addEventListener('change', this.onMediaQueryChange);
  }

  ngOnDestroy(): void {
    this.#mediaQuery?.removeEventListener('change', this.onMediaQueryChange);
  }

  getTransitionDuration(normalDuration: number): number {
    return this.prefersReducedMotion() ? 0 : normalDuration;
  }

  getAnimationClass(baseClass: string): string {
    return this.prefersReducedMotion() ? `${baseClass}--no-motion` : baseClass;
  }

  private resolveMediaQuery(): MediaQueryList | null {
    if (!isPlatformBrowser(this.#platformId) || typeof window.matchMedia !== 'function') {
      return null;
    }

    return window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  readonly onMediaQueryChange = (event: MediaQueryListEvent): void => {
    this.#prefersReducedMotion.set(event.matches);
  };
}
