import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynRangeSlider</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-range-slider',
  standalone: true,
  templateUrl: './range-slider.html',
  styleUrl: './range-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-range-slider' },
})
export class RangeSliderElementComponent {
  readonly label = input<string | undefined>(undefined);
  readonly minValue = input<string | undefined>(undefined);
  readonly maxValue = input<string | undefined>(undefined);
  readonly step = input<string | undefined>(undefined);
  readonly initialValue = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
