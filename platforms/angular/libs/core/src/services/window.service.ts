import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';

type WindowRecord = Window & Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class WindowService {
  readonly #document = inject(DOCUMENT);
  readonly #platform = inject(PlatformService);

  getWindow(): Window | null {
    if (!this.#platform.isBrowser()) {
      return null;
    }

    return this.#document.defaultView;
  }

  hasProperty(key: string): boolean {
    const windowRef = this.getWindow();
    if (!windowRef) {
      return false;
    }

    return key in (windowRef as WindowRecord);
  }

  getProperty<T = unknown>(key: string): T | null {
    const windowRef = this.getWindow();
    if (!windowRef) {
      return null;
    }

    const windowRecord = windowRef as WindowRecord;
    if (!(key in windowRecord)) {
      return null;
    }

    return windowRecord[key] as T;
  }

  setProperty(key: string, value: unknown): boolean {
    const windowRef = this.getWindow();
    if (!windowRef) {
      return false;
    }

    Reflect.set(windowRef as WindowRecord, key, value);
    return true;
  }

  deleteProperty(key: string): boolean {
    const windowRef = this.getWindow();
    if (!windowRef) {
      return false;
    }

    return delete (windowRef as WindowRecord)[key];
  }
}
