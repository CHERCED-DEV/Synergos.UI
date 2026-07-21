import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynTooltip</c>.
 *
 * An accessible, on-demand tooltip: it wraps a short trigger label and reveals
 * a supplementary message on hover and on keyboard focus. The trigger is a
 * real focusable button so the tooltip is reachable without a pointer; the
 * bubble is linked via `aria-describedby` so assistive tech announces it, and
 * `Escape` dismisses it (WAI-ARIA tooltip pattern).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface TooltipRuntimeConfig {
  readonly triggerText?: string;
  readonly tooltipText?: string;
  readonly position?: string;
  readonly delay?: number;
}

/** Side of the trigger the bubble is anchored to. */
export type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

export const TOOLTIP_POSITIONS: readonly TooltipPosition[] = ['top', 'right', 'bottom', 'left'];

const DEFAULT_POSITION: TooltipPosition = 'top';
const DEFAULT_DELAY_MS = 120;
const MAX_DELAY_MS = 2000;

/** Clamp an arbitrary delay to a sane, non-negative window. */
export function normalizeDelay(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return DEFAULT_DELAY_MS;
  }
  return Math.min(Math.round(value), MAX_DELAY_MS);
}

/** Coerce arbitrary input to a supported anchor side, or '' when unknown. */
export function normalizePosition(value: unknown): TooltipPosition | '' {
  return coerceStringEnumInput(value, TOOLTIP_POSITIONS) ?? '';
}

function sanitizeTooltipConfig(value: Partial<TooltipRuntimeConfig>): TooltipRuntimeConfig {
  return omitUndefinedProperties<TooltipRuntimeConfig>({
    triggerText: coerceTrimmedStringInput(value.triggerText),
    tooltipText: coerceTrimmedStringInput(value.tooltipText),
    position: coerceTrimmedStringInput(value.position),
    delay: coerceOptionalNumberInput(value.delay),
  });
}

let tooltipInstanceCounter = 0;

@Component({
  selector: 'sg-tooltip',
  standalone: true,
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tooltip' },
})
export class TooltipElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<TooltipRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TooltipRuntimeConfig>(sanitizeTooltipConfig),
  });
  readonly triggerTextInput = input<string | undefined>(undefined, { alias: 'triggerText' });
  readonly tooltipTextInput = input<string | undefined>(undefined, { alias: 'tooltipText' });
  readonly positionInput = input<string | undefined>(undefined, { alias: 'position' });
  readonly delayInput = input<number | undefined, unknown>(undefined, {
    alias: 'delay',
    transform: coerceOptionalNumberInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Stable id linking the trigger (`aria-describedby`) to the bubble. */
  readonly bubbleId = `syn-tooltip-${++tooltipInstanceCounter}`;

  readonly triggerText = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.triggerTextInput()),
      coerceTrimmedStringInput(this.config()?.triggerText),
      '',
    ),
  );

  readonly tooltipText = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.tooltipTextInput()),
      coerceTrimmedStringInput(this.config()?.tooltipText),
      '',
    ),
  );

  readonly position = computed<TooltipPosition>(() => {
    const fromInput = normalizePosition(this.positionInput());
    if (fromInput) {
      return fromInput;
    }
    const fromConfig = normalizePosition(this.config()?.position);
    return fromConfig || DEFAULT_POSITION;
  });

  readonly delay = computed(() =>
    normalizeDelay(resolveConfigValue(this.delayInput(), this.config()?.delay, DEFAULT_DELAY_MS)),
  );

  /** A tooltip is only renderable when it has a label and a message. */
  readonly hasContent = computed(() => this.triggerText().length > 0 && this.tooltipText().length > 0);

  readonly #open = signal(false);
  readonly open = this.#open.asReadonly();

  #showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.#destroyRef.onDestroy(() => this.clearTimer());
  }

  /** Pointer enter / keyboard focus → reveal after the configured delay. */
  show(): void {
    if (!this.hasContent() || this.#open()) {
      return;
    }

    this.clearTimer();
    const delay = this.delay();
    if (delay === 0 || typeof setTimeout !== 'function') {
      this.#open.set(true);
      return;
    }

    this.#showTimer = setTimeout(() => {
      this.#showTimer = null;
      this.#open.set(true);
    }, delay);
  }

  /** Pointer leave / blur / Escape → hide immediately and cancel any pending reveal. */
  hide(): void {
    this.clearTimer();
    if (this.#open()) {
      this.#open.set(false);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.#open()) {
      event.preventDefault();
      this.hide();
    }
  }

  private clearTimer(): void {
    if (this.#showTimer !== null) {
      clearTimeout(this.#showTimer);
      this.#showTimer = null;
    }
  }
}
