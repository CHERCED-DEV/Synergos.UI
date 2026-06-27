import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import { coerceOptionalBooleanInput } from '@synergos/shared';

/**
 * Web Component for the CMS element `elementSynTimelineHorizontal`.
 *
 * Renders a horizontally scrollable, multi-track agenda. Items carry a `time`
 * (HH:mm), a `track` (lane), and a `title`. The component derives the hour axis
 * from the earliest/latest item and places each item in a CSS grid cell at the
 * intersection of its hour column and its track row. On mobile the grid scrolls
 * horizontally; optional scroll-snap aligns columns.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias (`eventsJson`/`items`, `snapEnabled`, `integration`).
 */

interface TimelineItem {
  readonly time: string;
  readonly track: string;
  readonly title: string;
  readonly description: string;
  /** Minutes since midnight, derived from `time`. */
  readonly minutes: number;
}

interface PlacedItem extends TimelineItem {
  /** 1-based grid column (hour slot + 1 for the track-label column). */
  readonly column: number;
  /** 1-based grid row (track index + 1 for the hour-axis row). */
  readonly row: number;
}

interface HourColumn {
  readonly label: string;
  /** 1-based grid column. */
  readonly column: number;
}

interface TrackRow {
  readonly label: string;
  /** 1-based grid row. */
  readonly row: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Parse "HH:mm" (or "H:mm") into minutes-since-midnight, or null. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatHour(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  return `${hours.toString().padStart(2, '0')}:00`;
}

function normalizeItem(value: unknown): TimelineItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const time = readString(value['time']).trim();
  const title = readString(value['title']).trim();
  const minutes = parseTimeToMinutes(time);
  if (!title || minutes === null) {
    return null;
  }
  return {
    time,
    title,
    track: readString(value['track']).trim() || 'General',
    description: readString(value['description']).trim(),
    minutes,
  };
}

export function normalizeItems(value: unknown): readonly TimelineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeItem(item))
    .filter((item): item is TimelineItem => item !== null);
}

@Component({
  selector: 'sg-timeline-horizontal',
  standalone: true,
  templateUrl: './timeline-horizontal.html',
  styleUrl: './timeline-horizontal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-timeline-horizontal',
    '[class.sg-timeline-horizontal--snap]': 'snap()',
  },
})
export class TimelineHorizontalElementComponent {
  readonly #initialData = inject(InitialDataService);

  /** Canonical alias `items`; `eventsJson` kept for the original scaffold/CMS. */
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly eventsJson = input<string | undefined>(undefined);
  readonly snapInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'snapEnabled',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  readonly snap = computed(() => this.snapInput() ?? true);

  readonly items = computed<readonly TimelineItem[]>(() => {
    const raw = this.itemsInput() ?? this.eventsJson();
    return normalizeItems(this.#initialData.parseValue<unknown>(raw));
  });

  readonly hasItems = computed(() => this.items().length > 0);

  /** Distinct tracks in first-seen order. */
  readonly tracks = computed<readonly TrackRow[]>(() => {
    const seen = new Set<string>();
    const rows: TrackRow[] = [];
    for (const item of this.items()) {
      if (!seen.has(item.track)) {
        seen.add(item.track);
        // +2: row 1 is the hour axis; rows are 1-based.
        rows.push({ label: item.track, row: rows.length + 2 });
      }
    }
    return rows;
  });

  /** Hour columns spanning the earliest..latest item (inclusive). */
  readonly hours = computed<readonly HourColumn[]>(() => {
    const items = this.items();
    if (items.length === 0) {
      return [];
    }
    const minutesList = items.map((item) => item.minutes);
    const startHour = Math.floor(Math.min(...minutesList) / 60);
    const endHour = Math.floor(Math.max(...minutesList) / 60);

    const columns: HourColumn[] = [];
    for (let hour = startHour; hour <= endHour; hour += 1) {
      // +2: column 1 is the track-label column; columns are 1-based.
      columns.push({ label: formatHour(hour * 60), column: hour - startHour + 2 });
    }
    return columns;
  });

  readonly #startHour = computed(() => {
    const items = this.items();
    return items.length === 0 ? 0 : Math.floor(Math.min(...items.map((item) => item.minutes)) / 60);
  });

  readonly #trackRowMap = computed(() => {
    const map = new Map<string, number>();
    for (const track of this.tracks()) {
      map.set(track.label, track.row);
    }
    return map;
  });

  readonly placedItems = computed<readonly PlacedItem[]>(() => {
    const startHour = this.#startHour();
    const rowMap = this.#trackRowMap();
    return this.items().map((item) => ({
      ...item,
      column: Math.floor(item.minutes / 60) - startHour + 2,
      row: rowMap.get(item.track) ?? 2,
    }));
  });

  /** Grid template: a sticky label column + one column per hour. */
  readonly gridColumns = computed(
    () => `var(--th-label-width) repeat(${this.hours().length}, var(--th-col-width))`,
  );

  readonly gridRows = computed(
    () => `var(--th-axis-height) repeat(${this.tracks().length}, minmax(var(--th-row-height), auto))`,
  );
}
