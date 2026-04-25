import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynCarousel</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-carousel',
  standalone: true,
  templateUrl: './carousel.html',
  styleUrl: './carousel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-carousel' },
})
export class CarouselElementComponent {
  readonly slidesJson = input<string | undefined>(undefined);
  readonly autoplayInterval = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
