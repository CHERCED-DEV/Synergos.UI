import { Injectable, inject } from '@angular/core';
import { StorageArea, StorageService } from './storage.service';

export interface StorageStackOptions<T> {
  readonly area?: StorageArea;
  readonly equals?: (left: T, right: T) => boolean;
  readonly limit?: number;
}

@Injectable({ providedIn: 'root' })
export class StorageStackService {
  readonly #storage = inject(StorageService);

  getAll<T>(key: string, area: StorageArea = 'local'): T[] {
    const values =
      area === 'local' ? this.#storage.getLocalObject<T[]>(key) : this.#storage.getSessionObject<T[]>(key);

    return Array.isArray(values) ? [...values] : [];
  }

  peek<T>(key: string, area: StorageArea = 'local'): T | null {
    return this.getAll<T>(key, area)[0] ?? null;
  }

  push<T>(key: string, item: T, options: StorageStackOptions<T> = {}): T[] {
    const area = options.area ?? 'local';
    const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0 ? options.limit : Number.POSITIVE_INFINITY;
    const equals = options.equals ?? this.defaultEquals;
    const currentValues = this.getAll<T>(key, area).filter((currentValue) => !equals(currentValue, item));
    const nextValues = [item, ...currentValues].slice(0, limit);

    this.write(area, key, nextValues);
    return nextValues;
  }

  remove<T>(key: string, index: number, area: StorageArea = 'local'): T[] {
    const currentValues = this.getAll<T>(key, area);
    if (index < 0 || index >= currentValues.length) {
      return currentValues;
    }

    currentValues.splice(index, 1);
    this.write(area, key, currentValues);
    return currentValues;
  }

  update<T>(key: string, index: number, item: T, area: StorageArea = 'local'): T[] {
    const currentValues = this.getAll<T>(key, area);
    if (index < 0 || index >= currentValues.length) {
      return currentValues;
    }

    currentValues[index] = item;
    this.write(area, key, currentValues);
    return currentValues;
  }

  clear(key: string, area: StorageArea = 'local'): void {
    this.write(area, key, []);
  }

  private write<T>(area: StorageArea, key: string, values: T[]): void {
    if (area === 'local') {
      this.#storage.setLocalObject(key, values);
      return;
    }

    this.#storage.setSessionObject(key, values);
  }

  private readonly defaultEquals = <T>(left: T, right: T): boolean => {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return Object.is(left, right);
    }
  };
}
