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
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynNotificationToast</c>.
 *
 * A stack of transient toasts anchored to a viewport corner. Each toast
 * carries a `variant` (info/success/warning/error), auto-dismisses after a
 * duration (paused while the pointer hovers the stack), and can be
 * dismissed manually. Errors announce assertively (`aria-live="assertive"`,
 * `role="alert"`); the rest announce politely (`role="status"`). New toasts
 * are pushed imperatively via `push()` or seeded declaratively via the
 * `toasts` / `message`+`type` inputs. Each dismissal emits a `toastdismiss`
 * CustomEvent.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type ToastVariant = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition =
  | 'top-start'
  | 'top-end'
  | 'top-center'
  | 'bottom-start'
  | 'bottom-end'
  | 'bottom-center';

export interface ToastSeedConfig {
  readonly message?: string;
  readonly title?: string;
  readonly variant?: string;
  readonly durationMs?: number;
}

export interface NotificationToastRuntimeConfig {
  readonly position?: string;
  readonly durationMs?: number;
  readonly toasts?: readonly ToastSeedConfig[];
}

export interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly title: string;
  readonly variant: ToastVariant;
  readonly durationMs: number;
}

/** Emitted on the `toastdismiss` CustomEvent and the typed Angular output. */
export interface ToastDismissDetail {
  readonly id: number;
  readonly message: string;
  readonly variant: ToastVariant;
}

const TOAST_VARIANTS: readonly ToastVariant[] = ['info', 'success', 'warning', 'error'];
const TOAST_POSITIONS: readonly ToastPosition[] = [
  'top-start',
  'top-end',
  'top-center',
  'bottom-start',
  'bottom-end',
  'bottom-center',
];

const DEFAULT_DURATION_MS = 5000;
const MIN_DURATION_MS = 0; // 0 → sticky (no auto-dismiss)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeVariant(value: unknown): ToastVariant {
  return coerceStringEnumInput(value, TOAST_VARIANTS) ?? 'info';
}

export function normalizePosition(value: unknown): ToastPosition {
  return coerceStringEnumInput(value, TOAST_POSITIONS) ?? 'top-end';
}

function normalizeDuration(value: unknown, fallback: number): number {
  const parsed = coerceOptionalNumberInput(value);
  if (parsed === undefined) {
    return fallback;
  }
  return parsed >= MIN_DURATION_MS ? parsed : fallback;
}

export function normalizeSeeds(value: unknown): readonly ToastSeedConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): ToastSeedConfig | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const message = readString(entry['message']).trim();
      if (!message) {
        return null;
      }
      return omitUndefinedProperties<ToastSeedConfig>({
        message,
        title: coerceTrimmedStringInput(entry['title']),
        variant: coerceTrimmedStringInput(entry['variant']),
        durationMs: coerceOptionalNumberInput(entry['durationMs']),
      });
    })
    .filter((seed): seed is ToastSeedConfig => seed !== null);
}

function sanitizeToastConfig(
  value: Partial<NotificationToastRuntimeConfig>,
): NotificationToastRuntimeConfig {
  return omitUndefinedProperties<NotificationToastRuntimeConfig>({
    position: coerceTrimmedStringInput(value.position),
    durationMs: coerceOptionalNumberInput(value.durationMs),
    toasts: value.toasts,
  });
}

