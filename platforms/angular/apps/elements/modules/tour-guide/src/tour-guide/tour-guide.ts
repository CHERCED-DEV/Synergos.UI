import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynTourGuide</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-tour-guide',
  standalone: true,
  templateUrl: './tour-guide.html',
  styleUrl: './tour-guide.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tour-guide' },
})
export class TourGuideElementComponent {
  readonly stepsJson = input<string | undefined>(undefined);
  readonly autoStart = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
