import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynChartBar</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-chart-bar',
  standalone: true,
  templateUrl: './chart-bar.html',
  styleUrl: './chart-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-chart-bar' },
})
export class ChartBarElementComponent {
  readonly chartTitle = input<string | undefined>(undefined);
  readonly dataJson = input<string | undefined>(undefined);
  readonly orientation = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
