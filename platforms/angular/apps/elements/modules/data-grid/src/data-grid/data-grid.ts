import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  FilterPanelComponent,
  type FilterPanelSection,
  type FilterPanelSortOption,
  type FilterPanelState,
  HeadingComponent,
  LinkComponent,
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynDataGrid</c>.
 *
 * A faceted, filterable, sortable grid of records — built for the
 * PROPIEDADES vertical (property listings). Each record renders as a
 * card with image + title + key/value specs + CTA. Filtering and sorting
 * are entirely client-side and reactive (signals); facets are described
 * declaratively via `filters`.
 *
 * The shared `@synergos/contracts` package does not declare a
 * `DataGridElementConfig`; the canonical shape lives here next to the
 * component until that contract lands in the registry ola.
 */
export interface DataGridRuntimeConfig {
  readonly title?: string;
  readonly emptyLabel?: string;
  readonly ctaLabel?: string;
  readonly loading?: boolean;
  readonly columns?: readonly DataGridColumnConfig[];
  readonly rows?: readonly DataGridRecord[];
  readonly filters?: readonly DataGridFilterConfig[];
  readonly sort?: readonly DataGridSortConfig[];
}

export type DataGridColumnType = 'text' | 'number' | 'currency' | 'badge';

export interface DataGridColumnConfig {
  readonly key?: string;
  readonly label?: string;
  readonly type?: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

export type DataGridFilterType = 'range' | 'select' | 'checkbox';

export interface DataGridFilterConfig {
  readonly key?: string;
  readonly label?: string;
  readonly type?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly options?: readonly DataGridFilterOptionConfig[];
}

export interface DataGridFilterOptionConfig {
  readonly value?: string;
  readonly label?: string;
}

export interface DataGridSortConfig {
  readonly key?: string;
  readonly label?: string;
  readonly direction?: string;
}

export type DataGridRecord = Record<string, unknown>;

interface DataGridColumn {
  readonly key: string;
  readonly label: string;
  readonly type: DataGridColumnType;
  readonly prefix: string;
  readonly suffix: string;
}

interface DataGridFilter {
  readonly key: string;
  readonly label: string;
  readonly type: DataGridFilterType;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly prefix: string;
  readonly suffix: string;
  readonly options: readonly { value: string; label: string }[];
}

interface DataGridSortOption {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly direction: 'asc' | 'desc';
}

interface DataGridCardSpec {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface DataGridCard {
  readonly id: string;
  readonly title: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly badge: string;
  readonly specs: readonly DataGridCardSpec[];
  readonly ctaHref: string;
  readonly record: DataGridRecord;
}

const COLUMN_TYPES: readonly DataGridColumnType[] = ['text', 'number', 'currency', 'badge'];
const FILTER_TYPES: readonly DataGridFilterType[] = ['range', 'select', 'checkbox'];

function isRecord(value: unknown): value is DataGridRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return '';
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeColumnType(value: unknown): DataGridColumnType {
  const candidate = readString(value).trim().toLowerCase() as DataGridColumnType;
  return COLUMN_TYPES.includes(candidate) ? candidate : 'text';
}

function normalizeFilterType(value: unknown): DataGridFilterType | null {
  const candidate = readString(value).trim().toLowerCase() as DataGridFilterType;
  return FILTER_TYPES.includes(candidate) ? candidate : null;
}

export function normalizeColumns(value: unknown): readonly DataGridColumn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): DataGridColumn | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const key = readString(entry['key']).trim();
      const label = readString(entry['label']).trim();
      if (!key || !label) {
        return null;
      }

      return {
        key,
        label,
        type: normalizeColumnType(entry['type']),
        prefix: readString(entry['prefix']).trim(),
        suffix: readString(entry['suffix']).trim(),
      };
    })
    .filter((column): column is DataGridColumn => column !== null);
}

function normalizeFilterOptions(
  value: unknown,
): readonly { value: string; label: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { value: label, label } : null;
      }

      if (isRecord(entry)) {
        const optionValue = readString(entry['value']).trim();
        const label = readString(entry['label']).trim() || optionValue;
        return optionValue || label ? { value: optionValue || label, label: label || optionValue } : null;
      }

      return null;
    })
    .filter((option): option is { value: string; label: string } => option !== null);
}

