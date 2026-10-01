import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CountdownClockProps } from '@synergos/contracts';
import {
  type CountdownMilestone,
  LiveRegionComponent,
  coerceTrimmedStringInput,
  countdownMilestone,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { t } from '@synergos/vitals-core';

/**
 * Web Component for the CMS element `elementSynCountdownClock`.
 *
 * Renders a circular-ring countdown toward an ISO `targetDate`, updating once
 * per second. Each ring (days / hours / minutes / seconds) shows a progress
 * arc plus the numeric value. When the target has passed, the component swaps
 * to an "event started" state.
 *
 * El `config` que manda el CMS tiene la forma de `CountdownClockProps`, GENERADO del record C#
 * (ADR 0135): `targetDate` es la fecha ISO que escribió el editor, validada y sin reescribir. La
 * vista la mandaba como `endDateTime` y el reloj decía «Fecha del evento no disponible» (D1).
 * `startedLabel`, `invalidLabel` y `labels` no los autora el editor: llegan por atributo.
 *
 * Sin atributo, los textos salen del diccionario con `t()` (ADR 0136), de la sección
 * `Countdown` que declara `CountdownClockProps` — la MISMA que declara `countdown-digital`: son el
 * mismo concepto (UI#86), y los hitos, «empezó» y «no disponible» son una clave cada uno, no dos.
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

/**
 * Los rótulos de cada anillo, del diccionario (sección `Countdown`, ADR 0136). Los anillos son
 * chicos: minutos y segundos van abreviados, con su propia clave (`Countdown.Short.*`); días y
 * horas son las mismas claves que usa `countdown-digital`.
 */
function defaultLabels(): CountdownLabels {
  return {
    days: t('Countdown.Days', 'Días'),
    hours: t('Countdown.Hours', 'Horas'),
    minutes: t('Countdown.Short.Minutes', 'Min'),
    seconds: t('Countdown.Short.Seconds', 'Seg'),
  };
}

interface CountdownSegment {
  readonly key: keyof CountdownLabels;
  readonly value: number;
  readonly label: string;
  /** Fraction 0..1 of the ring that should be filled. */
  readonly fraction: number;
  /** Two-digit, locale-stable string for display. */
  readonly display: string;
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

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeCountdownClockConfig(value: Partial<CountdownClockProps>): Partial<CountdownClockProps> {
  return omitUndefinedProperties<CountdownClockProps>({
    targetDate: coerceTrimmedStringInput(value.targetDate),
  });
}

/**
 * Lo que el reloj dice EN VOZ ALTA (#82). Antes, un `aria-live="polite"` sobre la frase del
 * tiempo restante la anunciaba en cada tic: un lector de pantalla hablando cada segundo mientras
 * la página esté abierta. El tiempo exacto lo describe el `role="timer"` —que calla por
 * definición— y en voz alta sólo se dicen estos umbrales, una vez cada uno. El último, «empezó»,
 * lo pone `startedLabel`.
 */
function milestones(): readonly CountdownMilestone[] {
  return [
    { atSeconds: DAY / SECOND, message: t('Countdown.Milestone.Day', 'Falta menos de un día.') },
    { atSeconds: HOUR / SECOND, message: t('Countdown.Milestone.Hour', 'Falta menos de una hora.') },
    { atSeconds: (10 * MINUTE) / SECOND, message: t('Countdown.Milestone.TenMinutes', 'Faltan menos de 10 minutos.') },
    { atSeconds: MINUTE / SECOND, message: t('Countdown.Milestone.Minute', 'Falta menos de un minuto.') },
  ];
}

function padTwo(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

@Component({
  selector: 'sg-countdown-clock',
  standalone: true,
  imports: [LiveRegionComponent],
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

  readonly config = input<Partial<CountdownClockProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CountdownClockProps>(sanitizeCountdownClockConfig),
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
  /**
   * Los rótulos de cada unidad (`{"days":"Días",…}`, JSON). No los autora el CMS (ADR 0135): son
   * atributo, no viajan en `config`.
   */
  readonly labelsInput = input<Partial<CountdownLabels> | undefined, unknown>(undefined, {
    alias: 'labels',
    transform: createConfigInputTransform<CountdownLabels>((value) => normalizeLabels(value)),
  });
  readonly integration = input<string | undefined>(undefined);

  /** Los hitos del diccionario: se leen una vez (sin señales de las que depender), no en cada tic. */
  readonly #milestones = computed(() => milestones());

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
    const fromConfig = this.labelsInput() ?? {};
    const defaults = defaultLabels();
    return {
      days: fromConfig.days ?? defaults.days,
      hours: fromConfig.hours ?? defaults.hours,
      minutes: fromConfig.minutes ?? defaults.minutes,
      seconds: fromConfig.seconds ?? defaults.seconds,
    };
  });

  readonly startedLabel = computed(() =>
    this.startedLabelInput() ??
    coerceTrimmedStringInput(this.labelFormatInput()) ??
    t('Countdown.Started', 'El evento ha comenzado'),
  );

  /** Shown when no valid target date is configured. */
  readonly invalidLabel = computed(() =>
    this.invalidLabelInput() ?? t('Countdown.Unavailable', 'Fecha del evento no disponible'),
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

  /**
   * La frase del tiempo restante, rehecha en cada tic. DESCRIBE el reloj (el `aria-label` del
   * `role="timer"` y el texto que se lee al recorrer la página); NO se anuncia — ver `milestone`.
   */
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

  /**
   * El hito cruzado, o `''`. Vale lo mismo durante toda una franja, así que sólo CAMBIA al cruzar
   * un umbral — y `syn-live-region` sólo anuncia cambios. El primer valor, el de la carga, no se
   * anuncia: quien abre la página a 3 horas del evento no necesita oír «falta menos de un día».
   */
  readonly milestone = computed(() => {
    const remaining = this.remainingMs();
    if (remaining === null) {
      return '';
    }
    return countdownMilestone(Math.ceil(remaining / SECOND), [
      ...this.#milestones(),
      { atSeconds: 0, message: this.startedLabel() },
    ]);
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
