import { Injectable, signal } from '@angular/core';

export interface ElementRegistration {
  tag: string;
}

@Injectable({ providedIn: 'root' })
export class ElementRegistry {
  readonly #registry = signal(new Map<string, ElementRegistration>());

  register(type: string, registration: ElementRegistration): void {
    const current = new Map(this.#registry());
    current.set(type, registration);
    this.#registry.set(current);
  }

  resolve(type: string): ElementRegistration | undefined {
    return this.#registry().get(type);
  }
}
