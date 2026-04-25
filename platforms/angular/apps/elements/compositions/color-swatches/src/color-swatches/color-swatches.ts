import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynColorSwatches</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-color-swatches',
  standalone: true,
  templateUrl: './color-swatches.html',
  styleUrl: './color-swatches.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-color-swatches' },
})
export class ColorSwatchesElementComponent {
  readonly swatchesJson = input<string | undefined>(undefined);
  readonly shape = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
