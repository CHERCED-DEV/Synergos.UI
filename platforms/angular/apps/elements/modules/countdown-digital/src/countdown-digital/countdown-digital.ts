import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CountdownDigitalProps } from '@synergos/contracts';
import {
  type CountdownMilestone,
  LiveRegionComponent,
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  countdownMilestone,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { t } from '@synergos/vitals-core';

/**
 * Web Component for the CMS element `elementSynCountdownDigital`.
 *
 * Renders a large-number digital countdown toward an ISO `targetDate`, updating
 * once per second with an optional per-digit flip animation. When the target
 * has passed it swaps to an "event started" message. `prefers-reduced-motion`
 * disables the flip.
 *
 * El `config` que manda el CMS tiene la forma de `CountdownDigitalProps`, GENERADO del record C#
 * (ADR 0135): `targetDate` es la fecha ISO que escribió el editor, `showLabels` su interruptor
 * (viaja siempre: `false` es una decisión) y `style` con el nombre de este elemento (el CMS
 * traduce `digits` a `plain`). La vista mandaba `endDateTime` y el reloj decía «Fecha del evento
 * no disponible» (D1). `startedLabel`, `invalidLabel` y `labels` llegan por atributo.
 *
 * Sin atributo, los textos salen del diccionario con `t()` (ADR 0136), de la sección
 * `Countdown` que declara `CountdownDigitalProps` — la MISMA que declara `countdown-clock`: son el
 * mismo concepto (UI#86), y los hitos, «empezó» y «no disponible» son una clave cada uno, no dos.
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

/** Los rótulos de cada unidad, del diccionario (sección `Countdown`, ADR 0136). */
function defaultLabels(): CountdownLabels {
  return {
    days: t('Countdown.Days', 'Días'),
    hours: t('Countdown.Hours', 'Horas'),
    minutes: t('Countdown.Minutes', 'Minutos'),
    seconds: t('Countdown.Seconds', 'Segundos'),
  };
}

interface CountdownUnit {
  readonly key: keyof CountdownLabels;
  readonly value: number;
  readonly label: string;
  readonly display: string;
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

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeCountdownDigitalConfig(value: Partial<CountdownDigitalProps>): Partial<CountdownDigitalProps> {
  return omitUndefinedProperties<CountdownDigitalProps>({
    targetDate: coerceTrimmedStringInput(value.targetDate),
    showLabels: coerceOptionalBooleanInput(value.showLabels),
    style: normalizeStyle(value.style),
  });
}

/**
 * Lo que el reloj dice EN VOZ ALTA (#82): los mismos umbrales —y las mismas claves— que `countdown-clock`. Antes, un
 * `aria-live="polite"` sobre la frase del tiempo restante la anunciaba en cada tic. El tiempo
 * exacto lo describe el `role="timer"` —que calla por definición— y en voz alta sólo se dicen
 * estos umbrales, una vez cada uno. El último, «empezó», lo pone `startedLabel`.
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
  selector: 'sg-countdown-digital',
  standalone: true,
  imports: [LiveRegionComponent],
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

  readonly config = input<Partial<CountdownDigitalProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CountdownDigitalProps>(sanitizeCountdownDigitalConfig),
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

  readonly showLabels = computed(() =>
    resolveConfigValue(this.showLabelsInput(), this.config()?.showLabels, true),
  );
  readonly style = computed<CountdownStyle>(() =>
    resolveConfigValue(this.styleInput(), normalizeStyle(this.config()?.style), 'flip'),
  );
  readonly isFlip = computed(() => this.style() === 'flip');

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
    this.startedLabelInput() ?? t('Countdown.Started', 'El evento ha comenzado'),
  );

  /** Shown when no valid target date is configured. */
  readonly invalidLabel = computed(() =>
    this.invalidLabelInput() ?? t('Countdown.Unavailable', 'Fecha del evento no disponible'),
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
    return this.units()
      .map((unit) => `${unit.value} ${unit.label}`)
      .join(', ');
  });

  /**
   * El hito cruzado, o `''`. Vale lo mismo durante toda una franja, así que sólo CAMBIA al cruzar
   * un umbral — y `syn-live-region` sólo anuncia cambios. El primer valor, el de la carga, no se
   * anuncia.
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
