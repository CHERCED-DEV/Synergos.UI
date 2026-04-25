import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynProgressBar</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-progress-bar',
  standalone: true,
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-progress-bar' },
})
export class ProgressBarElementComponent {
  readonly valueNow = input<string | undefined>(undefined);
  readonly valueMax = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
