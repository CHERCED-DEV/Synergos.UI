import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynNotificationCenter</c>.
 *
 * A notification center: a scrollable list of notifications with per-item
 * read/unread state, an unread badge, "mark all as read", and per-item
 * dismiss. Items can be supplied inline via `items` or fetched lazily from
 * `fetchEndpoint` (optionally re-polled every `pollingIntervalMs`). Toggling
 * an item emits a `notificationread` CustomEvent; "mark all" emits
 * `notificationreadall`; dismissing emits `notificationdismiss`.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface NotificationItemConfig {
  readonly id?: string;
  readonly title?: string;
  readonly body?: string;
  readonly href?: string;
  readonly timestamp?: string;
  readonly read?: boolean;
}

export interface NotificationCenterRuntimeConfig {
  readonly title?: string;
  readonly emptyLabel?: string;
  readonly markAllLabel?: string;
  readonly fetchEndpoint?: string;
  readonly pollingIntervalMs?: number;
  readonly items?: readonly NotificationItemConfig[];
}

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly timestamp: string;
  readonly read: boolean;
}

/** Emitted on the `notificationread` CustomEvent and the typed Angular output. */
export interface NotificationReadDetail {
  readonly id: string;
  readonly read: boolean;
}

/** Emitted on the `notificationdismiss` CustomEvent and the typed output. */
export interface NotificationDismissDetail {
  readonly id: string;
}

const DEFAULT_TITLE = 'Notificaciones';
const DEFAULT_EMPTY = 'No tienes notificaciones.';
const DEFAULT_MARK_ALL = 'Marcar todo como leído';
const DEFAULT_POLLING_MS = 0; // 0 → fetch once, no polling
const MIN_POLLING_MS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

