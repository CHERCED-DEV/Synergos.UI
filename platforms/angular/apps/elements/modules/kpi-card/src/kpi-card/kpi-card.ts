import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
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
 * Runtime config for the CMS element <c>elementSynKpiCard</c>.
 *
 * A single KPI tile: a large value, an optional delta with directional
 * colour (positive / negative / neutral), a descriptive label, an optional
 * period caption and an optional sparkline rendered from a numeric series.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface KpiCardRuntimeConfig {
  readonly label?: string;
  readonly value?: string;
  readonly delta?: number;
  readonly deltaLabel?: string;
  readonly trend?: string;
  readonly period?: string;
  readonly sparkline?: readonly number[];
}

/** Resolved trend direction driving the delta colour + arrow glyph. */
export type KpiTrend = 'up' | 'down' | 'flat';

interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

interface Sparkline {
  readonly points: string;
  readonly area: string;
  readonly last: SparklinePoint;
  readonly width: number;
  readonly height: number;
}

const TRENDS: readonly KpiTrend[] = ['up', 'down', 'flat'];

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 36;
const SPARK_PADDING = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.eE+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeTrend(value: unknown): KpiTrend | null {
  if (typeof value !== 'string') {
    return null;
  }
  const candidate = value.trim().toLowerCase() as KpiTrend;
  return TRENDS.includes(candidate) ? candidate : null;
}

export function normalizeSeries(value: unknown): readonly number[] {
  const source = isRecord(value) ? value['points'] ?? value['series'] : value;
  if (!Array.isArray(source)) {
    return [];
  }
  return source
    .map((entry) => readNumber(entry))
    .filter((entry): entry is number => entry !== null);
}

/** Derive a trend from a delta when none is supplied explicitly. */
export function trendFromDelta(delta: number | undefined): KpiTrend {
  if (delta === undefined || delta === 0) {
    return 'flat';
  }
  return delta > 0 ? 'up' : 'down';
}

/** Build a viewBox-relative polyline + filled area from a numeric series. */
export function buildSparkline(series: readonly number[]): Sparkline | null {
  if (series.length < 2) {
    return null;
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;

  const innerWidth = SPARK_WIDTH - SPARK_PADDING * 2;
  const innerHeight = SPARK_HEIGHT - SPARK_PADDING * 2;
  const stepX = innerWidth / (series.length - 1);

  const points = series.map((value, index): SparklinePoint => {
    const x = SPARK_PADDING + index * stepX;
    // SVG y grows downward, so invert the normalized value.
    const y = SPARK_PADDING + innerHeight - ((value - min) / span) * innerHeight;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const baseline = SPARK_HEIGHT - SPARK_PADDING;
  const area = `${first.x},${baseline} ${line} ${last.x},${baseline}`;

  return { points: line, area, last, width: SPARK_WIDTH, height: SPARK_HEIGHT };
}

function sanitizeKpiCardConfig(value: Partial<KpiCardRuntimeConfig>): KpiCardRuntimeConfig {
  return omitUndefinedProperties<KpiCardRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    value: coerceTrimmedStringInput(value.value),
    delta: coerceOptionalNumberInput(value.delta),
    deltaLabel: coerceTrimmedStringInput(value.deltaLabel),
    trend: coerceTrimmedStringInput(value.trend),
    period: coerceTrimmedStringInput(value.period),
    sparkline: value.sparkline,
  });
}

@Component({
  selector: 'sg-kpi-card',
  standalone: true,
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-kpi-card' },
})
export class KpiCardElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<KpiCardRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<KpiCardRuntimeConfig>(sanitizeKpiCardConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly valueInput = input<string | undefined>(undefined, { alias: 'value' });
  readonly deltaInput = input<number | undefined, unknown>(undefined, {
    alias: 'delta',
    transform: coerceOptionalNumberInput,
  });
  readonly deltaLabelInput = input<string | undefined>(undefined, { alias: 'deltaLabel' });
  readonly trendInput = input<string | undefined>(undefined, { alias: 'trend' });
  readonly periodInput = input<string | undefined>(undefined, { alias: 'period' });
  readonly sparklineInput = input<string | undefined>(undefined, { alias: 'sparkline' });
  readonly integration = input<string | undefined>(undefined);

  readonly label = computed(() => resolveConfigValue(this.labelInput(), this.config()?.label, ''));
  readonly value = computed(() => resolveConfigValue(this.valueInput(), this.config()?.value, ''));
  readonly period = computed(() =>
    resolveConfigValue(this.periodInput(), this.config()?.period, ''),
  );

  readonly delta = computed<number | undefined>(() => {
    const resolved = resolveConfigValue(this.deltaInput(), this.config()?.delta, undefined);
    return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : undefined;
  });

  /** Trend: explicit input/config wins; otherwise derived from the delta. */
  readonly trend = computed<KpiTrend>(() => {
    const explicit =
      normalizeTrend(this.trendInput()) ?? normalizeTrend(this.config()?.trend);
    return explicit ?? trendFromDelta(this.delta());
  });

  /** Human-readable delta caption, e.g. "+12.5%" — falls back from the value. */
  readonly deltaLabel = computed<string>(() => {
    const explicit = resolveConfigValue(this.deltaLabelInput(), this.config()?.deltaLabel, '');
    if (explicit) {
      return explicit;
    }
    const delta = this.delta();
    if (delta === undefined) {
      return '';
    }
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta}%`;
  });

  readonly hasDelta = computed(() => this.deltaLabel().length > 0);
  readonly hasValue = computed(() => this.value().trim().length > 0);
  readonly hasPeriod = computed(() => this.period().trim().length > 0);

  readonly series = computed<readonly number[]>(() =>
    normalizeSeries(this.resolveSource(this.sparklineInput(), this.config()?.sparkline)),
  );

  readonly sparkline = computed<Sparkline | null>(() => buildSparkline(this.series()));
  readonly hasSparkline = computed(() => this.sparkline() !== null);

  /** Accessible description combining delta direction + period for screen readers. */
  readonly trendDescription = computed<string>(() => {
    if (!this.hasDelta()) {
      return '';
    }
    const direction =
      this.trend() === 'up' ? 'al alza' : this.trend() === 'down' ? 'a la baja' : 'sin cambio';
    const period = this.hasPeriod() ? ` ${this.period()}` : '';
    return `Variación ${this.deltaLabel()} ${direction}${period}`.trim();
  });

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
