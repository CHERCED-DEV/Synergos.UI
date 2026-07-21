import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { VIEWPORT_BREAKPOINTS } from '../core.tokens';
import { WindowService } from './window.service';

export type ViewportOrientation = 'portrait' | 'landscape';

export interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly layout: string;
  readonly orientation: ViewportOrientation;
}

@Injectable({ providedIn: 'root' })
export class ViewportService {
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
  readonly #viewportBreakpoints = inject(VIEWPORT_BREAKPOINTS);
  readonly #window = inject(WindowService);
  readonly #snapshot = signal<ViewportSnapshot>(this.captureSnapshot());

  readonly snapshot = this.#snapshot.asReadonly();
  readonly width = computed(() => this.#snapshot().width);
  readonly height = computed(() => this.#snapshot().height);
  readonly layout = computed(() => this.#snapshot().layout);
  readonly orientation = computed(() => this.#snapshot().orientation);

  constructor() {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return;
    }

    this.syncCssVariables();
    windowRef.addEventListener('resize', this.onViewportChange, { passive: true });
    windowRef.addEventListener('orientationchange', this.onViewportChange, { passive: true });

    this.#destroyRef.onDestroy(() => {
      windowRef.removeEventListener('resize', this.onViewportChange);
      windowRef.removeEventListener('orientationchange', this.onViewportChange);
    });
  }

  refresh(): void {
    const nextSnapshot = this.captureSnapshot();
    this.#snapshot.set(nextSnapshot);
    this.syncCssVariables(nextSnapshot);
  }

  syncCssVariables(snapshot: ViewportSnapshot = this.#snapshot()): void {
    if (!this.#window.getWindow()) {
      return;
    }

    const rootElement = this.#document.documentElement;
    rootElement.style.setProperty('--vw', `${snapshot.width}px`);
    rootElement.style.setProperty('--vh', `${snapshot.height * 0.01}px`);
  }

  getCssBreakpoint(variableName: string, fallback = 768): number {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return fallback;
    }

    const rawValue = windowRef.getComputedStyle(this.#document.documentElement).getPropertyValue(variableName).trim();
    const parsedValue = Number.parseFloat(rawValue.replace('px', ''));

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }

  private captureSnapshot(): ViewportSnapshot {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return {
        width: 0,
        height: 0,
        layout: this.resolveLayout(0),
        orientation: 'portrait',
      };
    }

    const width = windowRef.innerWidth;
    const height = windowRef.innerHeight;

    return {
      width,
      height,
      layout: this.resolveLayout(width),
      orientation: width >= height ? 'landscape' : 'portrait',
    };
  }

  private resolveLayout(width: number): string {
    const sortedBreakpoints = [...this.#viewportBreakpoints].sort((left, right) => left.minWidth - right.minWidth);
    let layout = sortedBreakpoints[0]?.name ?? 'xs';

    for (const breakpoint of sortedBreakpoints) {
      if (width >= breakpoint.minWidth) {
        layout = breakpoint.name;
      }
    }

    return layout;
  }

  readonly onViewportChange = (): void => {
    this.refresh();
  };
}
