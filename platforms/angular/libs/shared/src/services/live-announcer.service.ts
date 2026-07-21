import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

type LivePoliteness = 'polite' | 'assertive';

@Injectable({ providedIn: 'root' })
export class LiveAnnouncerService {
  readonly #document = inject(DOCUMENT);
  readonly #platformId = inject(PLATFORM_ID);

  #announceTimer: ReturnType<typeof setTimeout> | null = null;
  #clearTimer: ReturnType<typeof setTimeout> | null = null;
  #liveRegion: HTMLElement | null = null;

  announce(message: string, politeness: LivePoliteness = 'polite', duration = 3000): void {
    if (!isPlatformBrowser(this.#platformId)) {
      return;
    }

    this.ensureLiveRegion(politeness);
    this.clearTimers();

    if (!this.#liveRegion) {
      return;
    }

    this.#liveRegion.textContent = '';

    this.#announceTimer = setTimeout(() => {
      if (this.#liveRegion) {
        this.#liveRegion.textContent = message;
      }
    }, 100);

    this.#clearTimer = setTimeout(() => {
      if (this.#liveRegion) {
        this.#liveRegion.textContent = '';
      }
    }, duration);
  }

  clear(): void {
    this.clearTimers();

    if (this.#liveRegion) {
      this.#liveRegion.textContent = '';
    }
  }

  private ensureLiveRegion(politeness: LivePoliteness): void {
    if (this.#liveRegion?.getAttribute('aria-live') !== politeness) {
      this.#liveRegion?.remove();
      this.#liveRegion = null;
    }

    if (this.#liveRegion) {
      return;
    }

    const region = this.#document.createElement('div');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', 'status');
    region.setAttribute('data-syn-live-announcer', 'true');
    region.style.cssText = [
      'position:absolute',
      'width:1px',
      'height:1px',
      'padding:0',
      'margin:-1px',
      'overflow:hidden',
      'clip:rect(0, 0, 0, 0)',
      'white-space:nowrap',
      'border:0',
    ].join(';');

    this.#document.body.appendChild(region);
    this.#liveRegion = region;
  }

  private clearTimers(): void {
    if (this.#announceTimer) {
      clearTimeout(this.#announceTimer);
      this.#announceTimer = null;
    }

    if (this.#clearTimer) {
      clearTimeout(this.#clearTimer);
      this.#clearTimer = null;
    }
  }
}
