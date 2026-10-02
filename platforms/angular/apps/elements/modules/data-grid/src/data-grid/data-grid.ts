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
import type { DataGridProps, DatoDeLaFila, FilaDelListado } from '@synergos/contracts';
import { t } from '@synergos/vitals-core';

/**
 * Runtime config for the CMS element <c>elementSynDataGrid</c>.
 *
 * A faceted, filterable, sortable grid of records — built for the
 * PROPIEDADES vertical (property listings). Each record renders as a
 * card with image + title + key/value specs + CTA. Filtering and sorting
 * are entirely client-side and reactive (signals); facets are described
 * declaratively via `filters`.
 *
 * **Lo que manda el CMS** (`config`) tiene la forma de `DataGridProps`, GENERADO del record
 * C# (ADR 0135): las FILAS que el servidor arma desde la fuente que eligió el editor (las fichas
 * de su sección, o el catálogo de cursos, de eventos o de inmuebles), cada una con sus datos ya
 * formateados (CMS#196, tanda D). Antes el editor escribía un `dataSource` que nadie consultaba y
 * la grilla decía «No hay resultados que coincidan con los filtros» sin haber buscado nada.
 *
 * Las columnas, los filtros y el orden siguen para el tag crudo, por atributos (`columns`,
 * `rows`, `filters`, `sort`…): ese es el shape de abajo. Sus textos salen del diccionario,
 * sección `DataGrid` (ADR 0136).
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

/** El `config` que manda el CMS (ver `DataGridProps`). */
export type DataGridConfig = Partial<DataGridProps>;

function sanitizeDato(value: unknown): DatoDeLaFila | null {
  if (!isRecord(value)) {
    return null;
  }
  const label = coerceTrimmedStringInput(value['label']);
  const valor = coerceTrimmedStringInput(value['value']);
  return label && valor ? { label, value: valor } : null;
}

function sanitizeFila(value: unknown): FilaDelListado | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = coerceTrimmedStringInput(value['id']);
  const title = coerceTrimmedStringInput(value['title']);
  if (!id || !title) {
    return null;
  }
  const specs = Array.isArray(value['specs'])
    ? value['specs'].map(sanitizeDato).filter((d): d is DatoDeLaFila => d !== null)
    : [];
  return omitUndefinedProperties<FilaDelListado>({
    id,
    title,
    href: coerceTrimmedStringInput(value['href']),
    image: coerceTrimmedStringInput(value['image']),
    imageAlt: coerceTrimmedStringInput(value['imageAlt']),
    badge: coerceTrimmedStringInput(value['badge']),
    specs: specs.length ? specs : undefined,
  }) as FilaDelListado;
}

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeDataGridConfig(value: DataGridConfig): DataGridConfig {
  const rows = Array.isArray(value.rows)
    ? value.rows.map(sanitizeFila).filter((f): f is FilaDelListado => f !== null)
    : undefined;
  return omitUndefinedProperties<DataGridProps>({ rows: rows?.length ? rows : undefined });
}

/** El `?q` de la página: el buscador la recarga con él y el servidor ya filtró las filas. */
function consultaDeLaPagina(): string {
  return typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('q') ?? '').trim();
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

  readonly config = input<DataGridConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DataGridProps>(sanitizeDataGridConfig),
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

  readonly title = computed(() => this.titleInput() ?? '');
  /** Lo que se buscó, si la página se recargó con `?q`. */
  readonly consulta = consultaDeLaPagina();
  readonly ariaLabel = t('DataGrid.Aria', 'Listado');
  readonly loadingLabel = t('DataGrid.Loading', 'Cargando…');
  readonly emptyLabel = computed(() =>
    resolveConfigValue(
      this.emptyLabelInput(),
      undefined,
      this.consulta
        ? t('DataGrid.NoResults', 'No hay resultados para «{query}».', { query: this.consulta })
        : t('DataGrid.Empty', 'Todavía no hay nada publicado aquí.'),
    ),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), undefined, t('DataGrid.Cta', 'Ver detalle')),
  );
  readonly loading = computed(() =>
    resolveConfigValue(this.loadingInput(), undefined, false),
  );

  /** Placeholder rows for the loading skeleton; mirrors a typical page size. */
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  readonly columns = computed<readonly DataGridColumn[]>(() =>
    normalizeColumns(this.resolveSource(this.columnsInput(), undefined)),
  );
  readonly filters = computed<readonly DataGridFilter[]>(() =>
    normalizeFilters(this.resolveSource(this.filtersInput(), undefined)),
  );
  readonly sortOptions = computed<readonly DataGridSortOption[]>(() =>
    normalizeSortOptions(this.resolveSource(this.sortInput(), undefined)),
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
    if (count === 1 && total === 1) {
      return t('DataGrid.Count.One', '1 resultado');
    }

    return t('DataGrid.Count.Other', '{count} resultados', { count });
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
      String(index + 1);
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

    const datos = Array.isArray(row['specs']) ? (row['specs'] as unknown[]) : null;
    if (datos) {
      const specs = datos
        .map(sanitizeDato)
        .filter((d): d is DatoDeLaFila => d !== null)
        .map((d, i) => ({ key: `dato-${i}`, label: d.label, value: d.value }));
      return { id, title, imageSrc, imageAlt, badge, specs, ctaHref, record: row };
    }

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
        const formatted = new Intl.NumberFormat('es-CO').format(numeric);
        return `${column.prefix || '$'}${formatted}${column.suffix}`;
      }
    }

    if (column.type === 'number') {
      const numeric = readNumber(value);
      if (numeric !== null) {
        return `${column.prefix}${new Intl.NumberFormat('es-CO').format(numeric)}${column.suffix}`;
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
