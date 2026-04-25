import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynBreadcrumb</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-breadcrumb',
  standalone: true,
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-breadcrumb' },
})
export class BreadcrumbElementComponent {
  readonly itemsJson = input<string | undefined>(undefined);
  readonly includeStructuredData = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
