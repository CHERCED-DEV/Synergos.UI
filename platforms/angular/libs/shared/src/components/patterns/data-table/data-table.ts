import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { VisuallyHiddenComponent } from '../../primitives/visually-hidden/visually-hidden';

export type DataTableRow = object;
export type DataTableAlign = 'left' | 'center' | 'right';
export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableSort {
  readonly key: string;
  readonly direction: DataTableSortDirection;
}

export interface DataTableColumn<TData extends DataTableRow = Record<string, unknown>> {
  readonly key: keyof TData & string;
  readonly label: string;
  readonly align?: DataTableAlign;
  readonly sortable?: boolean;
  readonly width?: string;
  readonly render?: (value: TData[keyof TData], row: TData) => string;
}

@Component({
  selector: 'syn-data-table',
  standalone: true,
  imports: [VisuallyHiddenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-data-table" [class]="tableClass()">
      <table class="syn-data-table__table">
        @if (caption()) {
          <caption class="syn-data-table__caption">
            <syn-visually-hidden>{{ caption() }}</syn-visually-hidden>
          </caption>
        }

        <thead class="syn-data-table__head">
          <tr>
            @for (column of columns(); track column.key) {
              <th
                class="syn-data-table__heading"
                [class]="headingClass(column)"
                [style.width]="column.width || null"
                [attr.aria-sort]="ariaSort(column)"
              >
                @if (column.sortable) {
                  <button type="button" class="syn-data-table__sort" (click)="toggleSort(column)">
                    <span>{{ column.label }}</span>
                    <span aria-hidden="true">{{ sortGlyph(column) }}</span>
                    <syn-visually-hidden>{{ sortDescription(column) }}</syn-visually-hidden>
                  </button>
                } @else {
                  <span>{{ column.label }}</span>
                }
              </th>
            }
          </tr>
        </thead>

        <tbody class="syn-data-table__body">
          @for (row of rows(); track $index) {
            <tr
              class="syn-data-table__row"
              tabindex="0"
              (click)="selectRow(row)"
              (keydown.enter)="selectRow(row)"
              (keydown.space)="selectRow(row)"
            >
              @for (column of columns(); track column.key) {
                <td
                  class="syn-data-table__cell"
                  [class]="cellClass(column)"
                  [attr.data-label]="column.label"
                >
                  {{ resolveCellValue(row, column) }}
                </td>
              }
            </tr>
          }
        </tbody>
      </table>

      @if (rows().length === 0) {
        <div class="syn-data-table__empty">
          <ng-content select="[empty]" />
          <p>{{ emptyLabel() }}</p>
        </div>
      }
    </div>
  `,
  styleUrl: './data-table.scss',
})
export class DataTableComponent<TData extends DataTableRow = Record<string, unknown>> {
  readonly columns = input<readonly DataTableColumn<TData>[]>([]);
  readonly rows = input<readonly TData[]>([]);
  readonly caption = input('');
  readonly emptyLabel = input('No data available.');
  readonly striped = input(true);
  readonly bordered = input(true);
  readonly hoverable = input(true);
  readonly compact = input(false);

  readonly #sort = signal<DataTableSort | null>(null);

  readonly sort = this.#sort.asReadonly();
  readonly sortChange = output<DataTableSort | null>();
  readonly rowSelected = output<TData>();

  readonly tableClass = computed(() =>
    classNames(
      'syn-data-table',
      this.striped() && 'syn-data-table--striped',
      this.bordered() && 'syn-data-table--bordered',
      this.hoverable() && 'syn-data-table--hoverable',
      this.compact() && 'syn-data-table--compact',
    ),
  );

  toggleSort(column: DataTableColumn<TData>): void {
    if (!column.sortable) {
      return;
    }

    const currentSort = this.#sort();
    let nextSort: DataTableSort | null = {
      key: column.key,
      direction: 'asc',
    };

    if (currentSort?.key === column.key && currentSort.direction === 'asc') {
      nextSort = { key: column.key, direction: 'desc' };
    } else if (currentSort?.key === column.key && currentSort.direction === 'desc') {
      nextSort = null;
    }

    this.#sort.set(nextSort);
    this.sortChange.emit(nextSort);
  }

  selectRow(row: TData): void {
    this.rowSelected.emit(row);
  }

  headingClass(column: DataTableColumn<TData>): string {
    return classNames(
      'syn-data-table__heading',
      `syn-data-table__heading--${column.align ?? 'left'}`,
      column.sortable && 'syn-data-table__heading--sortable',
    );
  }

  cellClass(column: DataTableColumn<TData>): string {
    return classNames('syn-data-table__cell', `syn-data-table__cell--${column.align ?? 'left'}`);
  }

  ariaSort(column: DataTableColumn<TData>): 'ascending' | 'descending' | 'none' {
    const currentSort = this.#sort();
    if (!column.sortable || currentSort?.key !== column.key) {
      return 'none';
    }

    return currentSort.direction === 'asc' ? 'ascending' : 'descending';
  }

  sortGlyph(column: DataTableColumn<TData>): string {
    const currentSort = this.#sort();
    if (currentSort?.key !== column.key) {
      return '+';
    }

    return currentSort.direction === 'asc' ? '^' : 'v';
  }

  sortDescription(column: DataTableColumn<TData>): string {
    const currentSort = this.#sort();
    if (currentSort?.key !== column.key) {
      return `Sort by ${column.label}`;
    }

    return currentSort.direction === 'asc'
      ? `Sorted ascending by ${column.label}`
      : `Sorted descending by ${column.label}`;
  }

  resolveCellValue(row: TData, column: DataTableColumn<TData>): string {
    const value = (row as Record<string, unknown>)[column.key];
    if (column.render) {
      return column.render(value as TData[keyof TData], row);
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }
}
