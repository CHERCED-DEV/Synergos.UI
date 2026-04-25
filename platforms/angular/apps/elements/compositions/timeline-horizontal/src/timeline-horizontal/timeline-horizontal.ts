import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynTimelineHorizontal</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-timeline-horizontal',
  standalone: true,
  templateUrl: './timeline-horizontal.html',
  styleUrl: './timeline-horizontal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-timeline-horizontal' },
})
export class TimelineHorizontalElementComponent {
  readonly eventsJson = input<string | undefined>(undefined);
  readonly snapEnabled = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
