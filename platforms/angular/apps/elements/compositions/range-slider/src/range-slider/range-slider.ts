import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynRangeSlider</c>.
 *
 * A dual-thumb range slider that lets a visitor pick a low/high bound inside
 * a numeric domain. Built for faceted filters (price/area/age) in the
 * PROPIEDADES and TIENDA verticals. Single-thumb mode is available by setting
 * `range` to false — then only the high thumb is used as the value.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 *
 * Selecting a value emits a `rangechange` CustomEvent with the resolved
 * `{ low, high }` pair (clamped + snapped to `step`).
 */
export interface RangeSliderRuntimeConfig {
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly low?: number;
  readonly high?: number;
  readonly range?: boolean;
  readonly prefix?: string;
  readonly suffix?: string;
}

/** Emitted on the `rangechange` CustomEvent and the typed Angular output. */
export interface RangeChangeDetail {
  readonly low: number;
  readonly high: number;
}

/** Which thumb is being driven by the keyboard / pointer. */
export type RangeThumb = 'low' | 'high';

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;
const LARGE_STEP_DIVISOR = 10;

/** Coerce to a finite number, or fall back when unparseable. */
function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = coerceOptionalNumberInput(value);
  return parsed === undefined ? fallback : parsed;
}

/** Snap a value to the nearest step starting from `min`, then clamp to range. */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const safeStep = step > 0 ? step : DEFAULT_STEP;
  const snapped = min + Math.round((value - min) / safeStep) * safeStep;
  const clamped = Math.min(Math.max(snapped, min), max);
  // Guard against binary float drift (e.g. 0.30000000000000004).
  return Number(clamped.toFixed(6));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeRangeSliderConfig(
  value: Partial<RangeSliderRuntimeConfig>,
): RangeSliderRuntimeConfig {
  return omitUndefinedProperties<RangeSliderRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    min: coerceOptionalNumberInput(value.min),
    max: coerceOptionalNumberInput(value.max),
    step: coerceOptionalNumberInput(value.step),
    low: coerceOptionalNumberInput(value.low),
    high: coerceOptionalNumberInput(value.high),
    range: typeof value.range === 'boolean' ? value.range : undefined,
    prefix: coerceTrimmedStringInput(value.prefix),
    suffix: coerceTrimmedStringInput(value.suffix),
  });
}

/** Parse a boolean-ish attribute ("false"/"0"/"no" → false). */
function parseBoolean(raw: string | undefined, configValue: boolean | undefined): boolean {
  if (raw !== undefined) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === '' || normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    return true;
  }
  return configValue ?? true;
}

@Component({
  selector: 'sg-range-slider',
  standalone: true,
  templateUrl: './range-slider.html',
  styleUrl: './range-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-range-slider' },
})
export class RangeSliderElementComponent {
  readonly config = input<RangeSliderRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<RangeSliderRuntimeConfig>(sanitizeRangeSliderConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly minInput = input<string | undefined>(undefined, { alias: 'minValue' });
  readonly maxInput = input<string | undefined>(undefined, { alias: 'maxValue' });
  readonly stepInput = input<string | undefined>(undefined, { alias: 'step' });
  readonly initialValueInput = input<string | undefined>(undefined, { alias: 'initialValue' });
  readonly rangeInput = input<string | undefined>(undefined, { alias: 'range' });
  readonly prefixInput = input<string | undefined>(undefined, { alias: 'prefix' });
  readonly suffixInput = input<string | undefined>(undefined, { alias: 'suffix' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `rangechange` CustomEvent. */
  readonly rangechange = output<RangeChangeDetail>();

  readonly label = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.labelInput()), this.config()?.label, ''),
  );

