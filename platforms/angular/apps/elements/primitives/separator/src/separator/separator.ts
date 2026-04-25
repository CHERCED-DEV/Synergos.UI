import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynSeparator</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-separator',
  standalone: true,
  templateUrl: './separator.html',
  styleUrl: './separator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-separator' },
})
export class SeparatorElementComponent {
  readonly style = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
