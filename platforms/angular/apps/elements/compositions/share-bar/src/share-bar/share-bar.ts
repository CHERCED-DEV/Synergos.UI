import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynShareBar</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-share-bar',
  standalone: true,
  templateUrl: './share-bar.html',
  styleUrl: './share-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-share-bar' },
})
export class ShareBarElementComponent {
  readonly platforms = input<string | undefined>(undefined);
  readonly shareLink = input<string | undefined>(undefined);
  readonly shareTitle = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
