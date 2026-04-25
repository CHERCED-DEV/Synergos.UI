import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynTestimonialCarousel</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-testimonial-carousel',
  standalone: true,
  templateUrl: './testimonial-carousel.html',
  styleUrl: './testimonial-carousel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-testimonial-carousel' },
})
export class TestimonialCarouselElementComponent {
  readonly testimonialsJson = input<string | undefined>(undefined);
  readonly autoplayInterval = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
