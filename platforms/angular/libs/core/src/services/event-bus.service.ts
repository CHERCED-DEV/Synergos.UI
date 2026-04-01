import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { EVENT_BUS_CHANNEL } from '../core.tokens';

export interface CoreEvent<TPayload = unknown> {
  readonly type: string;
  readonly key?: string;
  readonly payload?: TPayload;
  readonly source?: string;
  readonly timestamp?: number;
}

@Injectable({ providedIn: 'root' })
export class EventBusService {
  readonly #document = inject(DOCUMENT);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #channelName = inject(EVENT_BUS_CHANNEL);
  readonly #lastEvent = signal<CoreEvent | null>(null);
  readonly #channel = this.createChannel();

  readonly lastEvent = this.#lastEvent.asReadonly();
  readonly events$ = toObservable(this.lastEvent).pipe(
    filter((event): event is CoreEvent => event !== null),
  );

  constructor() {
    this.#channel?.addEventListener('message', this.onMessage);
  }

  publish<TPayload>(event: CoreEvent<TPayload>): void {
    const nextEvent: CoreEvent<TPayload> = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
      source: event.source ?? this.resolveSource(),
    };

    this.#lastEvent.set(nextEvent);
    this.#channel?.postMessage(nextEvent);
  }

  private createChannel(): BroadcastChannel | null {
    if (!isPlatformBrowser(this.#platformId) || typeof BroadcastChannel === 'undefined') {
      return null;
    }

    return new BroadcastChannel(this.#channelName);
  }

  private resolveSource(): string {
    const rootElement = this.#document.documentElement;
    return rootElement.getAttribute('data-synergos-instance') ?? 'synergos-ui';
  }

  readonly onMessage = (event: MessageEvent<CoreEvent>): void => {
    this.#lastEvent.set(event.data);
  };
}
