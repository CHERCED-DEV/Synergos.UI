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
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Web Component for the CMS element `elementSynCountdownDigital`.
 *
 * Renders a large-number digital countdown toward an ISO `targetDate`, updating
 * once per second with an optional per-digit flip animation. When the target
 * has passed it swaps to an "event started" message. `prefers-reduced-motion`
 * disables the flip.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config` which wins over defaults.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type CountdownStyle = 'flip' | 'plain';

interface CountdownLabels {
  readonly days: string;
  readonly hours: string;
  readonly minutes: string;
  readonly seconds: string;
}

const DEFAULT_LABELS: CountdownLabels = {
  days: 'Días',
  hours: 'Horas',
  minutes: 'Minutos',
  seconds: 'Segundos',
};

interface CountdownUnit {
  readonly key: keyof CountdownLabels;
  readonly value: number;
  readonly label: string;
  readonly display: string;
}

export interface CountdownDigitalRuntimeConfig {
  readonly targetDate?: string;
  readonly startedLabel?: string;
  readonly invalidLabel?: string;
  readonly showLabels?: boolean;
  readonly style?: CountdownStyle;
  readonly labels?: Partial<CountdownLabels>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStyle(value: unknown): CountdownStyle | undefined {
  const trimmed = coerceTrimmedStringInput(value)?.toLowerCase();
  return trimmed === 'flip' || trimmed === 'plain' ? trimmed : undefined;
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

function sanitizeCountdownDigitalConfig(
  value: Partial<CountdownDigitalRuntimeConfig> & { style?: unknown; labels?: unknown },
): CountdownDigitalRuntimeConfig {
  return omitUndefinedProperties<CountdownDigitalRuntimeConfig>({
    targetDate: coerceTrimmedStringInput(value.targetDate),
    startedLabel: coerceTrimmedStringInput(value.startedLabel),
    invalidLabel: coerceTrimmedStringInput(value.invalidLabel),
    showLabels: coerceOptionalBooleanInput(value.showLabels),
    style: normalizeStyle(value.style),
    labels: normalizeLabels(value.labels),
  });
}

function padTwo(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

@Component({
  selector: 'sg-countdown-digital',
  standalone: true,
  templateUrl: './countdown-digital.html',
  styleUrl: './countdown-digital.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-countdown-digital',
    '[class.sg-countdown-digital--started]': 'hasStarted()',
    '[class.sg-countdown-digital--flip]': 'isFlip()',
  },
})
export class CountdownDigitalElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CountdownDigitalRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CountdownDigitalRuntimeConfig>(sanitizeCountdownDigitalConfig),
  });

  /**
   * Canonical alias is `targetDate`; `endDateTime` is kept as a
   * backwards-compatible alias matching the original scaffold/CMS property.
   */
  readonly targetDateInput = input<string | undefined>(undefined, { alias: 'targetDate' });
  readonly endDateTimeInput = input<string | undefined>(undefined, { alias: 'endDateTime' });
  readonly showLabelsInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'showLabels',
    transform: coerceOptionalBooleanInput,
  });
  readonly styleInput = input<CountdownStyle | undefined, unknown>(undefined, {
    alias: 'style',
    transform: normalizeStyle,
  });
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

  readonly showLabels = computed(() =>
    resolveConfigValue(this.showLabelsInput(), this.config()?.showLabels, true),
  );
  readonly style = computed<CountdownStyle>(() =>
    resolveConfigValue(this.styleInput(), this.config()?.style, 'flip'),
  );
  readonly isFlip = computed(() => this.style() === 'flip');

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
    resolveConfigValue(this.startedLabelInput(), this.config()?.startedLabel, 'El evento ha comenzado'),
  );

  /** Shown when no valid target date is configured. */
  readonly invalidLabel = computed(() =>
    resolveConfigValue(this.invalidLabelInput(), this.config()?.invalidLabel, 'Fecha del evento no disponible'),
  );

  readonly remainingMs = computed<number | null>(() => {
    const target = this.targetMs();
    if (target === null) {
      return null;
    }
    return Math.max(0, target - this.#now());
  });

  readonly hasTarget = computed(() => this.targetMs() !== null);
  readonly hasStarted = computed(() => this.remainingMs() === 0 && this.hasTarget());

  readonly units = computed<readonly CountdownUnit[]>(() => {
    const remaining = this.remainingMs() ?? 0;
    const labels = this.labels();

    const days = Math.floor(remaining / DAY);
    const hours = Math.floor((remaining % DAY) / HOUR);
    const minutes = Math.floor((remaining % HOUR) / MINUTE);
    const seconds = Math.floor((remaining % MINUTE) / SECOND);

    return [
      { key: 'days', value: days, label: labels.days, display: padTwo(days) },
      { key: 'hours', value: hours, label: labels.hours, display: padTwo(hours) },
      { key: 'minutes', value: minutes, label: labels.minutes, display: padTwo(minutes) },
      { key: 'seconds', value: seconds, label: labels.seconds, display: padTwo(seconds) },
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
    return this.units()
      .map((unit) => `${unit.value} ${unit.label}`)
      .join(', ');
  });

  constructor() {
    const intervalId = setInterval(() => {
      if (this.hasStarted()) {
        return;
      }
      this.#now.set(Date.now());
    }, SECOND);

    this.#destroyRef.onDestroy(() => clearInterval(intervalId));
  }
}
