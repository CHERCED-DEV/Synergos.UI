import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { PLATFORM_ID, computed, inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly #platformId = inject(PLATFORM_ID);

  readonly isBrowser = computed(() => isPlatformBrowser(this.#platformId));
  readonly isServer = computed(() => isPlatformServer(this.#platformId));

  runInBrowser<T>(callback: () => T, fallback?: T): T | undefined {
    if (!this.isBrowser()) {
      return fallback;
    }

    return callback();
  }
}
