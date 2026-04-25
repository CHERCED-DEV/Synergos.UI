import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynTag</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-tag',
  standalone: true,
  templateUrl: './tag.html',
  styleUrl: './tag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tag' },
})
export class TagElementComponent {
  readonly tagLabel = input<string | undefined>(undefined);
  readonly tagColor = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
