import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynIconLabel</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-icon-label',
  standalone: true,
  templateUrl: './icon-label.html',
  styleUrl: './icon-label.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-icon-label' },
})
export class IconLabelElementComponent {
  readonly iconKey = input<string | undefined>(undefined);
  readonly labelText = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
