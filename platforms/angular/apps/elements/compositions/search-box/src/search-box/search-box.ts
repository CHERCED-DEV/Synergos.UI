import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynSearchBox</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-search-box',
  standalone: true,
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-search-box' },
})
export class SearchBoxElementComponent {
  readonly searchPlaceholder = input<string | undefined>(undefined);
  readonly searchEndpoint = input<string | undefined>(undefined);
  readonly searchParamName = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
