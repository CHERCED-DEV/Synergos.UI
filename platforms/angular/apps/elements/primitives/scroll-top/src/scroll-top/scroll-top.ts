import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynScrollTop</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-scroll-top',
  standalone: true,
  templateUrl: './scroll-top.html',
  styleUrl: './scroll-top.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-scroll-top' },
})
export class ScrollTopElementComponent {
  readonly scrollThreshold = input<string | undefined>(undefined);
  readonly position = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
