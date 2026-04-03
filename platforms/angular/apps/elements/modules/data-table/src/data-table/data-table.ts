import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { DataTableElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  DataTableComponent,
  type DataTableAlign,
  type DataTableColumn,
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type DataTableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataTableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeAlign(value: string): DataTableAlign | undefined {
  return value === 'center' || value === 'right' ? value : value === 'left' ? 'left' : undefined;
}

function normalizeColumn(value: unknown): DataTableColumn<DataTableRecord> | null {
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

  readonly configInput = input<Partial<DataTableElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<DataTableElementConfig>,
  });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly columnsInput = input<string | undefined>(undefined, { alias: 'columns' });
  readonly rowsInput = input<string | undefined>(undefined, { alias: 'rows' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
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
    resolveConfigValue(this.captionInput(), this.configInput()?.caption, ''),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), undefined, 'No data available.'),
  );
  readonly striped = computed(() =>
    resolveConfigValue(this.stripedInput(), undefined, true),
  );
  readonly bordered = computed(() =>
    resolveConfigValue(this.borderedInput(), undefined, true),
  );
  readonly hoverable = computed(() =>
    resolveConfigValue(this.hoverableInput(), undefined, true),
  );
  readonly compact = computed(() =>
    resolveConfigValue(this.compactInput(), undefined, false),
  );

  readonly parsedColumns = computed<readonly DataTableColumn<DataTableRecord>[]>(() => {
    if (this.columnsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.columnsInput());
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((column) => normalizeColumn(column))
        .filter((column): column is DataTableColumn<DataTableRecord> => column !== null);
    }

    return [];
  });

  readonly parsedRows = computed<readonly DataTableRecord[]>(() => {
    if (this.rowsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.rowsInput());
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue.filter((row): row is DataTableRecord => isRecord(row));
    }

    return [];
  });
}
