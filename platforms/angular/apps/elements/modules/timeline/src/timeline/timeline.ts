import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { TimelineProps } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { t } from '@synergos/vitals-core';
import { createConfigInputTransform, omitUndefinedProperties } from '@synergos/shared';

/**
 * <synergos-timeline>: a vertical timeline — an ordered list of milestones, each with a date,
 * title and body, joined by a continuous connector. Built for editorial "trayectoria / historia /
 * roadmap" sections.
 *
 * El `config` que manda el CMS tiene la forma de `TimelineProps`, GENERADO del record C#
 * (ADR 0135): `events` es una LISTA ya parseada (`date`, `title`, `body`). Esta cabecera decía
 * «every CMS property is a TypeScript input with the same alias», y era falso: la vista mandaba
 * el TEXTO `eventsJson` y la línea de tiempo colocada salía sin hitos (D1). `title`,
 * `emptyLabel` y `locale` no los autora el editor: son atributos, igual que `eventsJson`, que
 * gana sobre el `config`. `orientation` se acepta como atributo y no se pinta: siempre vertical.
 *
 * Su microcopia sale del diccionario, sección `Timeline` (ADR 0136): el nombre de la región sin
 * título y la línea vacía. El atributo `emptyLabel` sigue ganando.
 */

/** Normalized, render-ready timeline item. */
export interface TimelineItem {
  readonly id: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly dateTime: string | null;
  readonly title: string;
  readonly body: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LOCALE = 'es-CO';
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

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

/**
 * Format an ISO `yyyy-mm-dd` date as a localized human label. Non-ISO
 * strings are passed through verbatim so editors can write free-form
 * dates ("2024", "Q3 2025", "Marzo de 2026").
 */
export function formatTimelineDate(raw: string, locale: string): string {
  const trimmed = raw.trim();
  if (!ISO_DATE.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  try {
    return new Intl.DateTimeFormat(locale || DEFAULT_LOCALE, DATE_FORMAT).format(parsed);
  } catch {
    return trimmed;
  }
}

export function normalizeTimelineEvents(
  value: unknown,
  locale: string,
): readonly TimelineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): TimelineItem | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const date = readString(entry['date']).trim();
      const title = readString(entry['title']).trim();
      const body = readString(entry['body']).trim();

      if (!date && !title && !body) {
        return null;
      }

      return {
        id: `timeline-item-${index}`,
        date,
        dateLabel: formatTimelineDate(date, locale),
        dateTime: ISO_DATE.test(date) ? date : null,
        title,
        body,
      };
    })
    .filter((item): item is TimelineItem => item !== null);
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeTimelineConfig(value: Partial<TimelineProps>): Partial<TimelineProps> {
  return omitUndefinedProperties<TimelineProps>({
    events: Array.isArray(value.events) ? value.events : undefined,
  });
}

@Component({
  selector: 'sg-timeline',
  standalone: true,
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-timeline' },
})
export class TimelineElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<TimelineProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TimelineProps>(sanitizeTimelineConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly eventsJson = input<string | undefined>(undefined, { alias: 'eventsJson' });
  readonly orientation = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly integration = input<string | undefined>(undefined, { alias: 'integration' });

  readonly title = computed(() => this.titleInput() ?? '');
  readonly emptyLabel = computed(() => this.emptyLabelInput() ?? t('Timeline.Empty', 'No hay hitos para mostrar.'));

  /** El nombre de la región: el título, o `Timeline.Aria` si no lo tiene. */
  readonly regionLabel = computed(() => this.title() || t('Timeline.Aria', 'Línea de tiempo'));
  readonly locale = computed(() => this.localeInput() ?? DEFAULT_LOCALE);

  readonly hasTitle = computed(() => this.title().trim().length > 0);

  readonly items = computed<readonly TimelineItem[]>(() =>
    normalizeTimelineEvents(
      this.resolveSource(this.eventsJson(), this.config()?.events),
      this.locale(),
    ),
  );

  readonly hasItems = computed(() => this.items().length > 0);

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
