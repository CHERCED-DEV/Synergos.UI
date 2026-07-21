import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import { LoggerService } from '@synergos/core';

/** Lifecycle a registered widget moves through. Ported from NewShore's RegistrationService. */
export type WidgetStatus = 'loading' | 'loaded' | 'ready' | 'waiting';

/** Registration descriptor for one transactional widget on the page. */
export interface WidgetRegistration {
  /** Unique name (deduped with a numeric suffix on collision). */
  readonly name: string;
  /** Submit order — lower runs first when the queue fires. */
  readonly order: number;
  /** `true` if this widget participates in the coordinated submit. */
  readonly isSubmitter: boolean;
  /** `true` if it renders its own skeleton (suppresses the shared spinner). */
  readonly useSkeleton: boolean;
}

/** A submitter that runs as part of the ordered submit queue. */
export type SubmitTask = () => Promise<void>;

/** A unit of in-flight work, keyed for dedup/coalescing. */
export type RequestTask<T> = () => Promise<T>;

interface WidgetEntry extends WidgetRegistration {
  status: WidgetStatus;
}

/**
 * **Page-level orchestrator for N transactional widgets** — the most valuable
 * piece of NewShore (`services/orchestrator.service.ts` + `registration.service.ts`),
 * ported **zoneless + signals** with **no RxJS/NgRx**.
 *
 * A transactional page hosts several independent widgets (search, results, cart,
 * checkout) that load separately, each declaring its state. The orchestrator:
 *
 *  - **registers** widgets with name/order/role (names deduped with a numeric
 *    suffix, NewShore `getsuggestedName`);
 *  - exposes **global readiness** — `allReady` is `true` only when every widget is
 *    `loaded`+ (NewShore `areModulesLoaded$` → a signal here);
 *  - **dedups in-flight calls** — `callApi(requestId, task)` coalesces concurrent
 *    callers of the same `requestId` onto **one** shared promise (NewShore
 *    `callOngoingRequest`), so two widgets asking the same availability question
 *    hit the network once;
 *  - runs an **ordered submit queue** — `submit(name, task)` enqueues; once every
 *    submitter has a task, they run sequentially by `order` (NewShore
 *    `sendSubmitRequest`); and
 *  - shares a **loading signal**, suppressed when any widget owns a skeleton
 *    (NewShore `setLoader`).
 */
@Injectable({ providedIn: 'root' })
export class OrchestratorService {
  readonly #logger = inject(LoggerService);

  readonly #widgets = signal<readonly WidgetEntry[]>([]);
  readonly #submitting = signal(false);
  readonly #pendingSubmits = new Map<string, SubmitTask>();
  readonly #inFlight = new Map<string, Promise<unknown>>();

