import { Injectable, inject } from '@angular/core';
import { WindowService } from './window.service';

export interface NavigationUrlOptions {
  readonly hash?: string;
  readonly params?: Readonly<Record<string, boolean | number | string | null | undefined>>;
}

export interface NavigationRequest extends NavigationUrlOptions {
  readonly replace?: boolean;
  readonly state?: unknown;
  readonly target?: string;
}

@Injectable({ providedIn: 'root' })
export class NavigationService {
  readonly #window = inject(WindowService);

  currentUrl(): string {
    const windowRef = this.#window.getWindow();
    return windowRef?.location.href ?? '';
  }

  currentPath(): string {
    const windowRef = this.#window.getWindow();
    return windowRef?.location.pathname ?? '';
  }

  buildUrl(path: string, options: NavigationUrlOptions = {}): string {
    const windowRef = this.#window.getWindow();
    const baseUrl = windowRef?.location.href ?? 'https://synergos.local/';
    const url = new URL(path, baseUrl);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === null || value === undefined || value === '') {
          url.searchParams.delete(key);
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    if (options.hash) {
      url.hash = options.hash.startsWith('#') ? options.hash : `#${options.hash}`;
    }

    return windowRef ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  }

  navigate(path: string, request: NavigationRequest = {}): boolean {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return false;
    }

    const nextUrl = this.buildUrl(path, request);
    const target = request.target?.trim();

    if (target && target !== '_self') {
      windowRef.open(nextUrl, target, 'noopener,noreferrer');
      return true;
    }

    if (request.replace) {
      windowRef.location.replace(nextUrl);
      return true;
    }

    if (request.state !== undefined) {
      windowRef.history.pushState(request.state, '', nextUrl);
      return true;
    }

    windowRef.location.assign(nextUrl);
    return true;
  }

  replace(path: string, options: Omit<NavigationRequest, 'replace'> = {}): boolean {
    return this.navigate(path, {
      ...options,
      replace: true,
    });
  }

  back(): boolean {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return false;
    }

    windowRef.history.back();
    return true;
  }

  forward(): boolean {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return false;
    }

    windowRef.history.forward();
    return true;
  }

  reload(): boolean {
    const windowRef = this.#window.getWindow();
    if (!windowRef) {
      return false;
    }

    windowRef.location.reload();
    return true;
  }
}
