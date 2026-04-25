import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynQuoteAnimated</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-quote-animated',
  standalone: true,
  templateUrl: './quote-animated.html',
  styleUrl: './quote-animated.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-quote-animated' },
})
export class QuoteAnimatedElementComponent {
  readonly quote = input<string | undefined>(undefined);
  readonly attribution = input<string | undefined>(undefined);
  readonly animationMode = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
