import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';

export interface CookieStoreOptions {
  readonly domain?: string;
  readonly expires?: Date;
  readonly maxAge?: number;
  readonly path?: string;
  readonly sameSite?: 'Lax' | 'None' | 'Strict';
  readonly secure?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CookieStoreService {
  readonly #document = inject(DOCUMENT);
  readonly #platform = inject(PlatformService);

  all(): Readonly<Record<string, string>> {
    if (!this.#platform.isBrowser()) {
      return {};
    }

    const cookieEntries = this.#document.cookie
      .split(';')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return cookieEntries.reduce<Record<string, string>>((accumulator, entry) => {
      const [rawName, ...rawValueParts] = entry.split('=');
      const value = rawValueParts.join('=');

      accumulator[this.decode(rawName)] = this.decode(value);
      return accumulator;
    }, {});
  }

  get(name: string): string | null {
    return this.all()[name] ?? null;
  }

  has(name: string): boolean {
    return this.get(name) !== null;
  }

  set(name: string, value: string, options: CookieStoreOptions = {}): boolean {
    if (!this.#platform.isBrowser()) {
      return false;
    }

    const serializedParts = [
      `${this.encode(name)}=${this.encode(value)}`,
      `Path=${options.path ?? '/'}`,
    ];

    if (options.domain) {
      serializedParts.push(`Domain=${options.domain}`);
    }

    if (options.expires) {
      serializedParts.push(`Expires=${options.expires.toUTCString()}`);
    }

    if (options.maxAge !== undefined) {
      serializedParts.push(`Max-Age=${options.maxAge}`);
    }

    if (options.sameSite) {
      serializedParts.push(`SameSite=${options.sameSite}`);
    }

    if (options.secure) {
      serializedParts.push('Secure');
    }

    this.#document.cookie = serializedParts.join('; ');
    return true;
  }

  remove(name: string, options: Omit<CookieStoreOptions, 'expires' | 'maxAge'> = {}): boolean {
    return this.set(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    });
  }

  clear(options: Omit<CookieStoreOptions, 'expires' | 'maxAge'> = {}): void {
    for (const name of Object.keys(this.all())) {
      this.remove(name, options);
    }
  }

  private encode(value: string): string {
    return encodeURIComponent(value);
  }

  private decode(value: string): string {
    return decodeURIComponent(value);
  }
}
