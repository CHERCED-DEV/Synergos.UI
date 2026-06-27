import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynChartBar</c>.
 *
 * A responsive, accessible bar chart. Each datum renders as a labelled bar
 * whose length is proportional to its value relative to the largest value (or
 * an explicit `maxValue`). A visually-hidden data table mirrors the chart for
 * screen readers, so the visual is purely decorative for AT.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface ChartBarRuntimeConfig {
  readonly title?: string;
  readonly orientation?: string;
  readonly valueAxisLabel?: string;
  readonly categoryAxisLabel?: string;
  readonly maxValue?: number;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly locale?: string;
  readonly showValues?: boolean;
  readonly emptyLabel?: string;
  readonly data?: readonly ChartBarDatumConfig[];
}

export interface ChartBarDatumConfig {
  readonly label?: string;
  readonly value?: number;
  readonly color?: string;
}

/** A validated data point (label + finite value guaranteed). */
interface ChartBarPoint {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

/** A normalized, render-ready bar. */
export interface ChartBarDatum {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly displayValue: string;
  /** 0–100, the bar length relative to the chart maximum. */
  readonly percent: number;
  /** Optional per-bar accent (CSS color string), or '' to use the token. */
  readonly color: string;
}

export type ChartBarOrientation = 'vertical' | 'horizontal';

const ORIENTATIONS: readonly ChartBarOrientation[] = ['vertical', 'horizontal'];
const DEFAULT_LOCALE = 'es-CO';
const DEFAULT_EMPTY_LABEL = 'No hay datos para graficar.';

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

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeOrientation(value: unknown): ChartBarOrientation {
  const candidate = readString(value).trim().toLowerCase() as ChartBarOrientation;
  return ORIENTATIONS.includes(candidate) ? candidate : 'vertical';
}

/** Parse arbitrary config/attribute data into clean numeric data points. */
export function normalizeData(value: unknown): readonly ChartBarPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): ChartBarPoint | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const label = readString(entry['label']).trim() || readString(entry['name']).trim();
      const numeric = readNumber(entry['value']);
      if (!label || numeric === null) {
        return null;
      }

      return {
        label,
        value: numeric,
        color: readString(entry['color']).trim(),
      };
    })
    .filter((datum): datum is ChartBarPoint => datum !== null);
}

function sanitizeChartBarConfig(value: Partial<ChartBarRuntimeConfig>): ChartBarRuntimeConfig {
  return omitUndefinedProperties<ChartBarRuntimeConfig>({
    title: coerceTrimmedStringInput(value.title),
    orientation: coerceTrimmedStringInput(value.orientation),
    valueAxisLabel: coerceTrimmedStringInput(value.valueAxisLabel),
    categoryAxisLabel: coerceTrimmedStringInput(value.categoryAxisLabel),
    maxValue: typeof value.maxValue === 'number' ? value.maxValue : undefined,
    valuePrefix: coerceTrimmedStringInput(value.valuePrefix),
    valueSuffix: coerceTrimmedStringInput(value.valueSuffix),
    locale: coerceTrimmedStringInput(value.locale),
    showValues: coerceOptionalBooleanInput(value.showValues),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    data: value.data,
  });
}

