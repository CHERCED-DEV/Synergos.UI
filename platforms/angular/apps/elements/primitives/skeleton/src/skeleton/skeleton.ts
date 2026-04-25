import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynSkeleton</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-skeleton',
  standalone: true,
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-skeleton' },
})
export class SkeletonElementComponent {
  readonly shape = input<string | undefined>(undefined);
  readonly count = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
