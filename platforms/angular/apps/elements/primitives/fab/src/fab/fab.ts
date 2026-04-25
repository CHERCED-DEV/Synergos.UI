import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynFab</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-fab',
  standalone: true,
  templateUrl: './fab.html',
  styleUrl: './fab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-fab' },
})
export class FabElementComponent {
  readonly iconKey = input<string | undefined>(undefined);
  readonly actionLink = input<string | undefined>(undefined);
  readonly position = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
