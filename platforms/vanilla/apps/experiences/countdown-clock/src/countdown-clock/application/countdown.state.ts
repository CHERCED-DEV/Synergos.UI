import { calculateRemaining } from '../domain/countdown.domain';
import type { TimeRemaining } from '../domain/countdown.domain';

export type CountdownListener = (remaining: TimeRemaining) => void;

export class CountdownState {
  #targetDate: string;
  #interval: ReturnType<typeof setInterval> | null = null;
  #listeners: CountdownListener[] = [];

  constructor(targetDate: string) {
    this.#targetDate = targetDate;
  }

  get current(): TimeRemaining {
    return calculateRemaining(this.#targetDate);
  }

  start(): () => void {
    this.#interval = setInterval(() => {
      const remaining = calculateRemaining(this.#targetDate);
      for (const l of this.#listeners) l(remaining);
      if (remaining.expired) this.stop();
    }, 1000);

    return () => this.stop();
  }

  stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }

  subscribe(listener: CountdownListener): () => void {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }
}
