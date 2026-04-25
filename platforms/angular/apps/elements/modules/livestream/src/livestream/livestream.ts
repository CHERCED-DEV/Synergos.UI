import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynLivestream</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-livestream',
  standalone: true,
  templateUrl: './livestream.html',
  styleUrl: './livestream.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-livestream' },
})
export class LivestreamElementComponent {
  readonly streamUrl = input<string | undefined>(undefined);
  readonly streamType = input<string | undefined>(undefined);
  readonly viewerCountEndpoint = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
