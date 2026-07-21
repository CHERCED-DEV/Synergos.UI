import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { WindowService } from './window.service';

export interface VisualViewportSnapshot {
  readonly supported: boolean;
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly pageLeft: number;
  readonly pageTop: number;
  readonly scale: number;
}

@Injectable({ providedIn: 'root' })
export class VisualViewportService {
  readonly #destroyRef = inject(DestroyRef);
  readonly #window = inject(WindowService);
  readonly #snapshot = signal<VisualViewportSnapshot>(this.captureSnapshot());

  readonly snapshot = this.#snapshot.asReadonly();
  readonly supported = computed(() => this.#snapshot().supported);
  readonly width = computed(() => this.#snapshot().width);
  readonly height = computed(() => this.#snapshot().height);
  readonly scale = computed(() => this.#snapshot().scale);

  constructor() {
    const visualViewport = this.getVisualViewport();
    if (!visualViewport) {
      return;
    }

    visualViewport.addEventListener('resize', this.onViewportChange);
    visualViewport.addEventListener('scroll', this.onViewportChange);

    this.#destroyRef.onDestroy(() => {
      visualViewport.removeEventListener('resize', this.onViewportChange);
      visualViewport.removeEventListener('scroll', this.onViewportChange);
    });
  }

  refresh(): void {
    this.#snapshot.set(this.captureSnapshot());
  }

  getVisualViewport(): VisualViewport | null {
    return this.#window.getWindow()?.visualViewport ?? null;
  }

  private captureSnapshot(): VisualViewportSnapshot {
    const visualViewport = this.getVisualViewport();
    if (!visualViewport) {
      return {
        supported: false,
        width: 0,
        height: 0,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
      };
    }

    return {
      supported: true,
      width: visualViewport.width,
      height: visualViewport.height,
      offsetLeft: visualViewport.offsetLeft,
      offsetTop: visualViewport.offsetTop,
      pageLeft: visualViewport.pageLeft,
      pageTop: visualViewport.pageTop,
      scale: visualViewport.scale,
    };
  }

  readonly onViewportChange = (): void => {
    this.refresh();
  };
}
