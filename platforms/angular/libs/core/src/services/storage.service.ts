import { Injectable, computed, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';

export type StorageArea = 'local' | 'session';

type StorageAdapterKind = 'browser' | 'memory';

interface StorageAdapter {
  readonly kind: StorageAdapterKind;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  keys(): string[];
}

class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = 'memory' as const;

  readonly #storage = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#storage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#storage.set(key, value);
  }

  removeItem(key: string): void {
    this.#storage.delete(key);
  }

  clear(): void {
    this.#storage.clear();
  }

  keys(): string[] {
    return [...this.#storage.keys()];
  }
}

class BrowserStorageAdapter implements StorageAdapter {
  readonly kind = 'browser' as const;
  readonly #storage: Storage;

  constructor(storage: Storage) {
    this.#storage = storage;
  }

  getItem(key: string): string | null {
    return this.#storage.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.#storage.setItem(key, value);
  }

  removeItem(key: string): void {
    this.#storage.removeItem(key);
  }

  clear(): void {
    this.#storage.clear();
  }

  keys(): string[] {
    return Array.from({ length: this.#storage.length }, (_, index) => this.#storage.key(index)).filter(
      (key): key is string => key !== null,
    );
  }

  static isAvailable(storage: Storage): boolean {
    try {
      const key = '__syn_storage_probe__';
      storage.setItem(key, key);
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly #platform = inject(PlatformService);
  readonly #adapters = signal<Record<StorageArea, StorageAdapter>>(this.resolveAdapters());

  readonly activeAdapter = computed(() => this.#adapters().local.kind);
  readonly activeAdapters = computed(() => ({
    local: this.#adapters().local.kind,
    session: this.#adapters().session.kind,
  }));

  getItem(key: string): string | null {
    return this.getLocalItem(key);
  }

  setItem(key: string, value: string): void {
    this.setLocalItem(key, value);
  }

  getObject<T>(key: string): T | null {
    return this.getLocalObject<T>(key);
  }

  setObject(key: string, value: unknown): void {
    this.setLocalObject(key, value);
  }

  removeItem(key: string): void {
    this.removeLocalItem(key);
  }

  clear(): void {
    this.clearLocal();
  }

  keys(): string[] {
    return this.localKeys();
  }

  getLocalItem(key: string): string | null {
    return this.readItem('local', key);
  }

  setLocalItem(key: string, value: string): void {
    this.writeItem('local', key, value);
  }

  getLocalObject<T>(key: string): T | null {
    return this.readObject<T>('local', key);
  }

  setLocalObject(key: string, value: unknown): void {
    this.writeObject('local', key, value);
  }

  removeLocalItem(key: string): void {
    this.removeAreaItem('local', key);
  }

  clearLocal(): void {
    this.clearArea('local');
  }

  localKeys(): string[] {
    return this.keysIn('local');
  }

  getSessionItem(key: string): string | null {
    return this.readItem('session', key);
  }

  setSessionItem(key: string, value: string): void {
    this.writeItem('session', key, value);
  }

  getSessionObject<T>(key: string): T | null {
    return this.readObject<T>('session', key);
  }

  setSessionObject(key: string, value: unknown): void {
    this.writeObject('session', key, value);
  }

  removeSessionItem(key: string): void {
    this.removeAreaItem('session', key);
  }

  clearSession(): void {
    this.clearArea('session');
  }

  sessionKeys(): string[] {
    return this.keysIn('session');
  }

  clearAll(): void {
    this.clearLocal();
    this.clearSession();
  }

  useMemoryAdapter(area: StorageArea | 'all' = 'local'): void {
    this.#adapters.update((adapters) => {
      if (area === 'all') {
        return {
          local: new MemoryStorageAdapter(),
          session: new MemoryStorageAdapter(),
        };
      }

      return {
        ...adapters,
        [area]: new MemoryStorageAdapter(),
      };
    });
  }

  private readItem(area: StorageArea, key: string): string | null {
    return this.#adapters()[area].getItem(key);
  }

  private writeItem(area: StorageArea, key: string, value: string): void {
    this.#adapters()[area].setItem(key, value);
  }

  private readObject<T>(area: StorageArea, key: string): T | null {
    const rawValue = this.readItem(area, key);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return null;
    }
  }

  private writeObject(area: StorageArea, key: string, value: unknown): void {
    try {
      this.writeItem(area, key, JSON.stringify(value));
    } catch {
      this.removeAreaItem(area, key);
    }
  }

  private removeAreaItem(area: StorageArea, key: string): void {
    this.#adapters()[area].removeItem(key);
  }

  private clearArea(area: StorageArea): void {
    this.#adapters()[area].clear();
  }

  private keysIn(area: StorageArea): string[] {
    return this.#adapters()[area].keys();
  }

  private resolveAdapters(): Record<StorageArea, StorageAdapter> {
    return {
      local: this.resolveAdapter('local'),
      session: this.resolveAdapter('session'),
    };
  }

  private resolveAdapter(area: StorageArea): StorageAdapter {
    if (this.#platform.isBrowser()) {
      const storageRef = this.#platform.runInBrowser(
        () => (area === 'local' ? window.localStorage : window.sessionStorage),
        null,
      );
      if (storageRef && BrowserStorageAdapter.isAvailable(storageRef)) {
        return new BrowserStorageAdapter(storageRef);
      }
    }

    return new MemoryStorageAdapter();
  }
}