  readonly prefix = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.prefixInput()), this.config()?.prefix, ''),
  );

  readonly suffix = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.suffixInput()), this.config()?.suffix, ''),
  );

  /** Dual-thumb when true; single (high) thumb otherwise. */
  readonly isRange = computed(() => parseBoolean(this.rangeInput(), this.config()?.range));

  readonly min = computed(() =>
    toFiniteNumber(
      resolveConfigValue(coerceOptionalNumberInput(this.minInput()), this.config()?.min, DEFAULT_MIN),
      DEFAULT_MIN,
    ),
  );

  /** Max, kept strictly greater than min so the track never collapses. */
  readonly max = computed(() => {
    const min = this.min();
    const raw = toFiniteNumber(
      resolveConfigValue(coerceOptionalNumberInput(this.maxInput()), this.config()?.max, DEFAULT_MAX),
      DEFAULT_MAX,
    );
    return raw > min ? raw : min + DEFAULT_MAX;
  });

  readonly step = computed(() => {
    const raw = toFiniteNumber(
      resolveConfigValue(coerceOptionalNumberInput(this.stepInput()), this.config()?.step, DEFAULT_STEP),
      DEFAULT_STEP,
    );
    return raw > 0 ? raw : DEFAULT_STEP;
  });

  /** Larger jump used by PageUp / PageDown. */
  readonly largeStep = computed(() => {
    const span = this.max() - this.min();
    const candidate = span / LARGE_STEP_DIVISOR;
    return candidate > this.step() ? candidate : this.step();
  });

  /** Configured initial low/high parsed from `initialValue` or config. */
  readonly #initialBounds = computed<RangeChangeDetail>(() => {
    const min = this.min();
    const max = this.max();
    const step = this.step();

    let lowRaw: number | undefined = this.config()?.low;
    let highRaw: number | undefined = this.config()?.high;

    const raw = coerceTrimmedStringInput(this.initialValueInput());
    if (raw) {
      const parsed = this.parseInitialValue(raw);
      if (parsed.low !== undefined) {
        lowRaw = parsed.low;
      }
      if (parsed.high !== undefined) {
        highRaw = parsed.high;
      }
    }

    const low = snapToStep(lowRaw ?? min, min, max, step);
    const high = snapToStep(highRaw ?? max, min, max, step);
    return low <= high ? { low, high } : { low: high, high: low };
  });

  /** Live low/high state, seeded from config and reset when config changes. */
  readonly #low = signal(DEFAULT_MIN);
  readonly #high = signal(DEFAULT_MAX);
  readonly low = this.#low.asReadonly();
  readonly high = this.#high.asReadonly();

  /** Percent offsets for positioning the thumbs / fill (0–100). */
  readonly lowPercent = computed(() => this.toPercent(this.isRange() ? this.#low() : this.min()));
  readonly highPercent = computed(() => this.toPercent(this.#high()));

  readonly fillStart = computed(() => (this.isRange() ? this.lowPercent() : 0));
  readonly fillEnd = computed(() => this.highPercent());

  /** Human-readable label for the current selection (with prefix/suffix). */
  readonly displayValue = computed(() => {
    const high = this.formatValue(this.#high());
    if (!this.isRange()) {
      return high;
    }
    return `${this.formatValue(this.#low())} – ${high}`;
  });

  constructor() {
    // Re-seed live values whenever the resolved initial bounds change.
    effect(() => {
      const { low, high } = this.#initialBounds();
      this.#low.set(low);
      this.#high.set(high);
    });
  }

  formatValue(value: number): string {
    return `${this.prefix()}${value}${this.suffix()}`;
  }

  /** Pointer/native input on a thumb; `raw` is the slider's numeric value. */
  onThumbInput(thumb: RangeThumb, raw: number | string): void {
    const value = snapToStep(toFiniteNumber(raw, this.min()), this.min(), this.max(), this.step());
    this.setThumb(thumb, value);
  }

  /** Keyboard handling on a thumb (Arrow/Home/End/PageUp/PageDown). */
  onThumbKeydown(event: KeyboardEvent, thumb: RangeThumb): void {
    const step = this.step();
    const large = this.largeStep();
    const current = thumb === 'low' ? this.#low() : this.#high();

    const handlers: Record<string, () => number | undefined> = {
      ArrowRight: () => current + step,
      ArrowUp: () => current + step,
      ArrowLeft: () => current - step,
      ArrowDown: () => current - step,
      PageUp: () => current + large,
      PageDown: () => current - large,
      Home: () => this.min(),
      End: () => this.max(),
    };

    const next = handlers[event.key]?.();
    if (next === undefined) {
      return;
    }

    event.preventDefault();
    this.setThumb(thumb, snapToStep(next, this.min(), this.max(), this.step()));
  }

  /** Update one thumb, keeping low <= high, then emit the change. */
  private setThumb(thumb: RangeThumb, value: number): void {
    if (!this.isRange() || thumb === 'high') {
      const floor = this.isRange() ? this.#low() : this.min();
      this.#high.set(Math.max(value, floor));
    } else {
      this.#low.set(Math.min(value, this.#high()));
    }

    this.rangechange.emit({ low: this.#low(), high: this.#high() });
  }

  private toPercent(value: number): number {
    const min = this.min();
    const span = this.max() - min;
    if (span <= 0) {
      return 0;
    }
    return Math.min(Math.max(((value - min) / span) * 100, 0), 100);
  }

  /** Parse `initialValue` — supports "low,high", a single number, or JSON. */
  private parseInitialValue(raw: string): { low?: number; high?: number } {
    const trimmed = raw.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return {
            low: coerceOptionalNumberInput(parsed[0]),
            high: coerceOptionalNumberInput(parsed[1]),
          };
        }
        if (isRecord(parsed)) {
          return {
            low: coerceOptionalNumberInput(parsed['low']),
            high: coerceOptionalNumberInput(parsed['high']),
          };
        }
      } catch {
        // Fall through to delimiter parsing.
      }
    }

    if (trimmed.includes(',')) {
      const [lowPart, highPart] = trimmed.split(',');
      return {
        low: coerceOptionalNumberInput(lowPart),
        high: coerceOptionalNumberInput(highPart),
      };
    }

    return { high: coerceOptionalNumberInput(trimmed) };
  }
}
