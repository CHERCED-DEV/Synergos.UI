import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynCalendar</c>.
 *
 * A navigable month grid that marks days carrying events and lets a visitor
 * select a day. Built for the EVENTOS vertical (agenda) and BOOKING
 * (Reservar). Events can be supplied inline via `events` or fetched lazily
 * from `eventsEndpoint`. Selecting a day emits a `dateselect` CustomEvent
 * carrying the ISO date plus that day's events.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface CalendarRuntimeConfig {
  readonly initialMonth?: string;
  readonly locale?: string;
  readonly weekStartsOn?: number;
  readonly events?: readonly CalendarEventConfig[];
  readonly eventsEndpoint?: string;
}

export interface CalendarEventConfig {
  readonly date?: string;
  readonly title?: string;
  readonly href?: string;
}

export interface CalendarEvent {
  readonly date: string;
  readonly title: string;
  readonly href: string;
}

/** Emitted on the `dateselect` CustomEvent and the typed Angular output. */
export interface CalendarDateSelectDetail {
  readonly date: string;
  readonly events: readonly CalendarEvent[];
}

interface CalendarDay {
  readonly iso: string;
  readonly dayOfMonth: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly events: readonly CalendarEvent[];
  readonly label: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_WEEK = 7;
const GRID_WEEKS = 6;
const GRID_CELLS = DAYS_IN_WEEK * GRID_WEEKS;

const DEFAULT_LOCALE = 'es-CO';
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
const FULL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
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

/** Two-digit zero pad for month/day segments. */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Build a stable `YYYY-MM-DD` key from local date parts. */
function toIso(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Coerce arbitrary input to an `YYYY-MM-DD` key, or '' when unparseable. */
export function normalizeIsoDate(value: unknown): string {
  const raw = readString(value).trim();
  if (!raw) {
    return '';
  }

  if (ISO_DATE.test(raw)) {
    return raw;
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  const date = new Date(parsed);
  return toIso(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse a `YYYY-MM` (or `YYYY-MM-DD`) anchor into a first-of-month date. */
export function parseMonthAnchor(value: string | undefined): Date {
  const raw = coerceTrimmedStringInput(value);
  if (raw) {
    const match = /^(\d{4})-(\d{2})/.exec(raw);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (Number.isFinite(year) && monthIndex >= 0 && monthIndex <= 11) {
        return new Date(year, monthIndex, 1);
      }
    }
  }

  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function normalizeEvents(value: unknown): readonly CalendarEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): CalendarEvent | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const date = normalizeIsoDate(entry['date']);
      const title = readString(entry['title']).trim();
      if (!date || !title) {
        return null;
      }

      return {
        date,
        title,
        href: readString(entry['href']).trim() || readString(entry['url']).trim(),
      };
    })
    .filter((event): event is CalendarEvent => event !== null);
}

function sanitizeCalendarConfig(value: Partial<CalendarRuntimeConfig>): CalendarRuntimeConfig {
  return omitUndefinedProperties<CalendarRuntimeConfig>({
    initialMonth: coerceTrimmedStringInput(value.initialMonth),
    locale: coerceTrimmedStringInput(value.locale),
    weekStartsOn: typeof value.weekStartsOn === 'number' ? value.weekStartsOn : undefined,
    events: value.events,
    eventsEndpoint: coerceTrimmedStringInput(value.eventsEndpoint),
  });
}

@Component({
  selector: 'sg-calendar',
  standalone: true,
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-calendar' },
})
export class CalendarElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CalendarRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CalendarRuntimeConfig>(sanitizeCalendarConfig),
  });
  readonly initialMonthInput = input<string | undefined>(undefined, { alias: 'initialMonth' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly eventsInput = input<string | undefined>(undefined, { alias: 'events' });
  readonly eventsEndpointInput = input<string | undefined>(undefined, { alias: 'eventsEndpoint' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `dateselect` CustomEvent. */
  readonly dateselect = output<CalendarDateSelectDetail>();

  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );

  /** Inline / config events. */
  readonly inlineEvents = computed<readonly CalendarEvent[]>(() =>
    normalizeEvents(this.resolveSource(this.eventsInput(), this.config()?.events)),
  );

  /** Events fetched from `eventsEndpoint`, populated by the fetch effect. */
  readonly #fetchedEvents = signal<readonly CalendarEvent[]>([]);
  readonly #loading = signal(false);
  readonly #fetchFailed = signal(false);
  readonly loading = this.#loading.asReadonly();
  readonly fetchFailed = this.#fetchFailed.asReadonly();

  readonly eventsEndpoint = computed(() =>
    resolveConfigValue(this.eventsEndpointInput(), this.config()?.eventsEndpoint, ''),
  );

  /** Union of inline + fetched events, deduped by date+title. */
  readonly allEvents = computed<readonly CalendarEvent[]>(() => {
    const merged = [...this.inlineEvents(), ...this.#fetchedEvents()];
    const seen = new Set<string>();
    const result: CalendarEvent[] = [];
    for (const event of merged) {
      const key = `${event.date}::${event.title}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(event);
    }
    return result;
  });

  /** Events indexed by ISO date for O(1) day lookups. */
  readonly #eventsByDate = computed<Map<string, CalendarEvent[]>>(() => {
    const index = new Map<string, CalendarEvent[]>();
    for (const event of this.allEvents()) {
      const bucket = index.get(event.date);
      if (bucket) {
        bucket.push(event);
      } else {
        index.set(event.date, [event]);
      }
    }
    return index;
  });

  /** First-of-month anchor; navigable via prev/next. */
  readonly #monthAnchor = signal<Date>(parseMonthAnchor(undefined));

  /** Currently selected ISO day (null until the visitor picks one). */
  readonly selectedDate = signal<string | null>(null);

  /** Day that holds keyboard focus inside the grid (roving tabindex). */
  readonly #focusedDate = signal<string | null>(null);

  readonly #todayIso = toIso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(this.locale(), MONTH_FORMAT).format(this.#monthAnchor()),
  );

  /** Localized short weekday headers, honoring locale week order. */
  readonly weekdayLabels = computed<readonly string[]>(() => {
    const formatter = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    // 2024-01-07 is a Sunday — walk the seven days from there.
    return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + index)),
    );
  });

  /** The 6×7 grid of days surrounding the current month. */
  readonly weeks = computed<readonly (readonly CalendarDay[])[]>(() => {
    const anchor = this.#monthAnchor();
    const year = anchor.getFullYear();
    const monthIndex = anchor.getMonth();
    const index = this.#eventsByDate();
    const fullDate = new Intl.DateTimeFormat(this.locale(), FULL_DATE_FORMAT);

    // Sunday-first grid: back up to the Sunday on/before the 1st.
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const gridStart = new Date(year, monthIndex, 1 - firstWeekday);

    const days: CalendarDay[] = [];
    for (let offset = 0; offset < GRID_CELLS; offset++) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
      const iso = toIso(date.getFullYear(), date.getMonth(), date.getDate());
      const events = index.get(iso) ?? [];
      days.push({
        iso,
        dayOfMonth: date.getDate(),
        inMonth: date.getMonth() === monthIndex,
        isToday: iso === this.#todayIso,
        events,
        label: fullDate.format(date),
      });
    }

    const weeks: CalendarDay[][] = [];
    for (let week = 0; week < GRID_WEEKS; week++) {
      weeks.push(days.slice(week * DAYS_IN_WEEK, week * DAYS_IN_WEEK + DAYS_IN_WEEK));
    }
    return weeks;
  });

  readonly flatDays = computed<readonly CalendarDay[]>(() => this.weeks().flat());

  readonly hasEvents = computed(() => this.allEvents().length > 0);

  /** ISO date that should carry tabindex=0 (roving). */
  readonly focusedDate = computed<string>(() => {
    const focused = this.#focusedDate();
    if (focused && this.flatDays().some((day) => day.iso === focused)) {
      return focused;
    }

    const selected = this.selectedDate();
    if (selected && this.flatDays().some((day) => day.iso === selected)) {
      return selected;
    }

    const inMonthToday = this.flatDays().find((day) => day.inMonth && day.isToday);
    if (inMonthToday) {
      return inMonthToday.iso;
    }

    const firstInMonth = this.flatDays().find((day) => day.inMonth);
    return firstInMonth?.iso ?? this.flatDays()[0]?.iso ?? '';
  });

  constructor() {
    // Reset the anchor whenever the configured initial month changes.
    effect(() => {
      const anchor = parseMonthAnchor(
        resolveConfigValue(this.initialMonthInput(), this.config()?.initialMonth, ''),
      );
      this.#monthAnchor.set(anchor);
    });

    // Lazy-fetch events from the endpoint when one is configured.
    effect((onCleanup) => {
      const endpoint = this.eventsEndpoint().trim();
      this.#fetchedEvents.set([]);
      this.#fetchFailed.set(false);

      if (!endpoint || typeof fetch !== 'function') {
        this.#loading.set(false);
        return;
      }

      const controller = new AbortController();
      onCleanup(() => controller.abort());

      this.#loading.set(true);
      fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .then((data: unknown) => {
          const list = Array.isArray(data) ? data : isRecord(data) ? data['events'] : null;
          this.#fetchedEvents.set(normalizeEvents(list));
          this.#loading.set(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          this.#fetchFailed.set(true);
          this.#loading.set(false);
        });
    });

    this.#destroyRef.onDestroy(() => {
      // AbortController cleanup handled by effect onCleanup.
    });
  }

  previousMonth(): void {
    const anchor = this.#monthAnchor();
    this.#monthAnchor.set(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const anchor = this.#monthAnchor();
    this.#monthAnchor.set(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
  }

  selectDay(day: CalendarDay): void {
    if (!day.inMonth) {
      // Selecting an adjacent-month cell moves the view to that month.
      const [year, month] = day.iso.split('-').map(Number);
      this.#monthAnchor.set(new Date(year, month - 1, 1));
    }

    this.selectedDate.set(day.iso);
    this.#focusedDate.set(day.iso);

    const detail: CalendarDateSelectDetail = { date: day.iso, events: day.events };
    this.dateselect.emit(detail);
  }

  isSelected(day: CalendarDay): boolean {
    return this.selectedDate() === day.iso;
  }

  /** Roving keyboard navigation across the grid. */
  onDayKeydown(event: KeyboardEvent, day: CalendarDay): void {
    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(day.iso, 1),
      ArrowLeft: () => this.moveFocus(day.iso, -1),
      ArrowDown: () => this.moveFocus(day.iso, DAYS_IN_WEEK),
      ArrowUp: () => this.moveFocus(day.iso, -DAYS_IN_WEEK),
      Home: () => this.moveFocusToEdge(day.iso, 'start'),
      End: () => this.moveFocusToEdge(day.iso, 'end'),
      PageUp: () => this.shiftMonthKeepingDay(day.iso, -1),
      PageDown: () => this.shiftMonthKeepingDay(day.iso, 1),
      Enter: () => this.selectDay(day),
      ' ': () => this.selectDay(day),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(fromIso: string, delta: number): void {
    const [year, month, dayPart] = fromIso.split('-').map(Number);
    const next = new Date(year, month - 1, dayPart + delta);
    const nextIso = toIso(next.getFullYear(), next.getMonth(), next.getDate());

    // Pull the month view along when navigation crosses the boundary.
    if (next.getMonth() !== month - 1 || next.getFullYear() !== year) {
      this.#monthAnchor.set(new Date(next.getFullYear(), next.getMonth(), 1));
    }

    this.#focusedDate.set(nextIso);
    this.focusCell(nextIso);
  }

  private moveFocusToEdge(fromIso: string, edge: 'start' | 'end'): void {
    const week = this.weeks().find((days) => days.some((day) => day.iso === fromIso));
    if (!week || week.length === 0) {
      return;
    }
    const target = edge === 'start' ? week[0] : week[week.length - 1];
    this.#focusedDate.set(target.iso);
    this.focusCell(target.iso);
  }

  private shiftMonthKeepingDay(fromIso: string, monthDelta: number): void {
    const [year, month, dayPart] = fromIso.split('-').map(Number);
    const target = new Date(year, month - 1 + monthDelta, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const clampedDay = Math.min(dayPart, lastDay);
    this.#monthAnchor.set(new Date(target.getFullYear(), target.getMonth(), 1));
    const nextIso = toIso(target.getFullYear(), target.getMonth(), clampedDay);
    this.#focusedDate.set(nextIso);
    this.focusCell(nextIso);
  }

  private focusCell(iso: string): void {
    // Defer to next frame so the re-rendered grid contains the target cell.
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-calendar, synergos-calendar');
      const root = host?.shadowRoot ?? document;
      const cell = (root as ParentNode).querySelector<HTMLElement>(`[data-iso="${iso}"]`);
      cell?.focus();
    });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
