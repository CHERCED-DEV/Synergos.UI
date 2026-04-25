import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynSplitter</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-splitter',
  standalone: true,
  templateUrl: './splitter.html',
  styleUrl: './splitter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-splitter' },
})
export class SplitterElementComponent {
  readonly leftContent = input<string | undefined>(undefined);
  readonly rightContent = input<string | undefined>(undefined);
  readonly orientation = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
