import {
  ChangeDetectionStrategy,
  Component,
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
 * Runtime config for the CMS element <c>elementSynDatePicker</c>.
 *
 * A month-grid date selector with two modes:
 *  - `single`: pick one day (emits `datechange`).
 *  - `range`:  pick a check-in (departure) and a check-out (return) day,
 *              enforcing `return >= departure` plus an optional `minStay`
 *              (minimum nights). Built as the foundation of the BOOKING
 *              vertical (booking-engine). Disabled days (`disabledDates`)
 *              are never selectable.
 *
 * Selecting fires a `datechange` CustomEvent (and a typed Angular output)
 * carrying the resolved selection.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type DatePickerMode = 'single' | 'range';

export interface DatePickerRuntimeConfig {
  readonly mode?: DatePickerMode;
  readonly label?: string;
  readonly initialMonth?: string;
  readonly initialDate?: string;
  readonly initialReturnDate?: string;
  readonly minDate?: string;
  readonly maxDate?: string;
  readonly minStay?: number;
  readonly disabledDates?: readonly string[];
  readonly locale?: string;
}

/** Emitted on the `datechange` CustomEvent and the typed Angular output. */
export interface DatePickerChangeDetail {
  readonly mode: DatePickerMode;
  /** Selected day (single mode) or check-in / departure (range mode). */
  readonly date: string | null;
  /** Check-out / return day (range mode only). */
  readonly returnDate: string | null;
  /** Number of nights between date and returnDate (range, both set). */
  readonly nights: number | null;
}

interface DatePickerDay {
  readonly iso: string;
  readonly dayOfMonth: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly disabled: boolean;
  readonly label: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_WEEK = 7;
const GRID_WEEKS = 6;
const GRID_CELLS = DAYS_IN_WEEK * GRID_WEEKS;
const MS_PER_DAY = 86_400_000;

const DEFAULT_LOCALE = 'es-CO';
const DEFAULT_MODE: DatePickerMode = 'single';
const MODES: readonly DatePickerMode[] = ['single', 'range'];

const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
const FULL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};
const SUMMARY_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
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

/** Normalize an arbitrary list (or JSON array) of ISO days, deduped. */
export function normalizeIsoList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  for (const entry of value) {
    const iso = normalizeIsoDate(entry);
    if (iso) {
      seen.add(iso);
    }
  }
  return [...seen];
}

/** Whole nights between two ISO days (b - a). Negative when b precedes a. */
export function nightsBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00`);
  const b = Date.parse(`${bIso}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  return Math.round((b - a) / MS_PER_DAY);
}

function coerceMode(value: unknown): DatePickerMode | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return MODES.find((mode) => mode === raw);
}

function coerceMinStay(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(coerceTrimmedStringInput(value));
  if (!Number.isFinite(num) || num < 1) {
    return undefined;
  }
  return Math.floor(num);
}

function sanitizeDatePickerConfig(
  value: Partial<DatePickerRuntimeConfig>,
): DatePickerRuntimeConfig {
  return omitUndefinedProperties<DatePickerRuntimeConfig>({
    mode: coerceMode(value.mode),
    label: coerceTrimmedStringInput(value.label),
    initialMonth: coerceTrimmedStringInput(value.initialMonth),
    initialDate: coerceTrimmedStringInput(value.initialDate),
    initialReturnDate: coerceTrimmedStringInput(value.initialReturnDate),
    minDate: coerceTrimmedStringInput(value.minDate),
    maxDate: coerceTrimmedStringInput(value.maxDate),
    minStay: coerceMinStay(value.minStay),
    disabledDates: Array.isArray(value.disabledDates) ? value.disabledDates : undefined,
    locale: coerceTrimmedStringInput(value.locale),
  });
}

