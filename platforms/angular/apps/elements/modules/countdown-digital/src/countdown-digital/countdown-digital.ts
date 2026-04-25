import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynCountdownDigital</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-countdown-digital',
  standalone: true,
  templateUrl: './countdown-digital.html',
  styleUrl: './countdown-digital.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-countdown-digital' },
})
export class CountdownDigitalElementComponent {
  readonly endDateTime = input<string | undefined>(undefined);
  readonly showLabels = input<string | undefined>(undefined);
  readonly style = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
