import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynPagination</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-pagination',
  standalone: true,
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-pagination' },
})
export class PaginationElementComponent {
  readonly totalItems = input<string | undefined>(undefined);
  readonly itemsPerPage = input<string | undefined>(undefined);
  readonly currentPage = input<string | undefined>(undefined);
  readonly urlTemplate = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
