import { Injectable, computed, signal } from '@angular/core';

export interface SkeletonState {
  readonly blocks?: number;
  readonly key: string;
  readonly lines?: number;
  readonly loading: boolean;
}

@Injectable({ providedIn: 'root' })
export class SkeletonService {
  readonly #registry = signal<Record<string, SkeletonState>>({});

  readonly snapshot = computed(() => Object.values(this.#registry()));

  register(key: string, state: Omit<SkeletonState, 'key'> = { loading: true }): void {
    this.#registry.update((registry) => ({
      ...registry,
      [key]: {
        ...registry[key],
        ...state,
        key,
      },
    }));
  }

  update(key: string, patch: Partial<Omit<SkeletonState, 'key'>>): void {
    this.#registry.update((registry) => ({
      ...registry,
      [key]: {
        ...registry[key],
        loading: registry[key]?.loading ?? false,
        ...patch,
        key,
      },
    }));
  }

  setLoading(key: string, loading: boolean): void {
    this.update(key, { loading });
  }

  getState(key: string): SkeletonState | undefined {
    return this.#registry()[key];
  }

  isLoading(key: string): boolean {
    return this.#registry()[key]?.loading ?? false;
  }

  unregister(key: string): void {
    this.#registry.update((registry) => {
      const nextRegistry = { ...registry };
      delete nextRegistry[key];
      return nextRegistry;
    });
  }

  clear(): void {
    this.#registry.set({});
  }
}
