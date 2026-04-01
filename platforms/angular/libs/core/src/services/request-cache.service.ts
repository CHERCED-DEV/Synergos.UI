import { HttpResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

interface CacheEntry {
  readonly expiresAt: number | null;
  readonly response: HttpResponse<unknown>;
}

@Injectable({ providedIn: 'root' })
export class RequestCacheService {
  readonly #entries = signal(new Map<string, CacheEntry>());

  get(key: string): HttpResponse<unknown> | null {
    const entry = this.#entries().get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.delete(key);
      return null;
    }

    return entry.response.clone();
  }

  set(key: string, response: HttpResponse<unknown>, ttlSeconds?: number): void {
    const expiresAt =
      typeof ttlSeconds === 'number' && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;

    this.#entries.update((entries) => {
      const nextEntries = new Map(entries);
      nextEntries.set(key, {
        expiresAt,
        response: response.clone(),
      });
      return nextEntries;
    });
  }

  delete(key: string): void {
    this.#entries.update((entries) => {
      const nextEntries = new Map(entries);
      nextEntries.delete(key);
      return nextEntries;
    });
  }

  clear(): void {
    this.#entries.set(new Map());
  }
}
