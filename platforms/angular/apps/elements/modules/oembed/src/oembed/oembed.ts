import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynOEmbed</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-oembed',
  standalone: true,
  templateUrl: './oembed.html',
  styleUrl: './oembed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-oembed' },
})
export class OembedElementComponent {
  readonly embedUrl = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