export function normalizeNotifications(value: unknown): readonly NotificationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: NotificationItem[] = [];

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }

    const title = readString(entry['title']).trim();
    const body = readString(entry['body']).trim() || readString(entry['message']).trim();
    if (!title && !body) {
      return;
    }

    const rawId = readString(entry['id']).trim();
    const id = rawId || `notif-${index}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);

    result.push({
      id,
      title,
      body,
      href: readString(entry['href']).trim() || readString(entry['url']).trim(),
      timestamp: readString(entry['timestamp']).trim() || readString(entry['date']).trim(),
      read: readBoolean(entry['read']),
    });
  });

  return result;
}

export function normalizePollingInterval(value: unknown): number {
  const parsed = coerceOptionalNumberInput(value);
  if (parsed === undefined || parsed <= 0) {
    return DEFAULT_POLLING_MS;
  }
  return Math.max(parsed, MIN_POLLING_MS);
}

function sanitizeNotificationCenterConfig(
  value: Partial<NotificationCenterRuntimeConfig>,
): NotificationCenterRuntimeConfig {
  return omitUndefinedProperties<NotificationCenterRuntimeConfig>({
    title: coerceTrimmedStringInput(value.title),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    markAllLabel: coerceTrimmedStringInput(value.markAllLabel),
    fetchEndpoint: coerceTrimmedStringInput(value.fetchEndpoint),
    pollingIntervalMs: coerceOptionalNumberInput(value.pollingIntervalMs),
    items: value.items,
  });
}

@Component({
  selector: 'sg-notification-center',
  standalone: true,
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-notification-center' },
})
export class NotificationCenterElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<NotificationCenterRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<NotificationCenterRuntimeConfig>(
      sanitizeNotificationCenterConfig,
    ),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly markAllLabelInput = input<string | undefined>(undefined, { alias: 'markAllLabel' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly fetchEndpointInput = input<string | undefined>(undefined, { alias: 'fetchEndpoint' });
  readonly pollingIntervalInput = input<string | undefined>(undefined, {
    alias: 'pollingInterval',
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular outputs mirroring the native CustomEvents. */
  readonly notificationread = output<NotificationReadDetail>();
  readonly notificationreadall = output<void>();
  readonly notificationdismiss = output<NotificationDismissDetail>();

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, DEFAULT_TITLE),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, DEFAULT_EMPTY),
  );
  readonly markAllLabel = computed(() =>
    resolveConfigValue(this.markAllLabelInput(), this.config()?.markAllLabel, DEFAULT_MARK_ALL),
  );

  readonly fetchEndpoint = computed(() =>
    resolveConfigValue(this.fetchEndpointInput(), this.config()?.fetchEndpoint, ''),
  );

  readonly pollingIntervalMs = computed(() =>
    normalizePollingInterval(this.pollingIntervalInput() ?? this.config()?.pollingIntervalMs),
  );

  /** Inline / config items (the declarative seed). */
  readonly inlineItems = computed<readonly NotificationItem[]>(() =>
    normalizeNotifications(this.resolveSource(this.itemsInput(), this.config()?.items)),
  );

  readonly #fetchedItems = signal<readonly NotificationItem[]>([]);
  readonly #hasFetched = signal(false);
  readonly #loading = signal(false);
  readonly #fetchFailed = signal(false);
  readonly loading = this.#loading.asReadonly();
  readonly fetchFailed = this.#fetchFailed.asReadonly();

  /** Local read/dismiss overrides keyed by item id (visitor interaction). */
  readonly #readOverrides = signal<ReadonlyMap<string, boolean>>(new Map());
  readonly #dismissed = signal<ReadonlySet<string>>(new Set());

  /** Source of truth: fetched items once loaded, otherwise the inline seed. */
  readonly #sourceItems = computed<readonly NotificationItem[]>(() =>
    this.#hasFetched() ? this.#fetchedItems() : this.inlineItems(),
  );

  /** Items after applying local read overrides and dismissals. */
  readonly items = computed<readonly NotificationItem[]>(() => {
    const overrides = this.#readOverrides();
    const dismissed = this.#dismissed();
    return this.#sourceItems()
      .filter((item) => !dismissed.has(item.id))
      .map((item) => {
        const override = overrides.get(item.id);
        return override === undefined ? item : { ...item, read: override };
      });
  });

  readonly hasItems = computed(() => this.items().length > 0);
  readonly unreadCount = computed(() => this.items().filter((item) => !item.read).length);
  readonly hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    // Lazy-fetch (and optionally poll) when an endpoint is configured.
    effect((onCleanup) => {
      const endpoint = this.fetchEndpoint().trim();
      const intervalMs = this.pollingIntervalMs();

      this.#hasFetched.set(false);
      this.#fetchedItems.set([]);
      this.#fetchFailed.set(false);

      if (!endpoint || typeof fetch !== 'function') {
        this.#loading.set(false);
        return;
      }

      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let active = true;

      const run = (): void => {
        this.#loading.set(true);
        fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } })
          .then((response) =>
            response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
          )
          .then((data: unknown) => {
            if (!active) {
              return;
            }
            const list = Array.isArray(data) ? data : isRecord(data) ? data['items'] : null;
            this.#fetchedItems.set(normalizeNotifications(list));
            this.#hasFetched.set(true);
            this.#fetchFailed.set(false);
            this.#loading.set(false);
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return;
            }
            if (!active) {
              return;
            }
            this.#fetchFailed.set(true);
            this.#loading.set(false);
          })
          .finally(() => {
            if (active && intervalMs >= MIN_POLLING_MS && typeof setTimeout === 'function') {
              timer = setTimeout(run, intervalMs);
            }
          });
      };

      run();

      onCleanup(() => {
        active = false;
        controller.abort();
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      });
    });

    this.#destroyRef.onDestroy(() => {
      // AbortController + timer cleanup handled by effect onCleanup.
    });
  }

  /** Toggle a single item's read state and emit `notificationread`. */
  toggleRead(item: NotificationItem): void {
    const next = !item.read;
    this.#setRead(item.id, next);
    this.notificationread.emit({ id: item.id, read: next });
  }

  /** Mark a single item as read (no toggle); used when activating its link. */
  markRead(item: NotificationItem): void {
    if (item.read) {
      return;
    }
    this.#setRead(item.id, true);
    this.notificationread.emit({ id: item.id, read: true });
  }

  /** Mark every visible item as read and emit `notificationreadall`. */
  markAllRead(): void {
    if (!this.hasUnread()) {
      return;
    }
    const overrides = new Map(this.#readOverrides());
    for (const item of this.items()) {
      overrides.set(item.id, true);
    }
    this.#readOverrides.set(overrides);
    this.notificationreadall.emit();
  }

  /** Remove a single item from the list and emit `notificationdismiss`. */
  dismiss(item: NotificationItem): void {
    const dismissed = new Set(this.#dismissed());
    if (dismissed.has(item.id)) {
      return;
    }
    dismissed.add(item.id);
    this.#dismissed.set(dismissed);
    this.notificationdismiss.emit({ id: item.id });
  }

  trackById(_index: number, item: NotificationItem): string {
    return item.id;
  }

  #setRead(id: string, read: boolean): void {
    const overrides = new Map(this.#readOverrides());
    overrides.set(id, read);
    this.#readOverrides.set(overrides);
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
