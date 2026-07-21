import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { DataTableElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  DataTableComponent,
  type DataTableAlign,
  type DataTableColumn,
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

type DataTableRecord = Record<string, unknown>;
export type DataTableRuntimeConfig = Partial<DataTableElementConfig> & {
  readonly emptyLabel?: string;
  readonly emptyActionLabel?: string;
  readonly emptyActionHref?: string;
  readonly striped?: boolean;
  readonly bordered?: boolean;
  readonly hoverable?: boolean;
  readonly compact?: boolean;
  readonly columns?: readonly DataTableColumn<DataTableRecord>[];
  readonly headers?: readonly string[];
  readonly rows?: readonly DataTableRecord[] | readonly (readonly unknown[])[];
};

function isRecord(value: unknown): value is DataTableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeAlign(value: string): DataTableAlign | undefined {
  return value === 'center' || value === 'right' ? value : value === 'left' ? 'left' : undefined;
}

export function normalizeColumn(value: unknown): DataTableColumn<DataTableRecord> | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = readString(value['key']).trim();
  const label = readString(value['label']).trim();
  if (!key || !label) {
    return null;
  }

  const align = normalizeAlign(readString(value['align']).trim());
  const width = readString(value['width']).trim();

  return {
    key,
    label,
    ...(align ? { align } : {}),
    sortable: value['sortable'] === true,
    ...(width ? { width } : {}),
  };
}

export function normalizeColumns(value: unknown): readonly DataTableColumn<DataTableRecord>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((column) => normalizeColumn(column))
    .filter((column): column is DataTableColumn<DataTableRecord> => column !== null);
}

export function normalizeHeaders(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((header) => readString(header).trim())
    .filter((header) => header.length > 0);
}

function createHeaderColumnKey(label: string, index: number): string {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized.length > 0 ? `col-${normalized}-${index + 1}` : `col-${index + 1}`;
}

export function columnsFromHeaders(headers: readonly string[]): readonly DataTableColumn<DataTableRecord>[] {
  return headers.map((header, index) => ({
    key: createHeaderColumnKey(header, index),
    label: header,
    align: 'left',
    sortable: false,
  }));
}

export function normalizeRowsFromRecords(value: unknown): readonly DataTableRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((row): row is DataTableRecord => isRecord(row));
}

export function normalizeRowsFromMatrix(
  value: unknown,
  columns: readonly DataTableColumn<DataTableRecord>[],
): readonly DataTableRecord[] {
  if (!Array.isArray(value) || columns.length === 0) {
    return [];
  }

  return value
    .filter((row): row is readonly unknown[] => Array.isArray(row))
    .map((row) => {
      const normalizedRow: DataTableRecord = {};

      columns.forEach((column, index) => {
        const cellValue = row[index];

        if (typeof cellValue === 'string' || typeof cellValue === 'number' || typeof cellValue === 'boolean') {
          normalizedRow[column.key] = cellValue;
          return;
        }

        if (cellValue === null || cellValue === undefined) {
          normalizedRow[column.key] = '';
          return;
        }

        normalizedRow[column.key] = JSON.stringify(cellValue);
      });

      return normalizedRow;
    });
}

export function sanitizeDataTableConfig(
  value: Partial<DataTableElementConfig> & {
    readonly emptyActionLabel?: string;
    readonly emptyActionHref?: string;
  },
): DataTableRuntimeConfig {
  const columns = normalizeColumns(value.columns);
  const headers = normalizeHeaders(value.headers);
  const resolvedColumns = columns.length > 0 ? columns : columnsFromHeaders(headers);
  const recordRows = normalizeRowsFromRecords(value.rows);
  const rows = recordRows.length > 0 ? recordRows : normalizeRowsFromMatrix(value.rows, resolvedColumns);

  return omitUndefinedProperties<DataTableRuntimeConfig>({
    caption: coerceTrimmedStringInput(value.caption),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    emptyActionLabel: coerceTrimmedStringInput(value.emptyActionLabel),
    emptyActionHref: coerceTrimmedStringInput(value.emptyActionHref),
    striped: coerceOptionalBooleanInput(value.striped),
    bordered: coerceOptionalBooleanInput(value.bordered),
    hoverable: coerceOptionalBooleanInput(value.hoverable),
    compact: coerceOptionalBooleanInput(value.compact),
    columns,
    headers,
    rows,
  });
}

