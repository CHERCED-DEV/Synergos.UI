import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynSelectMulti</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-select-multi',
  standalone: true,
  templateUrl: './select-multi.html',
  styleUrl: './select-multi.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-select-multi' },
})
export class SelectMultiElementComponent {
  readonly label = input<string | undefined>(undefined);
  readonly optionsJson = input<string | undefined>(undefined);
  readonly maxSelections = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
