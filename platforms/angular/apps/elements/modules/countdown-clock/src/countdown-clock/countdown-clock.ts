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
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Web Component for the CMS element `elementSynCountdownClock`.
 *
 * Renders a circular-ring countdown toward an ISO `targetDate`, updating once
 * per second. Each ring (days / hours / minutes / seconds) shows a progress
 * arc plus the numeric value. When the target has passed, the component swaps
 * to an "event started" state.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config` which wins over defaults (see `resolveConfigValue`).
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface CountdownLabels {
  readonly days: string;
  readonly hours: string;
  readonly minutes: string;
  readonly seconds: string;
}

const DEFAULT_LABELS: CountdownLabels = {
  days: 'Días',
  hours: 'Horas',
  minutes: 'Min',
  seconds: 'Seg',
};

interface CountdownSegment {
  readonly key: keyof CountdownLabels;
  readonly value: number;
  readonly label: string;
  /** Fraction 0..1 of the ring that should be filled. */
  readonly fraction: number;
  /** Two-digit, locale-stable string for display. */
  readonly display: string;
}

export interface CountdownClockRuntimeConfig {
  readonly targetDate?: string;
  readonly startedLabel?: string;
  readonly invalidLabel?: string;
  readonly labels?: Partial<CountdownLabels>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeLabels(value: unknown): Partial<CountdownLabels> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const labels = omitUndefinedProperties<CountdownLabels>({
    days: coerceTrimmedStringInput(value['days']),
    hours: coerceTrimmedStringInput(value['hours']),
    minutes: coerceTrimmedStringInput(value['minutes']),
    seconds: coerceTrimmedStringInput(value['seconds']),
  });

  return Object.keys(labels).length > 0 ? labels : undefined;
}

/** Parse an ISO-8601 (or any Date-parseable) string into epoch ms, or null. */
export function parseTargetDate(value: string | undefined): number | null {
  const trimmed = coerceTrimmedStringInput(value);
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeCountdownClockConfig(
  value: Partial<CountdownClockRuntimeConfig> & { labels?: unknown },
): CountdownClockRuntimeConfig {
  return omitUndefinedProperties<CountdownClockRuntimeConfig>({
    targetDate: coerceTrimmedStringInput(value.targetDate),
    startedLabel: coerceTrimmedStringInput(value.startedLabel),
    invalidLabel: coerceTrimmedStringInput(value.invalidLabel),
    labels: normalizeLabels(value.labels),
  });
}

function padTwo(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

@Component({
  selector: 'sg-countdown-clock',
  standalone: true,
  templateUrl: './countdown-clock.html',
  styleUrl: './countdown-clock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-countdown-clock',
    '[class.sg-countdown-clock--started]': 'hasStarted()',
  },
})
export class CountdownClockElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CountdownClockRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CountdownClockRuntimeConfig>(sanitizeCountdownClockConfig),
  });

  /**
   * ISO target date. Canonical alias is `targetDate`; `endDateTime` is kept as
   * a backwards-compatible alias matching the original scaffold/CMS property.
   */
  readonly targetDateInput = input<string | undefined>(undefined, { alias: 'targetDate' });
  readonly endDateTimeInput = input<string | undefined>(undefined, { alias: 'endDateTime' });
  readonly labelFormatInput = input<string | undefined>(undefined, { alias: 'labelFormat' });
  readonly startedLabelInput = input<string | undefined>(undefined, { alias: 'startedLabel' });
  readonly invalidLabelInput = input<string | undefined>(undefined, { alias: 'invalidLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Reactive "now", refreshed by the per-second tick. */
  readonly #now = signal<number>(Date.now());

  readonly targetMs = computed(() =>
    parseTargetDate(
      resolveConfigValue(
        this.targetDateInput() ?? this.endDateTimeInput(),
        this.config()?.targetDate,
        '',
      ),
    ),
  );

  readonly labels = computed<CountdownLabels>(() => {
    const fromConfig = this.config()?.labels ?? {};
    return {
      days: fromConfig.days ?? DEFAULT_LABELS.days,
      hours: fromConfig.hours ?? DEFAULT_LABELS.hours,
      minutes: fromConfig.minutes ?? DEFAULT_LABELS.minutes,
      seconds: fromConfig.seconds ?? DEFAULT_LABELS.seconds,
    };
  });

  readonly startedLabel = computed(() =>
    resolveConfigValue(
      this.startedLabelInput() ?? coerceTrimmedStringInput(this.labelFormatInput()),
      this.config()?.startedLabel,
      'El evento ha comenzado',
    ),
  );

  /** Shown when no valid target date is configured. */
  readonly invalidLabel = computed(() =>
    resolveConfigValue(this.invalidLabelInput(), this.config()?.invalidLabel, 'Fecha del evento no disponible'),
  );

  /** Remaining ms, clamped to >= 0. null when there is no valid target. */
  readonly remainingMs = computed<number | null>(() => {
    const target = this.targetMs();
    if (target === null) {
      return null;
    }
    return Math.max(0, target - this.#now());
  });

  readonly hasTarget = computed(() => this.targetMs() !== null);
  readonly hasStarted = computed(() => this.remainingMs() === 0 && this.hasTarget());

  readonly segments = computed<readonly CountdownSegment[]>(() => {
    const remaining = this.remainingMs() ?? 0;
    const labels = this.labels();

    const days = Math.floor(remaining / DAY);
    const hours = Math.floor((remaining % DAY) / HOUR);
    const minutes = Math.floor((remaining % HOUR) / MINUTE);
    const seconds = Math.floor((remaining % MINUTE) / SECOND);

    return [
      { key: 'days', value: days, label: labels.days, fraction: Math.min(days / 365, 1), display: `${days}` },
      { key: 'hours', value: hours, label: labels.hours, fraction: hours / 24, display: padTwo(hours) },
      { key: 'minutes', value: minutes, label: labels.minutes, fraction: minutes / 60, display: padTwo(minutes) },
      { key: 'seconds', value: seconds, label: labels.seconds, fraction: seconds / 60, display: padTwo(seconds) },
    ];
  });

  /** Screen-reader sentence rebuilt each tick under aria-live=polite. */
  readonly ariaSummary = computed(() => {
    if (!this.hasTarget()) {
      return '';
    }
    if (this.hasStarted()) {
      return this.startedLabel();
    }
    return this.segments()
      .map((segment) => `${segment.value} ${segment.label}`)
      .join(', ');
  });

  /** Circumference for an r=42 ring inside a 100x100 viewBox. */
  readonly ringCircumference = 2 * Math.PI * 42;

  constructor() {
    const intervalId = setInterval(() => {
      // Stop spending cycles once the event has started.
      if (this.hasStarted()) {
        return;
      }
      this.#now.set(Date.now());
    }, SECOND);

    this.#destroyRef.onDestroy(() => clearInterval(intervalId));
  }

  /** Stroke-dashoffset for a ring given its fill fraction. */
  ringOffset(fraction: number): number {
    const clamped = Math.max(0, Math.min(1, fraction));
    return this.ringCircumference * (1 - clamped);
  }
}
