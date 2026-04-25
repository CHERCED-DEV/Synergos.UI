import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynBadgeGroup</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-badge-group',
  standalone: true,
  templateUrl: './badge-group.html',
  styleUrl: './badge-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-badge-group' },
})
export class BadgeGroupElementComponent {
  readonly badgesJson = input<string | undefined>(undefined);
  readonly layout = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
