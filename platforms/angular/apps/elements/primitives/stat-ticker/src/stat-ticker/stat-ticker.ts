import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynStatTicker</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-stat-ticker',
  standalone: true,
  templateUrl: './stat-ticker.html',
  styleUrl: './stat-ticker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-stat-ticker' },
})
export class StatTickerElementComponent {
  readonly statValue = input<string | undefined>(undefined);
  readonly statLabel = input<string | undefined>(undefined);
  readonly statPrefix = input<string | undefined>(undefined);
  readonly statSuffix = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
