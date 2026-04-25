import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynRichTooltip</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-rich-tooltip',
  standalone: true,
  templateUrl: './rich-tooltip.html',
  styleUrl: './rich-tooltip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-rich-tooltip' },
})
export class RichTooltipElementComponent {
  readonly triggerText = input<string | undefined>(undefined);
  readonly tooltipContent = input<string | undefined>(undefined);
  readonly placement = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