@Component({
  selector: 'sg-date-picker',
  standalone: true,
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-date-picker' },
})
export class DatePickerElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<DatePickerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DatePickerRuntimeConfig>(sanitizeDatePickerConfig),
  });
  readonly modeInput = input<string | undefined>(undefined, { alias: 'mode' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly initialMonthInput = input<string | undefined>(undefined, { alias: 'initialMonth' });
  readonly initialDateInput = input<string | undefined>(undefined, { alias: 'initialDate' });
  readonly initialReturnDateInput = input<string | undefined>(undefined, {
    alias: 'initialReturnDate',
  });
  readonly minDateInput = input<string | undefined>(undefined, { alias: 'minDate' });
  readonly maxDateInput = input<string | undefined>(undefined, { alias: 'maxDate' });
  readonly minStayInput = input<string | undefined>(undefined, { alias: 'minStay' });
  readonly disabledDatesInput = input<string | undefined>(undefined, { alias: 'disabledDates' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `datechange` CustomEvent. */
  readonly datechange = output<DatePickerChangeDetail>();

  readonly mode = computed<DatePickerMode>(
    () => coerceMode(this.modeInput()) ?? this.config()?.mode ?? DEFAULT_MODE,
  );

  readonly isRange = computed(() => this.mode() === 'range');

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );

  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );

  readonly minDate = computed(() =>
    normalizeIsoDate(resolveConfigValue(this.minDateInput(), this.config()?.minDate, '')),
  );

  readonly maxDate = computed(() =>
    normalizeIsoDate(resolveConfigValue(this.maxDateInput(), this.config()?.maxDate, '')),
  );

  readonly minStay = computed(() => {
    const fromInput = coerceMinStay(this.minStayInput());
    return fromInput ?? this.config()?.minStay ?? 1;
  });

  /** Days that can never be selected, indexed for O(1) checks. */
  readonly disabledDates = computed<ReadonlySet<string>>(() => {
    const source = this.resolveSource(this.disabledDatesInput(), this.config()?.disabledDates);
    return new Set(normalizeIsoList(source));
  });

  /** First-of-month anchor; navigable via prev/next. */
  readonly #monthAnchor = signal<Date>(parseMonthAnchor(undefined));

  /** Selected day (single) or check-in / departure (range). */
  readonly selectedDate = signal<string | null>(null);

  /** Check-out / return day (range mode only). */
  readonly returnDate = signal<string | null>(null);

  /** Day that holds keyboard focus inside the grid (roving tabindex). */
  readonly #focusedDate = signal<string | null>(null);

  readonly #todayIso = toIso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(this.locale(), MONTH_FORMAT).format(this.#monthAnchor()),
  );

  /** Localized short weekday headers (Sunday-first grid). */
  readonly weekdayLabels = computed<readonly string[]>(() => {
    const formatter = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    // 2024-01-07 is a Sunday — walk the seven days from there.
    return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + index)),
    );
  });

  /** Nights between check-in and check-out (range, both set), else null. */
  readonly nights = computed<number | null>(() => {
    const start = this.selectedDate();
    const end = this.returnDate();
    if (!this.isRange() || !start || !end) {
      return null;
    }
    return nightsBetween(start, end);
  });

  /** Whether a given ISO day falls outside [minDate, maxDate]. */
  #outOfBounds(iso: string): boolean {
    const min = this.minDate();
    const max = this.maxDate();
    if (min && iso < min) {
      return true;
    }
    if (max && iso > max) {
      return true;
    }
    return false;
  }

  /**
   * In range mode after a check-in is chosen, a candidate check-out is
   * disabled when it is too close to honor `minStay`.
   *
   * Only the FORWARD window is blocked. The check-in itself and every day
   * before it stay live on purpose:
   *  - `selectDay` re-anchors the range on an earlier pick, which is how the
   *    user moves the arrival without hunting for "Limpiar"; blocking those
   *    days makes that branch dead code and freezes every previous month.
   *  - a disabled cell is not focusable, and the roving tabindex parks
   *    `tabindex=0` on the check-in — blocking it leaves the grid with zero
   *    tabbable cells, so no keyboard user could reach a check-out.
   *  - `.date-picker__day:disabled` outranks `--selected` in the stylesheet,
   *    so a blocked check-in renders struck-through and muted.
   */
  #blockedByRangeRules(iso: string): boolean {
    if (!this.isRange()) {
      return false;
    }
    const start = this.selectedDate();
    const end = this.returnDate();
    // Only constrain while picking the check-out (start set, end not yet).
    if (!start || end) {
      return false;
    }
    const nights = nightsBetween(start, iso);
    if (nights <= 0) {
      return false;
    }
    return nights < this.minStay();
  }

  /** The 6×7 grid of days surrounding the current month. */
  readonly weeks = computed<readonly (readonly DatePickerDay[])[]>(() => {
    const anchor = this.#monthAnchor();
    const year = anchor.getFullYear();
    const monthIndex = anchor.getMonth();
    const disabled = this.disabledDates();
    const fullDate = new Intl.DateTimeFormat(this.locale(), FULL_DATE_FORMAT);

    // Sunday-first grid: back up to the Sunday on/before the 1st.
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const gridStart = new Date(year, monthIndex, 1 - firstWeekday);

    const days: DatePickerDay[] = [];
    for (let offset = 0; offset < GRID_CELLS; offset++) {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + offset,
      );
      const iso = toIso(date.getFullYear(), date.getMonth(), date.getDate());
      days.push({
        iso,
        dayOfMonth: date.getDate(),
        inMonth: date.getMonth() === monthIndex,
        isToday: iso === this.#todayIso,
        disabled:
          disabled.has(iso) || this.#outOfBounds(iso) || this.#blockedByRangeRules(iso),
        label: fullDate.format(date),
      });
    }

    const weeks: DatePickerDay[][] = [];
    for (let week = 0; week < GRID_WEEKS; week++) {
      weeks.push(days.slice(week * DAYS_IN_WEEK, week * DAYS_IN_WEEK + DAYS_IN_WEEK));
    }
    return weeks;
  });

  readonly flatDays = computed<readonly DatePickerDay[]>(() => this.weeks().flat());

  /** Human summary of the current selection (for the live region). */
  readonly summary = computed<string>(() => {
    const start = this.selectedDate();
    const formatter = new Intl.DateTimeFormat(this.locale(), SUMMARY_FORMAT);
    const fmt = (iso: string): string => formatter.format(new Date(`${iso}T00:00:00`));

    if (!start) {
      return this.isRange() ? 'Elige la fecha de entrada' : 'Ninguna fecha seleccionada';
    }

    if (!this.isRange()) {
      return fmt(start);
    }

    const end = this.returnDate();
    if (!end) {
      return `Entrada ${fmt(start)} — elige la salida`;
    }
    const nights = this.nights() ?? 0;
    return `${fmt(start)} → ${fmt(end)} · ${nights} noche${nights === 1 ? '' : 's'}`;
  });

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

    const firstSelectable = this.flatDays().find((day) => day.inMonth && !day.disabled);
    return firstSelectable?.iso ?? this.flatDays().find((day) => day.inMonth)?.iso ?? '';
  });

  constructor() {
    // Re-anchor and seed the selection whenever config/inputs change.
    effect(() => {
      const initialMonth = resolveConfigValue(
        this.initialMonthInput(),
        this.config()?.initialMonth,
        '',
      );
      const initialDate = normalizeIsoDate(
        resolveConfigValue(this.initialDateInput(), this.config()?.initialDate, ''),
      );

      // Anchor to the explicit month, else to the seeded date's month.
      const anchorSource = initialMonth || initialDate || '';
      this.#monthAnchor.set(parseMonthAnchor(anchorSource));

      if (initialDate) {
        this.selectedDate.set(initialDate);
        this.#focusedDate.set(initialDate);
      }

      if (this.mode() === 'range') {
        const initialReturn = normalizeIsoDate(
          resolveConfigValue(this.initialReturnDateInput(), this.config()?.initialReturnDate, ''),
        );
        // Only accept a return that respects the date ordering + minStay.
        if (
          initialDate &&
          initialReturn &&
          nightsBetween(initialDate, initialReturn) >= this.minStay()
        ) {
          this.returnDate.set(initialReturn);
        }
      } else {
        this.returnDate.set(null);
      }
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

  /** Selecting a day: single sets the date; range walks check-in → check-out. */
  selectDay(day: DatePickerDay): void {
    if (day.disabled) {
      return;
    }

    if (!day.inMonth) {
      // Selecting an adjacent-month cell moves the view to that month.
      const [year, month] = day.iso.split('-').map(Number);
      this.#monthAnchor.set(new Date(year, month - 1, 1));
    }

    this.#focusedDate.set(day.iso);

    if (!this.isRange()) {
      this.selectedDate.set(day.iso);
      this.returnDate.set(null);
      this.#emit();
      return;
    }

    const start = this.selectedDate();
    const end = this.returnDate();

    // Fresh range, or a completed range, or a pick before the current start:
    // (re)start the range at this day.
    if (!start || end || nightsBetween(start, day.iso) < 0) {
      this.selectedDate.set(day.iso);
      this.returnDate.set(null);
      this.#emit();
      return;
    }

    // Completing the range: enforce return >= departure + minStay.
    if (nightsBetween(start, day.iso) < this.minStay()) {
      // Too close — treat as a new check-in instead of an invalid range.
      this.selectedDate.set(day.iso);
      this.returnDate.set(null);
      this.#emit();
      return;
    }

    this.returnDate.set(day.iso);
    this.#emit();
  }

  /** Clear the whole selection. */
  clear(): void {
    this.selectedDate.set(null);
    this.returnDate.set(null);
    this.#emit();
  }

  isSelected(day: DatePickerDay): boolean {
    return this.selectedDate() === day.iso || this.returnDate() === day.iso;
  }

  isRangeStart(day: DatePickerDay): boolean {
    return this.isRange() && this.selectedDate() === day.iso;
  }

  isRangeEnd(day: DatePickerDay): boolean {
    return this.isRange() && this.returnDate() === day.iso;
  }

  /** A day strictly inside the chosen [check-in, check-out] interval. */
  isInRange(day: DatePickerDay): boolean {
    const start = this.selectedDate();
    const end = this.returnDate();
    if (!this.isRange() || !start || !end) {
      return false;
    }
    return day.iso > start && day.iso < end;
  }

  #emit(): void {
    const detail: DatePickerChangeDetail = {
      mode: this.mode(),
      date: this.selectedDate(),
      returnDate: this.isRange() ? this.returnDate() : null,
      nights: this.nights(),
    };
    this.datechange.emit(detail);
  }

  /** Roving keyboard navigation across the grid. */
  onDayKeydown(event: KeyboardEvent, day: DatePickerDay): void {
    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.#moveFocus(day.iso, 1),
      ArrowLeft: () => this.#moveFocus(day.iso, -1),
      ArrowDown: () => this.#moveFocus(day.iso, DAYS_IN_WEEK),
      ArrowUp: () => this.#moveFocus(day.iso, -DAYS_IN_WEEK),
      Home: () => this.#moveFocusToEdge(day.iso, 'start'),
      End: () => this.#moveFocusToEdge(day.iso, 'end'),
      PageUp: () => this.#shiftMonthKeepingDay(day.iso, -1),
      PageDown: () => this.#shiftMonthKeepingDay(day.iso, 1),
      Enter: () => this.selectDay(day),
      ' ': () => this.selectDay(day),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  #moveFocus(fromIso: string, delta: number): void {
    const [year, month, dayPart] = fromIso.split('-').map(Number);
    const next = new Date(year, month - 1, dayPart + delta);
    const nextIso = toIso(next.getFullYear(), next.getMonth(), next.getDate());

    // Pull the month view along when navigation crosses the boundary.
    if (next.getMonth() !== month - 1 || next.getFullYear() !== year) {
      this.#monthAnchor.set(new Date(next.getFullYear(), next.getMonth(), 1));
    }

    this.#focusedDate.set(nextIso);
    this.#focusCell(nextIso);
  }

  #moveFocusToEdge(fromIso: string, edge: 'start' | 'end'): void {
    const week = this.weeks().find((days) => days.some((day) => day.iso === fromIso));
    if (!week || week.length === 0) {
      return;
    }
    const target = edge === 'start' ? week[0] : week[week.length - 1];
    this.#focusedDate.set(target.iso);
    this.#focusCell(target.iso);
  }

  #shiftMonthKeepingDay(fromIso: string, monthDelta: number): void {
    const [year, month, dayPart] = fromIso.split('-').map(Number);
    const target = new Date(year, month - 1 + monthDelta, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const clampedDay = Math.min(dayPart, lastDay);
    this.#monthAnchor.set(new Date(target.getFullYear(), target.getMonth(), 1));
    const nextIso = toIso(target.getFullYear(), target.getMonth(), clampedDay);
    this.#focusedDate.set(nextIso);
    this.#focusCell(nextIso);
  }

  #focusCell(iso: string): void {
    // Defer to next frame so the re-rendered grid contains the target cell.
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-date-picker, synergos-date-picker');
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