export function normalizeFilters(value: unknown): readonly DataGridFilter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): DataGridFilter | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const key = readString(entry['key']).trim();
      const label = readString(entry['label']).trim();
      const type = normalizeFilterType(entry['type']);
      if (!key || !label || !type) {
        return null;
      }

      const min = readNumber(entry['min']) ?? 0;
      const max = readNumber(entry['max']) ?? 0;
      const step = readNumber(entry['step']) ?? 1;
      const options = normalizeFilterOptions(entry['options']);

      if (type !== 'range' && options.length === 0) {
        return null;
      }

      return {
        key,
        label,
        type,
        min,
        max: max > min ? max : min,
        step: step > 0 ? step : 1,
        prefix: readString(entry['prefix']).trim(),
        suffix: readString(entry['suffix']).trim(),
        options,
      };
    })
    .filter((filter): filter is DataGridFilter => filter !== null);
}

export function normalizeSortOptions(value: unknown): readonly DataGridSortOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): DataGridSortOption | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const key = readString(entry['key']).trim();
      const label = readString(entry['label']).trim();
      if (!key || !label) {
        return null;
      }

      const direction = readString(entry['direction']).trim().toLowerCase() === 'desc' ? 'desc' : 'asc';

      return { id: `sort-${index}-${key}-${direction}`, key, label, direction };
    })
    .filter((option): option is DataGridSortOption => option !== null);
}

function normalizeRows(value: unknown): readonly DataGridRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((row): row is DataGridRecord => isRecord(row));
}

function sanitizeDataGridConfig(value: Partial<DataGridRuntimeConfig>): DataGridRuntimeConfig {
  return omitUndefinedProperties<DataGridRuntimeConfig>({
    title: coerceTrimmedStringInput(value.title),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    ctaLabel: coerceTrimmedStringInput(value.ctaLabel),
    loading: coerceOptionalBooleanInput(value.loading),
    columns: value.columns,
    rows: value.rows,
    filters: value.filters,
    sort: value.sort,
  });
}

