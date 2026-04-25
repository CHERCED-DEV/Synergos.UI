import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynPopover</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-popover',
  standalone: true,
  templateUrl: './popover.html',
  styleUrl: './popover.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-popover' },
})
export class PopoverElementComponent {
  readonly triggerLabel = input<string | undefined>(undefined);
  readonly popoverContent = input<string | undefined>(undefined);
  readonly placement = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
