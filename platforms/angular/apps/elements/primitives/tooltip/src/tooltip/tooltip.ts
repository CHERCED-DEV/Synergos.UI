import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynTooltip</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-tooltip',
  standalone: true,
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tooltip' },
})
export class TooltipElementComponent {
  readonly triggerText = input<string | undefined>(undefined);
  readonly tooltipText = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
