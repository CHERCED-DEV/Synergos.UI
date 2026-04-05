import type { Notification } from '../domain/notification.domain';

export type StateListener = (items: Notification[]) => void;

export class NotificationState {
  #items: Notification[];
  #listeners: StateListener[] = [];

  constructor(initial: Notification[]) {
    this.#items = [...initial];
  }

  get items(): Notification[] {
    return this.#items;
  }

  dismiss(id: string): void {
    this.#items = this.#items.filter((n) => n.id !== id);
    this.#notify();
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }

  #notify(): void {
    for (const l of this.#listeners) l(this.#items);
  }
}