@Component({
  selector: 'sg-data-table',
  imports: [DataTableComponent],
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-data-table' },
})
export class DataTableElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<DataTableRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DataTableRuntimeConfig>(sanitizeDataTableConfig),
  });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly columnsInput = input<string | undefined>(undefined, { alias: 'columns' });
  readonly rowsInput = input<string | undefined>(undefined, { alias: 'rows' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly emptyActionLabelInput = input<string | undefined>(undefined, { alias: 'emptyActionLabel' });
  readonly emptyActionHrefInput = input<string | undefined>(undefined, { alias: 'emptyActionHref' });
  readonly stripedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'striped',
    transform: coerceOptionalBooleanInput,
  });
  readonly borderedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'bordered',
    transform: coerceOptionalBooleanInput,
  });
  readonly hoverableInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'hoverable',
    transform: coerceOptionalBooleanInput,
  });
  readonly compactInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'compact',
    transform: coerceOptionalBooleanInput,
  });

  readonly caption = computed(() =>
    resolveConfigValue(this.captionInput(), this.config()?.caption, ''),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, 'No data available.'),
  );
  readonly emptyActionLabel = computed(() =>
    resolveConfigValue(this.emptyActionLabelInput(), this.config()?.emptyActionLabel, ''),
  );
  readonly emptyActionHref = computed(() =>
    resolveConfigValue(this.emptyActionHrefInput(), this.config()?.emptyActionHref, ''),
  );

  /** Emitted when the empty-state CTA button (no `emptyActionHref`) is activated. */
  readonly emptyAction = output<void>();

  onEmptyAction(): void {
    this.emptyAction.emit();
  }

  readonly striped = computed(() =>
    resolveConfigValue(this.stripedInput(), this.config()?.striped, true),
  );
  readonly bordered = computed(() =>
    resolveConfigValue(this.borderedInput(), this.config()?.bordered, true),
  );
  readonly hoverable = computed(() =>
    resolveConfigValue(this.hoverableInput(), this.config()?.hoverable, true),
  );
  readonly compact = computed(() =>
    resolveConfigValue(this.compactInput(), this.config()?.compact, false),
  );

  readonly parsedColumns = computed<readonly DataTableColumn<DataTableRecord>[]>(() => {
    if (this.columnsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.columnsInput());
      const inputColumns = normalizeColumns(parsedValue);
      if (inputColumns.length > 0) {
        return inputColumns;
      }
    }

    if (this.config()) {
      const configColumns = normalizeColumns(this.config()?.columns);
      if (configColumns.length > 0) {
        return configColumns;
      }

      const headerColumns = columnsFromHeaders(normalizeHeaders(this.config()?.headers));
      if (headerColumns.length > 0) {
        return headerColumns;
      }
    }

    return [];
  });

  readonly parsedRows = computed<readonly DataTableRecord[]>(() => {
    if (this.rowsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.rowsInput());
      const inputRecordRows = normalizeRowsFromRecords(parsedValue);
      if (inputRecordRows.length > 0) {
        return inputRecordRows;
      }

      const inputMatrixRows = normalizeRowsFromMatrix(parsedValue, this.parsedColumns());
      if (inputMatrixRows.length > 0) {
        return inputMatrixRows;
      }
    }

    if (this.config()) {
      const configRecordRows = normalizeRowsFromRecords(this.config()?.rows);
      if (configRecordRows.length > 0) {
        return configRecordRows;
      }

      const configMatrixRows = normalizeRowsFromMatrix(this.config()?.rows, this.parsedColumns());
      if (configMatrixRows.length > 0) {
        return configMatrixRows;
      }
    }

    return [];
  });
}
