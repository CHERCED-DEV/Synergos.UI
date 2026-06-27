import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynProgressBar</c>.
 *
 * A horizontal progress indicator with two modes:
 *  - determinate: fills proportionally to `value` against `max` (0..100%);
 *  - indeterminate: an animated sweep when the amount of work is unknown.
 *
 * Exposes the WAI-ARIA `progressbar` role with `aria-valuenow/min/max` (or
 * an indeterminate bar without `aria-valuenow`, per spec). Honors
 * `prefers-reduced-motion` for the indeterminate sweep.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type ProgressBarSize = 'sm' | 'md' | 'lg';
export type ProgressBarTone = 'brand' | 'success' | 'warning' | 'danger';

export interface ProgressBarRuntimeConfig {
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
  readonly label?: string;
  readonly showValue?: boolean;
  readonly size?: ProgressBarSize;
  readonly tone?: ProgressBarTone;
}

const DEFAULT_MAX = 100;
const VALID_SIZES: readonly ProgressBarSize[] = ['sm', 'md', 'lg'];
const VALID_TONES: readonly ProgressBarTone[] = ['brand', 'success', 'warning', 'danger'];

/** Clamp a finite number into [min, max]; returns min for non-finite input. */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** Resolve a usable positive ceiling from raw config; falls back to 100. */
export function resolveMax(raw: number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_MAX;
}

/** Whole-percent fill (0..100) of `value` against `max`. */
export function computePercent(value: number, max: number): number {
  const safeMax = resolveMax(max);
  const clamped = clampNumber(value, 0, safeMax);
  return Math.round((clamped / safeMax) * 100);
}

function sanitizeProgressBarConfig(
  value: Partial<ProgressBarRuntimeConfig>,
): ProgressBarRuntimeConfig {
  return omitUndefinedProperties<ProgressBarRuntimeConfig>({
    value: coerceOptionalNumberInput(value.value),
    max: coerceOptionalNumberInput(value.max),
    indeterminate: coerceOptionalBooleanInput(value.indeterminate),
    label: coerceTrimmedStringInput(value.label),
    showValue: coerceOptionalBooleanInput(value.showValue),
    size: coerceStringEnumInput(value.size, VALID_SIZES),
    tone: coerceStringEnumInput(value.tone, VALID_TONES),
  });
}

@Component({
  selector: 'sg-progress-bar',
  standalone: true,
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-progress-bar',
    '[attr.data-size]': 'size()',
    '[attr.data-tone]': 'tone()',
    '[attr.data-indeterminate]': 'indeterminate() ? "" : null',
  },
})
export class ProgressBarElementComponent {
  readonly config = input<ProgressBarRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ProgressBarRuntimeConfig>(sanitizeProgressBarConfig),
  });

  // CMS bridge inputs (string-friendly aliases). `valueNow`/`valueMax` keep
  // the scaffold's aliases for backwards compatibility with the schema.
  readonly valueInput = input<string | number | undefined>(undefined, { alias: 'value' });
  readonly valueNowInput = input<string | number | undefined>(undefined, { alias: 'valueNow' });
  readonly maxInput = input<string | number | undefined>(undefined, { alias: 'max' });
  readonly valueMaxInput = input<string | number | undefined>(undefined, { alias: 'valueMax' });
  readonly indeterminateInput = input<string | boolean | undefined>(undefined, {
    alias: 'indeterminate',
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly showValueInput = input<string | boolean | undefined>(undefined, { alias: 'showValue' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly toneInput = input<string | undefined>(undefined, { alias: 'tone' });
  readonly integration = input<string | undefined>(undefined);

  readonly max = computed(() =>
    resolveMax(
      resolveConfigValue(
        coerceOptionalNumberInput(this.maxInput() ?? this.valueMaxInput()),
        this.config()?.max,
        DEFAULT_MAX,
      ),
    ),
  );

  readonly value = computed(() => {
    const resolved = resolveConfigValue(
      coerceOptionalNumberInput(this.valueInput() ?? this.valueNowInput()),
      this.config()?.value,
      0,
    );
    return clampNumber(resolved, 0, this.max());
  });

  readonly indeterminate = computed(() =>
    resolveConfigValue(
      coerceOptionalBooleanInput(this.indeterminateInput()),
      this.config()?.indeterminate,
      false,
    ),
  );

  readonly size = computed<ProgressBarSize>(() =>
    resolveConfigValue(
      coerceStringEnumInput(this.sizeInput(), VALID_SIZES),
      this.config()?.size,
      'md',
    ),
  );

  readonly tone = computed<ProgressBarTone>(() =>
    resolveConfigValue(
      coerceStringEnumInput(this.toneInput(), VALID_TONES),
      this.config()?.tone,
      'brand',
    ),
  );

  readonly label = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.labelInput()), this.config()?.label, ''),
  );

  readonly showValue = computed(() =>
    resolveConfigValue(
      coerceOptionalBooleanInput(this.showValueInput()),
      this.config()?.showValue,
      false,
    ),
  );

  /** Whole-percent fill for the determinate bar (0 while indeterminate). */
  readonly percent = computed(() =>
    this.indeterminate() ? 0 : computePercent(this.value(), this.max()),
  );

  /** `aria-valuenow`, suppressed (null) while indeterminate per ARIA spec. */
  readonly ariaValueNow = computed<number | null>(() =>
    this.indeterminate() ? null : this.value(),
  );

  /** Accessible name shown to AT and (optionally) rendered as a caption. */
  readonly accessibleLabel = computed(() => this.label() || 'Progreso');

  /** Human-readable percent string for the optional value caption. */
  readonly valueText = computed(() => (this.indeterminate() ? '' : `${this.percent()}%`));

  /** Inline width style for the determinate fill. */
  readonly fillWidth = computed(() => (this.indeterminate() ? '100%' : `${this.percent()}%`));
}
