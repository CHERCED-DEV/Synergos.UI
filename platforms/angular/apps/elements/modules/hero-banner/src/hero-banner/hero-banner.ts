import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynHeroBanner</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-hero-banner',
  standalone: true,
  templateUrl: './hero-banner.html',
  styleUrl: './hero-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-hero-banner' },
})
export class HeroBannerElementComponent {
  readonly title = input<string | undefined>(undefined);
  readonly subtitle = input<string | undefined>(undefined);
  readonly media = input<string | undefined>(undefined);
  readonly ctaLabel = input<string | undefined>(undefined);
  readonly ctaLink = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
