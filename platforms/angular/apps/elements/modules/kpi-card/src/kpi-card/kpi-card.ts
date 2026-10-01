import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { KpiCardProps } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { t } from '@synergos/vitals-core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-kpi-card>: a single KPI tile — a large value, an optional delta with
 * directional colour (positive / negative / neutral), a descriptive label, an
 * optional period caption and an optional sparkline rendered from a numeric series.
 *
 * El `config` que manda el CMS tiene la forma de `KpiCardProps`, GENERADO del record C#
 * del mismo nombre (ADR 0135): el sanitizador se tipa con él, así que leer una clave que el
 * CMS no manda no compila. Antes esta cabecera decía «every CMS property is a TypeScript
 * input with the same alias», y era falso: la vista mandaba `kpiLabel`… y este elemento
 * leía `label`…, así que el bundle borraba al hidratar lo que el SSR había pintado (D1).
 *
 * `delta` (número) y `sparkline` NO viajan en el `config`: el editor no los autora. Siguen
 * siendo atributos del elemento para quien lo monte a mano; los atributos ganan sobre el
 * `config`, que gana sobre los defaults (`resolveConfigValue`).
 *
 * Su microcopia sale del diccionario, sección `Synhost.Kpi` (ADR 0136) — la MISMA que usa el
 * respaldo SSR de la vista para la frase de la tendencia. Antes este elemento escribía «al alza» a
 * mano y, al hidratar, reemplazaba «Tendencia al alza» que el SSR había pintado del diccionario.
 */

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

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeKpiCardConfig(value: Partial<KpiCardProps>): Partial<KpiCardProps> {
  return omitUndefinedProperties<KpiCardProps>({
    label: coerceTrimmedStringInput(value.label),
    value: coerceTrimmedStringInput(value.value),
    deltaLabel: coerceTrimmedStringInput(value.deltaLabel),
    trend: normalizeTrend(value.trend) ?? undefined,
    period: coerceTrimmedStringInput(value.period),
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

  readonly config = input<Partial<KpiCardProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<KpiCardProps>(sanitizeKpiCardConfig),
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
    const resolved = this.deltaInput();
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

  readonly series = computed<readonly number[]>(() => {
    const raw = this.sparklineInput();
    return normalizeSeries(raw === undefined ? undefined : this.#initialData.parseValue<unknown>(raw));
  });

  readonly sparkline = computed<Sparkline | null>(() => buildSparkline(this.series()));
  readonly hasSparkline = computed(() => this.sparkline() !== null);

  /**
   * La frase de la tendencia para un lector de pantalla — «Tendencia al alza: +12 % vs. agosto» —,
   * con la misma clave que el respaldo SSR (`Synhost.Kpi.Trend.*`): el SSR y la hidratación dicen
   * lo mismo.
   */
  readonly trendDescription = computed<string>(() => {
    if (!this.hasDelta()) {
      return '';
    }
    const frase =
      this.trend() === 'up'
        ? t('Synhost.Kpi.Trend.Up', 'Tendencia al alza')
        : this.trend() === 'down'
          ? t('Synhost.Kpi.Trend.Down', 'Tendencia a la baja')
          : t('Synhost.Kpi.Trend.Flat', 'Tendencia estable');
    const period = this.hasPeriod() ? ` ${this.period()}` : '';
    return `${frase}: ${this.deltaLabel()}${period}`;
  });

  /** El nombre del grupo cuando el editor no le dio rótulo, y el texto de «sin valor». */
  readonly groupLabel = computed(() => this.label() || t('Synhost.Kpi.Aria', 'Indicador'));
  readonly noDataLabel = computed(() => t('Synhost.Kpi.NoData', 'Sin dato'));
  readonly sparklineLabel = computed(() =>
    t('Synhost.Kpi.Sparkline', 'Evolución: {label}', { label: this.groupLabel() }),
  );
}
