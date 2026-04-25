import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynKpiCard</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-kpi-card',
  standalone: true,
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-kpi-card' },
})
export class KpiCardElementComponent {
  readonly kpiLabel = input<string | undefined>(undefined);
  readonly kpiValue = input<string | undefined>(undefined);
  readonly kpiTrend = input<string | undefined>(undefined);
  readonly kpiDelta = input<string | undefined>(undefined);
  readonly kpiPeriod = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
