import { Injectable, signal } from '@angular/core';

export interface ElementRegistration {
  tag: string;
  bundleUrl?: string;
  loaded: boolean;
}

@Injectable({ providedIn: 'root' })
export class ElementRegistry {
  readonly #registry = signal(new Map<string, ElementRegistration>());

  register(type: string, registration: Omit<ElementRegistration, 'loaded'>): void {
    const current = new Map(this.#registry());
    current.set(type, { ...registration, loaded: false });
    this.#registry.set(current);
  }

  resolve(type: string): ElementRegistration | undefined {
    return this.#registry().get(type);
  }

  isRegistered(type: string): boolean {
    return this.#registry().has(type);
  }

  markLoaded(type: string): void {
    const current = new Map(this.#registry());
    const entry = current.get(type);
    if (entry) {
      current.set(type, { ...entry, loaded: true });
      this.#registry.set(current);
    }
  }

  allRegistrations(): ReadonlyMap<string, ElementRegistration> {
    return this.#registry();
  }
}