@Component({
  selector: 'sg-data-grid',
  standalone: true,
  imports: [FilterPanelComponent, HeadingComponent, LinkComponent],
  templateUrl: './data-grid.html',
  styleUrl: './data-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-data-grid' },
})
export class DataGridElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<DataGridRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DataGridRuntimeConfig>(sanitizeDataGridConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly loadingInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loading',
    transform: coerceOptionalBooleanInput,
  });
  readonly columnsInput = input<string | undefined>(undefined, { alias: 'columns' });
  readonly rowsInput = input<string | undefined>(undefined, { alias: 'rows' });
  readonly filtersInput = input<string | undefined>(undefined, { alias: 'filters' });
  readonly sortInput = input<string | undefined>(undefined, { alias: 'sort' });

  readonly title = computed(() => resolveConfigValue(this.titleInput(), this.config()?.title, ''));
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, 'No hay resultados que coincidan con los filtros.'),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.config()?.ctaLabel, 'Ver detalle'),
  );
  readonly loading = computed(() =>
    resolveConfigValue(this.loadingInput(), this.config()?.loading, false),
  );

  /** Placeholder rows for the loading skeleton; mirrors a typical page size. */
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  readonly columns = computed<readonly DataGridColumn[]>(() =>
    normalizeColumns(this.resolveSource(this.columnsInput(), this.config()?.columns)),
  );
  readonly filters = computed<readonly DataGridFilter[]>(() =>
    normalizeFilters(this.resolveSource(this.filtersInput(), this.config()?.filters)),
  );
  readonly sortOptions = computed<readonly DataGridSortOption[]>(() =>
    normalizeSortOptions(this.resolveSource(this.sortInput(), this.config()?.sort)),
  );
  readonly rows = computed<readonly DataGridRecord[]>(() =>
    normalizeRows(this.resolveSource(this.rowsInput(), this.config()?.rows)),
  );

  /** Filter facets mapped to the shared filter-panel section model. */
  readonly filterSections = computed<readonly FilterPanelSection[]>(() =>
    this.filters().map((filter): FilterPanelSection => {
      if (filter.type === 'range') {
        return {
          id: filter.key,
          title: filter.label,
          type: 'range',
          initiallyExpanded: true,
          range: {
            min: filter.min,
            max: filter.max,
            step: filter.step,
            value: filter.max,
            prefix: filter.prefix,
            suffix: filter.suffix,
            showValue: true,
          },
        };
      }

      return {
        id: filter.key,
        title: filter.label,
        type: filter.type === 'select' ? 'single' : 'multiple',
        initiallyExpanded: true,
        options: filter.options.map((option) => ({
          id: option.value,
          value: option.value,
          label: option.label,
        })),
      };
    }),
  );

  readonly panelSortOptions = computed<readonly FilterPanelSortOption[]>(() =>
    this.sortOptions().map((option) => ({ value: option.id, label: option.label })),
  );

  readonly hasFilters = computed(() => this.filterSections().length > 0);
  readonly hasSort = computed(() => this.panelSortOptions().length > 0);
  readonly hasTitle = computed(() => this.title().trim().length > 0);

  /** Live filter state from the shared filter-panel (immediate commit). */
  readonly filterState = signal<FilterPanelState | null>(null);

  readonly allCards = computed<readonly DataGridCard[]>(() =>
    this.rows().map((row, index) => this.toCard(row, index)),
  );

  readonly visibleCards = computed<readonly DataGridCard[]>(() => {
    const state = this.filterState();
    const cards = this.allCards();
    const filtered = state ? cards.filter((card) => this.matchesFilters(card.record, state)) : cards;
    return this.sortCards(filtered, state);
  });

  readonly resultCount = computed(() => this.visibleCards().length);
  readonly resultLabel = computed(() => {
    const count = this.resultCount();
    const total = this.allCards().length;
    if (count === total) {
      return count === 1 ? '1 propiedad' : `${count} propiedades`;
    }

    return `${count} de ${total} propiedades`;
  });

  onFilterStateChange(state: FilterPanelState): void {
    this.filterState.set(state);
  }

  cardCtaHref(card: DataGridCard): string {
    return card.ctaHref;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }

    return configValue;
  }

  private toCard(row: DataGridRecord, index: number): DataGridCard {
    const id = readString(row['id']).trim() || `card-${index}`;
    const title =
      readString(row['title']).trim() ||
      readString(row['name']).trim() ||
      readString(row['nombre']).trim() ||
      `Propiedad ${index + 1}`;
    const imageSrc =
      readString(row['image']).trim() ||
      readString(row['imageSrc']).trim() ||
      readString(row['imagen']).trim();
    const imageAlt = readString(row['imageAlt']).trim() || readString(row['alt']).trim() || title;
    const badge = readString(row['badge']).trim() || readString(row['status']).trim();
    const ctaHref =
      readString(row['href']).trim() ||
      readString(row['url']).trim() ||
      readString(row['ctaHref']).trim();

    const specs: DataGridCardSpec[] = this.columns()
      .filter((column) => column.type !== 'badge')
      .map((column) => ({
        key: column.key,
        label: column.label,
        value: this.formatCell(row[column.key], column),
      }))
      .filter((spec) => spec.value.length > 0);

    return { id, title, imageSrc, imageAlt, badge, specs, ctaHref, record: row };
  }

  private formatCell(value: unknown, column: DataGridColumn): string {
    if (value === undefined || value === null || value === '') {
      return '';
    }

    if (column.type === 'currency') {
      const numeric = readNumber(value);
      if (numeric !== null) {
        const formatted = new Intl.NumberFormat('es-MX').format(numeric);
        return `${column.prefix || '$'}${formatted}${column.suffix}`;
      }
    }

    if (column.type === 'number') {
      const numeric = readNumber(value);
      if (numeric !== null) {
        return `${column.prefix}${new Intl.NumberFormat('es-MX').format(numeric)}${column.suffix}`;
      }
    }

    return `${column.prefix}${readString(value)}${column.suffix}`.trim();
  }

  private matchesFilters(row: DataGridRecord, state: FilterPanelState): boolean {
    for (const filter of this.filters()) {
      const value = state.values[filter.key];

      if (filter.type === 'range') {
        if (typeof value !== 'number') {
          continue;
        }

        const cellValue = readNumber(row[filter.key]);
        if (cellValue !== null && cellValue > value) {
          return false;
        }

        continue;
      }

      if (Array.isArray(value) && value.length > 0) {
        const cellValue = readString(row[filter.key]).trim();
        if (!value.includes(cellValue)) {
          return false;
        }
      }
    }

    return true;
  }

  private sortCards(
    cards: readonly DataGridCard[],
    state: FilterPanelState | null,
  ): readonly DataGridCard[] {
    if (!state?.sort) {
      return cards;
    }

    const option = this.sortOptions().find((entry) => entry.id === state.sort);
    if (!option) {
      return cards;
    }

    const sorted = [...cards].sort((a, b) => this.compareRecords(a.record, b.record, option));
    return sorted;
  }

  private compareRecords(
    a: DataGridRecord,
    b: DataGridRecord,
    option: DataGridSortOption,
  ): number {
    const aNumber = readNumber(a[option.key]);
    const bNumber = readNumber(b[option.key]);

    let result: number;
    if (aNumber !== null && bNumber !== null) {
      result = aNumber - bNumber;
    } else {
      result = readString(a[option.key]).localeCompare(readString(b[option.key]), 'es');
    }

    return option.direction === 'desc' ? -result : result;
  }
}