@Component({
  selector: 'sg-notification-toast',
  standalone: true,
  templateUrl: './notification-toast.html',
  styleUrl: './notification-toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-notification-toast' },
})
export class NotificationToastElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<NotificationToastRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<NotificationToastRuntimeConfig>(sanitizeToastConfig),
  });
  readonly positionInput = input<string | undefined>(undefined, { alias: 'position' });
  readonly durationMsInput = input<string | undefined>(undefined, { alias: 'durationMs' });
  readonly toastsInput = input<string | undefined>(undefined, { alias: 'toasts' });
  /** Convenience single-toast seeds for the simplest CMS authoring. */
  readonly messageInput = input<string | undefined>(undefined, { alias: 'message' });
  readonly typeInput = input<string | undefined>(undefined, { alias: 'type' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `toastdismiss` CustomEvent. */
  readonly toastdismiss = output<ToastDismissDetail>();

  readonly position = computed<ToastPosition>(() =>
    normalizePosition(resolveConfigValue(this.positionInput(), this.config()?.position, 'top-end')),
  );

  readonly defaultDuration = computed(() => {
    // The attribute alias arrives as a string; config carries a number.
    // Either can win; normalizeDuration coerces both and clamps invalid input.
    const raw = this.durationMsInput() ?? this.config()?.durationMs;
    return normalizeDuration(raw, DEFAULT_DURATION_MS);
  });

  /** Politeness for the live region: assertive when any toast is an error. */
  readonly liveAssertive = computed(() => this.toasts().some((toast) => toast.variant === 'error'));

  readonly #toasts = signal<readonly ToastItem[]>([]);
  readonly toasts = this.#toasts.asReadonly();
  readonly hasToasts = computed(() => this.#toasts().length > 0);

  #sequence = 0;
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();
  #paused = false;

  constructor() {
    // Seed declaratively from config / single-message inputs. Runs once per
    // distinct seed signature; pushing imperatively is unaffected.
    effect(() => {
      const seeds = this.#resolveSeeds();
      // Read inside the effect so it re-runs on input change, but only seed
      // when the stack is empty to avoid duplicate floods on re-render.
      if (seeds.length > 0 && this.#toasts().length === 0 && this.#sequence === 0) {
        for (const seed of seeds) {
          this.push(seed.message ?? '', {
            title: seed.title,
            variant: seed.variant,
            durationMs: seed.durationMs,
          });
        }
      }
    });

    this.#destroyRef.onDestroy(() => this.#clearAllTimers());
  }

  /** Imperative API: push a toast onto the stack. Returns its id. */
  push(
    message: string,
    options: { title?: string; variant?: string; durationMs?: number } = {},
  ): number {
    const trimmed = (message ?? '').trim();
    if (!trimmed) {
      return -1;
    }

    const id = (this.#sequence += 1);
    const durationMs = normalizeDuration(options.durationMs, this.defaultDuration());
    const toast: ToastItem = {
      id,
      message: trimmed,
      title: (options.title ?? '').trim(),
      variant: normalizeVariant(options.variant),
      durationMs,
    };

    this.#toasts.update((current) => [...current, toast]);
    this.#scheduleDismiss(toast);
    return id;
  }

  /** Dismiss a single toast by id and emit `toastdismiss`. */
  dismiss(id: number): void {
    const toast = this.#toasts().find((item) => item.id === id);
    if (!toast) {
      return;
    }

    this.#clearTimer(id);
    this.#toasts.update((current) => current.filter((item) => item.id !== id));
    this.toastdismiss.emit({ id, message: toast.message, variant: toast.variant });
  }

  /** Dismiss every toast (e.g. route change). */
  clear(): void {
    for (const toast of [...this.#toasts()]) {
      this.dismiss(toast.id);
    }
  }

  /** Pause all auto-dismiss timers while the pointer is over the stack. */
  pause(): void {
    if (this.#paused) {
      return;
    }
    this.#paused = true;
    this.#clearAllTimers();
  }

  /** Resume auto-dismiss when the pointer leaves the stack. */
  resume(): void {
    if (!this.#paused) {
      return;
    }
    this.#paused = false;
    for (const toast of this.#toasts()) {
      this.#scheduleDismiss(toast);
    }
  }

  /** ARIA role per toast: errors are alerts, the rest are status. */
  toastRole(toast: ToastItem): 'alert' | 'status' {
    return toast.variant === 'error' ? 'alert' : 'status';
  }

  trackById(_index: number, toast: ToastItem): number {
    return toast.id;
  }

  #resolveSeeds(): readonly ToastSeedConfig[] {
    if (this.toastsInput() !== undefined) {
      return normalizeSeeds(this.#initialData.parseValue<unknown>(this.toastsInput()));
    }

    const fromConfig = normalizeSeeds(this.config()?.toasts);
    if (fromConfig.length > 0) {
      return fromConfig;
    }

    const single = (this.messageInput() ?? '').trim();
    if (single) {
      return [{ message: single, variant: coerceTrimmedStringInput(this.typeInput()) }];
    }

    return [];
  }

  #scheduleDismiss(toast: ToastItem): void {
    if (this.#paused || toast.durationMs <= 0 || typeof setTimeout !== 'function') {
      return;
    }
    this.#clearTimer(toast.id);
    const handle = setTimeout(() => this.dismiss(toast.id), toast.durationMs);
    this.#timers.set(toast.id, handle);
  }

  #clearTimer(id: number): void {
    const handle = this.#timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.#timers.delete(id);
    }
  }

  #clearAllTimers(): void {
    for (const handle of this.#timers.values()) {
      clearTimeout(handle);
    }
    this.#timers.clear();
  }
}
