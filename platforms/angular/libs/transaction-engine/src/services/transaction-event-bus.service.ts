import { Injectable, type Signal, signal } from '@angular/core';

/**
 * A strongly-typed event message. `type` keys into the consumer's event map and
 * `payload` is the value for that key.
 */
export interface TransactionEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly payload: TPayload;
  /** Epoch ms; stamped on publish. */
  readonly timestamp: number;
  /** Instance id of the publisher — lets receivers ignore their own echoes. */
  readonly source: string;
}

/**
 * A typed event map: `{ cartUpdated: CartSnapshot; pageRedirected: { url: string } }`.
 * Consumers define one and parameterise the bus with it for end-to-end typing.
 */
export type TransactionEventMap = Record<string, unknown>;

/** Listener for one event type. */
export type TransactionEventListener<TPayload> = (payload: TPayload, source: string) => void;

/**
 * **Typed, instance-scoped event bus over `BroadcastChannel`.**
 *
 * Adapts NewShore's `EventBusService` (`CoreV2/.../lib/event-bus.service.ts`),
 * which scoped its channel by reading `<IBE-ID ibe-id="…">` and re-entered the
 * Angular zone manually. We are **zoneless**, so there is no `NgZone`; signals
 * react to channel messages directly. Scoping is explicit via `scope(...)`
 * (typically a `siteRoot`/instance id) so multiple `elementSyn*` islands on the
 * same origin — which do **not** share an Angular root — can coordinate without
 * cross-talk.
 *
 * Why a second bus alongside `@synergos/core`'s `EventBusService`: the core one
 * is a single untyped firehose on one fixed channel. The transaction engine needs
 * **per-instance isolation** and **compile-time typed** events to wire the wizard
 * ↔ cart ↔ checkout ↔ IA layer (ADR 0095) safely. This service is generic over a
 * `TransactionEventMap`.
 *
 * Not an HTTP/RxJS surface: `lastEvent` is a signal; `on(...)` is a plain
 * callback subscription returning an unsubscribe function.
 *
 * @example
 * ```ts
 * interface Bus extends TransactionEventMap {
 *   cartUpdated: { count: number };
 *   pageRedirected: { url: string };
 * }
 * const bus = inject<TransactionEventBusService<Bus>>(TransactionEventBusService);
 * bus.scope(siteRoot);                         // isolate this island
 * const off = bus.on('cartUpdated', (p) => render(p.count));
 * bus.publish('cartUpdated', { count: 3 });    // typed payload
 * off();                                        // unsubscribe
 * ```
 */
@Injectable({ providedIn: 'root' })
export class TransactionEventBusService<TMap extends TransactionEventMap = TransactionEventMap> {
  /** Unique id of this service instance — tags published events as `source`. */
  readonly instanceId = `txn-bus-${Math.random().toString(36).slice(2, 10)}`;

  readonly #channelPrefix = 'synergos-txn';
  readonly #listeners = new Map<keyof TMap, Set<TransactionEventListener<unknown>>>();
  readonly #lastEvent = signal<TransactionEvent<Extract<keyof TMap, string>> | null>(null);

  #scopeId = 'default';
  #channel: BroadcastChannel | null = null;

  /** The most recent event seen on this bus (published locally or received). */
  get lastEvent(): Signal<TransactionEvent<Extract<keyof TMap, string>> | null> {
    return this.#lastEvent.asReadonly();
  }

  /** The channel name currently in use (for diagnostics/tests). */
  get channelName(): string {
    return `${this.#channelPrefix}:${this.#scopeId}`;
  }

  /**
   * Scope the bus to an instance/`siteRoot`. Re-opens the underlying channel so
   * islands sharing a scope hear each other and nobody else. Call once during
   * island bootstrap before publishing. Idempotent for the same scope.
   */
  scope(scopeId: string): void {
    const next = scopeId.trim() || 'default';
    if (next === this.#scopeId && this.#channel !== null) {
      return;
    }
    this.#scopeId = next;
    this.openChannel();
  }

  /**
   * Publish a typed event. Notifies local listeners synchronously and broadcasts
   * to other tabs/islands on the same scope. Cross-document echoes are ignored by
   * `source` so a publisher never re-handles its own message.
   */
  publish<TType extends Extract<keyof TMap, string>>(type: TType, payload: TMap[TType]): void {
    const event: TransactionEvent<TType, TMap[TType]> = {
      type,
      payload,
      timestamp: Date.now(),
      source: this.instanceId,
    };
    this.#lastEvent.set(event as TransactionEvent<Extract<keyof TMap, string>>);
    this.dispatchLocal(type, payload, event.source);
    this.ensureChannel();
    this.#channel?.postMessage(event);
  }

  /**
   * Subscribe to one event type. Returns an unsubscribe function — there is no
   * RxJS `Subscription`. Listeners fire for both local publishes and remote
   * (cross-island/tab) messages.
   */
  on<TType extends Extract<keyof TMap, string>>(
    type: TType,
    listener: TransactionEventListener<TMap[TType]>,
  ): () => void {
    const set = this.#listeners.get(type) ?? new Set<TransactionEventListener<unknown>>();
    set.add(listener as TransactionEventListener<unknown>);
    this.#listeners.set(type, set);
    return () => {
      set.delete(listener as TransactionEventListener<unknown>);
      if (set.size === 0) {
        this.#listeners.delete(type);
      }
    };
  }

  /** Tear down the channel and drop all listeners. */
  destroy(): void {
    this.#channel?.removeEventListener('message', this.onMessage);
    this.#channel?.close();
    this.#channel = null;
    this.#listeners.clear();
  }

  private ensureChannel(): void {
    if (this.#channel === null) {
      this.openChannel();
    }
  }

  private openChannel(): void {
    this.#channel?.removeEventListener('message', this.onMessage);
    this.#channel?.close();
    this.#channel = null;
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    this.#channel = new BroadcastChannel(this.channelName);
    this.#channel.addEventListener('message', this.onMessage);
  }

  private dispatchLocal(type: keyof TMap, payload: unknown, source: string): void {
    const set = this.#listeners.get(type);
    if (!set) {
      return;
    }
    for (const listener of set) {
      listener(payload, source);
    }
  }

  private readonly onMessage = (
    message: MessageEvent<TransactionEvent<Extract<keyof TMap, string>>>,
  ): void => {
    const event = message.data;
    if (!event || event.source === this.instanceId) {
      return;
    }
    this.#lastEvent.set(event);
    this.dispatchLocal(event.type, event.payload, event.source);
  };
}
