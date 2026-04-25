import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynDataGrid</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-data-grid',
  standalone: true,
  templateUrl: './data-grid.html',
  styleUrl: './data-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-data-grid' },
})
export class DataGridElementComponent {
  readonly dataSource = input<string | undefined>(undefined);
  readonly columnsJson = input<string | undefined>(undefined);
  readonly pageSize = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