@Component({
  selector: 'sg-chart-bar',
  standalone: true,
  templateUrl: './chart-bar.html',
  styleUrl: './chart-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-chart-bar' },
})
export class ChartBarElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<ChartBarRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ChartBarRuntimeConfig>(sanitizeChartBarConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'chartTitle' });
  readonly orientationInput = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly valueAxisLabelInput = input<string | undefined>(undefined, { alias: 'valueAxisLabel' });
  readonly categoryAxisLabelInput = input<string | undefined>(undefined, {
    alias: 'categoryAxisLabel',
  });
  readonly maxValueInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxValue',
    transform: (value: unknown) => readNumber(value) ?? undefined,
  });
  readonly valuePrefixInput = input<string | undefined>(undefined, { alias: 'valuePrefix' });
  readonly valueSuffixInput = input<string | undefined>(undefined, { alias: 'valueSuffix' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly showValuesInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'showValues',
    transform: coerceOptionalBooleanInput,
  });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly dataJsonInput = input<string | undefined>(undefined, { alias: 'dataJson' });
  /** Reserved bridge attribute (framework/integration hint); unused at render. */
  readonly integration = input<string | undefined>(undefined);

  /** Index of the bar currently hovered/focused, for the active highlight. */
  readonly activeIndex = signal<number | null>(null);

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly orientation = computed<ChartBarOrientation>(() =>
    normalizeOrientation(resolveConfigValue(this.orientationInput(), this.config()?.orientation, 'vertical')),
  );
  readonly valueAxisLabel = computed(() =>
    resolveConfigValue(this.valueAxisLabelInput(), this.config()?.valueAxisLabel, ''),
  );
  readonly categoryAxisLabel = computed(() =>
    resolveConfigValue(this.categoryAxisLabelInput(), this.config()?.categoryAxisLabel, ''),
  );
  readonly valuePrefix = computed(() =>
    resolveConfigValue(this.valuePrefixInput(), this.config()?.valuePrefix, ''),
  );
  readonly valueSuffix = computed(() =>
    resolveConfigValue(this.valueSuffixInput(), this.config()?.valueSuffix, ''),
  );
  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );
  readonly showValues = computed(() =>
    resolveConfigValue(this.showValuesInput(), this.config()?.showValues, true),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, DEFAULT_EMPTY_LABEL),
  );

  readonly #rawData = computed<readonly ChartBarPoint[]>(() =>
    normalizeData(this.resolveSource(this.dataJsonInput(), this.config()?.data)),
  );

  /** Chart maximum: explicit `maxValue` if larger than data, else data peak. */
  readonly maxValue = computed<number>(() => {
    const configured = resolveConfigValue(this.maxValueInput(), this.config()?.maxValue, 0);
    const peak = this.#rawData().reduce((max, datum) => Math.max(max, datum.value), 0);
    const candidate = Math.max(configured, peak);
    return candidate > 0 ? candidate : 1;
  });

  readonly #numberFormat = computed(() => new Intl.NumberFormat(this.locale()));

  readonly bars = computed<readonly ChartBarDatum[]>(() => {
    const max = this.maxValue();
    const format = this.#numberFormat();
    const prefix = this.valuePrefix();
    const suffix = this.valueSuffix();

    return this.#rawData().map((datum, index): ChartBarDatum => {
      const ratio = max > 0 ? datum.value / max : 0;
      const percent = Math.max(0, Math.min(100, Math.round(ratio * 1000) / 10));
      return {
        id: `bar-${index}-${datum.label}`,
        label: datum.label,
        value: datum.value,
        displayValue: `${prefix}${format.format(datum.value)}${suffix}`.trim(),
        percent,
        color: datum.color ?? '',
      };
    });
  });

  readonly hasBars = computed(() => this.bars().length > 0);
  readonly hasTitle = computed(() => this.title().trim().length > 0);
  readonly hasValueAxisLabel = computed(() => this.valueAxisLabel().trim().length > 0);
  readonly hasCategoryAxisLabel = computed(() => this.categoryAxisLabel().trim().length > 0);

  /** ARIA summary describing the dataset for the chart region. */
  readonly chartSummary = computed(() => {
    const count = this.bars().length;
    const base = this.title().trim() || 'Gráfico de barras';
    if (count === 0) {
      return base;
    }
    const unit = count === 1 ? 'categoría' : 'categorías';
    return `${base}: ${count} ${unit}.`;
  });

  setActive(index: number | null): void {
    this.activeIndex.set(index);
  }

  isActive(index: number): boolean {
    return this.activeIndex() === index;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
