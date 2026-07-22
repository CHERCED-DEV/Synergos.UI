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
  untracked,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynToastCenter</c>.
 *
 * A host / queue for transient toast notifications. It owns the on-screen
 * region (corner placement, stacking order, max-visible cap, overflow
 * counter) while individual toasts complement <c>notification-toast</c>:
 * each entry carries a severity, optional title/message and an optional
 * action. Toasts can be supplied declaratively via <c>toasts</c> (seeded on
 * load) and pushed imperatively at runtime through:
 *   - the public {@link ToastCenterElementComponent.push} method, or
 *   - a `synergos:toast` CustomEvent dispatched on `window`.
 *
 * Dismissals (manual or auto) emit a `toastdismiss` CustomEvent plus the
 * typed Angular output. Bridge contract: every CMS property is a TypeScript
 * input with the same alias; a `config` object (JSON) is also accepted;
 * explicit attributes win over `config`, which wins over defaults.
 */
export interface ToastCenterRuntimeConfig {
  readonly position?: string;
  readonly maxVisible?: number;
  readonly duration?: number;
  readonly dismissible?: boolean;
  readonly pauseOnHover?: boolean;
  readonly toasts?: readonly ToastConfig[];
}

export type ToastSeverity = 'info' | 'success' | 'warning' | 'danger';

export type ToastPosition =
  | 'top-start'
  | 'top-center'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-center'
  | 'bottom-end';

export interface ToastConfig {
  readonly id?: string;
  readonly severity?: string;
  readonly title?: string;
  readonly message?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly duration?: number;
  readonly dismissible?: boolean;
}

/** A normalized toast held in the live queue. */
export interface Toast {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly actionHref: string;
  readonly duration: number;
  readonly dismissible: boolean;
}

/** Emitted on the `toastdismiss` CustomEvent and the typed Angular output. */
export interface ToastDismissDetail {
  readonly id: string;
  readonly reason: 'manual' | 'timeout' | 'overflow' | 'api';
}

const SEVERITIES: readonly ToastSeverity[] = ['info', 'success', 'warning', 'danger'];
const POSITIONS: readonly ToastPosition[] = [
  'top-start',
  'top-center',
  'top-end',
  'bottom-start',
  'bottom-center',
  'bottom-end',
];

const DEFAULT_POSITION: ToastPosition = 'top-end';
const DEFAULT_MAX_VISIBLE = 4;
const DEFAULT_DURATION = 5000;
/** Highest cap so a misconfigured value can never freeze the queue forever. */
const MAX_DURATION = 60000;
/** Live-region announcement: assertive for problems, polite otherwise. */
const ASSERTIVE: readonly ToastSeverity[] = ['warning', 'danger'];
const SEVERITY_TITLES: Record<ToastSeverity, string> = {
  info: 'Información',
  success: 'Listo',
  warning: 'Atención',
  danger: 'Error',
};

let toastSeq = 0;

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

export function normalizeSeverity(value: unknown): ToastSeverity {
  const candidate = readString(value).trim().toLowerCase() as ToastSeverity;
  return SEVERITIES.includes(candidate) ? candidate : 'info';
}

export function normalizePosition(value: unknown): ToastPosition {
  const candidate = readString(value).trim().toLowerCase().replace(/[_\s]+/g, '-') as ToastPosition;
  return POSITIONS.includes(candidate) ? candidate : DEFAULT_POSITION;
}

/** Clamp a raw duration: 0 (or negative) = sticky; otherwise capped. */
function clampDuration(value: unknown, fallback: number): number {
  const raw = coerceOptionalNumberInput(value);
  if (raw === undefined) {
    return fallback;
  }
  if (raw <= 0) {
    return 0;
  }
  return Math.min(raw, MAX_DURATION);
}

/** Build one normalized toast from arbitrary input; null when unusable. */
export function normalizeToast(value: unknown, defaults: ToastDefaults): Toast | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = readString(value['title']).trim();
  const message = readString(value['message']).trim() || readString(value['text']).trim();
  if (!title && !message) {
    return null;
  }

  const severity = normalizeSeverity(value['severity'] ?? value['type']);
  const id = readString(value['id']).trim() || `toast-${++toastSeq}`;
  const dismissible = coerceOptionalBooleanInput(value['dismissible']) ?? defaults.dismissible;

  return {
    id,
    severity,
    title: title || SEVERITY_TITLES[severity],
    message,
    actionLabel: readString(value['actionLabel']).trim(),
    actionHref: readString(value['actionHref']).trim() || readString(value['href']).trim(),
    duration: clampDuration(value['duration'], defaults.duration),
    dismissible,
  };
}

export interface ToastDefaults {
  readonly duration: number;
  readonly dismissible: boolean;
}

export function normalizeToasts(value: unknown, defaults: ToastDefaults): readonly Toast[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeToast(entry, defaults))
    .filter((toast): toast is Toast => toast !== null);
}

