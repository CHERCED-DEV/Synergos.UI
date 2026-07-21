import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynTimeline</c>.
 *
 * A vertical timeline: an ordered list of milestones, each with a date,
 * title and body, joined by a continuous connector. Built for editorial
 * "trayectoria / historia / roadmap" sections. Items can be supplied
 * inline via `events` (JSON array) or via a `config` object.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. Explicit attributes win over `config`, which wins over defaults
 * (see `resolveConfigValue`).
 */
export interface TimelineRuntimeConfig {
  readonly title?: string;
  readonly emptyLabel?: string;
  readonly locale?: string;
  readonly events?: readonly TimelineEventConfig[];
}

export interface TimelineEventConfig {
  readonly date?: string;
  readonly title?: string;
  readonly body?: string;
}

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

function sanitizeTimelineConfig(
  value: Partial<TimelineRuntimeConfig>,
): TimelineRuntimeConfig {
  return omitUndefinedProperties<TimelineRuntimeConfig>({
    title: coerceTrimmedStringInput(value.title),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    locale: coerceTrimmedStringInput(value.locale),
    events: value.events,
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

  readonly config = input<TimelineRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TimelineRuntimeConfig>(sanitizeTimelineConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly eventsJson = input<string | undefined>(undefined, { alias: 'eventsJson' });
  readonly orientation = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly integration = input<string | undefined>(undefined, { alias: 'integration' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(
      this.emptyLabelInput(),
      this.config()?.emptyLabel,
      'No hay hitos para mostrar.',
    ),
  );
  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );

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
