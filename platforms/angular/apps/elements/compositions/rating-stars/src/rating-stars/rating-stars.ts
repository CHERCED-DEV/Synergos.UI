import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynRatingStars</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-rating-stars',
  standalone: true,
  templateUrl: './rating-stars.html',
  styleUrl: './rating-stars.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-rating-stars' },
})
export class RatingStarsElementComponent {
  readonly valueNow = input<string | undefined>(undefined);
  readonly maxStars = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