  /** Snapshot of all registered widgets. */
  readonly widgets: Signal<readonly WidgetRegistration[]> = computed(() =>
    this.#widgets().map(({ name, order, isSubmitter, useSkeleton }) => ({
      name,
      order,
      isSubmitter,
      useSkeleton,
    })),
  );

  /** `true` only when every registered widget is `loaded`, `ready`, or `waiting`. */
  readonly allReady = computed(() => {
    const widgets = this.#widgets();
    return widgets.length > 0 && widgets.every((widget) => widget.status !== 'loading');
  });

  /** `true` once every submitter is `ready` (eligible to fire the submit queue). */
  readonly allSubmittersReady = computed(() => {
    const submitters = this.#widgets().filter((widget) => widget.isSubmitter);
    return submitters.length > 0 && submitters.every((widget) => widget.status === 'ready');
  });

  /**
   * Shared loading flag: `true` while a coordinated submit runs, **unless** a
   * widget renders its own skeleton (then the page suppresses the global spinner).
   */
  readonly loading = computed(() => {
    if (!this.#submitting()) {
      return false;
    }
    return !this.#widgets().some((widget) => widget.useSkeleton);
  });

  /**
   * Register a widget. Returns the **resolved name** (deduped if the requested one
   * was taken). Re-registering an existing exact name resets it to `loading`.
   */
  register(
    name: string,
    options: { order?: number; isSubmitter?: boolean; useSkeleton?: boolean } = {},
  ): string {
    const resolved = this.suggestName(name);
    const entry: WidgetEntry = {
      name: resolved,
      order: options.order ?? this.#widgets().length,
      isSubmitter: options.isSubmitter ?? false,
      useSkeleton: options.useSkeleton ?? false,
      status: 'loading',
    };
    this.#widgets.update((widgets) => [...widgets, entry]);
    return resolved;
  }

  /** Remove a widget and any pending submit it owns. */
  unregister(name: string): void {
    this.#widgets.update((widgets) => widgets.filter((widget) => widget.name !== name));
    this.#pendingSubmits.delete(name);
  }

  /** Transition a widget's status. No-op for unknown names. */
  setStatus(name: string, status: WidgetStatus): void {
    this.#widgets.update((widgets) =>
      widgets.map((widget) => (widget.name === name ? { ...widget, status } : widget)),
    );
  }

  /** Current status of a widget, or `undefined`. */
  statusOf(name: string): WidgetStatus | undefined {
    return this.#widgets().find((widget) => widget.name === name)?.status;
  }

  /**
   * Run a request, **coalescing concurrent callers of the same `requestId`** onto
   * one promise. The second caller during the same window receives the first
   * caller's in-flight promise instead of issuing a duplicate call. The entry is
   * cleared when the promise settles, so a later call re-issues.
   */
  callApi<T>(requestId: string, task: RequestTask<T>): Promise<T> {
    const existing = this.#inFlight.get(requestId);
    if (existing) {
      return existing as Promise<T>;
    }
    const promise = task().finally(() => {
      this.#inFlight.delete(requestId);
    });
    this.#inFlight.set(requestId, promise);
    return promise;
  }

  /** `true` if a `callApi` for this id is currently in flight. */
  isInFlight(requestId: string): boolean {
    return this.#inFlight.has(requestId);
  }

  /**
   * Enqueue a submitter's task. When **every** registered submitter has enqueued a
   * task, the queue fires automatically, running tasks **sequentially by `order`**.
   * Returns a promise that resolves when (and if) the whole queue completes for
   * this round; resolves immediately (no-op) if not all submitters are ready yet.
   */
  async submit(name: string, task: SubmitTask): Promise<void> {
    const widget = this.#widgets().find((entry) => entry.name === name);
    if (!widget || !widget.isSubmitter) {
      this.#logger.warn(`submit() ignored: "${name}" is not a registered submitter.`);
      return;
    }
    this.#pendingSubmits.set(name, task);

    const submitters = this.#widgets().filter((entry) => entry.isSubmitter);
    const allEnqueued = submitters.every((entry) => this.#pendingSubmits.has(entry.name));
    if (!allEnqueued || this.#submitting()) {
      return;
    }
    await this.runQueue(submitters);
  }

  /** Drop every queued submit without running it. */
  cancelSubmits(): void {
    this.#pendingSubmits.clear();
  }

  /** Reset orchestration state — widgets, queue, and in-flight registry. */
  reset(): void {
    this.#widgets.set([]);
    this.#pendingSubmits.clear();
    this.#inFlight.clear();
    this.#submitting.set(false);
  }

  private async runQueue(submitters: readonly WidgetEntry[]): Promise<void> {
    this.#submitting.set(true);
    try {
      const ordered = [...submitters].sort((a, b) => a.order - b.order);
      for (const widget of ordered) {
        const task = this.#pendingSubmits.get(widget.name);
        if (task) {
          await task();
        }
      }
    } finally {
      this.#pendingSubmits.clear();
      this.#submitting.set(false);
    }
  }

  private suggestName(name: string): string {
    const taken = new Set(this.#widgets().map((widget) => widget.name));
    if (!taken.has(name)) {
      return name;
    }
    let suffix = 1;
    while (taken.has(`${name}-${suffix}`)) {
      suffix += 1;
    }
    return `${name}-${suffix}`;
  }
}