function sanitizeToastCenterConfig(
  value: Partial<ToastCenterRuntimeConfig>,
): ToastCenterRuntimeConfig {
  return omitUndefinedProperties<ToastCenterRuntimeConfig>({
    position: coerceTrimmedStringInput(value.position),
    maxVisible: coerceOptionalNumberInput(value.maxVisible),
    duration: coerceOptionalNumberInput(value.duration),
    dismissible: coerceOptionalBooleanInput(value.dismissible),
    pauseOnHover: coerceOptionalBooleanInput(value.pauseOnHover),
    toasts: value.toasts,
  });
}

@Component({
  selector: 'sg-toast-center',
  standalone: true,
  templateUrl: './toast-center.html',
  styleUrl: './toast-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-toast-center' },
})
export class ToastCenterElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<ToastCenterRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ToastCenterRuntimeConfig>(sanitizeToastCenterConfig),
  });
  readonly positionInput = input<string | undefined>(undefined, { alias: 'position' });
  readonly maxVisibleInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxVisible',
    transform: coerceOptionalNumberInput,
  });
  readonly durationInput = input<number | undefined, unknown>(undefined, {
    alias: 'duration',
    transform: coerceOptionalNumberInput,
  });
  readonly dismissibleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'dismissible',
    transform: coerceOptionalBooleanInput,
  });
  readonly pauseOnHoverInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'pauseOnHover',
    transform: coerceOptionalBooleanInput,
  });
  readonly toastsInput = input<string | undefined>(undefined, { alias: 'toasts' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `toastdismiss` CustomEvent. */
  readonly toastdismiss = output<ToastDismissDetail>();

  readonly position = computed<ToastPosition>(() =>
    normalizePosition(resolveConfigValue(this.positionInput(), this.config()?.position, DEFAULT_POSITION)),
  );

  readonly maxVisible = computed(() => {
    const raw = resolveConfigValue(this.maxVisibleInput(), this.config()?.maxVisible, DEFAULT_MAX_VISIBLE);
    return raw >= 1 ? Math.floor(raw) : DEFAULT_MAX_VISIBLE;
  });

  readonly defaultDuration = computed(() =>
    clampDuration(
      resolveConfigValue(this.durationInput(), this.config()?.duration, DEFAULT_DURATION),
      DEFAULT_DURATION,
    ),
  );

  readonly defaultDismissible = computed(() =>
    resolveConfigValue(this.dismissibleInput(), this.config()?.dismissible, true),
  );

  readonly pauseOnHover = computed(() =>
    resolveConfigValue(this.pauseOnHoverInput(), this.config()?.pauseOnHover, true),
  );

  /** Defaults applied to incoming toasts that omit their own values. */
  readonly #defaults = computed<ToastDefaults>(() => ({
    duration: this.defaultDuration(),
    dismissible: this.defaultDismissible(),
  }));

  /** Toasts declared on the element (seeded once into the live queue). */
  readonly seedToasts = computed<readonly Toast[]>(() =>
    normalizeToasts(this.resolveSource(this.toastsInput(), this.config()?.toasts), this.#defaults()),
  );

  /** The live queue (oldest first). */
  readonly #queue = signal<readonly Toast[]>([]);
  readonly queue = this.#queue.asReadonly();

  /** Visible slice honoring the max-visible cap (newest-relevant kept). */
  readonly visibleToasts = computed<readonly Toast[]>(() => this.#queue().slice(0, this.maxVisible()));

  /** How many queued toasts are hidden behind the cap. */
  readonly overflowCount = computed(() => Math.max(0, this.#queue().length - this.maxVisible()));
  readonly hasToasts = computed(() => this.#queue().length > 0);
  readonly hasOverflow = computed(() => this.overflowCount() > 0);

  readonly stackVertical = computed<'top' | 'bottom'>(() =>
    this.position().startsWith('bottom') ? 'bottom' : 'top',
  );

  /** Pending auto-dismiss timers keyed by toast id. */
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Hover pauses every auto-dismiss timer until the pointer leaves. */
  readonly #paused = signal(false);

  constructor() {
    // Seed declared toasts into the queue whenever the declaration changes.
    // Re-seeding replaces the previously seeded set without touching the ids.
    //
    // The body MUST stay untracked: #syncTimers() reads visibleToasts() (and
    // therefore #queue) plus #paused(), which made #queue a dependency of the
    // very effect that writes #queue. That read-write cycle re-ran the seeding
    // on EVERY queue mutation, which broke both paths:
    //   - imperative: each push() / `synergos:toast` was reset back to the
    //     declared seeds (usually none) before it could ever paint;
    //   - declarative (the CMS-authored path): dismissing a declared toast
    //     re-seeded it straight back, so the close button did nothing and an
    //     auto-dismissed toast resurrected and re-armed its timer — an endless
    //     flicker emitting a spurious `toastdismiss` once per duration window.
    // The only legitimate trigger for re-seeding is a change in the declaration.
    effect(() => {
      const seeds = this.seedToasts();
      untracked(() => {
        this.#queue.set(seeds);
        this.#syncTimers();
      });
    });

    // Timer reconciliation is its own effect: it tracks the visible slice and
    // the pause flag but writes no signal, so it cannot feed back into seeding.
    // This keeps auto-dismiss timers correct when the visible set shifts for a
    // reason other than enqueue/remove (e.g. a maxVisible or position change),
    // which used to ride along on the seeding effect above.
    effect(() => {
      this.visibleToasts();
      this.#paused();
      untracked(() => this.#syncTimers());
    });

    // Listen for runtime pushes dispatched on window.
    if (typeof window !== 'undefined') {
      const handler = (event: Event): void => this.#onWindowToast(event);
      window.addEventListener('synergos:toast', handler as EventListener);
      this.#destroyRef.onDestroy(() =>
        window.removeEventListener('synergos:toast', handler as EventListener),
      );
    }

    this.#destroyRef.onDestroy(() => this.#clearAllTimers());
  }

  /** Imperative API: enqueue a toast and return its id (or '' if rejected). */
  push(input: ToastConfig): string {
    const toast = normalizeToast(input as unknown, this.#defaults());
    if (!toast) {
      return '';
    }
    this.#enqueue(toast);
    return toast.id;
  }

  /** Imperative API: remove a toast by id. */
  dismiss(id: string, reason: ToastDismissDetail['reason'] = 'api'): void {
    this.#remove(id, reason);
  }

  /** Imperative API: clear the whole queue. */
  clear(): void {
    for (const toast of this.#queue()) {
      this.#emitDismiss(toast.id, 'api');
    }
    this.#clearAllTimers();
    this.#queue.set([]);
  }

  onDismissClick(toast: Toast): void {
    this.#remove(toast.id, 'manual');
  }

  onToastKeydown(event: KeyboardEvent, toast: Toast): void {
    if (toast.dismissible && (event.key === 'Escape' || event.key === 'Delete')) {
      event.preventDefault();
      this.#remove(toast.id, 'manual');
    }
  }

  onPointerEnter(): void {
    if (this.pauseOnHover()) {
      this.#paused.set(true);
      this.#clearAllTimers();
    }
  }

  onPointerLeave(): void {
    if (this.#paused()) {
      this.#paused.set(false);
      this.#syncTimers();
    }
  }

  ariaLive(toast: Toast): 'assertive' | 'polite' {
    return ASSERTIVE.includes(toast.severity) ? 'assertive' : 'polite';
  }

  iconPath(severity: ToastSeverity): string {
    switch (severity) {
      case 'success':
        return 'M20 6 9 17l-5-5';
      case 'warning':
        return 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z';
      case 'danger':
        return 'M12 8v5m0 3h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z';
      default:
        return 'M12 16v-5m0-3h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z';
    }
  }

  trackById(_index: number, toast: Toast): string {
    return toast.id;
  }

  #onWindowToast(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    if (Array.isArray(detail)) {
      for (const entry of detail) {
        const toast = normalizeToast(entry, this.#defaults());
        if (toast) {
          this.#enqueue(toast);
        }
      }
      return;
    }
    const toast = normalizeToast(detail, this.#defaults());
    if (toast) {
      this.#enqueue(toast);
    }
  }

  #enqueue(toast: Toast): void {
    // Replace any existing toast with the same id (idempotent updates).
    const next = this.#queue().filter((existing) => existing.id !== toast.id);
    this.#clearTimer(toast.id);
    next.push(toast);
    this.#queue.set(next);
    this.#syncTimers();
  }

  #remove(id: string, reason: ToastDismissDetail['reason']): void {
    const exists = this.#queue().some((toast) => toast.id === id);
    if (!exists) {
      return;
    }
    this.#clearTimer(id);
    this.#queue.set(this.#queue().filter((toast) => toast.id !== id));
    this.#emitDismiss(id, reason);
    this.#syncTimers();
  }

  #emitDismiss(id: string, reason: ToastDismissDetail['reason']): void {
    this.toastdismiss.emit({ id, reason });
  }

  /** Reconcile auto-dismiss timers against the currently visible toasts. */
  #syncTimers(): void {
    if (this.#paused()) {
      return;
    }
    const visibleIds = new Set(this.visibleToasts().map((toast) => toast.id));

    // Drop timers for toasts no longer visible.
    for (const id of [...this.#timers.keys()]) {
      if (!visibleIds.has(id)) {
        this.#clearTimer(id);
      }
    }

    // Start timers for visible, non-sticky toasts that lack one.
    if (typeof setTimeout !== 'function') {
      return;
    }
    for (const toast of this.visibleToasts()) {
      if (toast.duration <= 0 || this.#timers.has(toast.id)) {
        continue;
      }
      const timer = setTimeout(() => {
        this.#timers.delete(toast.id);
        this.#remove(toast.id, 'timeout');
      }, toast.duration);
      this.#timers.set(toast.id, timer);
    }
  }

  #clearTimer(id: string): void {
    const timer = this.#timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(id);
    }
  }

  #clearAllTimers(): void {
    for (const timer of this.#timers.values()) {
      clearTimeout(timer);
    }
    this.#timers.clear();
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
